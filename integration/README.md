# Integration files

The card needs three things that **do not exist** in the upstream
integration:

| | |
|---|---|
| `sensor.tide16_channel_levels` | All 16 channel levels, as one frame, plus the speaker each output is assigned to |
| `minidsp_tide16.request_fast_metering` | Temporarily raises the poll rate to 4 Hz |
| `button.tide16_scene_{red,green,yellow,blue}` | Recalls the four scenes the device stores itself |

The `tide16-metering.patch` file adds them to
[GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration](https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration)
**v0.28.0**.  (The filename is unchanged from when metering was all it
did, so existing instructions keep working.)

**Why a diff and not the finished files?** Because the finished files
are ~1,500 lines, only 340 of them mine.  Shipping them would republish
Gael's integration under a different name, which is not what this repo
is.  The diff carries my 340 lines and nothing else of substance - you
install his integration normally, from his repo, and this adds to it.

## Apply

With his integration already at `config/custom_components/minidsp_tide16`:

```bash
cd /config
patch -p1 --dry-run < /path/to/tide16-metering.patch   # check first
patch -p1 < /path/to/tide16-metering.patch
```

Then restart Home Assistant.

It touches five files and creates `services.yaml`.  Nothing is deleted
and only two existing lines are rewritten - one import gains `callback`,
and the peak assignment is split so the per-channel array can be kept
alongside it - so if you have local edits to those files the patch
should still land.

No `patch` command?  It's a readable diff: lines starting with `+` are
the additions, and `@@` headers give the line numbers to add them at.

## Verify

- **Developer Tools > States** - `sensor.tide16_channel_levels` exists,
  its `channels` attribute is a list of 16 numbers, and `channel_names`
  names your speakers (`LeftFront`, `Center`, `Sub`...).
- **Developer Tools > Actions** - `minidsp_tide16.request_fast_metering`
  is listed.
- **Developer Tools > States** - four `button.tide16_scene_*` entities
  exist.  Pressing one recalls that slot; a slot you have never saved on
  the device recalls nothing, which is not a fault.

## Then exclude it from the recorder

While the card is on screen this entity updates **4x/sec**, each update
carrying a 16-float attribute.  In `configuration.yaml`:

```yaml
recorder:
  exclude:
    entities:
      - sensor.tide16_channel_levels
```

## After an upstream update

HACS overwrites `custom_components/minidsp_tide16` whenever it updates
the integration, taking these changes with it.  Reapply and restart.

If upstream has moved past v0.28.0 the patch may fuzz or reject -
`patch` will say so, and only the affected hunk needs placing by hand.

## What it changes

Six files, ~340 lines.  No upstream behaviour is modified.

**`const.py`** - adds `FAST_RMS_INTERVAL` (0.25 s) and
`FAST_METERING_HOLD` (3 s), plus the measurements the numbers came
from.

**`coordinator.py`** - adds `_channels_db()`, which keeps the
per-channel values that `_peak_db()` was already receiving and
discarding.  They are ordered by the device's own 1-based `index` field
rather than by array position, so a bar can never end up attached to
the wrong channel if the device returns them out of order.  Also adds
`async_request_fast_metering()` and its self-cancelling timer.

**`__init__.py`** - registers the service, guarded by `has_service()`
so a reload doesn't double-register.

Also adds `_apply_output_speakers()` and
`_apply_custom_out_port_names()`, fed by two endpoints the integration
did not previously call.  `get_output_speakers` returns the speaker
assigned to each output (`{"1": "LeftFront", ... "11": "Sub2"}`), keyed
by the same 1-based index the metering is sorted by;
`get_custom_out_port_names` returns any names the owner set on the
device itself, which win over the stock ones.  Both are requested once
at startup alongside `get_source_names`, and flattened into a
positional `channel_names` list.

**`sensor.py`** - adds `Tide16ChannelLevelsSensor`.

**`button.py`** - adds `Tide16SceneButton`, four of them, one per scene
slot the device stores.  The colours are the device's own names for the
slots, in the order its web UI and front panel use them: red, green,
yellow, blue = index 0-3.

**`coordinator.py`** (again) - adds `async_recall_scene()`, which sends
`set_scene`, and `async_set_preset()`, which sends `set_preset`.  Preset
ids are **not** contiguous - the hardware here reports 1, 3..12 - so they
are treated as opaque labels rather than an index to count through.  No
entity is wired to `async_set_preset()` yet; it is there because the
endpoint exists and the preset readout is otherwise read-only.

**`services.yaml`** - new file; service description for the UI.

### Why there is no "save scene"

The device recalls with `set_scene` and **overwrites** with `save_scene`,
and the stock web UI only ever sends the latter - so the endpoint that
reads like the obvious one is the destructive one.  A save has no undo:
it replaces a stored snapshot with whatever the box is doing right now.
Exposing that as a Home Assistant button, one mis-tap away from a
dashboard, is not worth it.  Save from the stock UI at
`http://<host>:5050` instead.

### Why the hold is a deadline and not a flag

The `async_request_fast_metering()` call pushes out a timestamp.  Every
exit from fast polling is that deadline lapsing, so nothing has to
actively cancel anything - a card that vanishes without saying so (tab
closed, view switched, lid shut, background tab throttled, card crashed)
costs at most 3 seconds of extra polling.  There is no state that can
get stuck fast, and there is deliberately no "stop" service.  The idle
`RMS_REFRESH_INTERVAL` timer is never touched and resumes as the cadence
the moment the fast timer removes itself.

### Why the levels are one attribute and not 16 sensors

A meter wants them as one coherent frame, and one entity churning at
4 Hz is very different from sixteen doing it.

The sensor's *state* is the peak rounded to whole dB, because the state
is what the recorder would store and an unrounded peak changes on
essentially every poll.  The `channels` attribute carries the real
precision.

### What it deliberately does not add

The dB-to-bar-height mapping.  That is a display choice; the integration
reports raw dB and the card decides how to draw it.

It also does not invent a meter reference level.  The card currently
infers one from `number.tide16_volume`, because the device does not
report it over the API.  If miniDSP exposes those values, the right fix
is a sensor here carrying the real number - not a better guess in the
card.

## Measurements

Taken on live hardware while validating this, in case they save someone
else the trouble.

Polling at 3.86 Hz, 40/40 replies: median round-trip **3.7 ms**, p95
**36 ms**, max **104 ms** - comfortably inside the 250 ms budget.

Real content (Dolby Digital Plus 7.2.2, -42 dB master): p05 -80.6,
median -62.7, p95 -46.0, max **-42.9** dB.  That max landing on the
master volume setting is why the card anchors its scale to
`number.tide16_volume` instead of to fixed dB values.

**The trap:** an idle link looks identical to a working one at every
level *except* the metering itself.  The `sensor.tide16_stream` entity
reports the negotiated format and `speaker_config` reports 7.2.2 with
nothing playing at all, so both look like proof of playback and are not.
During true silence every channel reads exactly `-122.5`, which is
easily mistaken for "the firmware never populates this array".  Only the
metering moving proves playback.

## Upstreaming

These changes are offered upstream.  If they land in a future release of
Gael's integration this directory goes away, and the card will simply
require that version.
