"""The Tide16 as a media player: source, volume, mute, power off.

Two deliberate choices here, both of which the front panel depends on:

* **It reports `off`, never `unavailable`.**  Standby takes the unit off the
  network, so "I cannot reach it" and "it is off" are the same fact - and a
  panel that wants to show a reboot in progress needs a state it can watch,
  not an entity that vanishes.
* **The input table rides along as an attribute.**  `sources` carries every
  input's live name and the device's own `hidden` flag, so a dashboard can grey
  out the inputs this unit is not using and follow a rename without a card
  edit.  It used to take a python script on a `command_line` sensor to get it.

There is no turn_on, and there cannot be: standby tears down the network stack,
so nothing this integration can reach is still listening once the unit is off.
Only an IR remote can wake it.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.media_player import (
    MediaPlayerDeviceClass,
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api.const import MIN_VOLUME_DB, SET_MUTE, SET_SOURCE, SHUTDOWN
from .const import DOMAIN
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([Tide16MediaPlayer(coordinator)])


class Tide16MediaPlayer(Tide16Entity, MediaPlayerEntity):
    _attr_device_class = MediaPlayerDeviceClass.RECEIVER
    _attr_supported_features = (
        MediaPlayerEntityFeature.SELECT_SOURCE
        | MediaPlayerEntityFeature.TURN_OFF
        | MediaPlayerEntityFeature.VOLUME_SET
        | MediaPlayerEntityFeature.VOLUME_MUTE
    )

    def __init__(self, coordinator: Tide16Coordinator) -> None:
        # name None makes this the device's own entity: media_player.tide16
        super().__init__(coordinator, "media_player", None)

    @property
    def available(self) -> bool:
        return True

    @property
    def state(self) -> MediaPlayerState:
        return (
            MediaPlayerState.ON if self.coordinator.connected else MediaPlayerState.OFF
        )

    @property
    def source(self) -> str | None:
        data = self.coordinator.data
        return (data.get("source_names") or {}).get(data.get("source_id"))

    @property
    def source_list(self) -> list[str]:
        return list((self.coordinator.data.get("source_names") or {}).values())

    @property
    def volume_level(self) -> float | None:
        db = self.coordinator.data.get("volume_db")
        if db is None:
            return None
        return round((float(db) - MIN_VOLUME_DB) / -MIN_VOLUME_DB, 4)

    @property
    def is_volume_muted(self) -> bool | None:
        return self.coordinator.data.get("muted")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data
        return {
            "volume_db": data.get("volume_db"),
            "status": data.get("status"),
            "source_id": data.get("source_id"),
            # {id: {name, hidden, volume_offset}} straight off the device
            "sources": data.get("sources") or {},
        }

    async def async_select_source(self, source: str) -> None:
        """Sources are selected by id; the panel only knows display names."""
        names = self.coordinator.data.get("source_names") or {}
        for source_id, name in names.items():
            if name == source:
                await self.coordinator.async_send(SET_SOURCE, value=source_id)
                return
        # a name that is not in the table is very likely already an id
        if source in names:
            await self.coordinator.async_send(SET_SOURCE, value=source)

    async def async_set_volume_level(self, volume: float) -> None:
        await self.coordinator.client.set_volume_db(
            MIN_VOLUME_DB + (volume * -MIN_VOLUME_DB)
        )

    async def async_mute_volume(self, mute: bool) -> None:
        await self.coordinator.async_send(SET_MUTE, value=mute)

    async def async_turn_off(self) -> None:
        """A press while it is already off is a no-op, not an error."""
        if self.coordinator.connected:
            await self.coordinator.async_send(SHUTDOWN)
