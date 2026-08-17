"""Master volume, and every numeric setting the unit reports."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfSoundPressure
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api.const import MAX_VOLUME_DB, MIN_VOLUME_DB
from .const import DOMAIN
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity, Tide16SettingEntity
from .settings import NUMBER, Tide16Setting, of_kind


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [Tide16Volume(coordinator)]
        + [Tide16SettingNumber(coordinator, s) for s in of_kind(NUMBER)]
    )


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


class Tide16SettingNumber(Tide16SettingEntity, NumberEntity):
    """One of the unit's numeric settings - see settings.py."""

    _attr_mode = NumberMode.BOX

    def __init__(self, coordinator: Tide16Coordinator, setting: Tide16Setting) -> None:
        super().__init__(coordinator, setting)
        self._attr_native_min_value = setting.min_value
        self._attr_native_max_value = setting.max_value
        self._attr_native_step = setting.step
        self._attr_native_unit_of_measurement = setting.unit

    @property
    def native_value(self) -> float | None:
        value = self._value
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    async def async_set_native_value(self, value: float) -> None:
        # Whole numbers go over the wire as integers. Several of these are
        # indexes or millisecond counts, and the unit's own page sends them
        # through Math.floor - a float where it expects a count is not worth
        # finding out about at runtime.
        step = self._setting.step
        if step is not None and float(step).is_integer():
            await self._write(int(round(value)))
        else:
            await self._write(value)
