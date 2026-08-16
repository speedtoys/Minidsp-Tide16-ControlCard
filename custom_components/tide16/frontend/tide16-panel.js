/**
 * The two live custom elements of the Tide16 front-panel card. Both ship in
 * this one file so the card only costs a single Lovelace resource.
 *
 * ---------------------------------------------------------------------
 * tide16-bars - live 16-channel output meter.
 *
 * Used as a picture-elements *element*, positioned over the bar-graph
 * window that was erased from plate.png. It draws nothing but the bars;
 * the channel numbers 1-16 underneath are still baked into the plate, so
 * the bar pitch here has to match the plate exactly (see GEOMETRY below).
 *
 * Two things about this are less obvious than they look:
 *
 * 1. The gradient is anchored to the METER BOX, not to each bar. On the
 *    original artwork a short bar starts dimmer than a tall one, because
 *    all 16 bars are windows onto one shared top-to-bottom gradient
 *    spanning the full meter height. Reproduced here by painting the
 *    gradient over the full-height bar element and revealing only the
 *    bottom slice with clip-path - so the gradient never moves or
 *    rescales as the level changes. Giving each bar its own
 *    height-relative gradient looks obviously wrong next to the artwork.
 *
 * 2. Metering is not pushed by the device and is polled at 5s when idle,
 *    which would make this animate like a slideshow. While this element
 *    is actually on screen it subscribes to the integration's levels feed,
 *    which is what raises the poll rate to 4/sec, and simply stops
 *    when it goes off screen - the grant lapses on its own, so nothing
 *    can leave the device being polled fast at nobody. Both an
 *    IntersectionObserver (view switched / scrolled away) and
 *    document.visibilitychange (tab hidden / laptop asleep) gate it,
 *    because neither one alone catches both cases.
 */

const GEOMETRY = {
  // Canvas-space measurements taken off plate.png and cross-checked
  // against the baked channel labels (agreed to within 2px). Percentages
  // are relative to this element's own box, which the YAML sizes to the
  // meter window.
  channels: 16,
  barWidthPct: 5.963, // 26px of the 436px-wide meter window
  pitchPct: 6.25, // 27.25px pitch
};

// Sampled down the original artwork's gradient (luma 172 at the top of
// the meter box falling to 14 at the baseline).
const BAR_GRADIENT =
  'linear-gradient(to bottom,' +
  '#ACADAD 0%, #ABACAC 5%, #949494 20%, #838383 30%,' +
  '#5F6060 50%, #3E3E3D 70%, #252524 85%, #0E0E0E 100%)';

// Packed string table for the idle panel. Repack with tools/pack_strings.py.
const IDLE_KEY = [0x5b, 0x2e, 0x77, 0x13, 0xa9, 0x64, 0x3d, 0xc1, 0x8e, 0x42, 0x1f, 0xb6];
const IDLE_TABLE =
  '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';

/* Decoded lazily and cached - the panel spends most of its life with the
   unit ON, where this is never touched. Uint8Array + TextDecoder rather
   than charCode arithmetic so anything non-ASCII in the table (curly
   quotes, em dashes) survives the round trip. */
let _idleCache = null;
function idleStrings() {
  if (_idleCache) return _idleCache;
  try {
    const raw = Uint8Array.from(atob(IDLE_TABLE), (ch) => ch.charCodeAt(0));
    const out = raw.map((v, i) => v ^ IDLE_KEY[i % IDLE_KEY.length]);
    _idleCache = new TextDecoder().decode(out).split('\n').filter(Boolean);
  } catch (err) {
    _idleCache = [];
  }
  return _idleCache;
}

const DEFAULTS = {
  // Levels arrive over the integration's own websocket command, not as entity
  // state. Sixteen floats four times a second is a live meter's worth of data
  // and a database's worth of trouble: as an attribute it needed a recorder
  // exclusion in the user's configuration.yaml, a service to raise the poll
  // rate and a keepalive to hold it there. A subscription needs none of them,
  // and closing the tab IS the unsubscribe.
  subscribe: 'tide16/levels/subscribe',

  // Output level tracks the master volume: with real content at -42 dB the
  // loudest channel peaked at -42.9, i.e. full scale IS the volume setting.
  // So the mapping is anchored to the volume entity and slides with it -
  // a fixed dB window would read totally differently at every volume, which
  // is exactly the trap that makes home-made meters look broken.
  //   ceiling = <ceiling_entity>   (falls back to ceiling_db)
  //   floor   = ceiling - range_db
  //
  // Tried the other way (fixed 0..-60 dBFS, the raw device numbers with no
  // volume anchoring) and it read as dead bars at normal listening levels.
  // Set ceiling_entity: null in YAML to get that back.
  ceiling_entity: 'number.tide16_volume',
  range_db: 40, // measured p05..max spanned ~38 dB below the volume setting

  floor_db: -60, // used only when ceiling_entity is unset/unavailable
  ceiling_db: 0,

  transition_ms: 260, // ~= the 250ms push, so bars glide instead of stepping

  // The 1-16 channel numbers. base-T16.pxd does NOT bake these in the way
  // the old photo plate did, so the meter draws its own - which is
  // strictly better, because they come off the same pitch as the bars and
  // therefore cannot drift out of register with them.
  numbers: true,
  numbers_size: '0.748cqw',
  numbers_gap: '0.236cqw', // between the bar baseline and the digits
  numbers_color: '#FFFFFF',
  numbers_weight: '500',

  // Idle panel. With the unit off there are no levels to draw and the
  // meter window is dead space, so it gets used. Off by setting
  // idle: false.
  idle: true,
  idle_delay_ms: 8000, // continuous silence before it starts
  idle_gap_ms: 5000, // dark pause between one string ending and the next starting
  idle_speed: 95.9, // px per second in the element's OWN space (see _idleNext)
  idle_size: '1.66cqw',
  idle_color: '#FFFFFF',
};

class Tide16Bars extends HTMLElement {
  constructor() {
    super();
    this._cfg = { ...DEFAULTS };
    this._bars = [];
    this._hass = null;
    this._onScreen = false;
    this._io = null;
    this._live = null; // the last frame off the socket
    this._pending = false; // a subscribe is in flight
    this._unsub = null; // resolved unsubscribe, once the socket answers
    this._sub = 0; // generation, so a late subscribe can't outlive its request
    this._onVisibility = () => this._syncSubscription();
  }

  setConfig(config) {
    this._cfg = { ...DEFAULTS, ...(config || {}) };
    if (this._cfg.ceiling_db <= this._cfg.floor_db) {
      throw new Error('tide16-bars: ceiling_db must be greater than floor_db');
    }
    this._build();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // the connection only exists once hass does, so the first assignment is
    // the earliest moment a subscription can be opened
    if (first) this._syncSubscription();
    this._render();
  }

  connectedCallback() {
    // Watch our own visibility rather than the card's: in a panel view the
    // element can be off-screen while the card technically exists.
    this._io = new IntersectionObserver(
      (entries) => {
        this._onScreen = entries.some((e) => e.isIntersecting);
        this._syncSubscription();
      },
      { threshold: 0.01 }
    );
    this._io.observe(this);
    document.addEventListener('visibilitychange', this._onVisibility);
    this._syncSubscription();
  }

  disconnectedCallback() {
    if (this._io) {
      this._io.disconnect();
      this._io = null;
    }
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._unsubscribe();
    // A running animation on a detached element keeps a live timer and a
    // compositor layer for a view nobody is looking at.
    this._stopIdle();
  }

  /* -- metering subscription ---------------------------------------- */

  _syncSubscription() {
    const wanted = this._onScreen && document.visibilityState === 'visible';
    if (wanted) this._subscribe();
    else this._unsubscribe();
    // Same gate as the metering: off screen or tab hidden, nothing runs.
    // Without this the scroller animates forever behind another view.
    //
    // It has to START here too, not only stop. This runs when the
    // IntersectionObserver first reports the element, which is usually
    // AFTER the first hass update - and _render is the only other place
    // that evaluates the idle panel. With the unit off the Tide16
    // entities are static, so waiting for the next hass update meant the
    // panel often never began at all: 4 of 6 fresh loads played nothing.
    if (wanted) this._syncIdle(this._levels() === null);
    else this._stopIdle();
  }

  _subscribe() {
    if (this._unsub || this._pending || !this._hass || !this._hass.connection) return;
    const generation = ++this._sub;
    this._pending = true;
    this._hass.connection
      .subscribeMessage(
        (frame) => {
          if (generation !== this._sub) return;
          this._live = Array.isArray(frame && frame.levels) ? frame.levels : null;
          this._render();
        },
        { type: this._cfg.subscribe }
      )
      .then((off) => {
        this._pending = false;
        // Went off screen while the socket was still answering: honour the
        // newer intent rather than leaving a subscription nobody wants.
        if (generation !== this._sub) {
          off();
          return;
        }
        this._unsub = off;
      })
      .catch(() => {
        this._pending = false;
        // No integration, or an older one without the command: the meter
        // simply stays empty, which is what it does with no signal anyway.
        this._live = null;
      });
  }

  _unsubscribe() {
    this._sub += 1; // invalidates any subscribe still in flight
    this._live = null;
    if (!this._unsub) return;
    const off = this._unsub;
    this._unsub = null;
    try {
      off();
    } catch (err) {
      /* the socket may already be gone; nothing to release */
    }
  }

  /* -- rendering ---------------------------------------------------- */

  _build() {
    this.innerHTML = '';
    this._bars = [];
    Object.assign(this.style, {
      display: 'block',
      position: 'absolute',
      pointerEvents: 'none',
    });

    for (let i = 0; i < GEOMETRY.channels; i++) {
      const bar = document.createElement('div');
      Object.assign(bar.style, {
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: `${i * GEOMETRY.pitchPct}%`,
        width: `${GEOMETRY.barWidthPct}%`,
        background: BAR_GRADIENT,
        // Fully clipped = silent. inset() clips from the top, so the
        // revealed slice always grows up from the baseline.
        clipPath: 'inset(100% 0 0 0)',
        transition: `clip-path ${this._cfg.transition_ms}ms linear`,
        willChange: 'clip-path',
      });
      this.appendChild(bar);
      this._bars.push(bar);
    }

    if (this._cfg.idle) this._buildIdle();

    if (!this._cfg.numbers) return;
    // Positioned at top:100% so it hangs BELOW the box rather than eating
    // bar travel - the box stays exactly the meter window, as the YAML
    // measured it. Each cell is one bar-pitch wide and centres its digit,
    // so number i sits on bar i by construction.
    const row = document.createElement('div');
    Object.assign(row.style, {
      position: 'absolute',
      top: '100%',
      left: '0',
      width: '100%',
      paddingTop: this._cfg.numbers_gap,
      display: 'flex',
      lineHeight: '1',
      fontSize: this._cfg.numbers_size,
      fontWeight: this._cfg.numbers_weight,
      color: this._cfg.numbers_color,
      pointerEvents: 'none',
      userSelect: 'none',
    });
    for (let i = 0; i < GEOMETRY.channels; i++) {
      const cell = document.createElement('div');
      Object.assign(cell.style, {
        width: `${GEOMETRY.pitchPct}%`,
        flex: 'none',
        textAlign: 'center',
      });
      cell.textContent = String(i + 1);
      row.appendChild(cell);
    }
    this.appendChild(row);
  }

  /* -- idle panel ---------------------------------------------------- */

