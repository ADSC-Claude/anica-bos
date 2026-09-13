/* ===========================================================================
 * envelope.js — the envelope opening engine
 * ---------------------------------------------------------------------------
 * An ES module with no dependencies. It builds an envelope, opens it once on a
 * tap, and then hands the screen over to whatever HTML it was given. It draws
 * the envelope; it does not draw the invitation. Nothing in here reads, styles
 * or rewrites the content it is handed — the content is moved into the slot as
 * it is, and every property the engine put on the slot to reveal it is removed
 * when the opening ends.
 *
 *   import { createEnvelope } from './envelope.js';
 *
 *   const env = createEnvelope('#app', {
 *     theme: 'royal',                          // one of THEMES
 *     background: 'gold-particles',            // one of BACKGROUNDS
 *     seal: { type: 'couple', text: 'J&J' },   // type is one of SEALS
 *     colors: { envelope: '#5B2333', accent: '#C9A961' },   // optional
 *     fonts: { heading: 'Baskerville, serif' },             // optional
 *     openHint: 'Tap to Open',
 *     content: '#my-invitation',               // selector, element, or HTML
 *     onOpen: () => {},
 *   });
 *
 *   env.open();      // play the opening (the same as a tap)
 *   env.reset();     // close it again, ready to replay
 *   env.update({ theme: 'floral' });   // re-render in place, no reload
 *   env.destroy();   // remove the envelope and give the content back
 *
 * Every field is optional. Anything missing, unknown or the wrong shape falls
 * back to the default below, with a warning in the console rather than a throw.
 *
 * The state machine — closed, opening, sliding, expanded — is published as
 * data-envelope-state on the root element, which is what envelope.css animates.
 * The timing is fixed and identical for every theme; see the phase table at the
 * top of envelope.css. This file owns the numbers and writes them into the CSS
 * as custom properties, so the two can never drift apart.
 * =========================================================================== */

export const VERSION = '1.0.0';

/** The envelope variants. One class each, on .envelope. */
export const THEMES = [
  'wedding',
  'floral',
  'modern',
  'royal',
  'birthday',
  'christening',
  'corporate',
];

/** The seals. One class each, on .seal. */
export const SEALS = ['wax', 'monogram', 'couple', 'number', 'cross', 'logo'];

/** The background themes. One class each, on .envelope-stage. */
export const BACKGROUNDS = [
  'plain',
  'floral',
  'watercolor',
  'gold-particles',
  'minimal',
  'dark',
];

/** The phases, in order. Published as data-envelope-state. */
export const STATES = ['closed', 'opening', 'sliding', 'expanded'];

/**
 * The opening, in milliseconds. Fixed for every theme and every seal: a theme
 * may change how the envelope looks and never how it moves.
 *
 *   0     the flap rotates up (720) — the seal shrinks away (360), hint goes (240)
 *   500   the card rises out of the pocket (680), overlapping the flap by 220
 *   1180  the card opens out to the viewport (800), envelope fades (560)
 *   1980  handoff: transforms dropped, slot becomes a plain scrollable box
 */
const MOTION = {
  flap: 720,
  seal: 360,
  hint: 240,
  slideDelay: 500,
  slide: 680,
  expandDelay: 1180,
  expand: 800,
  fade: 560,
  close: 420,
  total: 1980,
};

/**
 * The same four phases for somebody who has asked for less movement: a plain
 * cross-fade, over as soon as it is read. The state machine still runs in
 * order, so onOpen fires exactly as it always does.
 */
const MOTION_REDUCED = {
  flap: 1,
  seal: 160,
  hint: 160,
  slideDelay: 0,
  slide: 1,
  expandDelay: 0,
  expand: 260,
  fade: 260,
  close: 200,
  total: 280,
};

/**
 * Where the card sits, as a fraction of the envelope it sits in.
 *   top     the card's resting top edge, below the notch in the front panel
 *           (the notch bottoms out at 30%), so nothing of it shows at rest
 *   height  a card is a little over half the height of its envelope
 *   lift    how far past its own height the card rises, so its bottom edge
 *           clears the notch and it reads as out rather than half out
 */
const CARD = {
  width: 0.84,
  height: 0.6,
  top: 0.34,
  lift: 0.08,
  minTop: 8,
};

