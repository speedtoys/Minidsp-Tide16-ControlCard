"""Atmos, audio signal, Dirac measuring."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import Tide16Coordinator
from .entity import Tide16Entity


@dataclass(frozen=True, kw_only=True)
class Tide16BinaryDescription(BinarySensorEntityDescription):
    value: Callable[[dict[str, Any]], bool | None]


def _atmos(data: dict[str, Any]) -> bool:
    """Atmos is not a flag the unit sets - it is a word in what it decoded.

    Both the source format and the decoder name are checked, because which one
    names it depends on how the stream arrived.

    The negations have to go first, and this is not hypothetical: the unit
    reports "Dolby Digital Plus without Dolby Atmos" for a plain DD+ stream,
    and a plain substring test lights the Atmos badge on exactly the stream
    that is telling you it has none.
    """
    stream = data.get("stream") or {}
    haystack = " ".join(
        str(stream.get(field) or "")
        for field in ("decoder_stream_src_format", "decoder_type", "decoder_stream_type")
    ).lower()
    for denial in ("without dolby atmos", "without atmos", "no atmos"):
        haystack = haystack.replace(denial, "")
    return "atmos" in haystack


BINARY_SENSORS: tuple[Tide16BinaryDescription, ...] = (
    Tide16BinaryDescription(key="atmos", name="Atmos", value=_atmos),
    Tide16BinaryDescription(
        key="audio_signal",
        name="Audio Signal",
        # The only entity fed by metering, and it only writes state when audio
        # starts or stops - see the coordinator.
        value=lambda d: bool(d.get("signal")),
    ),
    Tide16BinaryDescription(
        key="dirac_measuring",
        name="Dirac Measuring",
        value=lambda d: d.get("dirac_measuring"),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: Tide16Coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(Tide16BinarySensor(coordinator, d) for d in BINARY_SENSORS)


class Tide16BinarySensor(Tide16Entity, BinarySensorEntity):
    entity_description: Tide16BinaryDescription

    def __init__(
        self, coordinator: Tide16Coordinator, description: Tide16BinaryDescription
    ) -> None:
        super().__init__(coordinator, description.key, description.name)
        self.entity_description = description

    @property
    def is_on(self) -> bool | None:
        return self.entity_description.value(self.coordinator.data)