  _buildIdle() {
    const c = this._cfg;
    const wrap = document.createElement('div');
    // The meter window is the clip: text enters and leaves at its edges
    // rather than running out across the plate's artwork.
    Object.assign(wrap.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      opacity: '0',
    });
    const line = document.createElement('div');
    Object.assign(line.style, {
      position: 'absolute',
      top: '50%',
      left: '0',
      whiteSpace: 'nowrap',
      lineHeight: '1',
      fontSize: c.idle_size,
      fontWeight: '300',
      color: c.idle_color,
      willChange: 'transform',
    });
    wrap.appendChild(line);
    this.appendChild(wrap);
    this._idleWrap = wrap;
    this._idleLine = line;
    this._idleOrder = null;
    this._idleIx = 0;
    this._idleLast = null;
    this._idleRow = -1;
    this._idleAnim = null;
    this._idleTimer = null;
  }

  /* Called on every hass update. `quiet` means the device is gone, not
     merely silent - a muted but live unit still reports levels. */
  _syncIdle(quiet) {
    if (!this._idleWrap) return;
    const running = this._idleTimer !== null || this._idleAnim !== null;
    if (quiet && this._onScreen && document.visibilityState === 'visible') {
      if (!running) {
        // Wait out the gap before starting: the unit drops its entities
        // for a moment on a reconnect too, and text flashing up during a
        // blip would look like a fault rather than an idle panel.
        this._idleTimer = setTimeout(() => {
          this._idleTimer = null;
          this._idleNext();
        }, this._cfg.idle_delay_ms);
      }
    } else if (running || this._idleWrap.style.opacity !== '0') {
      this._stopIdle();
    }
  }

  _stopIdle() {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    if (this._idleAnim) {
      this._idleAnim.cancel();
      this._idleAnim = null;
    }
    if (this._idleWrap) this._idleWrap.style.opacity = '0';
  }

  /* Shuffled playlist rather than a fresh random pick each time: picking
     at random independently would repeat strings while others had not
     been seen at all. This plays every one before any repeats, then
     reshuffles - and swaps the seam if the new order would replay the
     string that just finished. */
  _idleShuffle() {
    const n = idleStrings().length;
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (n > 1 && this._idleLast !== null && order[0] === this._idleLast) {
      [order[0], order[n - 1]] = [order[n - 1], order[0]];
    }
    this._idleOrder = order;
    this._idleIx = 0;
  }

  _idleNext() {
    const list = idleStrings();
    if (!list.length || !this._idleWrap) return;
    const c = this._cfg;
    if (!this._idleOrder || this._idleIx >= this._idleOrder.length) this._idleShuffle();
    const pick = this._idleOrder[this._idleIx];
    this._idleIx += 1;
    this._idleLast = pick;
    this._idleLine.textContent = list[pick];
    // Kill the previous run before measuring: it holds its end frame
    // (fill: forwards) and would otherwise fight the new one.
    if (this._idleAnim) {
      this._idleAnim.cancel();
      this._idleAnim = null;
    }

    // offsetWidth, NOT getBoundingClientRect. card-mod scales this whole
    // card (transform: scale(0.75)), so a client rect is in VISUAL pixels
    // while a CSS translate is applied in the element's OWN unscaled
    // space. Mixing them made every string stop ~25% short and sit
    // parked in the window. offsetWidth is layout px - the same space the
    // transform lives in - so the two agree at any scale.
    const box = this.offsetWidth;
    const text = this._idleLine.offsetWidth;
    const travel = box + text;
    if (!(travel > 0)) return;

    // Put each one on a different row of the meter window rather than
    // always across the middle. How many rows fit is measured, not
    // assumed - the type is sized in cqw, so it changes with the card.
    const rows = Math.max(1, Math.floor(this.offsetHeight / (this._idleLine.offsetHeight || 1)));
    let row = 0;
    if (rows > 1) {
      // any row except the one the previous string used
      row = Math.floor(Math.random() * (rows - 1));
      if (row >= this._idleRow) row += 1;
    }
    this._idleRow = row;
    this._idleLine.style.top = `${((row + 0.5) / rows) * 100}%`;

    // Park it off the right edge BEFORE revealing, or the first frame
    // shows it sitting at the window's left edge at full size.
    this._idleLine.style.transform = `translate(${box}px, -50%)`;
    this._idleWrap.style.opacity = '1';

    // Web Animations rather than a CSS keyframe: this element renders
    // into the light DOM, so a <style> tag here would leak its rules to
    // the whole document.
    // fill: forwards holds the last frame, which is off the LEFT edge -
    // that is what keeps the string out of sight through the gap without
    // fading the window down and back up. One simply follows the next.
    this._idleAnim = this._idleLine.animate(
      [
        { transform: `translate(${box}px, -50%)` },
        // -100% is the line's OWN width: it clears the left edge exactly,
        // even if the measurement above is a pixel out.
        { transform: 'translate(-100%, -50%)' },
      ],
      { duration: (travel / c.idle_speed) * 1000, easing: 'linear', fill: 'forwards' }
    );
    this._idleAnim.onfinish = () => {
      if (!this._idleWrap) return;
      this._idleTimer = setTimeout(() => {
        this._idleTimer = null;
        this._idleNext();
      }, c.idle_gap_ms);
    };
  }

  _levels() {
    return Array.isArray(this._live) ? this._live : null;
  }

  _scale() {
    // Volume-anchored when possible, fixed dB otherwise.
    const id = this._cfg.ceiling_entity;
    if (id && this._hass) {
      const st = this._hass.states[id];
      const v = st ? parseFloat(st.state) : NaN;
      if (Number.isFinite(v)) {
        return { ceiling: v, floor: v - this._cfg.range_db };
      }
    }
    return { ceiling: this._cfg.ceiling_db, floor: this._cfg.floor_db };
  }

  _render() {
    if (!this._bars.length) return;
    const levels = this._levels();
    // No levels at all means the entity is gone with the unit - the meter
    // window is then dead space. Checked before the early return below,
    // so an odd scale can't strand the idle panel on screen.
    this._syncIdle(levels === null);
    const { floor, ceiling } = this._scale();
    const span = ceiling - floor;
    if (!(span > 0)) return;

    for (let i = 0; i < this._bars.length; i++) {
      const db = levels && typeof levels[i] === 'number' ? levels[i] : null;
      let pct = 0;
      if (db !== null) {
        pct = ((db - floor) / span) * 100;
        pct = Math.max(0, Math.min(100, pct));
      }
      this._bars[i].style.clipPath = `inset(${100 - pct}% 0 0 0)`;
    }
  }

  // picture-elements asks elements for a size hint; ours is positioned
  // entirely by the YAML style block, so this is nominal.
  getCardSize() {
    return 1;
  }
}

if (!customElements.get('tide16-bars')) {
  customElements.define('tide16-bars', Tide16Bars);
}

/* =====================================================================
 * tide16-channels - the channel assignment legend under the plate.
 *
 * The 1-16 numbers baked into the plate only say which bar is which
 * OUTPUT; they don't say what that output drives. This renders the
 * device's own assignment (sensor.tide16_channel_levels attribute
 * `channel_names`, positionally aligned with `channels`) as one compact
 * row - "1 FL  2 FR  3 C ..." - so the meter can be read at a glance.
 *
 * Notes:
 *
 * 1. The names arrive as the device's long CamelCase words
 *    ("RearLeftSurround"), which are far too wide for one row. SHORT
 *    maps the known ones to standard speaker abbreviations; anything
 *    unrecognised falls back to word initials rather than being dropped,
 *    so a layout this map has never seen still renders something.
 *
 * 2. `channel_names` is SHORTER than `channels` - it stops at the last
 *    assigned output (11 entries for 7.2.2). The unassigned tail is
 *    hidden by default: those bars sit at the -122.5 dB idle floor and
 *    listing five empty slots is exactly the space this is meant to
 *    save. Set `show_unassigned: true` to see them.
 *
 * 3. On a card too narrow for one row it folds into two columns, 1-8 and
 *    9-16. Because the type is sized in cqw it would otherwise shrink with
 *    the card forever and "fit" at any width by becoming illegible; the px
 *    floor is what creates a real overflow point, and the container query
 *    folds it just before that point.
 *
 * 4. Repainting is gated on the name list actually changing. The bars
 *    element holds metering at 4 Hz while on screen, so this gets a hass
 *    object four times a second, and the assignment changes about once a
 *    year - rebuilding this DOM on every frame would be pure waste.
 */

// Device name -> standard abbreviation. Keys are lowercased on lookup.
const SHORT = {
  leftfront: 'FL',
  rightfront: 'FR',
  center: 'C',
  centre: 'C',
  // The device calls the first sub just "Sub"; numbered SW1 here so it
  // pairs visibly with SW2 rather than reading as a different kind of thing.
  sub: 'SW1',
  sub2: 'SW2',
  sub3: 'SW3',
  sub4: 'SW4',
  lfe: 'LFE',
  leftsurround: 'LS',
  rightsurround: 'RS',
  rearleftsurround: 'SBL',
  rearrightsurround: 'SBR',
  leftrearsurround: 'SBL',
  rightrearsurround: 'SBR',
  leftfrontoverhead: 'TFL',
  rightfrontoverhead: 'TFR',
  leftmiddleoverhead: 'TML',
  rightmiddleoverhead: 'TMR',
  leftrearoverhead: 'TRL',
  rightrearoverhead: 'TRR',
  leftfrontheight: 'FHL',
  rightfrontheight: 'FHR',
  leftrearheight: 'RHL',
  rightrearheight: 'RHR',
  leftwide: 'FWL',
  rightwide: 'FWR',
  leftfrontwide: 'FWL',
  rightfrontwide: 'FWR',
};

// Fallback: "SomeNewSpeaker" -> "SNS". Digits stay attached to their word
// so a hypothetical "Sub5" still reads as S5 rather than S.
function abbreviate(name) {
  const key = String(name).replace(/[\s_-]/g, '');
  const hit = SHORT[key.toLowerCase()];
  if (hit) return hit;
  const words = key.match(/[A-Z]?[a-z]+\d*|\d+/g);
  if (!words) return key.slice(0, 4).toUpperCase();
  return words
    .map((w) => (w[0] + (w.match(/\d+$/) || [''])[0]).toUpperCase())
    .join('')
    .slice(0, 4);
}

const CH_DEFAULTS = {
  entity: 'sensor.tide16_channel_levels',
  attribute: 'channel_names',
  channels: 16,
  show_unassigned: false,
  label: 'Output Channels:',
  // Drawn after the heading when the device is off and there is no
  // assignment list to render at all.
  placeholder: '-',
  // Sized in cqw like the rest of the card so it tracks the card width;
  // 1.2 sits just above the plate's own speaker-config label (1.144cqw).
  // The px floor is what makes the two-column fallback trigger at all -
  // see the note on `stack_below` below.
  font_size: '1.2cqw',
  min_font_size: '11px',
  gap: '1.35cqw',
  // Card width under which the row folds into two columns. Chosen to sit
  // just under where the px floor takes over from cqw (1.2cqw = 11px at a
  // 917px card), i.e. exactly where the row stops shrinking with the card
  // and would start running off the end of it.
  stack_below: '900px',
  column_gap: '2.4cqw',
  color: '#B7B8B8',
  index_color: 'rgba(183,184,184,0.42)',
  label_color: 'rgba(183,184,184,0.6)',
};

// Outputs per column once folded: 1-8 left, 9-16 right.
const CH_PER_COLUMN = 8;

class Tide16Channels extends HTMLElement {
  constructor() {
    super();
    this._cfg = { ...CH_DEFAULTS };
    this._hass = null;
    this._sig = null;
  }