const DEFAULTS = {
  theme: 'wedding',
  background: 'plain',
  seal: { type: 'wax', text: '', logo: '' },
  colors: {},
  fonts: {},
  openHint: 'Tap to Open',
  content: '',
  onOpen: null,
};

/** config.colors.<key> → the CSS variable it sets on .envelope. */
const COLOR_VARS = {
  envelope: '--envelope-color',
  accent: '--envelope-accent',
  lining: '--envelope-lining',
  seal: '--seal-color',
  sealText: '--seal-text-color',
  text: '--text-color',
  background: '--background',
};

/** config.fonts.<key> → the CSS variable it sets on .envelope. */
const FONT_VARS = {
  heading: '--font-heading',
  body: '--font-body',
};

let instanceCount = 0;

/* ---------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------ */

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function warn(message) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[envelope] ' + message);
  }
}

/** An allowed value, or the default with a word about why. */
function pick(value, allowed, fallback, what) {
  if (typeof value === 'string' && allowed.indexOf(value) !== -1) return value;
  if (value !== undefined && value !== null && value !== '') {
    warn('unknown ' + what + ' "' + value + '" — using "' + fallback + '". Known: ' + allowed.join(', '));
  }
  return fallback;
}

/**
 * A logo URL the engine is willing to put in an <img>. Anything that is not
 * plainly an image address is dropped rather than rendered: a seal is
 * decoration, and decoration is never a reason to run somebody's javascript:.
 */
function safeUrl(value) {
  const url = String(value == null ? '' : value).trim();
  if (/^(?:https?:\/\/|data:image\/|blob:|\/|\.{1,2}\/|[\w-]+\/)/i.test(url)) return url;
  warn('the seal logo "' + url.slice(0, 40) + '" is not an image address — ignoring it');
  return '';
}

/** Shallow-merge a config over a base, with nested seal/colors/fonts objects. */
function merge(base, next) {
  const input = next && typeof next === 'object' ? next : {};
  const cfg = Object.assign({}, base, input);
  cfg.seal = Object.assign({}, base.seal, input.seal && typeof input.seal === 'object' ? input.seal : {});
  // colors: null and fonts: null mean "back to the theme's own".
  cfg.colors = input.colors === null ? {} : Object.assign({}, base.colors, input.colors || {});
  cfg.fonts = input.fonts === null ? {} : Object.assign({}, base.fonts, input.fonts || {});
  return cfg;
}

/**
 * Can a registered <number> custom property be eased here? @property is what
 * makes --env-p-open interpolable; where it is missing the numbers jump.
 */
