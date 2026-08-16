# Changelog

## v2.0.0 - 2026-08-15

**This repo is an integration now.**  It speaks the Tide16's WebSocket API
itself, and everything that used to be assembled by hand around the card is
gone: the third-party integration and the patch over it, three python scripts
run as `command_line` sensors, a 194-line package of template sensors and
scripts, five stanzas of `configuration.yaml`, the `www/` copy of the plate art
and the Lovelace resource with its hand-bumped cache-buster.

Install is now: add the repo to HACS as an **Integration**, add the device from
Settings > Devices & services, paste the view.  Nothing else.

**The API layer has no Home Assistant in it.**  `custom_components/tide16/api/`
is a plain async WebSocket client that runs from a terminal -
`python3 -m api 192.168.1.212`, run from inside that folder, prints the unit's
live state - which is what makes the protocol testable without a Home Assistant at
all.  Above it sits a coordinator, and above that the entities.

The protocol was captured from the hardware rather than ported: requests are
`{"endpoint": ...}`, replies come back as `{"req", "status", "data"}` with no
request id (so correlation is by endpoint name), and eleven notifications are
pushed unasked.  Setters mostly do not reply at all - the unit confirms them by
pushing instead - so anything that waits for a setter's reply waits forever.

**Metering stopped being entity state.**  Sixteen channel levels four times a
second was a `recorder` problem that every user had to solve by hand with an
exclusion in their own configuration.yaml, plus a service to raise the poll rate
and a keepalive from the card to hold it there.  The card now subscribes to
`tide16/levels/subscribe`; frames go straight from the coordinator to the
browser, the 4 Hz cadence runs only while at least one subscriber exists, and
closing the tab is the unsubscribe.  Measured on the live unit: 4.3 Hz to the
browser, and nothing in the database.

**Everything the panel prints is a real entity.**  The split volume, the kHz
sample rate, the Atmos flag and the held channel legend were `template:` blocks;
the Dolby profile, the input table and the firmware versions were python scripts
shelling out to the device.  All seven come from the coordinator now, and the
Dolby profile is a proper `select` entity rather than a sensor plus a
`shell_command`.

**Fixed: "Dolby Digital Plus without Dolby Atmos" lit the Atmos badge.**  The
old template asked whether "atmos" appeared anywhere in the stream description,
which is true of the string that exists to tell you there is none.  The
negations are stripped before the test now.

Entity ids are unchanged, so recorder history carries across the swap - but the
old registry rows have to be removed first or Home Assistant hands the new
entities `_2` suffixes.  See the upgrade notes in the README.

## v1.1.12 - 2026-08-15

Four changes to the panel's controls, and one bug that only a real reboot
could have found.  (1.1.9 through 1.1.11 were steps taken on a live panel;
they ship together here.)

**The power symbol moved into the standby dome, and lights with the unit.**
It used to float above the dome with its own painted-on dish, which put two
buttons on the plate where the hardware has one.  It now sits *in* the dome -
the real power button - half again as large, 33px of art to 49.5px, and
coloured by state: `#B300FF` while the unit is on, `#F52727` when it is not.

Centring it meant measuring the dome from its **poles**, not from an ink
bounding box.  The dome carries a specular highlight and a soft shadow down
its right side, which a threshold reads as real geometry: the bbox centres on
x=1161.5, while scanlines y140, y150, y250 and y260 all come out symmetric
about x=1151.0.  Anything centred on the bbox sits ~10px right of the button
it belongs to.

The colour comes from a new `color_entity` on `tide16-glyph`.  The PNG stops
being an `<img>` and becomes a CSS **mask**: its alpha is the shape and the
colour is the element's own background, so one file serves both states and
the hex is exact rather than whatever a filter chain lands on.  Anything that
is not a live `on` reads as off - unknown, unavailable, no entity at all.
That fail-safe is the only honest mapping here: standby takes the Tide16 off
the network, so "I cannot see it" and "it is off" are the same fact.

**The reboot button moved to the bottom corner, and says what it is.**  It
mirrors the Bluetooth PAIR button at the other end of the black section, and
every number is taken from it rather than eyeballed: same vertical (x1278),
same 48px box, same 4px between the glyph and its caption, and the 15px PAIR
sits from the very top is the 15px this sits from the very bottom.  The
caption is set in the Dolby profile list's type - 0.804cqw / 400 / `#B7B8B8` -
so "Reboot" and "Movie" are the same words on the same panel.

