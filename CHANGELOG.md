# Changelog

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