let numberTween = null;
function supportsNumberTween() {
  if (numberTween !== null) return numberTween;
  numberTween = typeof CSS !== 'undefined' && typeof CSS.registerProperty === 'function';
  return numberTween;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------------------------------------------------------------------------
 * createEnvelope
 * ------------------------------------------------------------------------ */

/**
 * Build an envelope inside `target` and return a handle to it.
 *
 * @param {string|Element} target  where to mount: a selector or an element
 * @param {object} [config]        see the block at the top of this file
 * @returns {{
 *   el: Element, stage: Element, slot: Element, state: string,
 *   open: () => void, reset: () => void,
 *   update: (config: object) => void, destroy: () => void
 * }}
 */
export function createEnvelope(target, config) {
  const mount = typeof target === 'string' ? document.querySelector(target) : target;
  if (!mount || !mount.appendChild) {
    throw new Error('[envelope] createEnvelope: no element to mount in (' + String(target) + ')');
  }

  let cfg = merge(DEFAULTS, config);
  let state = 'closed';
  let destroyed = false;
  const timers = [];
  const id = 'envelope-slot-' + (++instanceCount);

  /* --- the markup -------------------------------------------------------- */

  const stage = el('div', 'envelope-stage');
  const root = el('div', 'envelope');
  root.setAttribute('data-envelope-state', 'closed');
  // Held still until the card has been measured, so nothing animates in from
  // a position it was never in.
  root.setAttribute('data-envelope-ready', 'false');

  // Whether this browser can interpolate a registered custom property. The
  // opening is written as arithmetic on two eased numbers; without @property
  // they step instead of easing, and the stylesheet fades the last phase in
  // rather than growing it. Everything else is unaffected.
  root.setAttribute('data-envelope-tween', supportsNumberTween() ? 'ease' : 'snap');

  const button = el('button', 'envelope__button');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', id);

  const body = el('span', 'envelope__body');
  const back = el('span', 'envelope__back');
  const lining = el('span', 'envelope__lining');
  const pocket = el('span', 'envelope__pocket');
  const flapWrap = el('span', 'envelope__flap-wrap');
  const flap = el('span', 'envelope__flap');
  const flapFront = el('span', 'envelope__flap-face envelope__flap-face--front');
  const flapBack = el('span', 'envelope__flap-face envelope__flap-face--back');
  const seal = el('span', 'seal');
  const sealMark = el('span', 'seal__mark');
  const hint = el('span', 'envelope__hint');
  const hintText = el('span', 'envelope__hint-text');

  const slot = el('div', 'envelope__slot');
  slot.id = id;
  slot.tabIndex = -1;
  const contentBox = el('div', 'envelope__content');

  flap.appendChild(flapFront);
  flap.appendChild(flapBack);
  flapWrap.appendChild(flap);
  seal.appendChild(sealMark);
  body.appendChild(back);
  body.appendChild(lining);
  body.appendChild(pocket);
  body.appendChild(flapWrap);
  body.appendChild(seal);
  hint.appendChild(hintText);
  button.appendChild(body);
  button.appendChild(hint);
  slot.appendChild(contentBox);
  root.appendChild(button);
  root.appendChild(slot);
  stage.appendChild(root);

  /* --- the content ------------------------------------------------------- */

  // Where a borrowed element came from, so destroy() can put it back exactly
  // where it was rather than leaving a hole in somebody's page.
  let borrowed = null;

  function releaseContent() {
    if (!borrowed) return;
    const { node, parent, next } = borrowed;
    borrowed = null;
    if (!parent) {
      if (node.parentNode) node.parentNode.removeChild(node);
      return;
    }
    if (next && next.parentNode === parent) parent.insertBefore(node, next);
    else parent.appendChild(node);
  }

  /**
   * Put the content in the slot. An element (or a selector that finds one) is
   * MOVED, not copied: its listeners, its state and its identity survive. A
   * string of HTML is written in as it is. Either way the engine adds no class,
   * no attribute and no style of its own to it.
   */
  function applyContent(value) {
    const current = borrowed ? borrowed.node : null;

    let node = null;
    let html = null;

    if (value && typeof value === 'object' && value.nodeType === 1) {
      node = value;
    } else if (typeof value === 'string' && value.trim()) {
      const text = value.trim();
      if (text.charAt(0) !== '<') {
        try {
          node = document.querySelector(text);
        } catch (error) {
          node = null;
        }
        if (!node) {
          warn('content "' + text.slice(0, 60) + '" matched no element — treating it as HTML');
          html = text;
        }
      } else {
        html = text;
      }
    } else {
      html = '';
    }

    if (node && node === current) return;

    releaseContent();
    contentBox.textContent = '';

    if (node) {
      if (node.contains(contentBox)) {
        warn('content cannot contain the envelope it is being put inside — ignoring it');
        return;
      }
      borrowed = { node, parent: node.parentNode, next: node.nextSibling };
      contentBox.appendChild(node);
      return;
    }

    // Developer-authored markup, handed over deliberately. It is written in
    // untouched, which is the whole point of the slot.
    contentBox.innerHTML = html;
  }

  /* --- appearance -------------------------------------------------------- */

  function applyAppearance() {
    const theme = pick(cfg.theme, THEMES, DEFAULTS.theme, 'theme');
    const background = pick(cfg.background, BACKGROUNDS, DEFAULTS.background, 'background');
    const sealType = pick(cfg.seal.type, SEALS, DEFAULTS.seal.type, 'seal type');

    // The variant class goes on the root (the documented API) and on the stage
    // (so --background, a theme variable, can reach the backdrop above it).
    root.className = 'envelope ' + theme;
    stage.className = 'envelope-stage bg-' + background + ' ' + theme;
    seal.className = 'seal ' + sealType;

    // Colours and fonts from config win over the variant's own.
    Object.keys(COLOR_VARS).forEach((key) => {
      const value = cfg.colors[key];
      if (typeof value === 'string' && value.trim()) {
        root.style.setProperty(COLOR_VARS[key], value.trim());
        stage.style.setProperty(COLOR_VARS[key], value.trim());
      } else {
        root.style.removeProperty(COLOR_VARS[key]);
        stage.style.removeProperty(COLOR_VARS[key]);
      }
    });

    Object.keys(FONT_VARS).forEach((key) => {
      const value = cfg.fonts[key];
      if (typeof value === 'string' && value.trim()) root.style.setProperty(FONT_VARS[key], value.trim());
      else root.style.removeProperty(FONT_VARS[key]);
    });

    // The seal's mark: text, or for .seal.logo an inline SVG or an image.
    const text = cfg.seal.text == null ? '' : String(cfg.seal.text);
    sealMark.textContent = '';
    if (sealType === 'logo') {
      const logo = cfg.seal.logo || cfg.seal.svg || '';
      if (typeof logo === 'string' && /^\s*<svg[\s>]/i.test(logo)) {
        sealMark.innerHTML = logo;
      } else if (logo) {
        const url = safeUrl(logo);
        if (url) {
          const img = new Image();
          img.alt = '';
          img.setAttribute('aria-hidden', 'true');
          img.src = url;
          sealMark.appendChild(img);
        } else {
          sealMark.textContent = text;
        }
      } else {
        sealMark.textContent = text;
      }
    } else {
      sealMark.textContent = text;
    }

    const label = cfg.openHint == null ? '' : String(cfg.openHint);
    hintText.textContent = label;
    hint.hidden = label === '';
    // The words on the screen are the button's name. With no words, it still
    // needs one.
    if (label) button.removeAttribute('aria-label');
    else button.setAttribute('aria-label', 'Open the invitation');
  }

  /* --- timing ------------------------------------------------------------ */

  function motion() {
    return prefersReducedMotion() ? MOTION_REDUCED : MOTION;
  }

  function applyTiming() {
    const m = motion();
    root.style.setProperty('--env-flap-dur', m.flap + 'ms');
    root.style.setProperty('--env-seal-dur', m.seal + 'ms');
    root.style.setProperty('--env-hint-dur', m.hint + 'ms');
    root.style.setProperty('--env-slide-dur', m.slide + 'ms');
    root.style.setProperty('--env-expand-dur', m.expand + 'ms');
    root.style.setProperty('--env-fade-dur', m.fade + 'ms');
    root.style.setProperty('--env-close-dur', m.close + 'ms');
  }

  /* --- geometry ---------------------------------------------------------- */

  /**
   * Measure the envelope and write down where the card sits: the rect it rests
   * in inside the pocket, the rect it rises to, and the two scales that shrink
   * a viewport-sized slot onto it. envelope.css builds both transforms out of
   * these — the window's and its exact inverse on the content — so the
   * invitation is drawn at its true size through a card-shaped window rather
   * than shrunk to fit one.
   *
   * Called at build, on resize, and on every reset — never mid-opening, where
   * changing the numbers would move the target the animation is heading for.
   */
  function measure() {
    if (destroyed || !body.isConnected) return;

    const rect = body.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const doc = document.documentElement;
    // clientWidth/clientHeight, not innerWidth/innerHeight: this is the
    // viewport position:fixed resolves against, which is what the slot is.
    const vw = doc.clientWidth || window.innerWidth || 1;
    const vh = doc.clientHeight || window.innerHeight || 1;

    const cardW = rect.width * CARD.width;
    const cardH = rect.height * CARD.height;
    const cardX = rect.left + (rect.width - cardW) / 2;
    const cardY = rect.top + rect.height * CARD.top;

    // Risen: far enough that the card's bottom edge clears the notch, but
    // never off the top of a short screen.
    let risenY = cardY - cardH - rect.height * CARD.lift;
    risenY = Math.max(CARD.minTop, Math.min(risenY, cardY - 1));

    const sx = cardW / vw;
    const sy = cardH / vh;

    root.style.setProperty('--env-card-x', cardX.toFixed(2) + 'px');
    root.style.setProperty('--env-card-y', cardY.toFixed(2) + 'px');
    root.style.setProperty('--env-card-risen-y', risenY.toFixed(2) + 'px');
    // Never zero: the content's transform divides by these to invert them.
    root.style.setProperty('--env-card-sx', Math.max(sx, 0.001).toFixed(5));
    root.style.setProperty('--env-card-sy', Math.max(sy, 0.001).toFixed(5));
  }

  /* --- the state machine ------------------------------------------------- */

  function setState(next) {
    state = next;
    root.setAttribute('data-envelope-state', next);
    button.setAttribute('aria-expanded', next === 'closed' ? 'false' : 'true');
    root.dispatchEvent(new CustomEvent('envelope:state', {
      bubbles: true,
      detail: { state: next },
    }));
  }

  function clearTimers() {
    while (timers.length) clearTimeout(timers.pop());
  }

  function after(ms, fn) {
    timers.push(setTimeout(fn, ms));
  }

  /**
   * The handoff. Every property the engine put on the slot and its content to
   * reveal them is dropped here: no transform, no clipping, no paper, no
   * containing block of ours. What is left is a box fixed to the viewport that
   * scrolls, with the invitation inside it exactly as it arrived.
   */
  function handoff() {
    root.setAttribute('data-envelope-handoff', '');
    slot.removeAttribute('aria-hidden');
    slot.removeAttribute('inert');
    // Reading continues where the envelope was, for a keyboard or a screen
    // reader. preventScroll so the page does not jump under a pointer.
    try {
      slot.focus({ preventScroll: true });
    } catch (error) {
      /* focus is a courtesy, never a requirement */
    }
    root.dispatchEvent(new CustomEvent('envelope:open', { bubbles: true }));
    if (typeof cfg.onOpen === 'function') {
      try {
        cfg.onOpen();
      } catch (error) {
        warn('onOpen threw: ' + (error && error.message ? error.message : error));
      }
    }
  }

  function open() {
    if (destroyed || state !== 'closed') return;
    const m = motion();
    applyTiming();
    measure();
    setState('opening');
    after(m.slideDelay, () => setState('sliding'));
    after(m.expandDelay, () => setState('expanded'));
    after(m.total, handoff);
  }

  function reset() {
    if (destroyed) return;
    clearTimers();
    const hadFocus = slot.contains(document.activeElement);
    root.removeAttribute('data-envelope-handoff');
    slot.setAttribute('aria-hidden', 'true');
    slot.toggleAttribute('inert', true);
    applyTiming();
    setState('closed');
    measure();
    if (hadFocus) {
      try {
        button.focus({ preventScroll: true });
      } catch (error) {
        /* as above */
      }
    }
  }

  /* --- events ------------------------------------------------------------ */

  function onClick() {
    open();
  }

  let resizeFrame = 0;
  function onResize() {
    // Only between openings: re-measuring mid-flight would move the target the
    // transition is already travelling towards.
    if (state !== 'closed') return;
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      measure();
    });
  }

  button.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  let observer = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(onResize);
    observer.observe(stage);
  }

  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  function onMotionChange() {
    applyTiming();
  }
  if (motionQuery) {
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
    else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
  }

  /* --- go ---------------------------------------------------------------- */

  slot.setAttribute('aria-hidden', 'true');
  slot.toggleAttribute('inert', true);
  applyAppearance();
  applyTiming();
  applyContent(cfg.content);
  mount.appendChild(stage);

  // Measured in the same task as the insert, before anything is painted: the
  // card is in the pocket on the first frame, so there is no flash and no
  // layout shift. The ready flag is lifted a frame later, once the first
  // paint has happened with the transitions still switched off.
  measure();
  requestAnimationFrame(() => {
    if (!destroyed) root.setAttribute('data-envelope-ready', 'true');
  });

  function update(next) {
    if (destroyed) return;
    const previousContent = cfg.content;
    cfg = merge(cfg, next);
    applyAppearance();
    applyTiming();
    if (next && 'content' in next && next.content !== previousContent) {
      applyContent(cfg.content);
    }
    measure();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimers();
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    button.removeEventListener('click', onClick);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    if (observer) observer.disconnect();
    if (motionQuery) {
      if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
      else if (motionQuery.removeListener) motionQuery.removeListener(onMotionChange);
    }
    // The content was borrowed, not taken.
    releaseContent();
    if (stage.parentNode) stage.parentNode.removeChild(stage);
  }

  const instance = {
    el: root,
    stage,
    slot,
    content: contentBox,
    open,
    reset,
    update,
    destroy,
  };

  Object.defineProperty(instance, 'state', {
    get() {
      return state;
    },
  });

  Object.defineProperty(instance, 'config', {
    get() {
      return merge(cfg, null);
    },
  });

  return instance;
}

export default createEnvelope;