**A press now flashes the button until the unit is back.**  A reboot takes
the Tide16 off the network for about half a minute and the whole panel dashes
out while it is gone, so the one control with a real wait behind it was the
one that looked like it had done nothing.  The glyph rotates the power
symbol's two hexes - `#B300FF` to `#F52727`, a second a step - for as long as
the unit is away, and stops on the first tick after it answers.  The flash is
the progress bar.  60s is the hard stop: if it has not come back by then the
glyph rests at grey rather than blinking forever.

Two things have to be true for that to work, and the first attempt had both
wrong.  Both were found by pressing the button, not by reading the code:

- **`off` is not `unavailable`.**  Through a reboot the media_player reports
  `off` with `status: "not connected"` - it never goes unavailable - so a
  check that merely excluded unknown/unavailable read a rebooting unit as a
  live one and ended the wait before it had begun.  Liveness is a whitelist
  now: `busy_live_states`, default `['on']`.
- **A unit can only come back if it went away first.**  For the seconds
  between the press and the unit actually dropping off the network it is
  still answering, so "live" on its own ended the cycle a beat after it
  started.  The run waits to *see* it go down before a live reading may end
  it.

Measured on a real press: gone at 23:43:55, back at 23:44:27.  32 seconds,
well inside the 60s stop.

**Volume ±20 on the knob ring.**  The lower diagonals were the only part of
the ring still free, and they keep the ladder reading outward from the knob.
`at` takes a fraction, so 4.5 is half past four - 135 degrees - and 7.5 is
half past seven, 225.  Whole hours leave the two corners unreachable for no
reason at all.

Also in the card, and not yet wired into the view this repo ships:
`tide16-readout` rows can scroll when a value overflows its cell (`scroll`),
and `tide16-inputs` can read the device's own sources map to grey out and
disable the inputs the Tide16 has hidden, and to follow renames
(`source_entity`).  Both want sensors that are not in `packages/` yet.

## v1.1.8 - 2026-07-27

**Fixed: the idle panel often never started.**  `_syncKeepalive` runs
when the IntersectionObserver first reports the element, and it only ever
*stopped* the idle panel - starting it was left to `_render`, which runs
on a hass update.  The observer usually fires after the first of those,
and with the unit off the Tide16 entities are static, so whether the
panel ever began came down to unrelated state changes elsewhere in Home
Assistant.  Measured before the fix: 4 of 6 fresh page loads showed
nothing at all.  After: 6 of 6, each opening on a different string.

The selection itself was never at fault, and was measured rather than
assumed: 557 consecutive plays gave 150 distinct strings with the first
repeat at index 150 - every one shown before any repeats - and no
adjacent repeats.  Across 3000 shuffles the opening pick is uniform
(chi-square 140.8, df 149, inside the 3-sigma band 97..201) and every
string appears.

## v1.1.7 - 2026-07-27

**"Unknown" can no longer appear on the panel.**  A cold start has two
windows where there is nothing to show, and only one of them was covered:

    t+6s  -> t+21s    the entities do not exist yet
    t+21s -> t+34s    they exist and read `unknown`

No template can fix the first window - there is no entity to template -
so the placeholder had to move into the card.  Every plain `state-label`
on the plate is a `tide16-readout` row now, and a row falls back to its
placeholder for *all* of: no hass yet, no such entity, no such attribute,
and a state of `unknown` or `unavailable`.  The panel draws its dashes
from the first paint.

Two things fall out of that:

- **The volume needs no `conditional` blocks.**  The integer's
  placeholder is the whole `-.-` at one size and the decimal's is empty,
  so a missing reading is one clean string rather than a big hyphen, a
  small hyphen and a dot on three different baselines.
- **The `*_display` mirror sensors are gone.**  They existed only to
  inject a dash, so the card reads `sensor.tide16_source`,
  `_speaker_config` and `_preset` directly.

**Fixed:** the decimal half printed `.-` when the unit was off.  The
template sensors were returning a literal `"-"`, which looks like a real
reading to everything downstream, so the row's `.` prefix was applied to
it.  The sensors are `availability` gated again and substitute nothing -
the card is the single owner of "there is no value", and `prefix` is only
ever applied to a real one.

Anchors are unchanged: all six converted elements land within 0.02 canvas
px of where they were, so dropping `state-label`'s `-8px` padding
cancellation moved nothing.

## v1.1.6 - 2026-07-27

**The power and reboot glyphs are panel buttons now** - a shallow dish
milled into the plate, with a 1px rim.  The gradient is lit from BELOW,
dark at the top wall climbing to light at the bottom; the same gradient
flipped reads as a raised dome instead, which is why the standby button
between them looks the opposite way round.  Their icons are 20% smaller
and sit in the dish with room around them.

