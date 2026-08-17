# Changelog

## v2.5.1 - 2026-08-17

### Auto dim: the display follows the sun

A **DIM** button, top-right of the Source cell, walks the front panel's
brightness between a day and a night level across a window either side of
sunrise and sunset, using the sun at the Home Assistant location's own
coordinates - so it tracks the season without anybody editing a schedule twice
a year. White while it owns the display, grey while it does not.

`set_brightness` is not in the endpoint list the unit's control page publishes
- that page has no brightness control at all - and was found by probing:
`{"endpoint": "set_brightness", "value": 0-100}`, which answers `OK` and
rejects any other argument name with "Key value should be present". A firmware
without it simply never dims.

Five entities, because these are Home Assistant's settings rather than the
unit's - the Tide16 has nowhere to keep a schedule - so they restore across a
restart instead of being read back from the device:

| | default | |
|---|---|---|
| `switch.tide16_auto_dim` | off | what the button toggles |
| `number.tide16_auto_dim_day_brightness` | 80% | |
| `number.tide16_auto_dim_night_brightness` | 20% | |
| `number.tide16_auto_dim_lead` | 30 min | before the sun event |
| `number.tide16_auto_dim_trail` | 15 min | after it |
| `sensor.tide16_auto_dim_target` | | diagnostic: what it is aiming at |

The rate is not a setting - it falls out of the range and the window. 80% to
20% across 45 minutes is 1% every 45 seconds; widen the window to slow it.
Switching auto dim off hands the display back at the day level rather than
leaving it wherever the ramp had got to. Nothing else about the display is
touched, and in particular its sleep timeout is left alone.

The ramp runs in the integration, not the card: a card runs once per browser,
so the same ramp would run several times over, and would not run at all with
no dashboard open.

### The meter was three times slower than the hardware

Two throttles, neither of them the device. Measured: the unit answers
`get_rms_block_db` **89 times a second** with a 5ms round trip, but the numbers
only change about every 90ms - so ~11 Hz is its real update rate.

- The coordinator polled at 250ms, under-sampling the hardware nearly 3:1.
- The websocket pushed to the browser on its own 250ms timer, which was the
  actual ceiling - raising the poll rate alone changed nothing.

Both now 100ms: **10 frames a second, 77 of every 80 carrying new values.**

**Opening the view no longer waits.** The idle meter sleeps five seconds
between reads and a subscriber could not interrupt it, so switching to the
Tide16 view held the last frame for up to five seconds before the bars moved.
The wait is now an event a subscriber trips: first frame arrives in **1ms**.

### The meter window

- **A vertical dB axis**, off by default (`axis`). Marks are the multiples of
  `axis_step` inside the scale; the labels ride inside the plot rather than in
  a gutter, because the window is not wide enough to spend a tenth of it on
  four numbers. The rules are the blue-green of an old fluorescent display's
  graticule, barely lit, with a faint bloom rather than a hard hairline.
- **`marker: dot`** draws a level as a column of dots - a period-sized trail
  under a larger head - which is what lets 30-odd bands fit where 16 bars go.
  The lowest rows fade toward the baseline so a floor full of quiet bands does
  not read as a solid line of light.
- **`level_gain`**, a trim on the drawn height applied after the dB scale.
  The channel meter uses 1.1: compared against the unit's own bars, ours read
  about a tenth short. The scale says what the numbers mean and the trim says
  how they are drawn - folding the difference into `ceiling_db` would have
  made the meter lie about its own units.

### Also

- `tide16-toggle` takes an `icon` (drawn as a mask filled with the button's own
  colour, so it dims with the label) and per-state `colors`, for a button whose
  label does not change with its state.
- The frequency/number row under the meter follows the axis inset, so a label
  cannot end up under the gutter belonging to no column at all.

## v2.5.0 - 2026-08-17

### Every setting the unit has, as entities

`get_settings` returns the whole configuration of the processor and the
integration already asked for it every five seconds - and then used four
fields of it.  The rest is now exposed, whether or not the panel card has any
use for it:

- **Dolby**: loudness management, centre spread, upmixing, direct decoding,
  volume leveler, DRC mode/cut/boost, speaker virtualizing mode and its four
  angles, height speakers.
- **DTS**: direct mode, upmix, analog compensation, type-1 relabel, dialog
  control, DRC percentage, mask.
- **Bass management**: enable, crossover, the five routing flags, the LFE
  gains, the manager in use.
