"""The Tide16's WebSocket vocabulary.

Every name here was read off a live unit (Tide FW 1.16.6, HDMI 1.48/1.d) -
either from the endpoint list the processor's own control page on port 5050
builds its UI from, or from a recorded session against the hardware.  Nothing
is inherited from another implementation.

The wire format is small enough to state completely:

    request       {"endpoint": "<name>", ...args}
    reply         {"req": "<name>", "status": "OK", "data": <payload>}
    notification  {"notification": "<name>", "value"|"data": <payload>}
    greeting      {"val": "Hi from coordinator", "endpoint": ""}

Replies carry the endpoint back in `req`, which is what makes correlation
possible at all - there is no request id.  Setters mostly do NOT reply; the
unit confirms them by pushing a notification instead, so a setter that waits
for a reply waits forever.
"""

from __future__ import annotations

from typing import Final

DEFAULT_PORT: Final = 5555

# --- reads -----------------------------------------------------------------
GET_STATUS: Final = "get_coordinator_status"
GET_VOLUME_DB: Final = "get_volume_db"
GET_MUTE: Final = "get_mute"
GET_SOURCE: Final = "get_source"
GET_SOURCE_NAMES: Final = "get_source_names"
GET_STREAM: Final = "get_stream_properties"
GET_PRESET_INDEX: Final = "get_current_preset_index"
GET_PRESETS: Final = "get_all_presets"
GET_SPEAKER_CONFIG: Final = "get_speaker_config_number"
GET_OUTPUT_SPEAKERS: Final = "get_output_speakers"
GET_DIRAC_STATE: Final = "get_dirac_state"
GET_DIRAC_MEASURING: Final = "get_dirac_measuring_mode"
GET_BLUETOOTH: Final = "get_bluetooth_status"
GET_RMS_DB: Final = "get_rms_block_db"
GET_SETTINGS: Final = "get_settings"
POLL: Final = "poll"

# Everything the unit pushes on its own is still requested once at connect,
# and re-requested on the slow safety-net sweep in case a push was missed
# across a reconnect.  get_settings is the odd one out: nothing pushes it, and
# it is the only source for the input table, the Dolby profile and firmware.
REFRESH_ENDPOINTS: Final = (
    GET_STATUS,
    GET_VOLUME_DB,
    GET_MUTE,
    GET_SOURCE,
    GET_SOURCE_NAMES,
    GET_STREAM,
    GET_PRESET_INDEX,
    GET_PRESETS,
    GET_SPEAKER_CONFIG,
    GET_OUTPUT_SPEAKERS,
    GET_DIRAC_STATE,
    GET_DIRAC_MEASURING,
    GET_BLUETOOTH,
    GET_SETTINGS,
)

# --- writes ----------------------------------------------------------------
SET_VOLUME_DB: Final = "set_volume_db"
SET_MUTE: Final = "set_mute"
SET_SOURCE: Final = "set_source"
SET_SCENE: Final = "set_scene"
SET_PRESET: Final = "set_preset"
SET_DIRAC_STATE: Final = "set_dirac_state"
SET_BT_PAIRING: Final = "set_bt_pairing_mode"
SET_DOLBY_PROFILE: Final = "set_dolby_profile"
REBOOT: Final = "reboot"
SHUTDOWN: Final = "shutdown"

# set_dolby_profile is NOT in the control page's endpoint list - it was found
# by watching the unit - so a rejection means "this firmware doesn't have it",
# not "the request was malformed".
OBSERVED_ONLY: Final = frozenset({SET_DOLBY_PROFILE})

# --- pushes ----------------------------------------------------------------
# miniDSP's own docs warn that the unit sends more notifications than are
# documented, so unknown names are dropped rather than treated as errors.
N_STATUS: Final = "coordinator_status"
N_VOLUME_DB: Final = "volume_change_db"
N_MUTE: Final = "mute_change"
N_SOURCE: Final = "source_change"
N_SOURCE_NAMES: Final = "source_names_change"
N_PRESET: Final = "preset_change"
N_DIRAC_STATE: Final = "dirac_state"
N_DIRAC_MEASURING: Final = "dirac_measurement_mode"
N_STREAM: Final = "stream_changes"
N_BLUETOOTH: Final = "bluetooth_status"
N_SPEAKER_CONFIG: Final = "speaker_config_number_change"

# --- ranges ----------------------------------------------------------------
# The documented set_volume_db range: -127.5 dB is effectively silent, 0.0 is
# maximum.  Anything outside it is clamped before it reaches the wire.
MIN_VOLUME_DB: Final = -127.5
MAX_VOLUME_DB: Final = 0.0

# The unit reports 16 output channels whatever the speaker layout; unused ones
# sit at the floor.  Measured silence on this hardware is about -125 dB.
CHANNEL_COUNT: Final = 16
SILENCE_DB: Final = -70.0
