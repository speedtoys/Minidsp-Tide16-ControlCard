# Minidsp-Tide16-ControlCard

[![hacs][hacs-badge]][hacs-url]

A photoreal front-panel card for the miniDSP Tide16 in Home Assistant -
with a **live 16-channel output meter**.

![the Tide16 panel, live](docs/screenshot.png)

*This image just shows my system in use, and I only use 11 channels.
Yours will show all*

## What's here

| | |
|---|---|
| `dist/tide16-bars.js` | the meter. A `picture-elements` **element**, not a standalone card - it draws bars and nothing else, so the artwork underneath shows through |
| `assets/` | the front-panel plate and the format/Dirac marks |
| `lovelace/tide16-panel.yaml` | the complete view: meter plus every live readout |
| `packages/tide16_panel.yaml` | the two template sensors that split the volume into its big integer and small decimal |
| `integration/` | a small diff against the integration this depends on - **required**, see below |

## You need the original integration first

The card is the product here; it is not an integration and not a fork of
one. It sits on top of
[**GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration**](https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration)
(MIT) - all the device work, the WebSocket protocol, the config flow and
every entity this panel displays are his. Install that first; nothing
here works without it.

One gap has to be closed before the meter has anything to draw. His
integration receives all 16 channel levels from the device but collapses
them to a single peak and discards the rest, and it polls metering every
5 s - which reads as a broken meter rather than a slow one.
[`integration/`](integration/) is a 200-line additive diff that fixes
both. Not a fork, and deliberately not a copy of his files: you install
his integration from his repo, then apply this on top. See
[`integration/README.md`](integration/README.md).

It's offered upstream; if it lands there, that directory goes away and
the card just requires a newer version.

## Install

**1. The integration.** Install
[Gael's](https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration)
(v0.28.0) and add it under Settings > Devices & services. Then apply
[`integration/tide16-metering.patch`](integration/) and restart.

**2. The card.** HACS > ⋮ > Custom repositories >
`https://github.com/speedtoys/Minidsp-Tide16-ControlCard`, type
**Dashboard**. Download it.

Manually: copy `dist/tide16-bars.js` to `config/www/tide16-bars.js` and
add `/local/tide16-bars.js` as a **JavaScript module** resource under
Settings > Dashboards > ⋮ > Resources.

**3. The artwork.** Copy `assets/*` into `config/www/tide16/`.

**4. The helper sensors.** Copy `packages/tide16_panel.yaml` into
`config/packages/` (which needs
`homeassistant: packages: !include_dir_named packages` in
`configuration.yaml`), and add the recorder exclusion from
[`integration/README.md`](integration/README.md). Restart.

**5. The view.** Use [`lovelace/tide16-panel.yaml`](lovelace/).

## Minimal use

If you only want the meter, on your own artwork:

```yaml
type: picture-elements
image: /local/tide16/plate.png
elements:
  - type: custom:tide16-bars
    style:
      left: "17.315%"
      top: "26.937%"
      width: "16.629%"
      height: "26.384%"
      transform: translate(0, 0)
```

**`transform: translate(0, 0)` is not optional.** `picture-elements`
centres elements on their `left`/`top` by default
(`translate(-50%, -50%)`); without the override the meter sits half a
box up and to the left of where you put it.

`left`/`top`/`width`/`height` frame the **meter window** - the area the
bars sweep - not the whole plate. Everything inside the element is a
percentage of that box, so it scales with the artwork at any display
size. The values above are correct for the bundled `plate.png`: a
436x143 window at (454, 146) on a 2622x542 canvas.

## Options

| Option | Default | |
|---|---|---|
| `entity` | `sensor.tide16_channel_levels` | source entity |
| `attribute` | `channels` | attribute holding the array of dB values |
| `channels` | `16` | number of bars. Pitch is always `100/channels %` |
| `bar_width_ratio` | `0.9541` | bar's share of its slot, `0`-`1` |
| `gradient` | Tide16 grey | any CSS `background` value |
| `ceiling_entity` | `number.tide16_volume` | full-scale reference, see below |
| `range_db` | `40` | dB below the ceiling that maps to zero height |
| `ceiling_db` | `0` | fixed full scale, if `ceiling_entity` is unset |
| `floor_db` | `-60` | fixed zero point, if `ceiling_entity` is unset |
| `keepalive_service` | `minidsp_tide16.request_fast_metering` | `null` to disable |
| `keepalive_ms` | `1000` | keepalive period |
| `transition_ms` | `260` | bar animation, ≈ the 250 ms poll |

The defaults reproduce the bundled plate: 16 bars, 26 px wide on a
27.25 px pitch (`26 / 27.25 = 0.9541`). `channels` and `bar_width_ratio`
exist because the channel numbers `1`-`16` are **baked into the plate** -
the bars have to land on their printed labels.

If the bars sit slightly off those labels, adjust the YAML box first: a
mismatch that accumulates across the strip is a framing error.
`bar_width_ratio` only changes how much of each slot the ink fills.

## Why it looks and behaves the way it does

**The gradient is anchored to the meter box, not to each bar.** In the
original artwork a short bar starts dimmer than a tall one, because all
the bars are windows onto one shared top-to-bottom gradient spanning the
full meter height. The card paints that gradient over a full-height
element and reveals only the bottom slice with `clip-path`, so it never
moves or rescales as the level changes. Giving each bar its own
height-relative gradient looks obviously wrong next to the plate.

**The scale slides with the volume.** Output level tracks the master
volume - with real content at -42 dB master, the loudest channel peaked
at -42.9 dB. So full scale *is* the volume setting:
`ceiling = ceiling_entity`, `floor = ceiling - range_db`. A fixed dB
window reads completely differently at every volume, which is the trap
that makes home-made meters look broken. Set `ceiling_entity: null` for
a fixed `floor_db`..`ceiling_db` window instead.

**It only polls fast while you're looking.** While the element is on
screen it calls `request_fast_metering` every second, raising the rate
to 4 Hz on a 3-second lapsing grant. Off screen it simply stops calling
and the grant expires, so nothing can leave the device being polled hard
at nobody. Both an `IntersectionObserver` (view switched, scrolled away)
and `visibilitychange` (tab hidden, laptop asleep) gate it - neither
alone catches both cases.

## Reading the meter

During true silence every channel reads exactly `-122.5` dB, so the bars
sit at zero. Unused channels read `-122.5` too: a 7.2.2 stream shows 11
live bars and five flat ones, which is correct.

The opposite trap is worse. An idle link looks identical to a working
one at every level *except* the metering itself -
`sensor.tide16_stream` reports the negotiated format and
`speaker_config` reports 7.2.2 with nothing playing at all. Only the
metering moving proves playback.

## Credits and licensing

Everything in this repo is original work, MIT licensed - the card, the
Lovelace view, the template sensors, the artwork edits, and the
additions in `integration/tide16-metering.patch`.

None of it runs on its own. The integration it extends is
[@GaelFrance's](https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration),
also MIT, and is not redistributed here - install it from his repo. The
patch necessarily quotes a few lines of his as diff context, under that
same license.

`assets/` are front-panel artwork of the miniDSP Tide16, edited to
remove the baked-in readings so live values can be painted back on.
miniDSP, Tide16, Dolby Atmos, DTS:X, DIRAC and HDMI are trademarks of
their respective owners, used here to depict the device this card
controls. Not affiliated with or endorsed by miniDSP.

[hacs-badge]: https://img.shields.io/badge/HACS-Custom-41BDF5.svg
[hacs-url]: https://github.com/hacs/integration