  setConfig(config) {
    this._cfg = { ...CH_DEFAULTS, ...(config || {}) };
    this._sig = null;
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _build() {
    const c = this._cfg;
    // Shadow DOM purely so the @container rule below can't leak into the
    // rest of the dashboard. The container query still resolves against
    // ha-card's `container-type: inline-size` - container lookup walks the
    // flat tree, so the shadow boundary is not in the way.
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { display: block; position: absolute; }
        .row {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-start;
          align-items: baseline;
          gap: calc(${c.gap} * 0.45) ${c.gap};
          font-size: max(${c.min_font_size}, ${c.font_size});
          font-weight: 300;
          line-height: 1.35;
          letter-spacing: 0.05em;
          white-space: nowrap;
          color: ${c.color};
        }
        .lead { color: ${c.label_color}; }
        .idx { color: ${c.index_color}; margin-right: 0.3em; }
        .off { color: ${c.index_color}; }

        /* Folded form. Below this width the type has hit its px floor and
           stops scaling with the card, so a single row would overrun it.
           Every chip already carries a grid-row/grid-column - inert while
           this is a flex container, which is what lets the two layouts
           share one DOM and switch on width alone. */
        @container (max-width: ${c.stack_below}) {
          .row {
            display: grid;
            grid-template-columns: max-content max-content;
            column-gap: ${c.column_gap};
            row-gap: 0.15em;
            line-height: 1.25;
            justify-content: start;
          }
          /* right-align the numbers so the names form a clean column */
          .idx { display: inline-block; min-width: 1.5em; text-align: right; }
        }
      </style>
      <div class="row"></div>`;
    this._row = root.querySelector('.row');
  }

  _names() {
    if (!this._hass) return null;
    const st = this._hass.states[this._cfg.entity];
    if (!st || !st.attributes) return null;
    const raw = st.attributes[this._cfg.attribute];
    return Array.isArray(raw) ? raw : null;
  }

  _render() {
    const names = this._names();
    const sig = JSON.stringify(names);
    if (sig === this._sig) return;
    this._sig = sig;
    this._paint(names);
  }

  _paint(names) {
    if (!this._row) return;
    this._row.innerHTML = '';

    if (this._cfg.label) {
      const lead = document.createElement('span');
      lead.className = 'lead';
      lead.textContent = this._cfg.label;
      // Folded, the label heads both columns instead of sitting in one.
      lead.style.gridColumn = '1 / -1';
      lead.style.gridRow = '1';
      this._row.appendChild(lead);
    }

    // Device down: the assignment list doesn't exist at all, so there is
    // nothing to number. One dash after the heading, rather than sixteen
    // of them or - as this used to do - dropping the heading too and
    // leaving a silent gap under the plate.
    if (!names) {
      const gone = document.createElement('span');
      gone.className = 'off';
      gone.textContent = this._cfg.placeholder;
      gone.style.gridColumn = '1';
      gone.style.gridRow = '2';
      this._row.appendChild(gone);
      return;
    }

    const total = this._cfg.show_unassigned
      ? Math.max(this._cfg.channels, names.length)
      : names.length;

    for (let i = 0; i < total; i++) {
      const name = names[i];
      const chip = document.createElement('span');
      // Inert in the flex layout, honoured in the folded grid: outputs
      // 1-8 down the left column, 9-16 down the right. Row 1 is the label.
      chip.style.gridColumn = String(Math.floor(i / CH_PER_COLUMN) + 1);
      chip.style.gridRow = String((i % CH_PER_COLUMN) + 2);
      // Full device name on hover - the abbreviations are standard but
      // "SBL" vs "TRL" is worth being able to check without leaving the page.
      if (name) chip.title = `Output ${i + 1}: ${name}`;

      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(i + 1);
      chip.appendChild(idx);

      const label = document.createElement('span');
      if (!name) label.className = 'off';
      label.textContent = name ? abbreviate(name) : '—';
      chip.appendChild(label);

      this._row.appendChild(chip);
    }
  }

  getCardSize() {
    return 1;
  }
}

if (!customElements.get('tide16-channels')) {
  customElements.define('tide16-channels', Tide16Channels);
}

/* =====================================================================
 * tide16-buttons - the scene button column on the faceplate.
 *
 * A vertical stack of fixed-ratio buttons inside whatever box the YAML
 * gives it. The ratio is the point: the element sizes itself from the box
 * WIDTH via aspect-ratio, so re-positioning or resizing the box can never
 * produce squashed or stretched buttons - only different spacing.
 *
 * `gap` picks how the slack is spent. A justify-content keyword
 * ("space-between", the default) spreads the buttons across the whole box.
 * Any length instead ("1.53cqw") sets a fixed inter-button gap and the
 * stack is pinned to the BOTTOM of the box - which is the edge the YAML
 * aligns to the plate's screen, so the buttons stay registered to it and
 * the slack collects at the top, under the title.
 *
 * Buttons are inert until a `tap` is configured. Each entry takes
 * {color, label?, hint?, tap: {action, data}} where action is a service in
 * "domain.service" form - e.g.
 *   buttons:
 *     - color: "#D93A2B"
 *       hint: Movie Time
 *       tap: {action: scene.turn_on, data: {entity_id: scene.movie}}
 *
 * `hint` is the button's hover text, and on a colour-only button it is
 * the only name the thing has - worth setting.
 *
 * An optional `title` rides ABOVE the box (bottom: 100%), deliberately
 * outside it: the box IS the button column's geometry - its bottom edge
 * is aligned to the plate's screen from the YAML - so a heading that
 * consumed box height would drag the buttons off that alignment. As a
 * shadow child it centres on the column for free, and it inherits the
 * frontend font, so it matches the live readouts on the screen.
 */

const BTN_DEFAULTS = {
  ratio: '7 / 2', // width / height of each button
  gap: 'space-between', // justify-content keyword, or a length (see above)
  radius: '3px',
  title: null, // optional heading above the column
  title_size: '1.05cqw', // between the source and speaker-config readouts
  title_color: '#BFC0C0',
  title_gap: '0.5cqw', // clearance between heading and first button
  buttons: [{ color: '#D93A2B' }, { color: '#2FA84F' }, { color: '#E8C22E' }, { color: '#2F6FD0' }],
};

class Tide16Buttons extends HTMLElement {
  constructor() {
    super();
    this._cfg = { ...BTN_DEFAULTS };
    this._hass = null;
  }

  setConfig(config) {
    this._cfg = { ...BTN_DEFAULTS, ...(config || {}) };
    if (!Array.isArray(this._cfg.buttons) || !this._cfg.buttons.length) {
      throw new Error('tide16-buttons: `buttons` must be a non-empty list');
    }
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _build() {
    const c = this._cfg;
    // a justify-content keyword spreads the buttons; anything else is a
    // length, i.e. a fixed gap with the stack held against the box bottom
    const spread = /^(space-between|space-around|space-evenly|flex-start|flex-end|center)$/.test(
      String(c.gap).trim()
    );
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { display: block; position: absolute; }
        .col {
          display: flex;
          flex-direction: column;
          justify-content: ${spread ? c.gap : 'flex-end'};
          gap: ${spread ? '0' : c.gap};
          height: 100%;
        }
        .title {
          position: absolute;
          bottom: 100%;
          /* centred on the column, NOT laid out across it: the heading is
             normally wider than a button, and a width:100% box that the
             text overflows gets start-aligned by the engine no matter what
             text-align says - which hangs the whole word off the column's
             left edge. Sized to its own content and pulled back by half,
             it stays centred on the buttons at any width. */
          left: 50%;
          transform: translateX(-50%);
          width: max-content;
          padding-bottom: ${c.title_gap};
          text-align: center;
          /* no font-family: inherit the frontend's, same as the state
             labels printed on the screen */
          font-size: ${c.title_size};
          font-weight: 300;
          line-height: 1;
          letter-spacing: 0.08em;
          color: ${c.title_color};
          white-space: nowrap;
          pointer-events: none;
        }
        .btn {
          width: 100%;
          aspect-ratio: ${c.ratio};
          flex: none;
          border-radius: ${c.radius};
          /* faint top highlight + seated edge, so they read as physical
             buttons on a photoreal plate rather than flat CSS swatches */
          background-image: linear-gradient(
            to bottom, rgba(255,255,255,0.22), rgba(255,255,255,0) 45%,
            rgba(0,0,0,0.18) 100%);
          box-shadow:
            inset 0 0 0 1px rgba(0,0,0,0.35),
            0 1px 2px rgba(0,0,0,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1cqw;
          font-weight: 400;
          letter-spacing: 0.08em;
          color: rgba(0,0,0,0.72);
          user-select: none;
        }
        .btn[data-tap] { cursor: pointer; }
        .btn[data-tap]:active { filter: brightness(0.86); }
      </style>
      ${c.title ? '<div class="title"></div>' : ''}
      <div class="col"></div>`;

    // textContent, not interpolated into the template above, so a title
    // with markup in it stays text
    if (c.title) root.querySelector('.title').textContent = c.title;

    const col = root.querySelector('.col');
    c.buttons.forEach((b, i) => {
      const el = document.createElement('div');
      el.className = 'btn';
      el.style.backgroundColor = b.color || '#888';
      if (b.label) el.textContent = b.label;
      // A colour-only button says nothing about what it does, so the
      // hover text is the only label it has. `hint` first, then whatever
      // `label` is printed on it; without either it stays untitled rather
      // than surfacing a raw entity_id.
      const hint = b.hint != null ? String(b.hint) : b.label ? String(b.label) : '';
      if (b.tap && b.tap.action) {
        el.dataset.tap = '';
        el.addEventListener('click', () => this._fire(b.tap));
        if (hint) el.title = hint;
      }
      col.appendChild(el);
    });
  }

  _fire(tap) {
    if (!this._hass) return;
    const [domain, service] = String(tap.action).split('.');
    if (!domain || !service) return;
    this._hass.callService(domain, service, tap.data || {});
  }

  getCardSize() {
    return 1;
  }
}

if (!customElements.get('tide16-buttons')) {
  customElements.define('tide16-buttons', Tide16Buttons);
}

/* =====================================================================
 * tide16-glyph - one PNG on the plate, with a tap and hover text.
 *
 * Exists because picture-elements' own `image` element can't be hovered
 * reliably here: it does accept a `title`, but it hangs it on the inner
 * <hui-image> while its clickable wrapper puts another div over the top,
 * so the cursor lands on an element that has no title in its ancestry and
 * no tooltip ever appears. Owning the element means the title sits on the
 * host, which IS the hover target - the same thing that makes hover work
 * on the buttons, inputs and knob labels.
 *
 * {image, hint?, tap?: {action, data}}. The box sets the size, as with
 * everything else on this plate: the PNG fills the width and keeps its
 * own aspect. Untapped it stays inert and takes no pointer events, so it
 * can't swallow a click meant for the plate underneath.
 *
 * `button: true` sinks the glyph into a concave panel button - a round
 * dish with a 1px rim, lit from below so it reads as milled INTO the
 * plate rather than sitting on it. With it, the box is the BUTTON and
 * `icon_scale` (0.8 default) is the glyph inside, so give the box a
 * `height` as well as a `width` or the dish will not be round.
 *
 * `color_entity` paints the art from live state - {color_entity,
 * color_on?, color_off?, on_states?}. The PNG stops being an image and
 * becomes a MASK: its alpha is the shape and the colour is the element's
 * own background, so one file serves both states and the hex is exact
 * rather than whatever a filter chain lands on. Needs flat line art on
 * transparency, which is what the plate's glyphs are.
 * `on_states` defaults to ['on']; ANY other state - including a missing
 * entity, unknown or unavailable - is off. That fail-safe is deliberate
 * for the power glyph: the Tide16 drops off the network in standby, so
 * "I cannot see it" and "it is off" are the same fact.
 * `color` is the same masking with no entity behind it - one flat colour.
 *
 * `busy_colors` makes a TAP flash the glyph until the unit answers again.
 * A reboot takes the Tide16 off the network for most of a minute and the
 * whole panel dashes out while it is gone, so without this the button
 * looks like it did nothing at all. The cycle IS the progress bar:
 *   busy_colors    the colours to step through, one per interval
 *   busy_interval  ms per step (1000)
 *   busy_min_steps steps to show before liveness may end it (5)
 *   busy_timeout   hard stop in ms (60000), after which it rests again
 *   busy_entity    what "answering again" means (defaults to color_entity)
 *   busy_live_states  states that count as answering (['on'])
 * Two things make the wait honest, and both were learned the hard way:
 * the run must SEE the entity go down before a live reading can end it,
 * and down has to be a whitelist - a rebooting Tide16 reports `off`, not
 * `unavailable`, so "not unavailable" reads a dead unit as a live one.
 * Either exit lands back on the resting colour - the glyph never stays
 * stuck mid-cycle, however the wait ends.
 */

// Fallbacks for a `color_entity` glyph that names no colours of its own.
// The off colour is the plate's own glyph grey, so an untinted-looking
// glyph is what you get if only the entity is given.
const GLYPH_TINT_ON = '#BFC0C0';
const GLYPH_TINT_OFF = '#BFC0C0';
const GLYPH_BUSY_INTERVAL = 1000;
const GLYPH_BUSY_MIN_STEPS = 5;
const GLYPH_BUSY_TIMEOUT = 60000;

class Tide16Glyph extends HTMLElement {
  constructor() {
    super();
    this._cfg = {};
    this._hass = null;
  }

