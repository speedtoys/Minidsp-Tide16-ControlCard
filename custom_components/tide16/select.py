"""The Dolby profile.

Read from `get_settings` -> dolby.profile and written with
`set_dolby_profile`.  Both used to be a python script shelled out to by a
`command_line` sensor and a `shell_command`, because no integration spoke
either one.

`set_dolby_profile` is not in the endpoint list the unit's own control page
publishes - it was found by watching the device - so a firmware that does not
have it simply will not change, and the read-back is what tells us.
"""

from __future__ import annotations

import asyncio

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api.const import SET_DOLBY_PROFILE, SET_FORCED_UPMIXER
from .const import DOLBY_PROFILES, DOMAIN, UPMIXERS
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity, Tide16SettingEntity
from .settings import SELECT, Tide16Setting, of_kind


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [Tide16DolbyProfile(coordinator), Tide16Upmixer(coordinator)]
        + [Tide16SettingSelect(coordinator, s) for s in of_kind(SELECT)]
    )


# Measured on the unit: it accepts the frame in about 3ms and the profile
# actually changes about 570ms later. A single read-back fired straight after
# the send therefore reads the OLD value every time.
CONFIRM_INTERVAL = 0.25
CONFIRM_ATTEMPTS = 12  # 3s, comfortably past the ~570ms the unit takes


class Tide16DolbyProfile(Tide16Entity, SelectEntity):
    _attr_options = list(DOLBY_PROFILES)
    _attr_icon = "mdi:dolby"

    def __init__(self, coordinator: Tide16Coordinator) -> None:
        super().__init__(coordinator, "dolby_profile", "Dolby Profile")
        self._pending: str | None = None

    @property
    def current_option(self) -> str | None:
        # While a write is in flight the requested value is shown, so a tap
        # gets an answer now rather than in half a second.
        if self._pending is not None:
            return self._pending
        profile = self.coordinator.data.get("dolby_profile")
        return profile if profile in DOLBY_PROFILES else None

    async def async_select_option(self, option: str) -> None:
        """Write the profile, then wait for the unit to actually agree.

        Nothing pushes the profile, so a read-back is the only confirmation -
        and the unit applies the change ~570ms after accepting the request.
        Refreshing immediately (which is what this used to do) read the old
        value and left the entity one step behind until the next periodic
        poll, so changing profile appeared to need two taps: the second tap's
        read-back was what finally reported the first tap's change.

        So: show the requested value at once, then poll the read-back until
        the device agrees. If it never does, the pending value is dropped and
        the device's own reading stands - `set_dolby_profile` is not in the
        endpoint list the unit publishes, so a firmware without it has to snap
        visibly back rather than leave a lie on screen.
        """
        await self.coordinator.async_send(SET_DOLBY_PROFILE, profile=option)

        self._pending = option
        self.async_write_ha_state()
        try:
            for _ in range(CONFIRM_ATTEMPTS):
                await asyncio.sleep(CONFIRM_INTERVAL)
                await self.coordinator.async_refresh_settings()
                if self.coordinator.data.get("dolby_profile") == option:
                    break
        finally:
            self._pending = None
            self.async_write_ha_state()


class Tide16Upmixer(Tide16Entity, SelectEntity):
    """Which upmixer the unit is forced to use - Native, Dolby or DTS-X.

    The unit calls this the "decoder" in `set_forced_upmixer` and the
    "upmixer" in `get_settings`, and its own control page labels the values
    Dolby / Neural:X / Native. It is also the only field that distinguishes
    native from the rest: in native mode the decoder names carry straight on
    reporting whatever they last decoded.

    Same write-then-confirm dance as the profile above, for the same reason -
    nothing pushes this, so a read-back is the only confirmation there is.
    """

    _attr_options = list(UPMIXERS.values())
    _attr_icon = "mdi:surround-sound"

    def __init__(self, coordinator: Tide16Coordinator) -> None:
        super().__init__(coordinator, "upmixer", "Upmixer")
        self._pending: str | None = None

    @property
    def current_option(self) -> str | None:
        if self._pending is not None:
            return self._pending
        return UPMIXERS.get(self.coordinator.data.get("upmixer"))

    async def async_select_option(self, option: str) -> None:
        wire = next((k for k, label in UPMIXERS.items() if label == option), None)
        if wire is None:
            return
        await self.coordinator.async_send(SET_FORCED_UPMIXER, decoder=wire)

        self._pending = option
        self.async_write_ha_state()
        try:
            for _ in range(CONFIRM_ATTEMPTS):
                await asyncio.sleep(CONFIRM_INTERVAL)
                await self.coordinator.async_refresh_settings()
                if self.coordinator.data.get("upmixer") == wire:
                    break
        finally:
            self._pending = None
            self.async_write_ha_state()


class Tide16SettingSelect(Tide16SettingEntity, SelectEntity):
    """One of the unit's multiple-choice settings - see settings.py.

    The options are the ones its own control page offers, read out of that
    page's <select> markup rather than guessed.
    """

    def __init__(self, coordinator: Tide16Coordinator, setting: Tide16Setting) -> None:
        super().__init__(coordinator, setting)
        self._attr_options = list(setting.options or ())

    @property
    def current_option(self) -> str | None:
        value = self._value
        if value is None:
            return None
        value = str(value)
        return value if value in self._attr_options else None

    async def async_select_option(self, option: str) -> None:
        await self._write(option)
