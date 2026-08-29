"""The Tide16 integration - device, entities and the front-panel card.

One HACS install gets all of it.  The card and its plate art ship inside this
package and are registered with the frontend on setup, so there is no Lovelace
resource to add, no files to copy into `www/`, and no cache-buster to bump by
hand - the URL carries the manifest version.
"""

from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .api.const import MAX_VOLUME_DB, MIN_VOLUME_DB, SET_VOLUME_DB
from .const import (
    ATTR_DELTA,
    ATTR_DURATION,
    CONF_HOST,
    CONF_PORT,
    CONF_SILENCE_HOLD,
    CONF_SILENCE_LEVEL,
    DEFAULT_SILENCE_HOLD,
    DEFAULT_SILENCE_LEVEL,
    DOMAIN,
    PANEL_JS,
    SERVICE_MEASURE_LEVEL,
    SERVICE_VOLUME_STEP,
    STATIC_URL,
)
from .autodim import Tide16AutoDim
from .coordinator import Tide16Coordinator
from .websocket import async_register_websocket_api

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS: list[Platform] = [
    Platform.BINARY_SENSOR,
    Platform.BUTTON,
    Platform.MEDIA_PLAYER,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
]

VOLUME_STEP_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_DELTA): vol.All(
            vol.Coerce(float), vol.Range(min=-60, max=60)
        ),
    }
)

MEASURE_LEVEL_SCHEMA = vol.Schema(
    {
        vol.Optional(ATTR_DURATION, default=10): vol.All(
            vol.Coerce(float), vol.Range(min=1, max=120)
        ),
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the card once, whether or not a unit is configured yet."""
    await _async_register_frontend(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = Tide16Coordinator(
        hass,
        entry.data[CONF_HOST],
        entry.data.get(CONF_PORT, 5555),
        silence_level=float(
            entry.options.get(CONF_SILENCE_LEVEL, DEFAULT_SILENCE_LEVEL)
        ),
        silence_hold=float(entry.options.get(CONF_SILENCE_HOLD, DEFAULT_SILENCE_HOLD)),
    )
    await coordinator.async_start()

    coordinator.autodim = Tide16AutoDim(hass, coordinator)
    coordinator.autodim.async_start()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async_register_websocket_api(hass)
    _async_register_services(hass)

    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        coordinator: Tide16Coordinator = hass.data[DOMAIN].pop(entry.entry_id)
        if coordinator.autodim:
            coordinator.autodim.async_stop()
        await coordinator.async_stop()
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, SERVICE_VOLUME_STEP)
            hass.services.async_remove(DOMAIN, SERVICE_MEASURE_LEVEL)
    return unloaded


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Serve the card from this package and load it on every dashboard."""
    if hass.data.get(f"{DOMAIN}_frontend"):
        return
    hass.data[f"{DOMAIN}_frontend"] = True

    root = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(root), False)]
    )

    integration = await async_get_integration(hass, DOMAIN)
    version = str(integration.version or "dev")
    # The version in the URL is the whole cache-busting story: update the
    # integration and every browser fetches the new module, with nothing for
    # anyone to remember to bump.
    frontend.add_extra_js_url(hass, f"{STATIC_URL}/{PANEL_JS}?v={version}")


def _async_register_services(hass: HomeAssistant) -> None:
    if hass.services.has_service(DOMAIN, SERVICE_VOLUME_STEP):
        return

    async def _volume_step(call: ServiceCall) -> None:
        """Relative dB, clamped, applied to every configured unit.

        Server-side because a dashboard tap carries literal data and cannot
        read the current level to add to it - which is exactly why this used to
        be a hand-written script in the user's own YAML.
        """
        delta = float(call.data[ATTR_DELTA])
        for coordinator in hass.data.get(DOMAIN, {}).values():
            current = coordinator.data.get("volume_db")
            if current is None:
                continue
            target = max(MIN_VOLUME_DB, min(MAX_VOLUME_DB, float(current) + delta))
            await coordinator.async_send(SET_VOLUME_DB, value=round(target, 2))

    async def _measure_output_level(call: ServiceCall) -> ServiceResponse:
        """Report what the output is doing, so a threshold can be chosen.

        It returns rather than stores.  This is something a user runs once
        while deciding on a number, and an entity holding it would put the very
        levels this design keeps out of the recorder straight back into it.
        """
        coordinators = list(hass.data.get(DOMAIN, {}).values())
        if not coordinators:
            raise HomeAssistantError("No Tide16 is configured.")
        return await coordinators[0].async_measure_levels(
            float(call.data[ATTR_DURATION])
        )

    hass.services.async_register(
        DOMAIN, SERVICE_VOLUME_STEP, _volume_step, schema=VOLUME_STEP_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_MEASURE_LEVEL,
        _measure_output_level,
        schema=MEASURE_LEVEL_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
