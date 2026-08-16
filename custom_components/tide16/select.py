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

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api.const import SET_DOLBY_PROFILE
from .const import DOLBY_PROFILES, DOMAIN
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([Tide16DolbyProfile(coordinator)])


class Tide16DolbyProfile(Tide16Entity, SelectEntity):
    _attr_options = list(DOLBY_PROFILES)
    _attr_icon = "mdi:dolby"

    def __init__(self, coordinator: Tide16Coordinator) -> None:
        super().__init__(coordinator, "dolby_profile", "Dolby Profile")

    @property
    def current_option(self) -> str | None:
        profile = self.coordinator.data.get("dolby_profile")
        return profile if profile in DOLBY_PROFILES else None

    async def async_select_option(self, option: str) -> None:
        await self.coordinator.async_send(SET_DOLBY_PROFILE, profile=option)
        # Nothing pushes the profile, so the value only becomes true when it is
        # read back - the setter's own reply is not a confirmation.
        await self.coordinator.async_refresh_settings()
