# Minidsp-Tide16-ControlCard

[![hacs][hacs-badge]][hacs-url]

A photoreal front panel for the miniDSP Tide16 in Home Assistant - with a
**live 16-channel output meter**, and every control on it wired to the
device.

![the Tide16 panel, live](docs/screenshot.png)

*My system, mid-session.  It runs 7.2.2, so the meter shows 11 assigned
outputs and the legend names them; yours will show your own layout.  The
meter is at rest in this shot - the source was silent when it was taken.*

## What's here

| | |
|---|---|
| `dist/tide16-bars.js` | Seven `picture-elements` **elements**, not a standalone card - each draws one thing and nothing else, so the artwork underneath shows through |
| `assets/` | The front-panel plate, the format and Dirac marks, and the power / reboot / Bluetooth glyphs |
| `lovelace/tide16-panel.yaml` | The complete view: meter, source selector, scenes, volume ring, every live readout |
| `packages/tide16_panel.yaml` | The template sensors the panel prints (split volume, sample rate, Atmos flag) and the two scripts its knob and standby glyph call |
| `integration/` | A diff against the integration this depends on - **required**, see below |

## You need the original integration first

The card is the product here; it is not an integration and not a fork of
one.  It sits on top of
[**GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration**](https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration)
(MIT) - all the device work, the WebSocket protocol, the config flow and
most of the entities this panel displays are his.  Install that first;
nothing here works without it.

Two gaps have to be closed first, and
[`integration/tide16-metering.patch`](integration/) closes both.  It
deletes nothing and rewrites two existing lines:

- **Metering.** His integration receives all 16 channel levels from the
  device but collapses them to a single peak and discards the rest, and
  it polls metering every 5 s - which reads as a broken meter rather
  than a slow one.  The patch keeps the full array and adds an
  on-demand fast cadence the card asks for while it is on screen.
- **Scenes.** The device stores four scene snapshots and can recall
  them, but nothing in the integration reaches that endpoint, so the
  four scene buttons on the plate would have nothing to call.  The patch
  adds `button.tide16_scene_{red,green,yellow,blue}`.

Not a fork, and deliberately not a copy of his files: you install his
integration from his repo, then apply this on top.  See
[`integration/README.md`](integration/README.md).

It's offered upstream; if it lands there, that directory goes away and
the card just requires a newer version.

## Install