  setConfig(config) {
    this._cfg = { ...(config || {}) };
    if (!this._cfg.image) {
      throw new Error('tide16-glyph: `image` is required');
    }
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._paint();
  }

  /* The colour this glyph rests at: state-driven if it has an entity,
     otherwise its one flat `color`. */
  _restColor() {
    const c = this._cfg;
    if (c.color_entity && this._hass) {
      const st = this._hass.states[c.color_entity];
      const on = !!st && this._onStates.includes(String(st.state).toLowerCase());
      return on ? c.color_on || GLYPH_TINT_ON : c.color_off || GLYPH_TINT_OFF;
    }
    return c.color || c.color_off || GLYPH_TINT_OFF;
  }

  /* Repaint a masked glyph. hass ticks at 4 Hz while the meter is on
     screen, so this writes to the DOM only when the colour actually
     changes - and never while a busy run is on, which owns the colour
     until it ends. */
  _paint() {
    if (!this._ink || this._busy) return;
    const col = this._restColor();
    if (col === this._col) return;
    this._col = col;
    this._ink.style.background = col;
  }

  /* Is the thing this glyph waits on answering?
     Whitelist, not blacklist, and that is the whole point: through a
     reboot the Tide16's media_player does NOT go unavailable, it reports
     `off` with status "not connected" - so anything that merely excluded
     unknown/unavailable called a rebooting unit live and ended the wait
     before it had begun. Only the states named in `busy_live_states`
     (default ['on']) count as answering. */
  _isLive() {
    const c = this._cfg;
    const ent = c.busy_entity || c.color_entity;
    if (!ent || !this._hass) return false;
    const st = this._hass.states[ent];
    return !!st && this._liveStates.includes(String(st.state).toLowerCase());
  }

  _startBusy() {
    const c = this._cfg;
    if (!this._ink) return;
    const cols = Array.isArray(c.busy_colors) && c.busy_colors.length
      ? c.busy_colors
      : [this._restColor()];
    const every = Number(c.busy_interval) || GLYPH_BUSY_INTERVAL;
    const minSteps =
      c.busy_min_steps == null ? GLYPH_BUSY_MIN_STEPS : Number(c.busy_min_steps);
    const limit = Number(c.busy_timeout) || GLYPH_BUSY_TIMEOUT;
    this._stopBusy();
    this._busy = true;
    let step = 0;
    // A unit can only come BACK if it went away first. For the seconds
    // between the press and the unit actually dropping off the network it
    // is still answering, so "live" on its own would end the cycle a beat
    // after it started - which is exactly what it did. The run therefore
    // waits to SEE it go down, and only then treats live as "it's back".
    let seenDown = false;
    const tick = () => {
      // paint first, so the very first frame acknowledges the press
      this._col = cols[step % cols.length];
      this._ink.style.background = this._col;
      step += 1;
      const live = this._isLive();
      if (!live) seenDown = true;
      if ((live && seenDown && step >= minSteps) || step * every >= limit) {
        this._stopBusy();
        return;
      }
      this._busyTimer = setTimeout(tick, every);
    };
    tick();
  }

  /* Always the way out of a busy run - both exits and an unmount come
     through here, so the glyph can never be left stuck mid-cycle. */
  _stopBusy() {
    if (this._busyTimer) clearTimeout(this._busyTimer);
    this._busyTimer = null;
    this._busy = false;
    this._col = null; // the cycle wrote colours behind _paint's back
    this._paint();
  }

  disconnectedCallback() {
    this._stopBusy();
  }

