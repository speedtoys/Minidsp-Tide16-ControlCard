"""Reboot, Bluetooth pairing, and the four scenes the device stores itself."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api.const import REBOOT, SET_BT_PAIRING, SET_SCENE
from .const import DOMAIN, SCENES
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    entities: list[ButtonEntity] = [
        Tide16Button(coordinator, "reboot", "Reboot", REBOOT, {}, "mdi:restart"),
        Tide16Button(
            coordinator,
            "bluetooth_pair",
            "Bluetooth Pair",
            SET_BT_PAIRING,
            {},
            "mdi:bluetooth-settings",
        ),
    ]
    # The device stores four scenes against the colours on its own remote, so
    # the panel's coloured buttons recall the slot of the same name.  A slot
    # that was never saved recalls nothing, which is not a fault.
    for index, colour in enumerate(SCENES, start=1):
        entities.append(
            Tide16Button(
                coordinator,
                f"scene_{colour}",
                f"Scene {colour.title()}",
                SET_SCENE,
                {"index": index},
                "mdi:palette",
            )
        )
    async_add_entities(entities)


class Tide16Button(Tide16Entity, ButtonEntity):
    def __init__(
        self,
        coordinator: Tide16Coordinator,
        key: str,
        name: str,
        endpoint: str,
        args: dict,
        icon: str,
    ) -> None:
        super().__init__(coordinator, key, name)
        self._endpoint = endpoint
        self._args = args
        self._attr_icon = icon

    async def async_press(self) -> None:
        await self.coordinator.async_send(self._endpoint, **self._args)