- **Dirac**: gain, delay, filter index, slot, whether a filter is loaded.
- **The unit itself**: bypass, flip centre/sub, display sleep and brightness,
  web-UI dark mode, automatic updates, sample rate, bit depth, channel count,
  the USB interface's rate/depth/channels, sub and dialog gain, lipsync delay,
  max volume, lock state, settings file, Concord version, sample-rate
  conversion.
- **The 16-wide tables** - channel gains, mutes, phase, delays, crossovers,
  PEQ, the routing matrix, the speaker table and the source table - as one
  entity each with the values in the attributes.  Sixteen outputs times five
  properties would be eighty entities for something almost nothing adjusts
  from Home Assistant, and the attribute form is what a template or a script
  wants anyway.

Writable wherever the unit has a setter, read-only where it does not (`sub_gain`
and `dialog_gain` have none on this firmware; only `set_channel_gain` writes a
gain, per output).  The argument names were read out of the unit's own control
page rather than guessed at.  Costs no extra traffic: it is the same reply the
coordinator was already reading.

### The meter window can show a spectrum instead of the channels

The 16 DSP channel bars are what the unit itself meters.  This adds a second
thing the same window can draw: **a 31-band third-octave spectrum of what the
room is actually hearing**, as dot columns - a period-sized trail with a
larger head dot - in the power button's purple.  Dots rather than bars because
31 bars do not fit where 16 go.

**The integration does not measure anything.**  It is handed an entity whose
attribute is an array of dB values and draws it.  Where that array came from -
a microphone, a line input, another integration entirely - it neither knows
nor cares.  Nothing here depends on any particular hardware, and with the
option absent, which is the default, nothing about an existing install
changes.

Configured on the card:

```yaml
type: custom:tide16-panel
spectrum:
  entity: sensor.your_spl_sensor   # attribute holding an array of dB values
  attribute: bands
  label_attribute: frequencies     # optional: band centres, printed as 20 .. 20k
  bands: 31
  floor_db: 20                     # the scale, in whatever units your sensor reports
  ceiling_db: 90
  label_every: 3                   # print every third label - one per octave
  mode_entity: input_select.tide16_meter   # optional; adds a DSP/Freq button
```

With `mode_entity` set, both meters are built and each shows itself when that
entity reads its own state, so switching costs a display property rather than
a rebuild of the card - and a small **DSP / Freq** button appears in the Source
cell, showing which of the two is on screen.  The entity is an `input_select`
with two options (`Channels` and `Spectrum` by default, overridable with
`channels_state` / `spectrum_state`).  Without it, the spectrum simply replaces
the channel meter.

### What it takes to have one of your own

This is what the author's setup is, and it is all outside this repository:

1. **A measurement microphone.**  A **miniDSP UMIK-1**, plugged into the USB
   port of the machine Home Assistant runs on, with the calibration file that
   came with it (the 90-degree one, if the mic points at the ceiling).
2. **Capture has to run on the host, not in the container.**  Home Assistant
   in Docker sees the `/dev/snd` it was started with, so a microphone plugged
   in afterwards is invisible to it.  A small daemon on the host does the
   capture instead.
3. **A daemon that turns audio into bands.**  It reads the mic continuously,
   takes a window of it (0.5s is a good compromise - the 20 Hz third-octave is
   4.6 Hz wide and needs at least ~0.22s to resolve at all), computes a PSD,
   integrates it into the 31 ANSI S1.11 third-octave bands, applies the mic's
   calibration, and publishes the result.
4. **A way into Home Assistant.**  MQTT discovery is the least work: one
   sensor whose state is the wideband level and whose attributes carry
   `bands` and `frequencies`.
5. **A recorder exclusion.**  It publishes several times a second with 31
   values attached, and Home Assistant writes a row every time state or
   attributes change.
6. **Something to keep it running.**  A systemd unit, with
   `SupplementaryGroups=audio` - `/dev/snd` is `root:audio`, and the ACL that
   lets a desktop login read it belongs to the login session, which a service
   does not have.

Any other source works just as well.  The card asks only for an array of
numbers in an attribute.

### Also

- The channel meter grew a `marker: dot` form, a band count, an entity source
  and configurable labels - the spectrum is the same element pointed somewhere
  else, not a second meter implementation.
- `tide16-toggle`: a small two-state button for the faceplate, over any
  `input_select` or `input_boolean`, with a short label per state.

## v2.4.5 - 2026-08-17