  _build() {
    const c = this._cfg;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const tappable = !!(c.tap && c.tap.action);
    // `button: true` wraps the glyph in a concave panel button. The BOX is
    // the button, and the icon is `icon_scale` of it - width and height
    // both, with object-fit: contain, so the scale is exact whatever the
    // art's aspect. Sizing by width alone would shrink a tall glyph less
    // than a square one and the pair would stop matching.
    const s = c.icon_scale == null ? 0.8 : Number(c.icon_scale);
    const pct = (s * 100).toFixed(2);
    const btn = !!c.button;
    // A tinted glyph is a masked DIV, not an <img> - see the doc block.
    // `ink` is whichever of the two this instance ended up with, so the
    // sizing and :active rules below stay written once.
    const tint = !!(c.color_entity || c.color || c.busy_colors);
    const ink = tint ? '.ink' : 'img';
    const inkEl = tint ? '<div class="ink"></div>' : '<img>';
    this._onStates = (Array.isArray(c.on_states) ? c.on_states : ['on']).map((v) =>
      String(v).toLowerCase()
    );
    this._liveStates = (
      Array.isArray(c.busy_live_states) ? c.busy_live_states : ['on']
    ).map((v) => String(v).toLowerCase());
    root.innerHTML = `
      <style>
        :host {
          display: block;
          position: absolute;
          pointer-events: ${tappable ? 'auto' : 'none'};
          cursor: ${tappable ? 'pointer' : 'default'};
        }
        ${
          btn
            ? `
        /* A shallow dish milled into the panel. The gradient is lit from
           BELOW - bright at the bottom, dark at the top - which is what
           reads as concave; the same gradient flipped reads as a dome.
           The inset shadow up top is the rim casting into the well, the
           inset highlight at the bottom is the light it bounces back, and
           the 1px outer bottom line is the panel's own cut edge catching
           light, which is what makes it sit flush rather than float. */
        .btn {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          display: grid;
          place-items: center;
          /* The dish sits well ABOVE the plate's own near-black (#0e0e0e)
             so the component reads as hardware rather than as a hole.
             Bottom-lit: #14161a at the top wall climbing to #4e5157 at
             the bottom, a ~58-luma sweep across the face. */
          background: radial-gradient(120% 120% at 50% 128%,
                                      #4e5157 0%, #303338 38%, #1d1f23 72%, #14161a 100%);
          border: 1px solid ${c.button_border || '#7d828b'};
          box-shadow:
            /* rim casting into the well - the main concavity cue */
            inset 0 5px 7px -2px rgba(0, 0, 0, 0.95),
            /* light bouncing off the lower inner wall */
            inset 0 -4px 6px -2px rgba(255, 255, 255, 0.30),
            /* crisp inner darkening so the wall meets the rim, not fades */
            inset 0 0 0 1px rgba(0, 0, 0, 0.55),
            /* panel surface catching light on the upper lip of the hole,
               and dropping into shadow below it - an inset reads the
               OPPOSITE way round to a raised button here */
            0 -1px 0 rgba(255, 255, 255, 0.13),
            0 2px 3px rgba(0, 0, 0, 0.75);
        }
        ${ink} {
          display: block;
          width: ${pct}%;
          height: ${pct}%;
          object-fit: contain;
        }
        :host(:hover) .btn { border-color: ${c.button_border_hover || '#a3a8b1'}; }
        /* pressed: deepen the dish and sink the icon a hair */
        :host(:active) .btn {
          background: radial-gradient(120% 120% at 50% 128%,
                                      #3a3d42 0%, #232629 38%, #15171a 72%, #0e1013 100%);
          box-shadow:
            inset 0 6px 9px -2px rgba(0, 0, 0, 1),
            inset 0 0 0 1px rgba(0, 0, 0, 0.6);
        }
        :host(:active) ${ink} { filter: brightness(0.75); transform: translateY(0.5px); }`
            : `
        /* A masked glyph has no intrinsic size to keep an aspect from, so
           it fills the box and the BOX carries the art's aspect. An <img>
           still sizes itself off the file, exactly as before. */
        ${ink} { display: block; width: 100%; height: ${tint ? '100%' : 'auto'}; }
        :host(:active) ${ink} { filter: brightness(0.7); }`
        }
        ${
          tint
            ? `
        /* Both spellings: -webkit-mask is still the one some Chromium
           builds honour on the shorthand. A contain fit matches the
           object-fit an <img> would have used, so swapping to a mask does
           not resize the art. The colour here is only the pre-paint
           value - _paint owns it from the first hass tick. */
        .ink {
          -webkit-mask: url("${c.image}") center / contain no-repeat;
          mask: url("${c.image}") center / contain no-repeat;
          background: ${c.color || c.color_off || GLYPH_TINT_OFF};
        }`
            : ''
        }
      </style>
      ${btn ? `<div class="btn">${inkEl}</div>` : inkEl}`;
    this._ink = root.querySelector('.ink');
    this._col = null;
    const img = root.querySelector('img');
    if (img) {
      img.src = c.image;
      // alt, not the tooltip: the hover text belongs on the host, which is
      // what the cursor actually lands on
      img.alt = c.hint == null ? '' : String(c.hint);
    }
    if (c.hint != null) this.title = String(c.hint);
    if (tappable) {
      this.onclick = () => {
        this._fire(c.tap);
        if (c.busy_colors) this._startBusy();
      };
    }
    this._paint();
  }

  _fire(tap) {
    if (!this._hass) return;
    const [domain, service] = String(tap.action).split('.');
    if (!domain || !service) return;
    this._hass.callService(domain, service, tap.data || {});
  }

  getCardSize() {
    return 1;
  }
}

if (!customElements.get('tide16-glyph')) {
  customElements.define('tide16-glyph', Tide16Glyph);
}

/* =====================================================================
 * tide16-knob-labels - text laid out around a knob, by clock position.
 *
 * The YAML box is the KNOB, not the text: give it the knob's bounding
 * square on the plate and every label places itself outside that circle.
 * That is the whole point - one box to measure, and `gap` is then a real
 * clearance from the knob's edge that stays honest at every angle,
 * instead of eight hand-tuned left/top pairs that drift the moment the
 * card is rescaled.
 *
 * Each label is {at, text, tap?} where `at` is a clock position (12, 1,
 * 2, 3, 6, 9, 10, 11). Hours map to angles the usual way - 12 is up, 3
 * is right - and a FRACTION is a fraction of an hour, so 4.5 is half
 * past four: the 135-degree diagonal, which whole hours cannot reach.
 * The label is then pushed out along that ray by half its own
 * box, so what ends up `gap` from the circle is the label's NEAREST
 * edge: bottom at 12, top at 6, left at 3, right at 9, and the
 * corresponding corner on the diagonals.
 *
 * `tap` is the same {action, data} shape the scene buttons take, e.g.
 *   - at: 3
 *     text: "Vol: +10"
 *     tap: {action: script.turn_on, data: {entity_id: script.x}}
 * A tappable label carries hover text: `hint`, or its own rows joined
 * back into one line.
 * A label without one stays inert and does not take pointer events, so
 * it can't swallow a click meant for the plate underneath.
 *
 * No font-family: like the scene-button heading it inherits the
 * frontend's, so the labels match the readouts printed on the screen.
 */

const KNOB_DEFAULTS = {
  gap: '0.381cqw', // clearance from the knob edge (10px of the 2622 canvas)
  color: '#000',
  size: '1.05cqw', // same as the scene-button heading
  weight: '400',
  line_gap: '0.05cqw', // between the stacked rows of one label
  labels: [],
};

// clock hour -> angle in radians, measured CCW from 3 o'clock
const HOUR_ANGLE = (h) => ((3 - (h % 12)) * 30 * Math.PI) / 180;

class Tide16KnobLabels extends HTMLElement {
  constructor() {
    super();
    this._cfg = { ...KNOB_DEFAULTS };
    this._hass = null;
  }

  setConfig(config) {
    this._cfg = { ...KNOB_DEFAULTS, ...(config || {}) };
    if (!Array.isArray(this._cfg.labels) || !this._cfg.labels.length) {
      throw new Error('tide16-knob-labels: `labels` must be a non-empty list');
    }
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _build() {
    const c = this._cfg;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const round = (n) => Number(n.toFixed(4));

    const items = c.labels
      .map((l, i) => {
        const a = HOUR_ANGLE(Number(l.at));
        const cos = round(Math.cos(a));
        const sin = round(Math.sin(a));
        // the point on the circle for this hour, then `gap` further out
        const px = round(50 + 50 * cos);
        const py = round(50 - 50 * sin);
        // a stacked label has to know which way to align: the ray decides.
        // Labels out to the side grow away from the knob, the ones at 12
        // and 6 straddle its centreline.
        const align = cos > 0.1 ? 'left' : cos < -0.1 ? 'right' : 'center';
        return `
          .l${i} {
            left: calc(${px}% + (${c.gap} * ${cos}));
            top: calc(${py}% - (${c.gap} * ${sin}));
            text-align: ${align};
            /* push the box out by half of itself along the same ray, so
               its near edge - not its centre - lands on that point. With a
               stacked label the box is taller, so the whole stack simply
               sits further out; the near EDGE is still gap from the rim. */
            transform: translate(${round(-50 + 50 * cos)}%, ${round(-50 - 50 * sin)}%);
          }`;
      })
      .join('');

    root.innerHTML = `
      <style>
        /* the host box IS the knob, so it must not eat clicks - only the
           labels that actually have a tap turn pointer events back on */
        :host { display: block; position: absolute; pointer-events: none; }
        .wrap { position: relative; width: 100%; height: 100%; pointer-events: none; }
        .l {
          position: absolute;
          font-size: ${c.size};
          font-weight: ${c.weight};
          line-height: 1;
          letter-spacing: 0.04em;
          color: ${c.color};
          white-space: nowrap;
          user-select: none;
          pointer-events: none;
        }
        .l[data-tap] { pointer-events: auto; cursor: pointer; }
        .l[data-tap]:active { opacity: 0.55; }
        .ln + .ln { padding-top: ${c.line_gap}; }
        ${items}
      </style>
      <div class="wrap"></div>`;

    const wrap = root.querySelector('.wrap');
    c.labels.forEach((l, i) => {
      const el = document.createElement('div');
      el.className = `l l${i}`;
      // `text` takes a list as readily as a string - a list stacks, one
      // row per entry, which is how "Mute:" / "On" is drawn
      const lines = l.text == null ? [] : Array.isArray(l.text) ? l.text : [l.text];
      lines.forEach((t) => {
        const ln = document.createElement('div');
        ln.className = 'ln';
        ln.textContent = String(t);
        el.appendChild(ln);
      });
      if (l.tap && l.tap.action) {
        el.dataset.tap = '';
        el.addEventListener('click', () => this._fire(l.tap));
        // hover text: `hint`, else the label's own rows run back into one
        // line - "Mute:" / "On" reads as "Mute: On". The inert labels get
        // none; they don't take pointer events, so it would never show.
        const hint = l.hint != null ? String(l.hint) : lines.join(' ');
        if (hint) el.title = hint;
      }
      wrap.appendChild(el);
    });
  }

  _fire(tap) {
    if (!this._hass) return;
    const [domain, service] = String(tap.action).split('.');
    if (!domain || !service) return;
    this._hass.callService(domain, service, tap.data || {});
  }

  getCardSize() {
    return 1;
  }
}

if (!customElements.get('tide16-knob-labels')) {
  customElements.define('tide16-knob-labels', Tide16KnobLabels);
}

/* =====================================================================
 * tide16-readout - a titled block of label/value lines on the screen.
 *
 * The plate's screen is a grid of cells with the rules baked into the
 * artwork; this fills one of them the way the device's own UI does - a
 * dim heading over one or more live lines, e.g.
 *
 *     Program
 *     Rate: 48000
 *     Decoder: MAT_DTHD decoder
 *     Stream: Third-party channel-based PCM
 *
 * Rows read from an entity's state, or from one of its attributes when
 * `attribute` is given - which is the whole reason this exists rather
 * than three picture-elements state-labels: sample rate and decoder are
 * ATTRIBUTES of sensor.tide16_stream, and one box here is far easier to
 * keep inside its cell than four separately-positioned labels.
 *
 * A value that is missing, unknown or unavailable prints as `placeholder`
 * ("-" by default), so a powered-down Tide16 reads "Decoder: -" instead
 * of a bare dangling "Decoder:". Rows carrying no `entity` are static
 * text and never get one.
 *
 * With no `rows` it degenerates to a single static line, which is how
 * the red MUTE flag is drawn - wrap it in a picture-elements
 * `conditional` to gate it on switch.tide16_mute.
 *
 * `title_image` puts a mark before the title text, which is how the
 * "Dolby Profiles" heading is drawn - the word "Dolby" is the double-D,
 * not type. The row is a baseline-aligned inline-flex, so the mark's
 * BOTTOM lands on the text's baseline, and `title_image_scale` is its
 * height in em: the 0.715 default is Roboto's cap height, so the mark
 * measures exactly as tall as the capital P beside it. Sizing it off the
 * em box instead would leave it floating, since a font's em box is
 * taller than its capitals.
 *
 * Positioning: give it left/top as usual, or set `right` and leave
 * `left: unset` and the width shrink-wraps the text, so the box's RIGHT
 * edge is what you positioned. That is what the mute flag needs - it is
 * pinned a fixed distance in from the screen's right edge, and "Mute"
 * must not drift depending on how wide the word renders.
 *
 * No font-family: inherits the frontend's, like every other readout.
 */

const READOUT_DEFAULTS = {
  title: null,
  title_color: '#808080', // the grey the plate's own "Source"/"Program" are printed in
  title_size: '0.805cqw', // measured off that same baked label
  title_gap: '0.15cqw',
  title_image: null, // a mark drawn before the title text
  title_image_scale: 0.715, // its height in em - Roboto's cap height
  title_image_gap: '0.3em',
  title_image_alt: null, // the word the mark stands in for
  color: '#B7B8B8',
  size: '0.45cqw',
  row_gap: '0.10cqw',
  align: 'left',
  placeholder: '-',
  // A value wider than its box scrolls rather than spilling across the plate.
  // Needs a WIDTH on the element in the YAML - without one the box shrink-wraps
  // the text and nothing can ever overflow it.
  scroll: false,
  scroll_speed: 14, // CSS px per second. The plate renders at about 0.67 CSS px
  // per canvas px, so this is a slow walk, not a ticker.
  rows: [],
};

class Tide16Readout extends HTMLElement {
  constructor() {
    super();
    this._cfg = { ...READOUT_DEFAULTS };
    this._hass = null;
    this._rowEls = [];
  }

  setConfig(config) {
    this._cfg = { ...READOUT_DEFAULTS, ...(config || {}) };
    if (!this._cfg.title && !this._cfg.rows.length) {
      throw new Error('tide16-readout: needs a `title`, `rows`, or both');
    }
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._paint();
  }

  _build() {
    const c = this._cfg;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { display: block; position: absolute; pointer-events: none; }
        .block { text-align: ${c.align}; white-space: nowrap; }
        .title {
          font-size: ${c.title_size};
          font-weight: 300;
          line-height: 1;
          color: ${c.title_color};
          padding-bottom: ${c.title_gap};
        }
        /* Block-level flex, NOT inline-flex: an inline-level heading is
           laid out on a line box, and the parent's own strut then adds
           leading above it, which pushed this heading 7.4px below the one
           it is meant to sit level with. Block-level starts flush at the
           top of the box, so the YAML's top offset means what it says.
           Block-level also means text-align no longer reaches it, hence
           justify-content off the same align option.
           NOTE: no backticks in here - this is inside a template literal
           and one would end the string. */
        .title.marked {
          display: flex;
          align-items: baseline;
          justify-content: ${
            c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start'
          };
          gap: ${c.title_image_gap};
        }
        .title .mark {
          flex: none;
          height: ${c.title_image_scale}em;
          width: auto;
        }
        .row {
          font-size: ${c.size};
          font-weight: 300;
          line-height: 1;
          color: ${c.color};
        }
        .row + .row { padding-top: ${c.row_gap}; }
        /* Scrolling rows. The row is the window and .txt is the thing that
           moves, so the type never leaves the cell it belongs to. Held still at
           each end for a share of the cycle - a name you cannot read the start
           of is worse than one that does not move at all.
           NOTE: no backticks in here - this is inside a template literal and
           one would end the string. */
        .row.scroll { overflow: hidden; }
        .row.scroll .txt { display: inline-block; white-space: nowrap; }
        .row.scrolling .txt {
          animation: t16-scroll var(--t16-dur) ease-in-out infinite;
        }
        @keyframes t16-scroll {
          0%, 15% { transform: translateX(0); }
          50%, 65% { transform: translateX(calc(-1 * var(--t16-ov))); }
          100% { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .row.scrolling .txt { animation: none; }
        }
      </style>
      <div class="block">
        ${c.title ? '<div class="title"></div>' : ''}
        ${c.rows
          .map(() =>
            c.scroll ? '<div class="row scroll"><span class="txt"></span></div>' : '<div class="row"></div>'
          )
          .join('')}
      </div>`;

    // textContent rather than interpolation, so a label or a value that
    // happens to contain markup stays text
    if (c.title) {
      const t = root.querySelector('.title');
      if (c.title_image) {
        t.classList.add('marked');
        const mk = document.createElement('img');
        mk.className = 'mark';
        mk.src = c.title_image;
        // The mark stands in for a word, so it needs that word's name -
        // otherwise the heading reads as just "Profiles" to a screen
        // reader and to anyone whose images failed to load.
        mk.alt = c.title_image_alt == null ? '' : String(c.title_image_alt);
        const tx = document.createElement('span');
        tx.textContent = c.title;
        t.append(mk, tx);
      } else {
        t.textContent = c.title;
      }
    }
    this._rowEls = [...root.querySelectorAll('.row')];
    this._paint();

    // the plate scales with the window, so what fits changes with it
    if (c.scroll && !this._ro && typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._measure());
      this._ro.observe(this);
    }
  }

  _paint() {
    const c = this._cfg;
    if (!this._rowEls.length) return;
    let changed = false;
    c.rows.forEach((r, i) => {
      const el = this._rowEls[i];
      if (!el) return;
      const text = [r.label, this._value(r)].filter(Boolean).join(' ');
      // .txt is the span that moves when the row scrolls; without scrolling the
      // row itself holds the text, exactly as before
      const target = c.scroll ? el.firstElementChild : el;
      if (target.textContent === text) return;
      target.textContent = text;
      changed = true;
    });
    // hass ticks at 4 Hz while the meter is on screen, and measuring forces
    // layout - so only remeasure when a value actually changed
    if (c.scroll && changed) this._measure();
  }

  /* Does any row overflow its cell, and by how much? Sets the animation up per
     row, since one block can hold a short line and a long one.

     Deliberately measured rather than guessed from character counts: the panel
     inherits the frontend's font, so the same string is a different width on a
     different machine. */
  _measure() {
    const c = this._cfg;
    if (this._raf) cancelAnimationFrame(this._raf);
    // after layout, or scrollWidth is read against the previous text
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._rowEls.forEach((el) => {
        const txt = el.firstElementChild;
        if (!txt) return;
        const over = txt.scrollWidth - el.clientWidth;
        if (over > 0.5) {
          // travel is 35% of the cycle each way, so the rest is the pause at
          // either end and the speed stays what scroll_speed says
          const dur = over / (Number(c.scroll_speed) * 0.35);
          el.style.setProperty('--t16-ov', over + 'px');
          el.style.setProperty('--t16-dur', dur.toFixed(2) + 's');
          el.classList.add('scrolling');
        } else {
          el.classList.remove('scrolling');
          el.style.removeProperty('--t16-ov');
          el.style.removeProperty('--t16-dur');
        }
      });
    });
  }

  /* Every way a value can be absent lands on `placeholder`: no hass yet,
     no such entity, no such attribute, or a state of unknown/unavailable.
     That matters on a cold start - for ~15s after a restart these
     entities do not exist at all, and for ~12s after that they read
     `unknown`. A built-in state-label prints that word; this prints "-"
     from the very first paint.

     `prefix` is applied ONLY to a real value. The volume's decimal half
     uses it for the point, so a missing reading draws nothing rather
     than a stray ".". */
  _value(row) {
    // A row with no entity is static text - it has nothing to be missing.
    if (!row.entity) return '';
    const gone = row.placeholder == null ? this._cfg.placeholder : row.placeholder;
    if (!this._hass) return gone;
    const st = this._hass.states[row.entity];
    if (!st) return gone;
    const v = row.attribute ? st.attributes[row.attribute] : st.state;
    if (v === undefined || v === null || v === '') return gone;
    if (['unknown', 'unavailable'].includes(String(v))) return gone;
    return (row.prefix == null ? '' : String(row.prefix)) + String(v);
  }

  getCardSize() {
    return 1;
  }
}

if (!customElements.get('tide16-readout')) {
  customElements.define('tide16-readout', Tide16Readout);
}

/* =====================================================================
 * tide16-inputs - a grid of dot-and-label source selectors.
 *
 * Each cell is a small round button followed by its input name, laid out
 * as `columns` x `rows` across whatever box the YAML gives it. Flow is
 * grid-auto-flow: column, so the items fill DOWN each column and then
 * move right - which is what keeps an alphabetical list reading in order
 * when it is arranged as columns of two rather than rows of six.
 *
 * The box IS the geometry: the grid fills it at 100% x 100% and the rows
 * are 1fr each, so the row height is whatever is left after `row_gap`.
 * Re-positioning or resizing the box can only change spacing.
 *
 * The whole cell is the hit target, not just the dot - a 13px circle is
 * a mean thing to ask anyone to hit, and the label is right there.
 *
 * Each item is {text, id?, tap?, hint?} with the same {action, data} shape the
 * rest of the card uses. A tappable cell gets hover text - "Select
 * source: Roku" unless `hint` says otherwise. Sources are selected through
 * media_player.select_source rather than the button.tide16_source_*
 * entities: those are named after the physical inputs (hdmi_2, spotify)
 * while the device reports the user's RENAMED sources ("Roku",
 * "Comcast"), so the names in source_list are the only thing that maps
 * one-to-one with what the panel actually displays.
 *
 * box-sizing: border-box on the dot on purpose - the border must not
 * grow it, or the circle stops matching the size the YAML asked for.
 *
 * NOTE for the YAML: quote the `border` value. Unquoted, YAML reads
 * "#666666" as a comment and hands over a bare "1px solid", which CSS
 * completes with currentColor - a white border, silently.
 *
 * No font-family: inherits the frontend's, like every other readout.
 */

const INPUT_DEFAULTS = {
  columns: 6,
  rows: 2,
  row_gap: '0.503cqw', // 10px of the 1990 canvas
  dot: '0.653cqw', // diameter of the round button
  dot_gap: '0.302cqw', // between the button and its label
  size: '0.704cqw',
  // 400 is the source rows' own weight. The Dolby column sets 300 to
  // match the plate's headings: at an IDENTICAL font-size, 400 against
  // the heading's 300 reads as a bigger label, not just a heavier one -
  // which is why matching only the size looked like nothing had changed.
  weight: '400',
  color: '#B7B8B8',
  // the live source is read off an entity attribute and matched against
  // each item's text (or its `value`, if the label differs from what the
  // device reports), so the panel shows which input is actually selected
  active_entity: null,
  active_attribute: 'source',
  active_color: '#FFFFFF',
  // the live source can also be set a notch larger than the rest; null
  // leaves it at `size`. Cells are align-items: center, so a taller label
  // grows about the row's middle and cannot shift the row it sits in.
  active_size: null,
  // ...or heavier instead of larger, which is what the Dolby column uses:
  // its rows have to stay level with the scene bars beside them, and
  // weight marks the selection without touching the type size at all.
  active_weight: null,
  background: '#333333',
  border: '1px solid #666666',
  // The live one's button, so the selection reads at a glance from the
  // dot alone rather than only from the label's weight. null on either
  // leaves the inactive styling in place.
  // box-sizing on .dot is border-box, so a heavier active border cannot
  // grow the circle out of register with the rest of the column.
  active_background: null,
  active_border: null,
  // Which inputs are actually CONFIGURED, read live off the device. The map is
  // {id: {name, hidden}} exactly as the Tide16's get_settings -> sources gives
  // it (see scripts/tide16_sources.py, surfaced as a command_line sensor).
  // Items opt in by carrying an `id`. A hidden input is still drawn - the panel
  // has twelve inputs and always will - but pushed back and made inert.
  source_entity: null,
  source_attribute: 'sources',
  // pushed well back rather than merely dimmed: the point is that the three
  // configured inputs are what the eye lands on first
  disabled_color: '#5E5F5F',
  disabled_background: '#1F1F1F',
  disabled_border: '1px solid #3A3A3A',
  items: [],
};

class Tide16Inputs extends HTMLElement {
  constructor() {
    super();
    this._cfg = { ...INPUT_DEFAULTS };
    this._hass = null;
  }

  setConfig(config) {
    this._cfg = { ...INPUT_DEFAULTS, ...(config || {}) };
    if (!Array.isArray(this._cfg.items) || !this._cfg.items.length) {
      throw new Error('tide16-inputs: `items` must be a non-empty list');
    }
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._paintSources();
    this._paintActive();
  }

  /* Which inputs are configured? The device's own hidden flag decides, so the
     panel follows whatever is set in the Tide16's UI without a card edit.
     Matching is by `id`, which also keeps every label in step with whatever the
     input has been RENAMED to - the YAML `text` is only the fallback for when
     the map is missing.

     Fail-open on purpose: an absent or empty map leaves every cell selectable.
     The map arrives from a polled command_line sensor, and a sensor that dies
     must not be able to render the whole input row inert. */
  _paintSources() {
    const c = this._cfg;
    if (!this._hass || !c.source_entity || !this._cells) return;
    const st = this._hass.states[c.source_entity];
    const map = st && c.source_attribute ? st.attributes[c.source_attribute] : null;
    if (!map || typeof map !== 'object' || !Object.keys(map).length) return;

    // hass ticks at 4 Hz while the meter is on screen and this table changes
    // about never, so repaint only when it actually differs
    const stamp = JSON.stringify(map);
    if (stamp === this._sourceStamp) return;
    this._sourceStamp = stamp;

    this._cells.forEach((cell) => {
      const it = cell._item;
      const entry = it && it.id != null ? map[it.id] : null;
      if (!entry) return;

      if (entry.name) {
        cell._lbl.textContent = String(entry.name);
        // select_source takes the DISPLAY name, so a renamed input needs the
        // new name in the payload or the tap quietly selects nothing. Held on
        // the CELL and merged in at fire time - Lovelace deep-freezes the
        // config it hands over, so writing it.tap.data.source throws
        // "Cannot assign to read only property", and a throw in this setter
        // takes the whole card's render down with it (card-mod stops applying,
        // and the plate loses its scale/outline box).
        cell._source = String(entry.name);
        if (it.hint == null && it.tap && it.tap.action) {
          cell.title = `Select source: ${entry.name}`;
        }
      }

      const hidden = entry.hidden === true;
      cell.classList.toggle('unconfigured', hidden);
      if (hidden) {
        // no pointer, no hover text, no press feedback - an inert cell must not
        // advertise itself as tappable
        delete cell.dataset.tap;
        cell.removeAttribute('title');
      } else if (it.tap && it.tap.action) {
        cell.dataset.tap = '';
      }
    });

    // a rename can move which label is the live one
    this._active = undefined;
    this._paintActive();
  }

  /* Which item is the live source? Repainted on every hass update, but
     only touched when the value actually changes - hass ticks at 4 Hz
     while the meter is on screen. */
  _paintActive() {
    const c = this._cfg;
    if (!this._hass || !c.active_entity || !this._cells) return;
    const st = this._hass.states[c.active_entity];
    const cur = st
      ? c.active_attribute
        ? st.attributes[c.active_attribute]
        : st.state
      : null;
    if (cur === this._active) return;
    this._active = cur;
    this._cells.forEach((cell, i) => {
      const it = c.items[i];
      const want = it.value == null ? it.text : it.value;
      cell.classList.toggle('on', cur != null && String(want) === String(cur));
    });
  }

  _build() {
    const c = this._cfg;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { display: block; position: absolute; }
        .grid {
          display: grid;
          grid-template-columns: repeat(${c.columns}, 1fr);
          grid-template-rows: repeat(${c.rows}, 1fr);
          /* fill down each column, then move right */
          grid-auto-flow: column;
          row-gap: ${c.row_gap};
          width: 100%;
          height: 100%;
        }
        .cell {
          display: flex;
          align-items: center;
          gap: ${c.dot_gap};
          white-space: nowrap;
          user-select: none;
          /* Grid items default to min-height: auto, so a cell taller than
             its 1fr track grows the track instead of overflowing it, and
             the rows walk off whatever the box was aligned to. The Dolby
             column is exactly that case - 20px dot and 21px type in an
             18.3px track - and without this its rows drift up to 12px
             clear of the scene bars they are supposed to sit level with.
             At 0 the track stays 1fr and the content overflows centred,
             so the row's midline is the track's midline. No effect on the
             source grid, whose type is shorter than its rows. */
          min-height: 0;
        }
        .dot {
          box-sizing: border-box;
          flex: none;
          width: ${c.dot};
          height: ${c.dot};
          border-radius: 50%;
          background: ${c.background};
          border: ${c.border};
        }
        .lbl {
          font-size: ${c.size};
          font-weight: ${c.weight};
          line-height: 1;
          letter-spacing: 0.03em;
          color: ${c.color};
        }
        .cell[data-tap] { cursor: pointer; }
        .cell[data-tap]:active .dot { filter: brightness(1.9); }
        .cell[data-tap]:active .lbl { opacity: 0.6; }
        /* the input the device is actually on */
        .cell.on .dot {
          ${c.active_background ? `background: ${c.active_background};` : ''}
          ${c.active_border ? `border: ${c.active_border};` : ''}
        }
        .cell.on .lbl {
          color: ${c.active_color};
          ${c.active_size ? `font-size: ${c.active_size};` : ''}
          ${c.active_weight ? `font-weight: ${c.active_weight};` : ''}
          text-decoration: underline;
          text-underline-offset: 0.22em;
          text-decoration-thickness: from-font;
        }
        /* an input the device has hidden: still drawn, but pushed back so the
           configured ones stand out, and inert. Declared after .cell.on so a
           hidden input could never be painted as the live one. */
        .cell.unconfigured { cursor: default; }
        .cell.unconfigured .lbl {
          color: ${c.disabled_color};
          text-decoration: none;
        }
        .cell.unconfigured .dot {
          background: ${c.disabled_background};
          border: ${c.disabled_border};
        }
      </style>
      <div class="grid"></div>`;

    this._cells = [];
    const grid = root.querySelector('.grid');
    c.items.forEach((it) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const dot = document.createElement('span');
      dot.className = 'dot';
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      // textContent, not interpolation, so a source name containing
      // markup stays text
      lbl.textContent = it.text == null ? '' : String(it.text);
      cell.appendChild(dot);
      cell.appendChild(lbl);
      // kept for _paintSources: it relabels cells and flips them inert
      cell._lbl = lbl;
      cell._item = it;
      if (it.tap && it.tap.action) {
        cell.dataset.tap = '';
        // guarded at fire time rather than at build time - `unconfigured` is
        // painted from live device state and can flip either way without a
        // rebuild, and a removed data-tap only changes the cursor
        cell.addEventListener('click', () => {
          if (cell.classList.contains('unconfigured')) return;
          this._fire(it.tap, cell._source);
        });
        // hover text says what the click does. Only the tappable cells
        // get one - a tooltip on something inert is a lie.
        cell.title = it.hint == null ? `Select source: ${lbl.textContent}` : String(it.hint);
      } else if (it.hint != null) {
        cell.title = String(it.hint);
      }
      this._cells.push(cell);
      grid.appendChild(cell);
    });
    this._active = undefined;
    this._sourceStamp = undefined;
    this._paintActive();
    this._paintSources();
  }

  /* `source` is the live name for this cell, if the device reported one.
     Merged into a COPY of the config's data - the config itself is frozen. */
  _fire(tap, source) {
    if (!this._hass) return;
    const [domain, service] = String(tap.action).split('.');
    if (!domain || !service) return;
    const data = { ...(tap.data || {}) };
    if (source && 'source' in data) data.source = source;
    this._hass.callService(domain, service, data);
  }

  getCardSize() {
    return 1;
  }
}

if (!customElements.get('tide16-inputs')) {
  customElements.define('tide16-inputs', Tide16Inputs);
}

/**
 * tide16-panel - the whole front panel, as ONE card.
 *
 * The seven elements above are picture-elements *elements*: each one needs a
 * box measured off the plate, and wiring them by hand is the 1000-line view
 * this repo used to ask people to paste. This card is that view, carried
 * inside the module and rendered on demand, so adding the panel to a
 * dashboard is one line - or two clicks, since it registers itself in the
 * card picker.
 *
 * Three things it deliberately does NOT do the way the pasted view did:
 *
 * 1. No card-mod. The view needed it to reach ha-card and turn on
 *    container-type (without which every cqw font silently resolves against
 *    the VIEWPORT instead of the card) and to strip the card chrome. Here
 *    the container lives on our own wrapper, and the chrome is switched off
 *    through ha-card's inherited custom properties - both of which cross the
 *    shadow boundary on their own. Nothing is pierced, and the last
 *    third-party dependency is gone.
 *
 * 2. Width, not transform. The old view shrank the plate with scale(0.75)
 *    because card-mod could not change how wide a panel view made the card,
 *    and a transform leaves the layout box at full size - so the card kept a
 *    band of dead space under the art, which is why the outline once
 *    appeared to float below the plate. Owning the box, `scale` is just a
 *    width, and the layout follows the art exactly.
 *
 * 3. It reports columns: full to a sections view. The plate is 1990x400,
 *    very nearly 5:1, and in a default-width section it would render as a
 *    letterbox slot too small to read.
 *
 * Options, both optional:
 *   scale    0-1, the fraction of the available width to use. Default 1.
 *   outline  CSS outline around the plate. Defaults to the 2px white one the
 *            panel has always had; set it to none to drop it.
 */

const PANEL_LAYOUT = {
    "type": "picture-elements",
    "image": "/tide16_static/plate-v2.png",
    "elements": [
      {
        "type": "custom:tide16-bars",
        "style": {
          "left": "17.739%",
          "top": "21.500%",
          "width": "15.628%",
          "height": "29.250%",
          "transform": "translate(0, 0)",
          "pointer-events": "none"
        }
      },
      {
        "type": "custom:tide16-channels",
        "entity": "sensor.tide16_channel_names_held",
        "attribute": "channel_names",
        "font_size": "0.78cqw",
        "gap": "0.88cqw",
        "color": "#FFFFFF",
        "index_color": "#B7B8B8",
        "label_color": "#B7B8B8",
        "style": {
          "left": "0.854%",
          "top": "86.375%",
          "width": "66%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-buttons",
        "ratio": "7 / 2",
        "gap": "1.190cqw",
        "title": "Scenes:",
        "title_size": "1.070cqw",
        "title_gap": "1.190cqw",
        "buttons": [
          {
            "color": "#D93A2B",
            "hint": "Recall red scene",
            "tap": {
              "action": "button.press",
              "data": {
                "entity_id": "button.tide16_scene_red"
              }
            }
          },
          {
            "color": "#2FA84F",
            "hint": "Recall green scene",
            "tap": {
              "action": "button.press",
              "data": {
                "entity_id": "button.tide16_scene_green"
              }
            }
          },
          {
            "color": "#E8C22E",
            "hint": "Recall yellow scene",
            "tap": {
              "action": "button.press",
              "data": {
                "entity_id": "button.tide16_scene_yellow"
              }
            }
          },
          {
            "color": "#2F6FD0",
            "hint": "Recall blue scene",
            "tap": {
              "action": "button.press",
              "data": {
                "entity_id": "button.tide16_scene_blue"
              }
            }
          }
        ],
        "style": {
          "left": "42.513%",
          "top": "36.473%",
          "width": "3.216%",
          "height": "36.047%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "title": "Profiles",
        "title_image": "/tide16_static/dolby.png?v=1",
        "title_image_alt": "Dolby",
        "title_size": "1.070cqw",
        "title_color": "#BFC0C0",
        "title_gap": "0",
        "align": "center",
        "style": {
          "left": "46.181%",
          "top": "25.225%",
          "width": "10.201%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-inputs",
        "columns": 1,
        "rows": 4,
        "row_gap": "1.190cqw",
        "dot": "1.005cqw",
        "dot_gap": "0.402cqw",
        "size": "0.804cqw",
        "weight": "400",
        "color": "#B7B8B8",
        "active_entity": "select.tide16_dolby_profile",
        "active_attribute": null,
        "active_color": "#FFFFFF",
        "active_background": "#32CD32",
        "active_border": "1px solid #FFFFFF",
        "active_weight": "700",
        "items": [
          {
            "text": "Movie",
            "value": "movie",
            "hint": "Set Dolby profile: Movie",
            "tap": {
              "action": "select.select_option",
              "data": {
                "entity_id": "select.tide16_dolby_profile",
                "option": "movie"
              }
            }
          },
          {
            "text": "Music",
            "value": "music",
            "hint": "Set Dolby profile: Music",
            "tap": {
              "action": "select.select_option",
              "data": {
                "entity_id": "select.tide16_dolby_profile",
                "option": "music"
              }
            }
          },
          {
            "text": "Night",
            "value": "night",
            "hint": "Set Dolby profile: Night",
            "tap": {
              "action": "select.select_option",
              "data": {
                "entity_id": "select.tide16_dolby_profile",
                "option": "night"
              }
            }
          },
          {
            "text": "Off",
            "value": "off",
            "hint": "Turn the Dolby profile off",
            "tap": {
              "action": "select.select_option",
              "data": {
                "entity_id": "select.tide16_dolby_profile",
                "option": "off"
              }
            }
          }
        ],
        "style": {
          "left": "49.121%",
          "top": "36.473%",
          "width": "4.472%",
          "height": "36.047%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "3.176cqw",
        "color": "#E7E8E8",
        "row_gap": "0",
        "align": "right",
        "rows": [
          {
            "entity": "sensor.tide16_volume_integer",
            "placeholder": "-.-"
          }
        ],
        "style": {
          "right": "86.231%",
          "left": "unset",
          "top": "24.189%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "1.673cqw",
        "color": "#DFE0E0",
        "row_gap": "0",
        "rows": [
          {
            "entity": "sensor.tide16_volume_decimal",
            "prefix": ".",
            "placeholder": ""
          }
        ],
        "style": {
          "left": "14.070%",
          "top": "30.259%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "1.141cqw",
        "color": "#B7B8B8",
        "row_gap": "0",
        "rows": [
          {
            "entity": "sensor.tide16_source"
          }
        ],
        "style": {
          "left": "6.734%",
          "top": "49.929%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "1.216cqw",
        "color": "#BFC0C0",
        "row_gap": "0",
        "rows": [
          {
            "entity": "sensor.tide16_speaker_config"
          }
        ],
        "style": {
          "left": "25.879%",
          "top": "64.723%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "0.844cqw",
        "row_gap": "0.010cqw",
        "rows": [
          {
            "label": "Rate:",
            "entity": "sensor.tide16_stream",
            "attribute": "sample_rate"
          },
          {
            "label": "Decoder:",
            "entity": "sensor.tide16_stream",
            "attribute": "decoder_type"
          },
          {
            "label": "Stream:",
            "entity": "sensor.tide16_stream"
          }
        ],
        "style": {
          "left": "6.784%",
          "top": "63.651%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "0.724cqw",
        "color": "#332050",
        "row_gap": "0",
        "rows": [
          {
            "entity": "sensor.tide16_status"
          }
        ],
        "style": {
          "left": "18.010%",
          "top": "60.320%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "1.075cqw",
        "color": "#BFC0C0",
        "row_gap": "0",
        "rows": [
          {
            "entity": "sensor.tide16_sample_rate_khz"
          }
        ],
        "style": {
          "left": "25.879%",
          "top": "71.431%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "title": "Preset",
        "title_size": "0.844cqw",
        "title_gap": "0",
        "style": {
          "left": "34.372%",
          "top": "58.726%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "1.216cqw",
        "color": "#BFC0C0",
        "row_gap": "0",
        "rows": [
          {
            "entity": "sensor.tide16_preset",
            "attribute": "preset_index"
          }
        ],
        "style": {
          "left": "34.372%",
          "top": "64.723%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "1.075cqw",
        "color": "#BFC0C0",
        "row_gap": "0",
        "scroll": true,
        "rows": [
          {
            "entity": "sensor.tide16_preset"
          }
        ],
        "style": {
          "left": "34.372%",
          "top": "71.431%",
          "width": "6.332%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "conditional",
        "conditions": [
          {
            "entity": "binary_sensor.tide16_atmos",
            "state": "on"
          }
        ],
        "elements": [
          {
            "type": "image",
            "image": "/tide16_static/dolby-atmos.png",
            "style": {
              "left": "34.698%",
              "top": "23.938%",
              "width": "5.226%",
              "transform": "translate(0, 0)",
              "filter": "brightness(0.91)",
              "pointer-events": "none"
            }
          }
        ]
      },
      {
        "type": "conditional",
        "conditions": [
          {
            "entity": "switch.tide16_dirac_live",
            "state": "on"
          }
        ],
        "elements": [
          {
            "type": "image",
            "image": "/tide16_static/dirac-a.png",
            "tap_action": {
              "action": "perform-action",
              "perform_action": "switch.toggle",
              "target": {
                "entity_id": "switch.tide16_dirac_live"
              }
            },
            "style": {
              "left": "35.930%",
              "top": "37.975%",
              "width": "2.764%",
              "transform": "translate(0, 0)",
              "cursor": "pointer"
            }
          }
        ]
      },
      {
        "type": "conditional",
        "conditions": [
          {
            "entity": "switch.tide16_dirac_live",
            "state_not": "on"
          }
        ],
        "elements": [
          {
            "type": "image",
            "image": "/tide16_static/dirac-a.png",
            "tap_action": {
              "action": "perform-action",
              "perform_action": "switch.toggle",
              "target": {
                "entity_id": "switch.tide16_dirac_live"
              }
            },
            "style": {
              "left": "35.930%",
              "top": "37.975%",
              "width": "2.764%",
              "transform": "translate(0, 0)",
              "filter": "grayscale(1) brightness(0.496)",
              "cursor": "pointer"
            }
          }
        ]
      },
      {
        "type": "conditional",
        "conditions": [
          {
            "entity": "switch.tide16_mute",
            "state": "on"
          }
        ],
        "elements": [
          {
            "type": "custom:tide16-readout",
            "title": "Mute",
            "title_color": "#D93A2B",
            "title_size": "0.894cqw",
            "title_gap": "0",
            "align": "right",
            "style": {
              "right": "60.302%",
              "left": "unset",
              "top": "32.847%",
              "transform": "translate(0, 0)"
            }
          }
        ]
      },
      {
        "type": "custom:tide16-inputs",
        "columns": 6,
        "rows": 2,
        "row_gap": "0.503cqw",
        "dot": "0.854cqw",
        "dot_gap": "0.302cqw",
        "size": "0.804cqw",
        "color": "#B7B8B8",
        "active_entity": "media_player.tide16",
        "active_attribute": "source",
        "active_color": "#FFFFFF",
        "active_background": "#32CD32",
        "active_border": "1px solid #FFFFFF",
        "active_size": "0.954cqw",
        "background": "#333333",
        "border": "1px solid #666666",
        "source_entity": "media_player.tide16",
        "source_attribute": "sources",
        "disabled_color": "#5E5F5F",
        "disabled_background": "#1F1F1F",
        "disabled_border": "1px solid #3A3A3A",
        "items": [
          {
            "text": "AppleTV",
            "id": "hdmi2",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "AppleTV"
              }
            }
          },
          {
            "text": "ARC / eARC",
            "id": "arc_earc",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "ARC / eARC"
              }
            }
          },
          {
            "text": "Bluetooth",
            "id": "bluetooth",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "Bluetooth"
              }
            }
          },
          {
            "text": "BR-DVD",
            "id": "hdmi3",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "BR-DVD"
              }
            }
          },
          {
            "text": "RCA",
            "id": "rca",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "RCA"
              }
            }
          },
          {
            "text": "Roku",
            "id": "hdmi1",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "Roku"
              }
            }
          },
          {
            "text": "SPDIF 1",
            "id": "spdif1",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "SPDIF 1"
              }
            }
          },
          {
            "text": "SPDIF 2",
            "id": "spdif2",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "SPDIF 2"
              }
            }
          },
          {
            "text": "TOSLINK 1",
            "id": "toslink1",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "TOSLINK 1"
              }
            }
          },
          {
            "text": "TOSLINK 2",
            "id": "toslink2",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "TOSLINK 2"
              }
            }
          },
          {
            "text": "USB",
            "id": "usb",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "USB"
              }
            }
          },
          {
            "text": "XLR",
            "id": "xlr",
            "tap": {
              "action": "media_player.select_source",
              "data": {
                "entity_id": "media_player.tide16",
                "source": "XLR"
              }
            }
          }
        ],
        "style": {
          "left": "17.487%",
          "top": "3.250%",
          "width": "50.804%",
          "height": "13.000%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-glyph",
        "image": "/tide16_static/bt.png",
        "hint": "Pair a Bluetooth device",
        "tap": {
          "action": "button.press",
          "data": {
            "entity_id": "button.tide16_bluetooth_pair"
          }
        },
        "style": {
          "left": "64.221%",
          "top": "3.750%",
          "width": "2.412%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "title": "PAIR",
        "title_size": "0.804cqw",
        "title_color": "#B7B8B8",
        "title_gap": "0",
        "align": "center",
        "style": {
          "left": "64.221%",
          "top": "16.750%",
          "width": "2.412%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-glyph",
        "image": "/tide16_static/power.png",
        "hint": "Power off the Tide16",
        "tap": {
          "action": "media_player.turn_off",
          "data": {
            "entity_id": "media_player.tide16"
          }
        },
        "color_entity": "media_player.tide16",
        "color_on": "#B300FF",
        "color_off": "#F52727",
        "style": {
          "left": "56.681%",
          "top": "43.938%",
          "width": "2.316%",
          "height": "12.375%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-glyph",
        "image": "/tide16_static/reboot.png",
        "hint": "Reboot the Tide16",
        "tap": {
          "action": "button.press",
          "data": {
            "entity_id": "button.tide16_reboot"
          }
        },
        "color": "#BFC0C0",
        "busy_colors": [
          "#B300FF",
          "#F52727"
        ],
        "busy_interval": 1000,
        "busy_min_steps": 5,
        "busy_timeout": 60000,
        "busy_entity": "media_player.tide16",
        "busy_live_states": [
          "on"
        ],
        "button": true,
        "icon_scale": 0.688,
        "style": {
          "left": "64.221%",
          "top": "79.250%",
          "width": "2.412%",
          "height": "12.000%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "title": "Reboot",
        "title_size": "0.804cqw",
        "title_color": "#B7B8B8",
        "title_gap": "0",
        "align": "center",
        "style": {
          "left": "64.221%",
          "top": "92.250%",
          "width": "2.412%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-knob-labels",
        "gap": "0.458cqw",
        "color": "#000",
        "size": "1.012cqw",
        "weight": "700",
        "labels": [
          {
            "at": 12,
            "text": [
              "Mute:",
              "On"
            ],
            "hint": "Mute on",
            "tap": {
              "action": "switch.turn_on",
              "data": {
                "entity_id": "switch.tide16_mute"
              }
            }
          },
          {
            "at": 6,
            "text": [
              "Mute:",
              "Off"
            ],
            "hint": "Mute off",
            "tap": {
              "action": "switch.turn_off",
              "data": {
                "entity_id": "switch.tide16_mute"
              }
            }
          },
          {
            "at": 3,
            "text": "Vol:+10",
            "hint": "Volume up 10 dB",
            "tap": {
              "action": "tide16.volume_step",
              "data": {
                "delta": 10
              }
            }
          },
          {
            "at": 4.5,
            "text": "Vol:+20",
            "hint": "Volume up 20 dB",
            "tap": {
              "action": "tide16.volume_step",
              "data": {
                "delta": 20
              }
            }
          },
          {
            "at": 2,
            "text": "Vol:+5",
            "hint": "Volume up 5 dB",
            "tap": {
              "action": "tide16.volume_step",
              "data": {
                "delta": 5
              }
            }
          },
          {
            "at": 1,
            "text": "Vol:+2",
            "hint": "Volume up 2 dB",
            "tap": {
              "action": "tide16.volume_step",
              "data": {
                "delta": 2
              }
            }
          },
          {
            "at": 11,
            "text": "Vol:-2",
            "hint": "Volume down 2 dB",
            "tap": {
              "action": "tide16.volume_step",
              "data": {
                "delta": -2
              }
            }
          },
          {
            "at": 10,
            "text": "Vol:-5",
            "hint": "Volume down 5 dB",
            "tap": {
              "action": "tide16.volume_step",
              "data": {
                "delta": -5
              }
            }
          },
          {
            "at": 9,
            "text": "Vol:-10",
            "hint": "Volume down 10 dB",
            "tap": {
              "action": "tide16.volume_step",
              "data": {
                "delta": -10
              }
            }
          },
          {
            "at": 7.5,
            "text": "Vol:-20",
            "hint": "Volume down 20 dB",
            "tap": {
              "action": "tide16.volume_step",
              "data": {
                "delta": -20
              }
            }
          }
        ],
        "style": {
          "left": "78.794%",
          "top": "22.375%",
          "width": "11.357%",
          "height": "56.500%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "size": "0.980cqw",
        "color": "#000",
        "row_gap": "0.150cqw",
        "rows": [
          {
            "label": "Tide FW:",
            "entity": "sensor.tide16_versions",
            "attribute": "tide"
          },
          {
            "label": "HDMI FW:",
            "entity": "sensor.tide16_versions",
            "attribute": "hdmi"
          }
        ],
        "style": {
          "left": "69.397%",
          "top": "86.000%",
          "transform": "translate(0, 0)"
        }
      },
      {
        "type": "custom:tide16-readout",
        "title": "v2.1.1",
        "title_size": "0.980cqw",
        "title_color": "#000",
        "title_gap": "0",
        "align": "right",
        "style": {
          "right": "0.854%",
          "left": "unset",
          "top": "91.625%",
          "width": "4.020%",
          "transform": "translate(0, 0)"
        }
      }
    ]
  };

class Tide16Panel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._token = 0;
  }

  setConfig(config) {
    this._config = config || {};
    this._card = null;
    this.shadowRoot.innerHTML = '';
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._card) this._card.hass = hass;
  }

  get hass() {
    return this._hass;
  }

  async _render() {
    // _render is async, and setConfig can land again before it finishes.
    // The token is what stops a superseded run from appending its card into
    // a wrapper that is no longer in the tree.
    const token = ++this._token;
    const asked = Number(this._config.scale);
    const scale = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 1) : 1;
    const outline =
      this._config.outline === undefined ? '2px solid #FFFFFF' : this._config.outline;

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
      }
      .wrap {
        /* The whole reason this element exists rather than a bare
           picture-elements card: every font on the panel is sized in cqw,
           and cqw only means "percent of the card" if something declares
           itself a container. Container queries resolve through shadow
           boundaries, so declaring it here reaches the elements inside the
           picture-elements card without touching that card at all. */
        container-type: inline-size;
        margin: 0 auto;
        /* Clips the square-cornered plate to the rounded box, so the outline
           traces a rounded card around a rounded image instead of cutting
           across four square corners. */
        overflow: hidden;
        border-radius: var(--ha-card-border-radius, 12px);
        /* Inherited custom properties, so they reach the ha-card inside the
           picture-elements shadow root without piercing it. Without them the
           plate sits on a second, visible card - theme background, border
           and shadow around the artwork. */
        --ha-card-background: transparent;
        --ha-card-box-shadow: none;
        --ha-card-border-width: 0;
        --ha-card-border-radius: 0;
      }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.style.width = `${(scale * 100).toFixed(4)}%`;
    wrap.style.outline = outline;
    this.shadowRoot.append(style, wrap);

    let card;
    try {
      const helpers = await window.loadCardHelpers();
      if (token !== this._token) return;
      // Deep clone. A Lovelace card deep-freezes the config it is handed,
      // and PANEL_LAYOUT is module state - freezing it would break every
      // later instance of this card on the page.
      card = helpers.createCardElement(JSON.parse(JSON.stringify(PANEL_LAYOUT)));
    } catch (err) {
      if (token !== this._token) return;
      wrap.textContent = `Tide16 panel failed to build: ${err}`;
      return;
    }

    if (this._hass) card.hass = this._hass;
    wrap.appendChild(card);
    this._card = card;
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    // 1990x400 of artwork. A sections view hands a card four columns by
    // default, which would letterbox the plate to about 340px wide.
    return { columns: 'full', min_columns: 6, rows: 'auto' };
  }

  static getStubConfig() {
    return {};
  }
}

