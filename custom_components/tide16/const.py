"""Constants for the Tide16 integration."""

from __future__ import annotations

from typing import Final

from .api.const import SIGNAL_DB

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

SERVICE_MEASURE_LEVEL: Final = "measure_output_level"
ATTR_DURATION: Final = "duration"

# Recall a preset by its id.  `select.select_option` is core Home Assistant
# and can only take a string that is already in the option list, so naming a
# preset on the unit - which turns the option "2" into "2: Movie" - breaks
# every automation that stored the number.  This takes the id and nothing
# else, so a rename cannot reach it.
SERVICE_SET_PRESET: Final = "set_preset"
ATTR_PRESET: Final = "preset"

# --- audio detection -------------------------------------------------------
# What counts as silence is not the same level on every system, which is why
# these are settable at all: an analog input, or a source that keeps a
# low-level signal alive between tracks, sits far above digital silence.  The
# defaults are measured rather than chosen - see api/const.SIGNAL_DB and
# coordinator._apply_signal.
CONF_SILENCE_LEVEL: Final = "silence_level"
CONF_SILENCE_HOLD: Final = "silence_hold"

DEFAULT_SILENCE_LEVEL: Final = SIGNAL_DB
DEFAULT_SILENCE_HOLD: Final = 4.0

# Guard rails, and they are not decoration.  Under the lower bound an input's
# own noise floor can hold the sensor on for ever, so it never reports silence
# and an automation waiting for it never fires - the worse of the two failures.
# Over the upper bound ordinary quiet material reads as silence, which is the
# flapping this whole design exists to stop.
MIN_SILENCE_LEVEL: Final = -110.0
MAX_SILENCE_LEVEL: Final = -45.0
MIN_SILENCE_HOLD: Final = 1.0
MAX_SILENCE_HOLD: Final = 60.0

DOLBY_PROFILES: Final = ("off", "movie", "music", "night")

# The upmixer, which the unit calls the "decoder". Its own control page labels
# datmos "Dolby" and dts "Neural:X"; the front panel shows the Dolby AUDIO and
# dts:x lockups for them, and nothing at all for native.
UPMIXERS: Final = {"native": "Native", "datmos": "Dolby", "dts": "DTS-X"}
SCENES: Final = ("red", "green", "yellow", "blue")
