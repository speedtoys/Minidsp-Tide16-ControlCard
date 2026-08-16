"""Mute and Dirac Live."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api.const import SET_DIRAC_STATE, SET_MUTE
from .const import DOMAIN
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([Tide16Mute(coordinator), Tide16Dirac(coordinator)])


class Tide16Mute(Tide16Entity, SwitchEntity):
    _attr_icon = "mdi:volume-off"

    def __init__(self, coordinator: Tide16Coordinator) -> None:
        super().__init__(coordinator, "mute", "Mute")

    @property
    def is_on(self) -> bool | None:
        return self.coordinator.data.get("muted")

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.async_send(SET_MUTE, value=True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.async_send(SET_MUTE, value=False)


class Tide16Dirac(Tide16Entity, SwitchEntity):
    """Dirac Live on/off.

    The unit reports a whole Dirac block - selected slot, gain and delay flags
    - but only `enabled` is settable from here, which is the switch the panel
    draws.
    """

    _attr_icon = "mdi:tune-variant"

    def __init__(self, coordinator: Tide16Coordinator) -> None:
        super().__init__(coordinator, "dirac_live", "Dirac Live")

    @property
    def is_on(self) -> bool | None:
        return (self.coordinator.data.get("dirac") or {}).get("enabled")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        dirac = self.coordinator.data.get("dirac") or {}
        return {
            "selected_slot": dirac.get("selected_slot"),
            "gain": dirac.get("gain"),
            "delay": dirac.get("delay"),
        }

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.async_send(SET_DIRAC_STATE, enabled=True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.async_send(SET_DIRAC_STATE, enabled=False)