if (!customElements.get('tide16-panel')) {
  customElements.define('tide16-panel', Tide16Panel);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'tide16-panel')) {
  window.customCards.push({
    type: 'tide16-panel',
    name: 'miniDSP Tide16 Panel',
    description:
      'The Tide16 front panel - live 16-channel meter, source selector, scenes, volume and every readout.',
    preview: true,
    documentationURL: 'https://github.com/speedtoys/Minidsp-Tide16-ControlCard',
  });
}

/**
 * Register with whichever registry the frontend actually ends up using.
 *
 * The integration serves this module through frontend.add_extra_js_url, and
 * Home Assistant imports it at about 60ms - well before its own bundle
 * installs the scoped custom element registry that REPLACES
 * window.customElements. Everything defined above therefore lands in the
 * NATIVE registry.
 *
 * The browser still upgrades those tags wherever they appear, which is why
 * the seven picture-elements elements have always worked. But the frontend
 * looks a CARD up in the replacement registry, so a card registered only
 * natively answers "Custom element doesn't exist" and the view renders a
 * Configuration error instead. Nothing above this line is enough on its own.
 *
 * So: register now, and register again if the registry is swapped out from
 * under us. A fresh subclass each time - a constructor may only be used once
 * per registry, and this is the same class going into a second one.
 */

