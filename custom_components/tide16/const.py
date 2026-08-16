"""Constants for the Tide16 integration."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "tide16"

CONF_HOST: Final = "host"
CONF_PORT: Final = "port"

# The panel and its art are served by the integration itself, so there is no
# resource to register by hand and nothing to copy into `www/`.
STATIC_URL: Final = "/tide16_static"
PANEL_JS: Final = "tide16-panel.js"

MANUFACTURER: Final = "miniDSP"
MODEL: Final = "Tide16"

# The device name decides every entity_id on the panel (sensor.tide16_status
# and the rest), so it is fixed rather than user-supplied.
DEVICE_NAME: Final = "Tide16"

SERVICE_VOLUME_STEP: Final = "volume_step"
ATTR_DELTA: Final = "delta"

DOLBY_PROFILES: Final = ("off", "movie", "music", "night")

# The upmixer, which the unit calls the "decoder". Its own control page labels
# datmos "Dolby" and dts "Neural:X"; the front panel shows the Dolby AUDIO and
# dts:x lockups for them, and nothing at all for native.
UPMIXERS: Final = {"native": "Native", "datmos": "Dolby", "dts": "DTS-X"}
SCENES: Final = ("red", "green", "yellow", "blue")