**Outputs the decoder does not assign are named at last.**  `get_output_speakers`
only reports the channels the decoder lays out - 13 of them for 7.2.4 - so an
output driven by hand through the routing matrix metered correctly and then sat
in the legend with no name.  The unit does know: `get_custom_out_port_names`
holds whatever was typed into its own web UI at :5050.  It answers `{}` until
something is named, which is what made it look like a dead end.  It is now
polled alongside the speaker list and merged into the legend, a custom name
winning where there is one.  Nothing pushes it, so a rename takes up to the 60s
sweep to appear.

**Those names print as they were written.**  `RightRearOverhead` has to be
abbreviated to fit; `L-Mix` does not, and shortening it again produced `LM`.
The integration marks which outputs are the user's own words
(`custom_channels`) and the legend abbreviates only the rest.

**Fixed: a lone capital vanished from an abbreviated name.**  The word split
only matched a capital followed by lower case, so `L-Mix` abbreviated to `M` -
dropping the half of the name that said which side it was.  Separators are now
split before case, so `analyser left` gives `AL` rather than `A`, and an
all-capitals name like `LM` is kept whole instead of reduced to its initial.

**The legend fits on one line whatever it holds.**  A second line falls off the
bottom of the plate, and two more entries were enough to cause one on a narrow
card, where the type sits on its 11px floor and stops scaling with the plate.
The spacing between entries and the spacing between an output's number and its
name are now scaled together when, and only when, the row would otherwise wrap
- the ratio between them is what keeps it reading as a list of pairs.  The type
is never touched.  All sixteen outputs named is the worst case, and it fits.
Above roughly 1600px of plate nothing is squeezed at all.

**The legend stops at the reboot button** rather than at the edge of the screen
area, so its last entry cannot end up behind it.  `13 SW2` already touched the
button on a 7.2.4 layout.

**`Dolby Digital Plus without Dolby Atmos`** joins the shortened stream names,
as `DD+ W/O Atmos`.  **The "Output Channels:" heading is white**, matching the
rest of the legend rather than the dimmed index numbers.

## v2.4.4 - 2026-08-16

**Peak-hold markers are off by default**, and the meter's ballistics are
eased: attack 10ms to 45ms, decay 20 to 40 dB/s.  The rise is smoothed rather
than instant - still well inside one 250ms data frame, so no peak is missed -
and a bar now falls the full window in about 2.3s instead of 4.5s.

**`peak: false` actually works now.**  It never did: the guard in the
ballistics loop tested `_peaks`, the VALUE array, which is built for all 16
channels whatever the config says.  The ELEMENTS in `_peaks_el` only exist
when markers are on, so turning them off walked into an undefined element on
the first channel, threw, and took the whole animation loop with it - no bar
was drawn at all.  It tests `_peaks_el` now.

## v2.4.3 - 2026-08-16

**The meter is absolute now, like the hardware's own.**

It shows what is going out to each channel against a fixed reference, which is
why the unit draws small bars at -70 and pegs near -5.  Every version before
this anchored the ceiling to the volume entity and slid the window with it, so
the bars drew the same heights at every listening level - the one thing this
meter must not do.  No constant could fix that, which is why `headroom_db`
kept being wrong at some other volume.

Measured, not guessed: a pink-noise sweep from -122 to 0 dB, with video of the
unit's own display matched frame by frame against the logged per-channel dB.

| peak dB | what the hardware shows |
|---|---|
| -93.3 | nothing |
| -92.2 | nothing |
| -86.2 | one tiny nub |
| -84.7 | a few nubs |
| -77.2 | small but clear bars |
| -0.3 | pegged |

Bars appear between -93 and -86 and peg at about 0, so the window is
**0 .. -90 dB**.  It checks out across the range: -77 lands at 14%, -86 at 4%,
and on separate movie content at -26.5 master the channels spanned -38 to -83,
which is 58% down to 8% - all visible, the quiet ones low, exactly as the unit
showed them.

`ceiling_entity`, `headroom_db` and `range_db` are gone.  There is nothing to
tune: `ceiling_db` and `floor_db` are the scale.

The sweep also turned up what the unit's dB actually is, which is what made
this so hard to pin down: it is NOT dBFS.  `get_rms_block` (linear) and
`get_rms_block_db` sit a constant 4.5 dB apart, so linear 1.0 - real full
scale - reads +4.5 in the unit's numbers, and the peak did hit +4.78 at master
0.  The display still clamps at 0.

## v2.4.2 - 2026-08-16

**The meter stopped pinning every loud channel at 100%.**

