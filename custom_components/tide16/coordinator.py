"""State for one Tide16, assembled from replies and pushes.

The unit pushes most of what changes - volume, mute, source, status, stream,
preset, Dirac - so this is not a polling coordinator with a scrape interval.
It keeps one supervised connection open, applies whatever arrives, and only
re-asks on two schedules:

    slow sweep    every 60s, a safety net in case a push was missed across a
                  reconnect, plus get_settings, which nothing ever pushes
    metering      every 1s idle, every 100ms while something is watching

Metering is the reason the split exists.  `get_rms_block_db` is the one thing
with no push behind it, and the front-panel card draws it as a live bar meter,
where 5s between samples reads as a broken meter rather than a slow one.  So
the card subscribes over the websocket API while it is on screen and the fast
cadence runs only while subscribers exist - see websocket.py.

The idle cadence is not free either, even with nobody watching: it is the only
thing feeding the audio-signal sensor, and how often it looks sets how late
that sensor can be - see _apply_signal.

The 16 levels deliberately never become entity state.  Four updates a second
of a sixteen-float attribute is a database problem, and the previous design
needed a `recorder:` exclusion in the user's own configuration.yaml to stay out
of trouble.  Here they go straight to the subscribed connections, and the only
entity derived from them is a binary sensor that changes when audio starts or
stops.
"""

from __future__ import annotations

import asyncio
import logging
import statistics
import time
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .api import Tide16Client, Tide16Error
from .api.const import (
    CHANNEL_COUNT,
    GET_RMS_DB,
    GET_SETTINGS,
    N_BLUETOOTH,
    N_DIRAC_MEASURING,
    N_DIRAC_STATE,
    N_MUTE,
    N_PRESET,
    N_SOURCE,
    N_SOURCE_NAMES,
    N_SPEAKER_CONFIG,
    N_STATUS,
    N_STREAM,
    N_VOLUME_DB,
    REFRESH_ENDPOINTS,
    SILENCE_DB,
)
from .const import (
    DEFAULT_SILENCE_HOLD,
    DEFAULT_SILENCE_LEVEL,
    DOMAIN,
    MAX_SILENCE_LEVEL,
    MIN_SILENCE_LEVEL,
)

_LOGGER = logging.getLogger(__name__)

FULL_REFRESH = 60.0
# Nobody is watching the meter at this cadence, but the audio-signal sensor is
# still fed from it, so this is that sensor's resolution: how soon it can say
# audio started, and the grain the release below is counted in.  At the old 5s
# every transition it reported landed on a five-second grid, which is what gave
# the flapping away.  One request a second on a socket that answers 89 of them
# a second is not a load worth optimising against.
IDLE_METERING = 1.0
# Matched to the unit, measured rather than assumed: it answers
# get_rms_block_db 89 times a second with a 5ms round trip, but the numbers it
# returns only change about every 90ms - so that is how often it recomputes
# the block, and anything faster than this just re-reads the same values.
#
# At the old 250ms this under-sampled the hardware by nearly three to one, and
# every reading could be a quarter-second old before it was even asked for.
FAST_METERING = 0.1

# get_settings gets its own loop, because it is the only source for things the
# user can change WITHOUT Home Assistant - the upmixer, the Dolby profile, the
# source map - and nothing pushes any of them. Left on the 60s sweep, a change
# made on the front panel, the remote or the unit's own web page took up to a
# minute to show, which reads as the panel being out of sync with the device.
#
# It is a big reply, so it is on its own timer rather than pulling the whole
# 14-endpoint sweep up with it.
SETTINGS_REFRESH = 5.0

DISCONNECTED_STATUS = "not connected"


