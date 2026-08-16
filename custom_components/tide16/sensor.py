"""Everything the panel prints.

The five entities that used to be `template:` blocks in the user's own
packages file - the split volume, the kHz rate, the held channel names - are
ordinary entities here.  So are the two that used to be `command_line` sensors
shelling out to python scripts: the firmware versions and the Dolby profile
both come from `get_settings`, which the coordinator already reads.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity


@dataclass(frozen=True, kw_only=True)
class Tide16SensorDescription(SensorEntityDescription):
    """A sensor is a name and a function of coordinator data."""

    value: Callable[[dict[str, Any]], Any]
    attributes: Callable[[dict[str, Any]], dict[str, Any]] | None = None
    always_available: bool = False


def _stream(data: dict[str, Any]) -> dict[str, Any]:
    return data.get("stream") or {}


def _rate_khz(data: dict[str, Any]) -> str | None:
    """48000 -> "48 kHz", 44100 -> "44.1 kHz"."""
    raw = _stream(data).get("sample_rate") or _stream(data).get("dec_sample_rate")
    try:
        hz = float(raw)
    except (TypeError, ValueError):
        return None
    if hz <= 0:
        return None
    khz = hz / 1000
    return f"{khz:g} kHz"


def _decoder(data: dict[str, Any]) -> str | None:
    """"LPCM decoder" -> "LPCM", "unknown decoder" -> "unknown".

    The unit suffixes the word onto every decoder name, which reads as
    "Decoder: unknown decoder" once the panel has already labelled the row.
    Names that carry no suffix (DTS_NEURAL_X) are left exactly as they are.
    """
    raw = _stream(data).get("decoder_type")
    if not isinstance(raw, str):
        return None
    trimmed = raw.strip()
    if trimmed.lower().endswith(" decoder"):
        trimmed = trimmed[: -len(" decoder")].strip()
    return trimmed or None


def _input_format(data: dict[str, Any]) -> str | None:
    """channel_config 2 -> "2.0", 6 -> "5.1", 8 -> "7.1".

    The unit prints this formatting on its own front panel, so the decimal is
    the device's convention rather than an invention here. It exists as a
    sensor because a dashboard can only read an attribute verbatim - and
    because doing it in a card template means a templating card re-rendering
    the whole panel every time the stream twitches.
    """
    raw = _stream(data).get("channel_config")
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return f"{n}.0" if n <= 2 else f"{n - 1}.1"


def _preset_fallback(data: dict[str, Any]) -> str | None:
    index = data.get("preset_index")
    return None if index is None else f"Preset {index}"


def _volume_parts(data: dict[str, Any]) -> tuple[str, str] | None:
    """-32.5 dB drawn as a big "-32" and a small ".5"."""
    db = data.get("volume_db")
    if db is None:
        return None
    negative = db < 0
    whole = int(abs(db))
    frac = round((abs(db) - whole) * 10)
    if frac == 10:  # -31.95 must read as -32.0, not -31.10
        whole += 1
        frac = 0
    return (f"-{whole}" if negative else f"{whole}", str(frac))


SENSORS: tuple[Tide16SensorDescription, ...] = (
    Tide16SensorDescription(
        key="status",
        name="Status",
        # The one sensor that survives the unit going away: "not connected" is
        # the answer, not the absence of one.
        always_available=True,
        value=lambda d: d.get("status"),
    ),
    Tide16SensorDescription(
        key="source",
        name="Source",
        value=lambda d: (d.get("source_names") or {}).get(d.get("source_id"))
        or d.get("source_id"),
    ),
    Tide16SensorDescription(
        key="stream",
        name="Stream",
        value=lambda d: _stream(d).get("decoder_stream_src_format"),
        attributes=lambda d: {
            "decoder_type": _decoder(d),
            "sample_rate": _stream(d).get("sample_rate"),
            "channel_config": _stream(d).get("channel_config") or None,
            "stream_type": _stream(d).get("decoder_stream_type"),
            "processing": _stream(d).get("decoder_stream_proc_type"),
        },
    ),
    Tide16SensorDescription(
        key="input_format",
        name="Input Format",
        value=_input_format,
    ),
    Tide16SensorDescription(
        key="sample_rate_khz",
        name="Sample Rate kHz",
        value=_rate_khz,
    ),
    Tide16SensorDescription(
        key="speaker_config",
        name="Speaker Config",
        value=lambda d: d.get("speaker_config"),
    ),
    Tide16SensorDescription(
        key="preset",
        name="Preset",
        # The state is what the unit CALLS this preset; the panel prints it
        # under the number.  Every slot on this hardware reports an empty
        # name, so "Preset 2" is the fallback rather than a blank line.
        value=lambda d: d.get("preset_name") or _preset_fallback(d),
        attributes=lambda d: {
            "preset_index": d.get("preset_index"),
            "name": d.get("preset_name") or None,
        },
    ),
    Tide16SensorDescription(
        key="volume_integer",
        name="Volume Integer",
        value=lambda d: (_volume_parts(d) or (None, None))[0],
    ),
    Tide16SensorDescription(
        key="volume_decimal",
        name="Volume Decimal",
        value=lambda d: (_volume_parts(d) or (None, None))[1],
    ),
    Tide16SensorDescription(
        key="channel_names_held",
        name="Channel Names Held",
        # The state is the count; the names themselves are the attribute the
        # legend reads, held across a dropout so the meter stays labelled.
        value=lambda d: len(d.get("channel_names_held") or []),
        attributes=lambda d: {"channel_names": d.get("channel_names_held") or []},
        always_available=True,
    ),
    Tide16SensorDescription(
        key="versions",
        name="Versions",
        entity_category=EntityCategory.DIAGNOSTIC,
        always_available=True,
        value=lambda d: (d.get("versions") or {}).get("tide"),
        attributes=lambda d: {
            "tide": (d.get("versions") or {}).get("tide"),
            "hdmi": " / ".join(
                part
                for part in (
                    (d.get("versions") or {}).get("hdmi_card"),
                    (d.get("versions") or {}).get("hdmi_xmos"),
                )
                if part
            )
            or None,
            "hdmi_card": (d.get("versions") or {}).get("hdmi_card"),
            "hdmi_xmos": (d.get("versions") or {}).get("hdmi_xmos"),
            "hdmi_kernel": (d.get("versions") or {}).get("hdmi_kernel"),
        },
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(Tide16Sensor(coordinator, d) for d in SENSORS)


class Tide16Sensor(Tide16Entity, SensorEntity):
    entity_description: Tide16SensorDescription

    def __init__(
        self, coordinator: Tide16Coordinator, description: Tide16SensorDescription
    ) -> None:
        super().__init__(coordinator, description.key, description.name)
        self.entity_description = description

    @property
    def available(self) -> bool:
        if self.entity_description.always_available:
            return True
        return super().available

    @property
    def native_value(self) -> Any:
        return self.entity_description.value(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self.entity_description.attributes is None:
            return None
        return self.entity_description.attributes(self.coordinator.data)
