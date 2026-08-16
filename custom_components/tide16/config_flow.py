"""Set the Tide16 up from the UI.

The unit announces itself nowhere - measured on a live one, it answers no
SSDP, advertises no mDNS service, and its only name on a network is whatever
that network's DHCP server decided to call it, which is a fact about the
network rather than the device. So there is nothing for Home Assistant's own
discovery to catch, and this goes looking instead: one port across the local
subnet, then a WebSocket handshake to confirm that whatever answered really is
a Tide16 and not something else that happens to listen on 5555.

Typing an address by hand is always available. The sweep is bounded to a small
subnet, and a unit in standby leaves the network entirely - so "nothing found"
is a perfectly ordinary answer that has to lead somewhere useful.
"""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import network
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .api import Tide16Client, Tide16Error, async_scan, candidate_hosts
from .api.const import DEFAULT_PORT
from .const import CONF_HOST, CONF_PORT, DEVICE_NAME, DOMAIN

_LOGGER = logging.getLogger(__name__)


class Tide16ConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._found: list[dict[str, Any]] = []
        self._scanned = False

    async def _async_local_hosts(self) -> list[str]:
        """Every address worth trying, taken from Home Assistant's own adapters.

        Bounded by candidate_hosts(): a /24 is 254 addresses and sweeps in
        about a second, a /16 is 65534 and is refused outright. On a network
        that large the user types the address.
        """
        hosts: list[str] = []
        try:
            adapters = await network.async_get_adapters(self.hass)
        except Exception:  # noqa: BLE001 - a convenience, never fatal
            _LOGGER.debug("could not read network adapters", exc_info=True)
            return []

        for adapter in adapters:
            if not adapter.get("enabled"):
                continue
            for ip in adapter.get("ipv4", []):
                address, prefix = ip.get("address"), ip.get("network_prefix")
                if not address or prefix is None:
                    continue
                for host in candidate_hosts(f"{address}/{prefix}"):
                    if host != address and host not in hosts:
                        hosts.append(host)
        return hosts

    async def _async_search(self) -> None:
        """Look once, on first entry to the form."""
        if self._scanned:
            return
        self._scanned = True
        hosts = await self._async_local_hosts()
        if not hosts:
            return
        try:
            self._found = await async_scan(
                hosts, session=async_get_clientsession(self.hass)
            )
        except Exception:  # noqa: BLE001
            _LOGGER.debug("scan failed", exc_info=True)
            self._found = []
        _LOGGER.debug("found %d Tide16(s) of %d addresses", len(self._found), len(hosts))

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}

        if user_input is None:
            await self._async_search()
        else:
            host = str(user_input[CONF_HOST]).strip()
            port = user_input.get(CONF_PORT, DEFAULT_PORT)

            # One unit per host: re-adding the same address should offer to
            # reconfigure it rather than build a second set of entities.
            await self.async_set_unique_id(f"{host}:{port}")
            self._abort_if_unique_id_configured()

            client = Tide16Client(host, port)
            try:
                await client.probe()
            except Tide16Error:
                # The unit answers on port 5555 only while it is awake, so this
                # is as likely to mean "it is in standby" as "wrong address".
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title=DEVICE_NAME, data={CONF_HOST: host, CONF_PORT: port}
                )

        configured = {
            entry.data.get(CONF_HOST) for entry in self._async_current_entries()
        }
        options = [
            SelectOptionDict(
                value=found["host"],
                label=(
                    f"{found['host']} - Tide16"
                    + (f" (firmware {found['version']})" if found.get("version") else "")
                ),
            )
            for found in self._found
            if found["host"] not in configured
        ]

        # custom_value: the list is a shortcut, not a restriction. A unit on
        # another subnet, or asleep when the scan ran, is still reachable by
        # typing its address.
        default = (user_input or {}).get(CONF_HOST) or (
            options[0]["value"] if options else ""
        )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_HOST, default=default): SelectSelector(
                        SelectSelectorConfig(
                            options=options,
                            custom_value=True,
                            mode=SelectSelectorMode.DROPDOWN,
                            sort=False,
                        )
                    ),
                    vol.Optional(CONF_PORT, default=DEFAULT_PORT): int,
                }
            ),
            errors=errors,
            description_placeholders={"found": self._found_message(len(options))},
        )

    @staticmethod
    def _found_message(count: int) -> str:
        if count == 1:
            return (
                "Found a Tide16 on this network. Pick it below, or type another "
                "address."
            )
        if count > 1:
            return (
                f"Found {count} Tide16 units on this network. Pick one below, or "
                "type another address."
            )
        return (
            "No Tide16 found on this network. A Tide16 in standby leaves the "
            "network entirely, so switch it on and try again - or type its "
            "address below if it is on a different subnet."
        )