Full scale was the volume setting.  It is the volume setting PLUS about 10 dB.
Measured across three master settings on real content:

| master | peak out | above master |
|---|---|---|
| -70 | -60.3 | 9.7 dB |
| -50 | -38.1 | 11.9 dB |
| -48 | -41.1 | 6.9 dB |

Dropping the master 22 dB pulled the peaks down with it, so anchoring the
window to the volume was right all along - it just sat ~10 dB too low, which
put four to six bars flat against the top on every frame and left the meter
saying nothing.  `headroom_db` (default 10) is that offset, and `range_db`
goes 40 to 45 because the headroom lifts the whole window and the quiet
channels would otherwise crowd the floor.  Measured after: peaks at 79-96%,
nothing pinned, 25-46% for the quiet channels.

The spread in that table is content, not error - three different passages.
And the unit does not publish its own meter reference: `get_rms_block` is the
same measurement in linear amplitude, and the display settings carry only
brightness, sleep time and colour, so this constant is the closest thing to
that reference there is.

**A 20px buffer above the plate.**  Padding on the card's host rather than a
margin on its wrapper - a margin collapses out of the shadow root and lands on
whatever the card sits under, which is how the panel ended up flush against
the top of the view.

**`binary_sensor.tide16_bitstream`**, carrying the device's own `is_bitstream`.

## v2.4.1 - 2026-08-16

**Settings now follow the device, not just Home Assistant.**  `get_settings`
is the only source for the upmixer, the Dolby profile and the source map, and
nothing pushes any of them - so a change made on the front panel, the remote
or the unit's own web page took up to a minute to appear.  It has its own 5s
loop now.  Not by turning `FULL_REFRESH` down: that drives a sweep of
fourteen endpoints, and pulling all of them up twelvefold is a lot of traffic
to aim at a unit for the sake of one reply.  Measured end to end: a decoder
changed straight at the device shows in Home Assistant in about a second.

**`In` says `Bitstream`.**  On a bitstream the unit sends `channel_config: ""`
and sets `is_bitstream`, so there is no channel count to render - its own
panel prints the word, and this now does too instead of falling back to a
dash.

**`Out` no longer claims `Upmixed` when nothing is being upmixed.**  It was
inferred from the selected upmixer, which only holds for LPCM: a native Atmos
bitstream is DECODED to 7.2.4, not upmixed to it, and the hardware prints
nothing under the layout.  `binary_sensor.tide16_upmixed` carries the device's
own `is_lpcm_upmixed` instead, and the row is a conditional, so absent is
exactly what appears.

**The sample rate keeps its decimal** - `48.0 kHz`, not `48 kHz`, which is
what the unit's panel shows.  `%g` was dropping the trailing zero.

**`Dolby Digital Plus with Dolby Atmos` is shortened to `DD+ W/Atmos`.**  At
35 characters it ran underneath the Dolby lockup, since the Program rows
shrink-wrap and the badge starts at x310.  Exact matches only - a stream this
does not know is passed through untouched, because guessing an abbreviation
for a format nobody has seen is how a panel ends up asserting something the
device never said.

## v2.4.0 - 2026-08-16

**The panel now follows the hardware, not a mock.**

Everything before this was anchored to `base-T16.pxd`, a design file - and the
shipping firmware does not draw that screen.  A photograph of a running unit
settled it, and the layout was rebuilt against the device:

* **There is no "Program" cell and no "Listening" cell.**  The unit's bottom
  strip is `ready` and a decoder badge on the left, then a three-column table
  headed **In / Out / Preset** on the right.  `plate-v3.png` is `plate-v2.png`
  with those two baked labels painted out - a new filename, because a plate
  replaced in place gets served from cache and presents as live bars animating
  behind painted ones.
* **The meter runs the full width**, x353..796 instead of stopping at x664.
  Nothing in the artwork ever stopped it: the only vertical rule in the whole
  meter band is the one at x343.  The old box was a habit inherited from a
  "badges cell" this design invented and the device does not have.
* **A decoder badge** - Dolby AUDIO, Dolby Atmos or dts:x, and nothing at all
  in Native, which is what the hardware shows.  Driven by
  `select.tide16_upmixer`, so plain conditionals can do it: the obvious
  alternative is an attribute, and picture-elements conditionals cannot see
  attributes at all - they silently fall back to testing the entity state and
  appear to work for the wrong reason.
* **A Dolby Modes column** - Native / Dolby / DTS-X - in the void to the right
  of the standby button, registered to the Profiles column's own geometry.