class Tide16Coordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Owns the connection and everything read off it."""

    def __init__(
        self,
        hass: HomeAssistant,
        host: str,
        port: int,
        *,
        silence_level: float = DEFAULT_SILENCE_LEVEL,
        silence_hold: float = DEFAULT_SILENCE_HOLD,
    ) -> None:
        super().__init__(hass, _LOGGER, name=f"{DOMAIN} {host}", update_interval=None)
        self.host = host
        self.port = port
        self.data = _blank()

        # Both settable per install - see the options flow.  They arrive here
        # rather than being read from the entry, because the coordinator has no
        # business knowing what a config entry is.
        self.silence_level = silence_level
        self.silence_hold = silence_hold

        # levels live outside `data` on purpose: they move at 4 Hz and must not
        # drag every entity through a state write with them
        self.levels: list[float] = [SILENCE_DB] * CHANNEL_COUNT
        self._signal = False
        self._signal_seen = 0.0

        # The two halves of the channel legend, kept apart because they arrive
        # in separate replies in no fixed order and either one has to be able
        # to rebuild the merged list on its own.
        self._speaker_names: dict[int, str] = {}
        self._custom_port_names: dict[int, str] = {}

        # Set by __init__ once the entry is up. Declared here so the type is
        # visible; it is not built in the coordinator because it needs the
        # coordinator, and the import would be a circle.
        self.autodim: Any = None

        self._subscribers = 0
        # Tripped when a subscriber arrives, so the metering loop can stop
        # waiting out an idle sleep it no longer needs - see _metering_loop.
        self._meter_wake = asyncio.Event()
        self._loops: list[asyncio.Task] = []
        self._client = Tide16Client(
            host,
            port,
            session=async_get_clientsession(hass),
            on_notification=self._on_notification,
            on_reply=self._on_reply,
            on_connected=self._on_connected,
        )

    @property
    def client(self) -> Tide16Client:
        return self._client

    @property
    def connected(self) -> bool:
        return self._client.connected

    # --- lifecycle ---------------------------------------------------------

    async def async_start(self) -> None:
        await self._client.start()
        self._loops = [
            self.hass.async_create_background_task(self._refresh_loop(), "tide16 sweep"),
            self.hass.async_create_background_task(self._metering_loop(), "tide16 meter"),
            self.hass.async_create_background_task(
                self._settings_loop(), "tide16 settings"
            ),
        ]

    async def async_stop(self) -> None:
        for task in self._loops:
            task.cancel()
        self._loops = []
        await self._client.stop()

    # --- metering subscribers ---------------------------------------------

    @callback
    def add_meter_subscriber(self) -> None:
        self._subscribers += 1
        self._meter_wake.set()

    @callback
    def remove_meter_subscriber(self) -> None:
        # never below zero: a connection can drop after the entry is unloaded
        self._subscribers = max(0, self._subscribers - 1)

    @property
    def metering_fast(self) -> bool:
        return self._subscribers > 0

    # --- loops -------------------------------------------------------------

    async def _refresh_loop(self) -> None:
        while True:
            if self._client.connected:
                await self._sweep()
            await asyncio.sleep(FULL_REFRESH)

    async def _settings_loop(self) -> None:
        """Keep the settings-only values following the device, not just us."""
        while True:
            if self._client.connected:
                await self._client.send(GET_SETTINGS)
            await asyncio.sleep(SETTINGS_REFRESH)

    async def _metering_loop(self) -> None:
        """Poll the levels, fast while something is watching.

        The wait is interruptible on purpose. With nothing watching this sits
        idle for five seconds at a time, and a plain sleep cannot be cut short
        - so opening the view subscribed, and then waited out however much of
        that five seconds was left before the first frame of data arrived. The
        meter held its last values for up to five seconds and then sprang to
        life, which reads as the card being broken rather than idle.
        """
        while True:
            if self._client.connected:
                await self._client.send(GET_RMS_DB)
            delay = FAST_METERING if self.metering_fast else IDLE_METERING
            try:
                await asyncio.wait_for(self._meter_wake.wait(), delay)
            except TimeoutError:
                pass  # nothing arrived; this is the ordinary cadence
            else:
                # A subscriber turned up: go round now, at the fast cadence.
                self._meter_wake.clear()

    async def _sweep(self) -> None:
        for endpoint in REFRESH_ENDPOINTS:
            if endpoint == GET_SETTINGS:
                continue  # _settings_loop owns this one
            if not await self._client.send(endpoint):
                return
            # the unit answers in order; this keeps a burst of 14 requests from
            # arriving as one lump it has to queue
            await asyncio.sleep(0.05)

    # --- connection state --------------------------------------------------

    @callback
    def _on_connected(self, connected: bool) -> None:
        if connected:
            self.hass.async_create_task(self._on_reconnect())
            return
        # Standby: the unit is gone, and every reading with it, so the panel
        # dashes rather than printing a stale number.  Three things survive:
        # `status`, because "not connected" is itself the answer to print; the
        # held speaker names, so the meter's legend keeps naming the channels;
        # and the firmware versions, which cannot change while the unit is off.
        held = self.data.get("channel_names_held") or []
        versions = self.data.get("versions") or {}
        self.data = _blank()
        self.data["status"] = DISCONNECTED_STATUS
        self.data["channel_names_held"] = held
        self.data["versions"] = versions
        self._signal = False
        self._signal_seen = 0.0
        self.levels = [SILENCE_DB] * CHANNEL_COUNT
        self.async_set_updated_data(self.data)

    async def _on_reconnect(self) -> None:
        # a moment for the coordinator process on the unit to finish coming up
        await asyncio.sleep(0.5)
        await self._sweep()

    # --- inbound -----------------------------------------------------------

    @callback
    def _on_reply(self, endpoint: str, data: Any) -> None:
        if endpoint == GET_RMS_DB:
            self._apply_levels(data)
            return
        handler = _REPLY_APPLIERS.get(endpoint)
        if handler is None:
            return
        handler(self, data)
        self.async_set_updated_data(self.data)

    @callback
    def _on_notification(self, name: str, payload: Any) -> None:
        # miniDSP's docs warn the unit sends more notifications than they
        # document, so an unknown name is dropped rather than logged as a fault
        handler = _PUSH_APPLIERS.get(name)
        if handler is None:
            return
        handler(self, payload)
        self.async_set_updated_data(self.data)

    # --- appliers ----------------------------------------------------------

    def _apply_levels(self, data: Any) -> None:
        if not isinstance(data, dict):
            return
        out = data.get("out")
        if not isinstance(out, list):
            return
        levels = [SILENCE_DB] * CHANNEL_COUNT
        for entry in out:
            if not isinstance(entry, dict):
                continue
            index = entry.get("index")
            value = entry.get("val")
            if isinstance(index, int) and 1 <= index <= CHANNEL_COUNT:
                if isinstance(value, (int, float)):
                    levels[index - 1] = float(value)
        self.levels = levels

        # The only entity fed by metering, and only when the envelope flips:
        # four state writes a second is exactly what this design exists to
        # avoid.
        self._apply_signal(max(levels))

    def _apply_signal(self, peak: float) -> None:
        """Fast attack, slow release.

        One sample is not evidence that the audio stopped.  `get_rms_block_db`
        answers with a single ~90ms block, and program material puts every
        output under the threshold for a block at a time with the audio
        running - between words, across a scene cut, under a fade.

        Testing one sample and believing it turned those gaps into state
        changes.  Worse, it turned them into gaps the length of the poll: the
        sample that landed in a 90ms pause reported silence until the next poll
        five seconds later, so a listener hearing continuous audio watched the
        sensor report several hundred transitions across an evening, none of
        which happened.

        So audio starting is believed at once, and audio stopping only after
        `silence_hold` seconds in which no sample cleared `silence_level`.
        """
        now = time.monotonic()
        if peak > self.silence_level:
            self._signal_seen = now
            if self._signal:
                return
            signal = True
        elif not self._signal or now - self._signal_seen < self.silence_hold:
            return
        else:
            signal = False
        self._signal = signal
        self.data["signal"] = signal
        self.async_set_updated_data(self.data)

    async def async_measure_levels(self, duration: float) -> dict[str, Any]:
        """Watch the output for a while and describe what it found.

        This is what makes the silence level settable with evidence rather than
        taste.  The number a user needs is somewhere in the gap between their
        own noise floor and the quietest thing their material actually does,
        and Home Assistant shows them neither - so a threshold field on its own
        is a slider nobody can reason about.

        It subscribes to metering exactly as the card does, so the sampling
        runs at the fast cadence and drops back to idle when it is finished.
        """
        if not self._client.connected:
            raise HomeAssistantError(
                "The Tide16 is not connected, so there is nothing to measure."
            )

        self.add_meter_subscriber()
        peaks: list[float] = []
        try:
            end = time.monotonic() + duration
            while time.monotonic() < end:
                peaks.append(max(self.levels))
                await asyncio.sleep(FAST_METERING)
        finally:
            self.remove_meter_subscriber()

        if not peaks:
            raise HomeAssistantError("No levels arrived from the Tide16.")

        floor = min(peaks)
        below = [p for p in peaks if p <= self.silence_level]
        longest = run = 0
        for p in peaks:
            run = run + 1 if p <= self.silence_level else 0
            longest = max(longest, run)

        # 30 dB over the quietest thing seen.  Run with nothing playing, that
        # floor is the system's own noise and this clears it comfortably; run
        # it with audio playing and the note below says so, because then the
        # floor is a gap in the programme and the suggestion means nothing.
        suggested = min(
            MAX_SILENCE_LEVEL, max(MIN_SILENCE_LEVEL, round(floor + 30.0))
        )

        result: dict[str, Any] = {
            "peak": round(max(peaks), 1),
            "median": round(statistics.median(peaks), 1),
            "floor": round(floor, 1),
            "below_threshold_percent": round(len(below) / len(peaks) * 100, 1),
            "longest_gap": round(longest * FAST_METERING, 2),
            "silence_level": self.silence_level,
            "silence_hold": self.silence_hold,
            "suggested_silence_level": float(suggested),
            "samples": len(peaks),
        }
        if statistics.median(peaks) > -90.0:
            result["note"] = (
                "Audio appears to have been playing. Run this again with "
                "nothing playing to measure your system's noise floor."
            )
        return result

    def _apply_status(self, value: Any) -> None:
        if isinstance(value, str):
            self.data["status"] = value

    def _apply_volume(self, value: Any) -> None:
        if isinstance(value, (int, float)):
            self.data["volume_db"] = float(value)

    def _apply_mute(self, value: Any) -> None:
        if isinstance(value, bool):
            self.data["muted"] = value

    def _apply_source(self, value: Any) -> None:
        if isinstance(value, str):
            self.data["source_id"] = value

    def _apply_source_names(self, data: Any) -> None:
        if isinstance(data, dict):
            self.data["source_names"] = {str(k): str(v) for k, v in data.items()}

    def _apply_stream(self, data: Any) -> None:
        if isinstance(data, dict):
            self.data["stream"] = data

    def _apply_preset_index(self, data: Any) -> None:
        if isinstance(data, (int, str)):
            self.data["preset_index"] = data

    def _apply_preset_push(self, payload: Any) -> None:
        # preset_change carries its fields on the envelope itself
        if isinstance(payload, dict):
            if "index" in payload:
                self.data["preset_index"] = payload.get("index")
            if payload.get("name"):
                self.data["preset_name"] = payload.get("name")

    def _apply_presets(self, data: Any) -> None:
        if isinstance(data, list):
            self.data["presets"] = data

    def _apply_speaker_config(self, value: Any) -> None:
        if isinstance(value, str) and value:
            self.data["speaker_config"] = value

    def _apply_output_speakers(self, data: Any) -> None:
        if not isinstance(data, dict) or not data:
            return
        self._speaker_names = {int(k): v for k, v in data.items() if v}
        self._rebuild_channel_names()

    def _apply_custom_port_names(self, data: Any) -> None:
        """Names typed into the unit's own web UI, for ports it does not assign.

        `get_output_speakers` only reports what the decoder lays out - 13
        entries for 7.2.4 - so an output driven by hand through the routing
        matrix meters correctly and then sits in the legend with no name.  The
        unit does keep a name for those: `get_custom_out_port_names` is what
        its own control page writes, and it comes back empty until somebody
        names something, which is why this looked for a while like the device
        simply had nothing to offer.

        Unset ports come back as "" and are dropped rather than stored as a
        blank name, so an untouched unit behaves exactly as before.
        """
        if not isinstance(data, dict):
            return
        self._custom_port_names = {int(k): v for k, v in data.items() if v}
        self._rebuild_channel_names()

    def _rebuild_channel_names(self) -> None:
        """One list from both sources, indexed by output number.

        A custom name wins where there is one: it was typed deliberately,
        and it is what the unit's own UI shows for that port.
        """
        speakers = self._speaker_names
        custom = self._custom_port_names
        if not speakers and not custom:
            return
        top = max([*speakers, *custom])
        names = [custom.get(i) or speakers.get(i) or None for i in range(1, top + 1)]
        while names and names[-1] is None:
            names.pop()
        self.data["channel_names"] = names
        # Which of those are somebody's own words rather than the decoder's
        # enum, so the legend knows which ones not to abbreviate.
        chosen = sorted(n for n in custom if n <= len(names))
        self.data["custom_channels"] = chosen
        # Held across a dropout: the legend under the meter should keep naming
        # the speakers while the unit is away, rather than emptying out.
        if names:
            self.data["channel_names_held"] = names
            self.data["custom_channels_held"] = chosen

    def _apply_dirac(self, data: Any) -> None:
        if isinstance(data, dict):
            self.data["dirac"] = data
        elif isinstance(data, bool):
            self.data["dirac"] = {**(self.data.get("dirac") or {}), "enabled": data}

    def _apply_dirac_measuring(self, value: Any) -> None:
        if isinstance(value, bool):
            self.data["dirac_measuring"] = value

    def _apply_bluetooth(self, data: Any) -> None:
        if isinstance(data, dict):
            self.data["bluetooth"] = data

    def _apply_settings(self, data: Any) -> None:
        """get_settings is the only source for most of what the unit knows.

        The whole payload is kept, not just the fields the panel prints. It is
        one reply on a poll that already happens, so every setting in it is
        free to keep - the Dolby and DTS blocks, bass management, the
        crossovers, the matrix, the PEQ - and entities for the rest of it can
        read straight out of here without asking the unit for anything more.
        """
        if not isinstance(data, dict):
            return

        self.data["settings"] = data

        sources = data.get("sources")
        if isinstance(sources, dict):
            self.data["sources"] = {
                str(sid): {
                    "name": entry.get("name"),
                    # explicit bool: a missing flag means visible, not hidden
                    "hidden": bool(entry.get("hidden")),
                    "volume_offset": entry.get("volume_offset"),
                }
                for sid, entry in sources.items()
                if isinstance(entry, dict)
            }

        dolby = data.get("dolby")
        if isinstance(dolby, dict) and isinstance(dolby.get("profile"), str):
            self.data["dolby_profile"] = dolby["profile"]

        # The active upmixer. This is what the front panel's Dolby AUDIO /
        # dts:x badge is lit from, and it is the only field that tells native
        # apart from the others - the decoder names do not.
        if isinstance(data.get("upmixer"), str):
            self.data["upmixer"] = data["upmixer"]

        self.data["versions"] = {
            "tide": _clean(data.get("version")),
            "hdmi_card": _clean(data.get("hdmi_card_firmware_version")),
            "hdmi_xmos": _clean(data.get("hdmi_xmos_firmware_version")),
            "hdmi_kernel": _clean(data.get("hdmi_kernel_version")),
        }

    # --- outbound ----------------------------------------------------------

    async def async_refresh_settings(self) -> None:
        """Re-read get_settings after we changed something only it reports."""
        await self._client.send(GET_SETTINGS)

    async def async_send(self, endpoint: str, **args: Any) -> bool:
        return await self._client.send(endpoint, **args)

    async def async_request(self, endpoint: str, **args: Any) -> Any:
        try:
            return await self._client.request(endpoint, **args)
        except Tide16Error as err:
            _LOGGER.debug("request %s failed: %s", endpoint, err)
            return None


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _blank() -> dict[str, Any]:
    return {
        "status": None,
        "volume_db": None,
        "muted": None,
        "source_id": None,
        "source_names": {},
        "sources": {},
        "stream": {},
        "preset_index": None,
        "preset_name": None,
        "presets": [],
        "speaker_config": None,
        "channel_names": [],
        # deliberately NOT cleared by _blank()'s callers on disconnect - see
        # _apply_output_speakers
        "channel_names_held": [],
        "custom_channels_held": [],
        "settings": {},
        "dirac": {},
        "dirac_measuring": None,
        "bluetooth": {},
        "dolby_profile": None,
        "upmixer": None,
        "versions": {},
        "signal": False,
    }


_REPLY_APPLIERS = {
    "get_coordinator_status": Tide16Coordinator._apply_status,
    "get_volume_db": Tide16Coordinator._apply_volume,
    "get_mute": Tide16Coordinator._apply_mute,
    "get_source": Tide16Coordinator._apply_source,
    "get_source_names": Tide16Coordinator._apply_source_names,
    "get_stream_properties": Tide16Coordinator._apply_stream,
    "get_current_preset_index": Tide16Coordinator._apply_preset_index,
    "get_all_presets": Tide16Coordinator._apply_presets,
    "get_speaker_config_number": Tide16Coordinator._apply_speaker_config,
    "get_output_speakers": Tide16Coordinator._apply_output_speakers,
    "get_custom_out_port_names": Tide16Coordinator._apply_custom_port_names,
    "get_dirac_state": Tide16Coordinator._apply_dirac,
    "get_dirac_measuring_mode": Tide16Coordinator._apply_dirac_measuring,
    "get_bluetooth_status": Tide16Coordinator._apply_bluetooth,
    "get_settings": Tide16Coordinator._apply_settings,
}

_PUSH_APPLIERS = {
    N_STATUS: Tide16Coordinator._apply_status,
    N_VOLUME_DB: Tide16Coordinator._apply_volume,
    N_MUTE: Tide16Coordinator._apply_mute,
    N_SOURCE: Tide16Coordinator._apply_source,
    N_SOURCE_NAMES: Tide16Coordinator._apply_source_names,
    N_STREAM: Tide16Coordinator._apply_stream,
    N_PRESET: Tide16Coordinator._apply_preset_push,
    N_DIRAC_STATE: Tide16Coordinator._apply_dirac,
    N_DIRAC_MEASURING: Tide16Coordinator._apply_dirac_measuring,
    N_BLUETOOTH: Tide16Coordinator._apply_bluetooth,
    N_SPEAKER_CONFIG: Tide16Coordinator._apply_speaker_config,
}
