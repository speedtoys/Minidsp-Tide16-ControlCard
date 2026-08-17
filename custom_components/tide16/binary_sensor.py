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
from .settings import BINARY, Tide16Setting, of_kind, value_at


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


def _upmixed(data: dict[str, Any]) -> bool:
    """Whether the output is an UPMIX rather than what arrived.

    The unit's own panel prints "Upmixed" under the output layout only when
    this is set, and nothing at all otherwise - a native Atmos bitstream is
    decoded to 7.2.4, not upmixed to it, and the panel says nothing.

    Inferring it from the selected upmixer is wrong for exactly that case: the
    upmixer can be Dolby while the stream needs no upmixing at all.
    """
    return bool((data.get("stream") or {}).get("is_lpcm_upmixed"))


BINARY_SENSORS: tuple[Tide16BinaryDescription, ...] = (
    Tide16BinaryDescription(key="atmos", name="Atmos", value=_atmos),
    Tide16BinaryDescription(key="upmixed", name="Upmixed", value=_upmixed),
    Tide16BinaryDescription(
        key="bitstream",
        name="Bitstream",
        # Two different signal paths with two different gain stagings, and the
        # meter has to scale for whichever one is running - see tide16-bars.
        value=lambda d: bool((d.get("stream") or {}).get("is_bitstream")),
    ),
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
    async_add_entities(
        [Tide16BinarySensor(coordinator, d) for d in BINARY_SENSORS]
        + [Tide16SettingBinary(coordinator, s) for s in of_kind(BINARY)]
    )


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


class Tide16SettingBinary(Tide16Entity, BinarySensorEntity):
    """A read-only flag out of `get_settings` - see settings.py."""

    def __init__(self, coordinator: Tide16Coordinator, setting: Tide16Setting) -> None:
        super().__init__(coordinator, setting.key, setting.name)
        self._setting = setting
        self._attr_entity_category = setting.category
        self._attr_icon = setting.icon

    @property
    def is_on(self) -> bool | None:
        value = value_at(self.coordinator.data.get("settings") or {}, self._setting.path)
        return None if value is None else bool(value)