**Fixed: the power button could never turn the unit on.**
`media_player.tide16` advertises `supported_features: 2316` - no
`TURN_ON` - but the script's default branch called it anyway, so the
service raised and the press did nothing.  It is power OFF only now, and
a press while the unit is already off is a clean no-op.  The Tide16
cannot be woken over its own API at all: standby tears down its network
stack, so port 5555 and the web UI both stop answering.

**Fixed: the buttons were centred ~10px off.**  They were placed on the
ink bounding box of the standby button, which centres on x1161.5 - but
that is skewed by the specular highlight and soft shadow down the dome's
right side.  Measured at the circle's top and bottom poles it centres on
x1151.0, and that is where the three now line up.

**The live selection is lime green with a white border**, on the source
selector and the profile column alike, so the choice reads from the
button and not only from the label's weight.  The profile options now
match the source rows exactly - same size, same weight - rather than the
heading above them.

`Game` became `Night`: the firmware's own profile list is off / movie /
music / night, and `game` is commented out in the device's web UI, so it
was never selectable.

**Every selectable control was audited** against the running device: 33
of 33 resolve to a live service and entity, all 12 source names match the
device's `source_list` exactly, the volume deltas sit inside the entity's
own `-127.5..0` bounds, and each control is the topmost hit target at its
own centre.  Everything the card calls belongs to the Tide16.

## v1.1.5 - 2026-07-26

**The panel reads as a panel when the Tide16 is off.**  Every entity goes
`unavailable` with the unit down, and a picture-elements `state-label`
prints that state localized - so the plate filled with the word
"Unavailable", the volume one overflowing the screen window because it is
right-aligned to the baked `dB` mark.  Every field now falls back to a
single `-`, and the volume to `-.-`.

The screen fields drop their `availability` templates and return the
placeholder instead.  `sensor.tide16_source`, `_speaker_config` and
`_preset` belong to the upstream integration and cannot carry one, so
they are mirrored as `*_display` sensors.  `tide16-readout` and
`tide16-channels` take a `placeholder` option, defaulting to `-`, which
is what turns a dangling `Decoder:` into `Decoder: -` and stops the
output legend from vanishing heading and all.

The volume placeholder needed its own element.  The integer/decimal split
relies on both halves being DIGITS: a hyphen's ink is centred on the em
box rather than sitting on the baseline, so feeding `-` through the two
differently-sized labels drew three stray marks.  The digits are now
wrapped in a `conditional`, with a second branch drawing `-.-` as one
string at one size.

**A Dolby profile column** - Movie / Music / Game / Off - in the void
between the scene bars and the standby button.  The heading's "Dolby" is
the double-D mark: `tide16-readout` takes a `title_image`, baseline
aligned and sized in em off the cap height, so the mark measures exactly
as tall as the capital beside it.

The options are `tide16-inputs` as one column of four, so the dot, the
label and the white/underlined/larger active state are the ones already
on the plate.  They register to the scene column rather than being
measured independently - same box, same gap - which puts each row on its
colour bar by arithmetic instead of by eye.

Options are **Movie / Music / Night / Off**, mirroring the firmware's own
list.  `game` appears in the device's web UI source but is commented out
there, so it cannot be selected on this hardware.

`tide16-inputs` also gained a `weight` option.  Matching the heading's
font-size was not enough to make the options read the same size as it:
the labels defaulted to 400 against every plate heading's 300, so at an
identical `1.070cqw` they still looked bigger.  The source rows keep 400;
the Dolby column sets 300.

**The profile column drives the real device.**  The integration has no
endpoint for it, but the Tide16 does: read `get_settings` ->
`data.dolby.profile`, write
`{"endpoint": "set_dolby_profile", "profile": "movie"}`.  So
`scripts/tide16_dolby.py` talks to the unit's own websocket, exposed as a
`command_line` sensor for the read and a `shell_command` for the write,
with `homeassistant.update_entity` fired straight after a set so the card
never shows a stale selection.  The column now reflects what the
processor is actually doing, and tapping it changes the processor.

> The script runs inside the Home Assistant container, so it uses
> **aiohttp**, not `websockets` - the latter is not installed there.  A
> second connection alongside the integration's own is fine; the device
> accepts concurrent clients.  With the unit off it prints `unknown`, so
> the sensor degrades to the panel's `-` rather than going unavailable.

