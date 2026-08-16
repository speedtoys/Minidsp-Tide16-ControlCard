"""Set the Tide16 up from the UI: one host, one connection test."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .api import Tide16Client, Tide16Error
from .api.const import DEFAULT_PORT
from .const import CONF_HOST, CONF_PORT, DEVICE_NAME, DOMAIN


class Tide16ConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST].strip()
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

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_HOST, default=(user_input or {}).get(CONF_HOST, "")
                    ): str,
                    vol.Optional(CONF_PORT, default=DEFAULT_PORT): int,
                }
            ),
            errors=errors,
        )
