"""Master volume, in dB."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfSoundPressure
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api.const import MAX_VOLUME_DB, MIN_VOLUME_DB
from .const import DOMAIN
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([Tide16Volume(coordinator)])


class Tide16Volume(Tide16Entity, NumberEntity):
    """The documented range is -127.5 dB (silent) to 0.0 dB (maximum)."""

    _attr_native_min_value = MIN_VOLUME_DB
    _attr_native_max_value = MAX_VOLUME_DB
    _attr_native_step = 0.5
    _attr_mode = NumberMode.BOX
    _attr_native_unit_of_measurement = UnitOfSoundPressure.DECIBEL
    _attr_icon = "mdi:volume-high"

    def __init__(self, coordinator: Tide16Coordinator) -> None:
        super().__init__(coordinator, "volume", "Volume")

    @property
    def native_value(self) -> float | None:
        return self.coordinator.data.get("volume_db")

    async def async_set_native_value(self, value: float) -> None:
        await self.coordinator.client.set_volume_db(value)