const TIDE16_ELEMENTS = [
  ['tide16-bars', Tide16Bars],
  ['tide16-channels', Tide16Channels],
  ['tide16-buttons', Tide16Buttons],
  ['tide16-glyph', Tide16Glyph],
  ['tide16-knob-labels', Tide16KnobLabels],
  ['tide16-readout', Tide16Readout],
  ['tide16-inputs', Tide16Inputs],
  ['tide16-panel', Tide16Panel],
];

const tide16Register = (registry) => {
  TIDE16_ELEMENTS.forEach(([name, cls]) => {
    if (registry.get(name)) return;
    try {
      registry.define(name, class extends cls {});
    } catch (err) {
      console.warn(`TIDE16: could not register <${name}>`, err);
    }
  });
};

const tide16FirstRegistry = window.customElements;
tide16Register(tide16FirstRegistry);

// ha-card is the frontend's own, so its absence means this is not the
// frontend's registry yet and a swap is still to come. Bounded: a page that
// never swaps is a page where the first registration was already the right
// one, and a timer must not outlive that answer.
if (!tide16FirstRegistry.get('ha-card')) {
  let waited = 0;
  const poll = setInterval(() => {
    waited += 200;
    if (window.customElements !== tide16FirstRegistry) {
      tide16Register(window.customElements);
      clearInterval(poll);
    } else if (waited >= 30000) {
      clearInterval(poll);
    }
  }, 200);
}

// Bumped with the repo tag. Printed on load so a stale cached copy is
// one glance in the console rather than a guess - the frontend caches
// /local/ hard, and the resource URL's ?v= is the only thing that busts
// it.
const TIDE16_VERSION = '2.1.1';

console.info(
  `%c TIDE16 ${TIDE16_VERSION} %c panel card + meter + legend + readouts + inputs + scenes + knob labels + glyphs `,
  'color:#0b1013;background:#ABACAC;font-weight:700',
  'color:#ABACAC;background:#0b1013'
);
