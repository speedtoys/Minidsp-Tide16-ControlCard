"""Shared base for every Tide16 entity."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DEVICE_NAME, DOMAIN, MANUFACTURER, MODEL
from .coordinator import Tide16Coordinator


class Tide16Entity(CoordinatorEntity[Tide16Coordinator]):
    """Device identity, availability and naming, in one place.

    `has_entity_name` with a fixed device name is what keeps the entity_ids
    the panel is written against - sensor.tide16_status, number.tide16_volume
    and the rest - stable whatever the user calls the device afterwards.
    """

    _attr_has_entity_name = True

    def __init__(self, coordinator: Tide16Coordinator, key: str, name: str | None) -> None:
        super().__init__(coordinator)
        self._key = key
        self._attr_name = name
        # Keyed on the host, not the config entry: removing and re-adding the
        # unit then keeps every entity_id and its history.
        self._attr_unique_id = f"{DOMAIN}_{coordinator.host}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.host)},
            name=DEVICE_NAME,
            manufacturer=MANUFACTURER,
            model=MODEL,
            configuration_url=f"http://{coordinator.host}:5050",
        )

    @property
    def available(self) -> bool:
        """Unavailable while the unit is away, so the panel dashes.

        Standby takes the Tide16 off the network entirely; a reading held over
        from before it went is worse than no reading, because the panel would
        print it as if it were current.
        """
        return self.coordinator.connected