**Fixed:** `tide16-inputs` cells inherited the grid default
`min-height: auto`, so a cell taller than its `1fr` track grew the track
instead of overflowing it - which walked the rows up to 12px clear of
whatever the box was aligned to.

**The output-channel legend latches.**  It reads a new trigger-based
`sensor.tide16_channel_names_held` instead of `sensor.tide16_channel_levels`
directly.  The live sensor goes unavailable with the unit and took the
whole legend with it, but the assignment only changes when the speaker
layout is reconfigured - so the last known list is what a dark panel
should keep showing.  Trigger-based because it has to read its own
previous value through `this`, and because those entities restore across
a restart; a minute tick re-latches it, since the attribute-change
trigger alone would never fire on a layout that never changes.

**Licensing is now stated file by file.**  The MIT grant covers the
source code only - `dist/`, `lovelace/`, `packages/`, `integration/` -
and `LICENSE` says so, so it no longer reads as covering everything when
opened on its own.  Every binary in `assets/` and `docs/` is listed in
the README with its origin and status; all ten are **excluded**, since
none are original artwork and several have unconfirmed provenance.
Previously only `bt.png` and `reboot.png` were called out, which left
the plate art, the Dolby and Dirac marks, `power.png` and the screenshot
riding on the grant by omission.

## v1.1.0 - 2026-07-26

The card was one element - a bar meter - on a photo of the plate.  It is
now the whole front panel, on new 1990x400 artwork with the baked-in
readings removed.

**Six new elements**, all in the same single JS resource:

| | |
|---|---|
| `tide16-channels` | The output legend, folding to two columns when the type hits its px floor and one row would overrun the plate |
| `tide16-readout` | A titled block of live values - Program, Preset, and static text like the version stamp |
| `tide16-inputs` | The 12-source selector.  The live source is drawn white, underlined and larger |
| `tide16-buttons` | The scene column.  Fixed aspect off the box width, so a resize can never squash a button |
| `tide16-knob-labels` | Text placed around the volume knob by clock hour - one box to measure instead of eight `left`/`top` pairs |
| `tide16-glyph` | A PNG with a tap and hover text |

**Hover text on every control**, saying what the click will do rather
than repeating the label - `Volume down 2 dB`, not `Vol:-2`.
`tide16-glyph` exists because of this: `picture-elements`' own `image`
element accepts a `title` but hangs it on the inner `<hui-image>` while
its clickable wrapper covers it, so the cursor lands on an element with
no title in its ancestry and no tooltip ever appears.

**The scene buttons drive the device's own scenes.** The Tide16 stores
four whole-box snapshots and names the slots by the colours on its front
panel - red, green, yellow, blue = index 0-3, the colour order the card
draws.  `integration/tide16-metering.patch` adds
`button.tide16_scene_*` to recall them.  Note the asymmetry that makes
this easy to get wrong: the device **recalls** with `set_scene` and
**overwrites** with `save_scene`, and the stock web UI only ever sends
the latter - so the endpoint that reads like the obvious one is the
destructive one.  Saving stays in the stock UI; it has no undo.

**Also**

- Bluetooth pairing, power and reboot as tappable glyphs on the plate.
- `async_set_preset()` in the patch, for the Dirac preset endpoint.  No
  entity on it yet - preset ids are not contiguous (this hardware
  reports 1, 3..12), so they are opaque labels, not an index.
- `packages/tide16_panel.yaml` now carries the sample-rate and Atmos
  sensors and the two scripts the panel calls.  The knob's relative dB
  steps have to be server-side, because Lovelace tap data is literal and
  cannot read the current level.
- The card logs `TIDE16 1.1.0` on load, and the plate carries a small
  black `v1.1` in the bottom-right of the silver end panel.  The
  frontend caches `/local/` hard and the resource `?v=` is the only
  thing that busts it, so which build a browser has should be one glance
  rather than a guess.
- The patch is regenerated against upstream v0.28.0: six files, ~340
  added lines, nothing deleted.

**Upgrading from v1.0.0.** Copy the new `assets/*` (the plate is a new
filename, `plate-v2.png`), reapply the patch, bump the `?v=` on the
resource, and take the new `lovelace/tide16-panel.yaml` - every position
moved when the canvas went from 2622x542 to 1990x400.

## v1.0.0 - 2026-07-26

First release.  The live 16-channel meter, its `picture-elements`
framing, the volume-anchored dB scale, and the on-demand fast-metering
patch against
[GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration](https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration)
v0.28.0.