* **`ready` is violet**, where the plate used to bake "Program".  Measured off
  the photo at #BF6DFE, which is a blown camera highlight, so #A96BF5 goes in.
  It was #332050, effectively invisible.
* **The volume is the size the unit draws it** - its digits fill about 73% of
  the dB cell where ours filled 54% - and sized to the widest reading rather
  than the current one, so `-100.5` still fits.
* **The source and the In/Out/Preset table are white.**  The hardware carries
  that block's hierarchy entirely by size, not by tone, and at 12.6px full
  white is needed for it to read as white at all.
* **Reboot is red**, glyph and label.

A measurement worth keeping: the bottom rule the hardware draws lands at 0.635
of the screen, which is x514, against the x506 the plate already carried.  The
art and the firmware agreed all along; only the placement did not.

`docs/panel-layout.annotated.yaml` carries all of it - every box, and why.

## v2.3.0 - 2026-08-16

**The upmixer is now a control, not just a readout.**  `select.tide16_upmixer`
offers Native / Dolby / DTS-X and writes them with `set_forced_upmixer`.  The
unit calls this the *upmixer* when reading and the **`decoder`** when writing,
which is not guessable - it rejects the request until given that key.  This is
also the only field that tells Native apart from the rest: in Native the
decoder names carry straight on reporting whatever they last decoded.

**Real meter ballistics.**  The bars used to glide with a CSS transition,
symmetric and eased.  Now they rise on a 10ms constant and fall at a fixed
**20 dB/s**, with a peak marker that holds 1.2s and then falls at 8 dB/s.

The rate is the point.  An exponential ease closes a *fraction* of the
remaining gap, so a bar falling from -6dB moves fast and the same bar near the
floor crawls - the fall rate you perceive depends on where the bar happens to
be.  A real meter falls at the same dB/s everywhere, which is what lets two
channels be compared while both are decaying.  Peak markers are separate
elements rather than a border on the bar, because the bar is clipped and a
border would be clipped with it exactly when the marker needs to still be
visible.  Tunable per card: `attack_ms`, `decay_db_s`, `peak_hold_ms`,
`peak_decay_db_s`, `peak_height_px`, `peak_color`, and `peak: false`.  Setting
`decay_db_s: 0` restores the old CSS glide.

**`sensor.tide16_input_format`** - `channel_config` 2 becomes `2.0`, 6 becomes
`5.1`, 8 becomes `7.1`.  The unit prints this formatting on its own front
panel, so the decimal is the device's convention rather than an invention.  It
is a sensor because a dashboard can only print an attribute verbatim, and
doing it in a card template means a templating card re-rendering the whole
panel every time the stream twitches.

**The decoder no longer repeats itself.**  The unit suffixes "decoder" onto
every decoder name, so a panel row already labelled Decoder read "Decoder:
unknown decoder".  Trimmed at the sensor: `LPCM decoder` becomes `LPCM`, and a
name that carries no suffix (`DTS_NEURAL_X`) is left exactly as it is.

**Changing the Dolby profile no longer takes two taps.**

The unit accepts `set_dolby_profile` in about 3ms and actually applies it
about **570ms later**, and nothing pushes the change - a read-back is the only
confirmation there is.  The entity refreshed immediately after sending, so it
read the *old* value every single time and then sat one step behind until the
next periodic poll.  That is what made a profile change appear to need two
taps: the second tap's read-back was what finally reported the first tap's
change.

Now the requested value is shown at once, so a tap gets an answer immediately,
and the read-back is polled every 250ms for up to 3s until the device agrees.
If it never agrees the pending value is dropped and the device's own reading
stands - `set_dolby_profile` is not in the endpoint list the unit publishes,
so a firmware without it has to snap visibly back rather than leave a lie on
screen.

## v2.2.0 - 2026-08-16

**Setup finds the unit for you.**  Open the integration and it sweeps the local
subnet for anything listening on the Tide16's port, then opens a WebSocket to
each and asks `get_settings` - so what you get offered is a unit that identified
itself, not an address that happened to have a port open.  A /24 takes about a
second and a half.

**Why a sweep and not discovery.**  Measured on a live unit: it answers no SSDP
and advertises no mDNS service.  The only name it has on a network is whatever
that network's DHCP server chose to call it, which is a fact about the network
rather than the device - useless for recognising one anywhere else.  There is
simply nothing for Home Assistant's own discovery to catch, so the integration
goes and asks.

