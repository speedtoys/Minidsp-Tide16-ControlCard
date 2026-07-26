/**
 * tide16-bars - live per-channel output meter for the miniDSP Tide16.
 *
 * Used as a picture-elements *element*, positioned over the bar-graph
 * window of a front-panel image. It draws nothing but the bars - no
 * frame, no labels, no background - so whatever artwork is underneath
 * shows through. If your plate has channel numbers baked in, the bar
 * pitch has to line up with them; see "Geometry" in the README.
 *
 * Requires @GaelFrance's miniDSP Tide16 integration, plus the metering
 * patch in this repo's integration/ directory - the card reads
 * `sensor.tide16_channel_levels` and calls `request_fast_metering`,
 * neither of which exists upstream.
 *   https://github.com/GaelFrance/MiniDSP-Tide-16---HomeAssitant-Integration
 *   https://github.com/speedtoys/Minidsp-Tide16-ControlCard
 *
 * Two things about this are less obvious than they look:
 *
 * 1. The gradient is anchored to the METER BOX, not to each bar. On the
 *    original artwork a short bar starts dimmer than a tall one, because
 *    all the bars are windows onto one shared top-to-bottom gradient
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

const VERSION = '1.0.0';

// Sampled down the original artwork's gradient (luma 172 at the top of
// the meter box falling to 14 at the baseline).
const BAR_GRADIENT =
  'linear-gradient(to bottom,' +
  '#ACADAD 0%, #ABACAC 5%, #949494 20%, #838383 30%,' +
  '#5F6060 50%, #3E3E3D 70%, #252524 85%, #0E0E0E 100%)';

const DEFAULTS = {
  entity: 'sensor.tide16_channel_levels',
  attribute: 'channels',

  // -- geometry ----------------------------------------------------
  // Bars are evenly spaced across this element's own box, so the pitch
  // is just 100/channels %. Only the bar's share of its slot is a real
  // choice: the default is measured off the stock Tide16 plate (26px
  // bar on a 27.25px pitch). Percentages throughout, so the meter
  // scales with the artwork at any display size.
  channels: 16,
  bar_width_ratio: 0.9541,

  gradient: BAR_GRADIENT,

  // -- level -> height mapping -------------------------------------
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

  // -- fast-metering keepalive -------------------------------------
  // Set keepalive_service to null to disable entirely (e.g. if something
  // else on the dashboard is already holding the fast rate open).
  keepalive_service: 'minidsp_tide16.request_fast_metering',
  keepalive_ms: 1000, // must stay well under the integration's 3s hold
  transition_ms: 260, // ~= the 250ms poll, so bars glide instead of stepping
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
    const cfg = { ...DEFAULTS, ...(config || {}) };

    if (!Number.isInteger(cfg.channels) || cfg.channels < 1) {
      throw new Error('tide16-bars: channels must be a positive integer');
    }
    if (!(cfg.bar_width_ratio > 0) || cfg.bar_width_ratio > 1) {
      throw new Error('tide16-bars: bar_width_ratio must be > 0 and <= 1');
    }
    if (cfg.ceiling_db <= cfg.floor_db) {
      throw new Error('tide16-bars: ceiling_db must be greater than floor_db');
    }
    if (!(cfg.range_db > 0)) {
      throw new Error('tide16-bars: range_db must be greater than 0');
    }
    // Fail here rather than at call time: a typo'd service would
    // otherwise be an error every keepalive period, forever.
    if (cfg.keepalive_service && !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(cfg.keepalive_service)) {
      throw new Error('tide16-bars: keepalive_service must be "domain.service" or null');
    }

    this._cfg = cfg;
    this._pitchPct = 100 / cfg.channels;
    this._barWidthPct = this._pitchPct * cfg.bar_width_ratio;
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
    const wanted =
      this._cfg.keepalive_service && this._onScreen && document.visibilityState === 'visible';
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
    if (!this._hass || !this._cfg.keepalive_service) return;
    const [domain, service] = this._cfg.keepalive_service.split('.');
    this._hass.callService(domain, service, {});
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

    for (let i = 0; i < this._cfg.channels; i++) {
      const bar = document.createElement('div');
      Object.assign(bar.style, {
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: `${i * this._pitchPct}%`,
        width: `${this._barWidthPct}%`,
        background: this._cfg.gradient,
        // Fully clipped = silent. inset() clips from the top, so the
        // revealed slice always grows up from the baseline.
        clipPath: 'inset(100% 0 0 0)',
        transition: `clip-path ${this._cfg.transition_ms}ms linear`,
        willChange: 'clip-path',
      });
      this.appendChild(bar);
      this._bars.push(bar);
    }
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

console.info(
  `%c TIDE16-BARS %c v${VERSION} `,
  'color:#0b1013;background:#ABACAC;font-weight:700',
  'color:#ABACAC;background:#0b1013'
);
