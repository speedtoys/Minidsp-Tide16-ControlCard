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
 *    is actually on screen it calls minidsp_tide16.request_fast_metering
 *    on a keepalive to raise the poll rate to 4/sec, and simply stops
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

const DEFAULTS = {
  entity: 'sensor.tide16_channel_levels',
  attribute: 'channels',

  // Output level tracks the master volume: with real content at -42 dB the
  // loudest channel peaked at -42.9, i.e. full scale IS the volume setting.
  // So the mapping is anchored to the volume entity and slides with it -
  // a fixed dB window would read totally differently at every volume, which
  // is exactly the trap that makes home-made meters look broken.
  //   ceiling = <ceiling_entity>   (falls back to ceiling_db)
  //   floor   = ceiling - range_db
  ceiling_entity: 'number.tide16_volume',
  range_db: 40, // measured p05..max spanned ~38 dB below the volume setting

  floor_db: -60, // used only when ceiling_entity is unset/unavailable
  ceiling_db: 0,

  keepalive_ms: 1000, // must stay well under FAST_METERING_HOLD (3s)
  transition_ms: 260, // ~= the 250ms poll, so bars glide instead of stepping

  // The 1-16 channel numbers. base-T16.pxd does NOT bake these in the way
  // the old photo plate did, so the meter draws its own - which is
  // strictly better, because they come off the same pitch as the bars and
  // therefore cannot drift out of register with them.
  numbers: true,
  numbers_size: '0.748cqw',
  numbers_gap: '0.236cqw', // between the bar baseline and the digits
  numbers_color: '#FFFFFF',
  numbers_weight: '500',
};

class Tide16Bars extends HTMLElement {
  constructor() {
    super();
    this._cfg = { ...DEFAULTS };
    this._bars = [];
    this._hass = null;
    this._onScreen = false;
    this._keepaliveTimer = null;
    this._io = null;
    this._onVisibility = () => this._syncKeepalive();
  }

  setConfig(config) {
    this._cfg = { ...DEFAULTS, ...(config || {}) };
    if (this._cfg.ceiling_db <= this._cfg.floor_db) {
      throw new Error('tide16-bars: ceiling_db must be greater than floor_db');
    }
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    // Watch our own visibility rather than the card's: in a panel view the
    // element can be off-screen while the card technically exists.
    this._io = new IntersectionObserver(
      (entries) => {
        this._onScreen = entries.some((e) => e.isIntersecting);
        this._syncKeepalive();
      },
      { threshold: 0.01 }
    );
    this._io.observe(this);
    document.addEventListener('visibilitychange', this._onVisibility);
    this._syncKeepalive();
  }

  disconnectedCallback() {
    if (this._io) {
      this._io.disconnect();
      this._io = null;
    }
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._stopKeepalive();
  }

  /* -- fast-metering keepalive ------------------------------------- */

  _syncKeepalive() {
    const wanted = this._onScreen && document.visibilityState === 'visible';
    if (wanted) this._startKeepalive();
    else this._stopKeepalive();
  }

  _startKeepalive() {
    if (this._keepaliveTimer !== null) return;
    this._ping(); // don't wait a full period for the first frame
    this._keepaliveTimer = setInterval(() => this._ping(), this._cfg.keepalive_ms);
  }

  _stopKeepalive() {
    if (this._keepaliveTimer === null) return;
    clearInterval(this._keepaliveTimer);
    this._keepaliveTimer = null;
    // Deliberately no "stop" call - the grant is deadline-based and
    // lapses by itself, which is what makes it robust to this element
    // simply vanishing.
  }

  _ping() {
    if (!this._hass) return;
    this._hass.callService('minidsp_tide16', 'request_fast_metering', {});
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

  _levels() {
    if (!this._hass) return null;
    const st = this._hass.states[this._cfg.entity];
    if (!st) return null;
    const raw = st.attributes ? st.attributes[this._cfg.attribute] : null;
    return Array.isArray(raw) ? raw : null;
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
 */

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
  }

  _build() {
    const c = this._cfg;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const tappable = !!(c.tap && c.tap.action);
    root.innerHTML = `
      <style>
        :host {
          display: block;
          position: absolute;
          pointer-events: ${tappable ? 'auto' : 'none'};
          cursor: ${tappable ? 'pointer' : 'default'};
        }
        img { display: block; width: 100%; height: auto; }
        :host(:active) img { filter: brightness(0.7); }
      </style>
      <img>`;
    const img = root.querySelector('img');
    img.src = c.image;
    // alt, not the tooltip: the hover text belongs on the host, which is
    // what the cursor actually lands on
    img.alt = c.hint == null ? '' : String(c.hint);
    if (c.hint != null) this.title = String(c.hint);
    if (tappable) {
      this.onclick = () => this._fire(c.tap);
    }
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
 * Each label is {at, text, tap?} where `at` is a clock hour (12, 1, 2,
 * 3, 6, 9, 10, 11). Hours map to angles the usual way - 12 is up, 3 is
 * right - and the label is pushed out along that ray by half its own
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
      </style>
      <div class="block">
        ${c.title ? '<div class="title"></div>' : ''}
        ${c.rows.map(() => '<div class="row"></div>').join('')}
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
  }

  _paint() {
    const c = this._cfg;
    if (!this._rowEls.length) return;
    c.rows.forEach((r, i) => {
      const el = this._rowEls[i];
      if (!el) return;
      el.textContent = [r.label, this._value(r)].filter(Boolean).join(' ');
    });
  }

  _value(row) {
    // A row with no entity is static text - it has nothing to be missing.
    if (!row.entity) return '';
    const gone = this._cfg.placeholder;
    if (!this._hass) return gone;
    const st = this._hass.states[row.entity];
    if (!st) return gone;
    const v = row.attribute ? st.attributes[row.attribute] : st.state;
    if (v === undefined || v === null || v === '') return gone;
    return ['unknown', 'unavailable'].includes(String(v)) ? gone : String(v);
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
 * Each item is {text, tap?, hint?} with the same {action, data} shape the
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
        .cell.on .lbl {
          color: ${c.active_color};
          ${c.active_size ? `font-size: ${c.active_size};` : ''}
          ${c.active_weight ? `font-weight: ${c.active_weight};` : ''}
          text-decoration: underline;
          text-underline-offset: 0.22em;
          text-decoration-thickness: from-font;
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
      if (it.tap && it.tap.action) {
        cell.dataset.tap = '';
        cell.addEventListener('click', () => this._fire(it.tap));
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
    this._paintActive();
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

if (!customElements.get('tide16-inputs')) {
  customElements.define('tide16-inputs', Tide16Inputs);
}

// Bumped with the repo tag. Printed on load so a stale cached copy is
// one glance in the console rather than a guess - the frontend caches
// /local/ hard, and the resource URL's ?v= is the only thing that busts
// it.
const TIDE16_VERSION = '1.1.5';

console.info(
  `%c TIDE16 ${TIDE16_VERSION} %c meter + legend + readouts + inputs + scenes + knob labels + glyphs `,
  'color:#0b1013;background:#ABACAC;font-weight:700',
  'color:#ABACAC;background:#0b1013'
);