**Typing the address still works, and always will.**  The list is a shortcut,
not a restriction: the host field takes a free-typed address for a unit on
another subnet.  The sweep is bounded to networks of 512 addresses or fewer -
on anything larger it is skipped rather than turned into a network scan.

**When nothing is found it says why.**  A Tide16 in standby leaves the network
entirely, so an empty result is ordinary rather than an error, and the form says
so: switch it on and try again, or type the address.

The scan is in the Home-Assistant-free API layer with everything else, so it
runs from a terminal:

```
cd custom_components/tide16
python3 -m api --scan              # this machine's subnet
python3 -m api --scan 10.0.0.0/24  # another one
```

## v2.1.2 - 2026-08-16

Housekeeping, and the release the HACS submission points at.

**The workflows are hardened.**  `actions/checkout` v4 to v7 - v4 targets
Node 20, which GitHub is retiring, so the runner was forcing it onto Node 24
and warning on every run.  Both jobs now take an explicit read-only token:
neither validation writes anything, and the job was inheriting whatever the
repository's default Actions permission happened to be.

**Why a release for that.**  The HACS submission checklist asks for a release
created *after* the validations pass, and v2.1.1 predates the first all-green
HACS run - the topics that turned it green are repository metadata, so nothing
in the v2.1.1 tag was wrong, but the ordering the checklist asks for was not
there.  Now it is.

No change to the integration, the card or the panel.

## v2.1.1 - 2026-08-16

Everything the HACS default-store validation asked for, once it was actually
run rather than guessed at.

**`dependencies` was missing from the manifest.**  Hassfest caught it: the
integration uses `http` (to serve the card and the plate art), plus `frontend`
and `websocket_api`, and declared none of them.  This is not only lint - without
the declaration there is no guarantee `http` is set up before this integration
is, and the static path registration is the first thing setup does.

**A brand icon**, at `custom_components/tide16/brand/icon.png`.  Original work,
drawn by `tools/make_brand_icon.py`: a seven-bar level meter in the card's own
palette, on transparency so it carries on a light or a dark theme.  It had to be
drawn rather than taken, because everything else this repo displays belongs to
somebody else.

**`LICENSE` is now the MIT text and nothing else**, so GitHub can identify it -
it was reading as `NOASSERTION`, because the scope paragraph at the top of the
file defeats licence detection.  The scope statement and the image-asset
exclusions moved to [`NOTICE`](NOTICE), unchanged in substance.  A repo that
looks unlicensed is worse than one that is carefully licensed and says so
somewhere a parser can cope with.

## v2.1.0 - 2026-08-16

**The panel is a card now: `custom:tide16-panel`.**  Add the integration,
then Edit dashboard > Add card > "miniDSP Tide16 Panel".  It can be dropped
into a section, a masonry view or a panel view, and it reports `columns:
full` to a sections view so the 5:1 plate is not letterboxed.  The thousand
lines of measured element boxes that v2.0.0 asked you to paste now travel
inside the module, which also means a release can fix the geometry - a
dashboard someone pasted cannot be.

**Fixes the panel, which v2.0.0 broke.**  On v2.0.0 every element on the
plate renders as `Configuration error`.  The integration serves the module
through `add_extra_js_url`, which Home Assistant imports about 60ms into the
page - before its own bundle **replaces** `window.customElements` with a
scoped registry.  Everything therefore registered against the native
registry.  The browser still upgrades those tags where they already sit in
the DOM, which is why this looked fine in v1.x when the module was a
Lovelace resource loaded late, but the frontend looks an element up in the
*replacement* registry, so nothing it had to create by name existed.  The
module now registers again if the registry is swapped out under it.

**card-mod is no longer a dependency.**  It was there for two things: turning
on `container-type` (without which every `cqw` font on the panel silently
resolves against the viewport instead of the card) and stripping ha-card's
background, border and shadow.  The card declares its own container, and
switches the chrome off through ha-card's inherited custom properties - both
cross the shadow boundary without reaching into it.

**`scale` is a width, not a transform.**  The old view scaled the plate with
`transform: scale(0.75)`, which shrinks the paint but not the layout box, so
the card kept a band of dead space underneath.  Now the layout follows the
art.

`docs/panel-layout.annotated.yaml` keeps the derivation of every percentage -
what each box was anchored to on the artwork, and why.  `tools/build_layout.py`
writes the card's copy from it and `tools/check_layout_sync.py` proves the two
still agree, which is a release step.

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