**1. The integration.** Install
[Gael's](https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration)
(v0.28.0) and add it under Settings > Devices & services.  Then apply
[`integration/tide16-metering.patch`](integration/) and restart.

**2. The card.** HACS > ⋮ > Custom repositories >
`https://github.com/speedtoys/Minidsp-Tide16-ControlCard`, type
**Dashboard**.  Download it.

Manually: copy `dist/tide16-bars.js` to `config/www/tide16/` and add
`/local/tide16/tide16-bars.js` as a **JavaScript module** resource under
Settings > Dashboards > ⋮ > Resources.  Put a `?v=` on the end and bump
it whenever you update the file - the frontend caches hard.

**3. The artwork.** Copy `assets/*` into `config/www/tide16/`.

**4. The helper sensors.** Copy `packages/tide16_panel.yaml` into
`config/packages/` (which needs
`homeassistant: packages: !include_dir_named packages` in
`configuration.yaml`), and add the recorder exclusion from
[`integration/README.md`](integration/README.md).  Restart.

**5. The view.** Use [`lovelace/tide16-panel.yaml`](lovelace/).  It also
needs [card-mod](https://github.com/thomasloven/lovelace-card-mod) from
HACS for the `scale()` wrapper that fits the plate to the page; delete
that `card_mod` block if you'd rather not have the dependency, and the
panel just renders full width.

## The elements

All seven live in the one JS file and are used the same way: as elements
inside a `picture-elements` card, each framed by its own box.

```yaml
type: picture-elements
image: /local/tide16/plate-v2.png
elements:
  - type: custom:tide16-bars
    style:
      left: "17.487%"
      top: "21.500%"
      width: "15.628%"
      height: "29.250%"
      transform: translate(0, 0)
```

**`transform: translate(0, 0)` is not optional.** `picture-elements`
centres elements on their `left`/`top` by default
(`translate(-50%, -50%)`); without the override every element sits half a
box up and to the left of where you put it.

**The box is the geometry.** Sizes inside each element are in `cqw` -
percent of the card's width - so the whole panel scales together at any
display size.  On the bundled 1990x400 plate, 1 canvas px ≈ 0.0503 cqw.
Moving or resizing a box changes spacing, never proportions.

### `tide16-bars` - the 16-channel meter

Frames the **meter window**, the area the bars sweep.  Draws its own
`1`-`16` numbers below the baseline, off the same pitch as the bars, so
they cannot drift out of register with them.

| Option | Default | |
|---|---|---|
| `entity` | `sensor.tide16_channel_levels` | Source entity |
| `attribute` | `channels` | Attribute holding the array of dB values |
| `ceiling_entity` | `number.tide16_volume` | Entity whose value is full scale |
| `range_db` | `40` | Height of the window, in dB below that ceiling |
| `ceiling_db` / `floor_db` | `0` / `-60` | Fallback pair, used only when `ceiling_entity` is unset or unavailable |
| `keepalive_service` | `minidsp_tide16.request_fast_metering` | `null` to disable |
| `keepalive_ms` | `1000` | Keepalive period |
| `transition_ms` | `260` | Bar animation, ≈ the 250 ms poll |
| `numbers` | `true` | Draw the 1-16 labels |
| `numbers_size` / `numbers_gap` / `numbers_color` / `numbers_weight` | `0.748cqw` / `0.236cqw` / `#FFFFFF` / `500` | |

### `tide16-channels` - the output legend

One compact row of `1 FL  2 FR  3 C …` under the plate, naming what each
output is assigned to.  Folds into two columns below `stack_below`,
where the type has hit its px floor and a single row would overrun.
Every chip carries the full device name as hover text.

| Option | Default | |
|---|---|---|
| `entity` / `attribute` | `sensor.tide16_channel_levels` / `channel_names` | |
| `channels` | `16` | Only used with `show_unassigned` |
| `show_unassigned` | `false` | Draw `—` for outputs the device left unassigned |
| `label` | `Output Channels:` | Set `null` for no heading |
| `font_size` / `min_font_size` | `1.2cqw` / `11px` | |
| `gap` / `column_gap` | `1.35cqw` / `2.4cqw` | |
| `stack_below` | `900px` | Card width at which the row folds |
| `color` / `index_color` / `label_color` | `#B7B8B8` / 42% / 60% of it | Names, numbers, heading |

### `tide16-readout` - a titled block of live values

A heading plus any number of rows, each `{label?, entity, attribute?}`.
Used for the Program and Preset blocks.

| Option | Default | |
|---|---|---|
| `title` / `title_color` / `title_size` / `title_gap` | `null` / `#808080` / `0.805cqw` / `0.15cqw` | `#808080` is what the plate prints its own baked labels in |
| `color` / `size` / `row_gap` | `#B7B8B8` / `0.45cqw` / `0.10cqw` | |
| `align` | `left` | |
| `rows` | `[]` | |

### `tide16-inputs` - the source selector

A grid of dot-and-label cells, filled **down** each column and then
right, so an alphabetical list reads in order when it is arranged as
columns of two.  The live source is read off an entity attribute and
matched against each item's `text` (or its `value`, when the label
differs from what the device reports).

Selection goes through `media_player.select_source`, not the
`button.tide16_source_*` entities: those are named after the physical
inputs (`hdmi_2`, `spotify`) while the device reports the user's
**renamed** sources ("Roku", "Comcast"), so the names in `source_list`
are the only thing that maps one-to-one with what the panel displays.

| Option | Default | |
|---|---|---|
| `columns` / `rows` | `6` / `2` | |
| `row_gap` / `dot` / `dot_gap` / `size` | `0.503cqw` / `0.653cqw` / `0.302cqw` / `0.704cqw` | |
| `color` / `background` / `border` | `#B7B8B8` / `#333333` / `1px solid #666666` | |
| `active_entity` / `active_attribute` | `null` / `source` | Which entity reports the live source |
| `active_color` / `active_size` | `#FFFFFF` / `null` | The live source is white and underlined; `active_size` also makes it bigger.  `null` keeps it at `size` |
| `items` | `[]` | `{text, value?, tap?, hint?}` |

Quote the `border` value.  Unquoted, YAML reads `#666666` as a comment
and hands over a bare `1px solid`, which CSS completes with
`currentColor` - a white border, silently.

### `tide16-buttons` - the scene column

A vertical stack of fixed-ratio buttons.  The ratio is the point: the
element sizes itself from the box **width** via `aspect-ratio`, so
re-positioning or resizing the box can never produce squashed buttons -
only different spacing.

`gap` picks how the slack is spent.  A `justify-content` keyword
(`space-between`, the default) spreads the buttons across the box; a
length instead sets a fixed gap and pins the stack to the box **bottom**.
An optional `title` rides above the box, outside it, so a heading can
never drag the buttons off whatever edge you aligned them to.

| Option | Default | |
|---|---|---|
| `ratio` / `radius` | `7 / 2` / `3px` | |
| `gap` | `space-between` | Keyword, or a length |
| `title` / `title_size` / `title_color` / `title_gap` | `null` / `1.05cqw` / `#BFC0C0` / `0.5cqw` | |
| `buttons` | four colours | `{color, label?, hint?, tap}` |

### `tide16-knob-labels` - text around a knob, by clock position

Give the box the **knob's** bounding square and every label places itself
outside that circle.  That is the whole point: one box to measure, and
`gap` is then a real clearance from the knob's edge that stays honest at
every angle, instead of eight hand-tuned `left`/`top` pairs that drift
the moment the card is rescaled.

Each label is `{at, text, tap?, hint?}`, where `at` is a clock hour and
`text` takes a list as readily as a string - a list stacks, one row per
entry, which is how `Mute:` / `On` is drawn.

| Option | Default | |
|---|---|---|
| `gap` | `0.381cqw` | Clearance from the knob's edge |
| `size` / `weight` / `color` / `line_gap` | `1.05cqw` / `400` / `#000` / `0.05cqw` | |
| `labels` | `[]` | |

### `tide16-glyph` - one PNG, with a tap and hover text

For the power, reboot and Bluetooth marks.  It exists because
`picture-elements`' own `image` element can't be hovered reliably: it
accepts a `title`, but hangs it on the inner `<hui-image>` while its
clickable wrapper puts another div over the top, so the cursor lands on
an element with no title in its ancestry and no tooltip ever appears.
Owning the element puts the title on the host, which *is* the hover
target.

`{image, hint?, tap?}`.  Untapped it takes no pointer events at all, so
it can't swallow a click meant for the plate underneath.

## Hover text

Every control on the panel carries it, and it says what the click will
**do** rather than repeating what you can already read - `Volume down
2 dB`, not `Vol:-2`.  Sources get `Select source: <name>` for free; the
rest take an optional `hint`.  On a colour-only scene button the hint is
the only name the thing has, so it's worth setting.

These are native `title` tooltips: no dependency, no layout risk, and no
way to clip them at the edge of the plate - at the cost of the browser's
own delay before they appear.

## The scene buttons are the *device's* scenes

Worth being explicit, because the four coloured buttons look like
something you'd wire to whatever you like.  The Tide16 stores four scene
slots itself - a whole-box snapshot of source, volume, Dirac preset,
Dirac on/off, bass management, upmixer and the Dolby/DTS settings - and
names them by the colours printed on its front panel.  Red, green,
yellow, blue is index 0-3, which is exactly the colour order the card
draws.  `button.tide16_scene_*` recalls them.

Note the asymmetry in the device API, which is easy to get wrong: it
**recalls** with `set_scene` and **overwrites** with `save_scene`.  The
stock web UI at `http://<host>:5050` only ever sends `save_scene` - its
"Save current" swatches - so the endpoint that reads like the obvious one
is the destructive one.  Nothing in this repo sends it: a mis-tap would
silently replace a stored scene with the current state, and the device
keeps no undo.  Save from the stock UI.

Recalling a slot that was never saved is a no-op, so buttons for slots
you haven't populated simply do nothing.

## Why the meter looks and behaves the way it does

**The gradient is anchored to the meter box, not to each bar.** In the
original artwork a short bar starts dimmer than a tall one, because all
the bars are windows onto one shared top-to-bottom gradient spanning the
full meter height.  The card paints that gradient over a full-height
element and reveals only the bottom slice with `clip-path`, so it never
moves or rescales as the level changes.  Giving each bar its own
height-relative gradient looks obviously wrong next to the plate.

**The scale slides with the volume.** None of the dB options describe the
Tide16's own range, which is -127.5 to 0 dB with silence metering at
exactly -122.5.  They describe the **window the bars draw** - which dB
value puts a bar at zero height and which fills it.

Output level tracks the master volume: with real content at -42 dB
master, the loudest channel peaked at -42.9 dB.  So full scale *is* the
volume setting, and the window slides with it:

```
ceiling = <ceiling_entity>          e.g. -42 dB
floor   = ceiling - range_db        e.g. -82 dB
```

A window fixed in absolute dB reads completely differently at every
volume, which is the trap that makes home-made meters look broken.  Turn
that off with `ceiling_entity: null` and the fixed
`floor_db`..`ceiling_db` pair is used instead - but pick your own values
if you do.  The `-60`..`0` defaults are only a fallback for when the
volume entity is missing, and they will read low at normal listening
levels.

**This is interim.** Anchoring to the volume entity is an inference, not
a reading - the device does not currently report its meter reference over
the API.  When miniDSP exposes those values and the integration picks
them up, these options become mirrors of real device state instead of
estimates, and `range_db` in particular should stop being a number anyone
tunes by eye.  The option names are chosen so that swap is a default
change rather than a breaking one.

**It only polls fast while you're looking.** While the element is on
screen it calls `request_fast_metering` every second, raising the rate to
4 Hz on a 3-second lapsing grant.  Off screen it simply stops calling and
the grant expires, so nothing can leave the device being polled hard at
nobody.  Both an `IntersectionObserver` (view switched, scrolled away)
and `visibilitychange` (tab hidden, laptop asleep) gate it - neither
alone catches both cases.

## Reading the meter

During true silence every channel reads exactly `-122.5` dB, so the bars
sit at zero.

Bars past the end of your layout also sit at zero, and that is not the
same thing.  The device reports which speaker each output is assigned to,
so `sensor.tide16_channel_levels` carries a `channel_names` attribute
alongside `channels`:

```
1  LeftFront          9   LeftFrontOverhead
2  RightFront         10  RightFrontOverhead
3  Center             11  Sub2
4  Sub                12-16  not present
5  LeftSurround
6  RightSurround
7  RearLeftSurround
8  RearRightSurround
```

That is a 7.2.2 layout, so the device returns exactly 11 entries and
outputs 12-16 are simply **absent** from the map - unassigned, not
assigned-and-silent.  Both read `-122.5`, which is why the names are
worth having.  `tide16-channels` draws exactly this list.

`channel_names` is positional against `channels` and is **shorter**
whenever the layout uses fewer than 16 outputs, so `zip()` the two rather
than indexing blindly.  Entries are `null` for an output the device left
unassigned.  If you have renamed ports on the Tide16 itself, those names
win over the stock speaker names.

The trap: an idle link looks identical to a working one at every level
*except* the metering itself.  The `sensor.tide16_stream` entity reports
the negotiated format and `speaker_config` reports 7.2.2 with nothing
playing at all.  Only the metering moving proves playback.

## Credits and licensing

The card, the Lovelace view, the template sensors, the plate edits and
the additions in `integration/tide16-metering.patch` are original work,
MIT licensed.

None of it runs on its own.  The integration it extends is
[@GaelFrance's](https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration),
also MIT, and is not redistributed here - install it from his repo.  The
patch necessarily quotes a few lines of his as diff context, under that
same license.

`assets/plate-v2.png` and the format marks are front-panel artwork of the
miniDSP Tide16, edited to remove the baked-in readings so live values can
be painted back on.  `assets/reboot.png` and `assets/bt.png` are
recoloured and background-stripped from third-party icon art supplied by
the repo owner; they are **not** covered by the MIT grant above unless
their own licensing allows it.  Swap in your own if in doubt.

The names miniDSP, Tide16, Dolby Atmos, DTS:X, DIRAC, HDMI and Bluetooth
are trademarks of their respective owners, used here to depict the device
this card controls.  Not affiliated with or endorsed by miniDSP.

[hacs-badge]: https://img.shields.io/badge/HACS-Custom-41BDF5.svg
[hacs-url]: https://github.com/hacs/integration
