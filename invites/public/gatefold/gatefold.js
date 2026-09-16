/* ===========================================================================
 * gatefold.js — the gate-fold reveal engine
 * ---------------------------------------------------------------------------
 * An ES module with no dependencies. It builds a ribbon-tied gate-fold holder,
 * unties it on one tap, swings it open, lifts the card out of the shadow
 * between the panels, and then hands the screen over to whatever HTML it was
 * given. It draws the package; it does not draw the invitation. Nothing in
 * here reads, styles or rewrites the content it is handed — the content is
 * moved into the card as it is, and every property the engine put on the card
 * to reveal it is removed when the reveal ends.
 *
 *   import { createGatefold } from './gatefold.js';
 *
 *   const gf = createGatefold('#app', {
 *     theme: 'wedding',                         // one of THEMES
 *     colors: { primary: '#F5EFE6', ribbon: '#8B1E3F', accent: '#C9A961' },
 *     fonts: { heading: 'Georgia, serif' },     // optional
 *     untieHint: 'Tap to Untie',
 *     content: '#my-invitation',                // selector, element, or HTML
 *     onOpen: () => {},
 *   });
 *
 *   gf.open();      // play the reveal (the same as a tap)
 *   gf.reset();     // tie it up again, ready to replay
 *   gf.update({ theme: 'debut' });   // re-render in place, no reload
 *   gf.destroy();   // remove the package and give the content back
 *
 * Every field is optional. Anything missing, unknown or the wrong shape falls
 * back to the default below, with a warning in the console rather than a throw.
 *
 * The state machine — tied, untying, opening, revealed, expanded — is published
 * as data-gatefold-state on the root element. What gatefold.css actually keys
 * off is a set of ACCUMULATING flags (data-gatefold-untied, -opened, -revealed,
 * -expanded), so a transition started in one stage runs to its end rather than
 * restarting when the next stage arrives.
 *
 * The timing is fixed and identical for every theme; see the stage table at the
 * top of gatefold.css. This file owns the numbers and writes them into the CSS
 * as custom properties, so the two can never drift apart.
 * =========================================================================== */

export const VERSION = '1.0.0';

/** The themes. One class each, on .gatefold. */
export const THEMES = ['wedding', 'baptism', 'birthday', 'debut', 'corporate'];

/** The stages, in order. Published as data-gatefold-state. */
export const STATES = ['tied', 'untying', 'opening', 'revealed', 'expanded'];

/**
 * Which flags are set at each stage. They accumulate on purpose: a rule
 * written against [data-gatefold-untied] keeps matching for the rest of the
 * reveal, so the ribbon does not fly back on when the panels start to swing.
 */
const FLAGS = {
  tied: [],
  untying: ['untied'],
  opening: ['untied', 'opened'],
  revealed: ['untied', 'opened', 'revealed'],
  expanded: ['untied', 'opened', 'revealed', 'expanded'],
};

const ALL_FLAGS = ['untied', 'opened', 'revealed', 'expanded'];

/**
 * The reveal, in milliseconds. Fixed for every theme: a theme may change how
 * the package looks and never how it opens.
 *
 *   0     untying — loops 0-400, knot 300-600, the fall 500-1400, fade to 1600
 *   1690  opening — left panel leads, right follows 130 later, 1400 each
 *   3310  revealed — the card lifts, the glow comes up, the motes start
 *   4110  expanded — the card opens out while the package fades
 *   4970  handoff
 *
 * 90ms of stillness is left between one stage finishing and the next starting,
 * which is what stops the whole thing reading as one continuous slide.
 */
const MOTION = {
  loopDur: 400,
  loopDelay: 0,
  knotDur: 300,
  knotDelay: 300,
  slideDur: 900,
  slideDelay: 500,
  ribbonFadeDur: 400,
  ribbonFadeDelay: 1200,
  panelDur: 1400,
  panelLag: 130,
  shadeDur: 1100,
  shadeDelay: 200,
  liftDur: 520,
  glowDur: 620,
  expandDur: 860,
  fadeDur: 520,
  closeDur: 520,
  hintDur: 260,
  breathDur: 3600,
  // when each stage starts
  openAt: 1690,
  revealAt: 3310,
  expandAt: 4110,
  total: 4970,
};

/**
 * The same five stages for somebody who has asked for less movement. Stages 2
 * to 4 are skipped outright — no untying, no swing, no lift — and the whole
 * thing is a fade. The stages still run in order, so onOpen fires exactly as
 * it always does.
 */
const MOTION_REDUCED = {
  loopDur: 1,
  loopDelay: 0,
  knotDur: 1,
  knotDelay: 0,
  slideDur: 1,
  slideDelay: 0,
  ribbonFadeDur: 160,
  ribbonFadeDelay: 0,
  panelDur: 1,
  panelLag: 0,
  shadeDur: 1,
  shadeDelay: 0,
  liftDur: 1,
  glowDur: 1,
  expandDur: 280,
  fadeDur: 280,
  closeDur: 200,
  hintDur: 160,
  breathDur: 3600,
  openAt: 0,
  revealAt: 0,
  expandAt: 0,
  total: 320,
};

/**
 * Where the card sits inside the holder, as a fraction of the package. A card
 * is a little smaller than the thing that holds it, in both directions.
 */
const CARD = { width: 0.84, height: 0.86 };

/** How many motes drift up behind the revealed card. */
const PARTICLES = 8;

const DEFAULTS = {
  theme: 'wedding',
  colors: {},
  fonts: {},
  untieHint: 'Tap to Untie',
  content: '',
  onOpen: null,
};

/** config.colors.<key> → the CSS variable it sets on .gatefold. */
const COLOR_VARS = {
  primary: '--primary-color',
  lining: '--lining-color',
  secondary: '--secondary-color',
  accent: '--accent-color',
  ribbon: '--ribbon-color',
  ribbonHighlight: '--ribbon-highlight',
  background: '--background',
  text: '--text-color',
};

/** config.fonts.<key> → the CSS variable it sets on .gatefold. */
const FONT_VARS = {
  heading: '--font-heading',
  body: '--font-body',
};

/** MOTION key → the CSS variable that carries it. */
const TIMING_VARS = {
  loopDur: '--gf-loop-dur',
  loopDelay: '--gf-loop-delay',
  knotDur: '--gf-knot-dur',
  knotDelay: '--gf-knot-delay',
  slideDur: '--gf-slide-dur',
  slideDelay: '--gf-slide-delay',
  ribbonFadeDur: '--gf-ribbon-fade-dur',
  ribbonFadeDelay: '--gf-ribbon-fade-delay',
  panelDur: '--gf-panel-dur',
  panelLag: '--gf-panel-lag',
  shadeDur: '--gf-shade-dur',
  shadeDelay: '--gf-shade-delay',
  liftDur: '--gf-lift-dur',
  glowDur: '--gf-glow-dur',
  expandDur: '--gf-expand-dur',
  fadeDur: '--gf-fade-dur',
  closeDur: '--gf-close-dur',
  hintDur: '--gf-hint-dur',
  breathDur: '--gf-breath-dur',
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
    console.warn('[gatefold] ' + message);
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

/** Shallow-merge a config over a base, with nested colors/fonts objects. */
function merge(base, next) {
  const input = next && typeof next === 'object' ? next : {};
  const cfg = Object.assign({}, base, input);
  // colors: null and fonts: null mean "back to the theme's own".
  cfg.colors = input.colors === null ? {} : Object.assign({}, base.colors, input.colors || {});
  cfg.fonts = input.fonts === null ? {} : Object.assign({}, base.fonts, input.fonts || {});
  return cfg;
}

/** The horizontal scale an element is currently drawn at, animation included. */
function currentScale(node) {
  const value = getComputedStyle(node).transform;
  if (!value || value === 'none') return 1;
  try {
    return new DOMMatrixReadOnly(value).a || 1;
  } catch (error) {
    const nums = value.match(/-?\d*\.?\d+/g);
    return nums && nums.length ? parseFloat(nums[0]) || 1 : 1;
  }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Can a registered <number> custom property be eased here? @property is what
 * makes --gf-p-open interpolable; where it is missing the numbers step.
 */
let numberTween = null;
function supportsNumberTween() {
  if (numberTween !== null) return numberTween;
  numberTween = typeof CSS !== 'undefined' && typeof CSS.registerProperty === 'function';
  return numberTween;
}

/**
 * The bow: two loops, a knot and two tails, as one inline SVG in a 120×84
 * frame. Every part is its own group so the untying can move each of them on
 * its own schedule, and every part turns about a point given in these same
 * units (see the transform-origins in gatefold.css).
 *
 * The silk gradient needs an id, and an id has to be unique on the page, so it
 * carries the instance number.
 */
function bowMarkup(id) {
  const band = 'url(#' + id + ')';
  const loopL = 'url(#' + id + '-l)';
  const loopR = 'url(#' + id + '-r)';
  return [
    '<svg viewBox="0 0 120 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">',
    '<defs>',
    // Down the band and the tails: light across the middle of the weave.
    '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" class="gatefold__bow-sheen-edge"/>',
    '<stop offset="0.42" class="gatefold__bow-sheen-mid"/>',
    '<stop offset="1" class="gatefold__bow-sheen-body"/>',
    '</linearGradient>',
    // Across each loop: dark where it folds into the knot, bright at its far
    // edge. This is what stops a loop reading as a flat shape.
    '<linearGradient id="' + id + '-l" x1="1" y1="0" x2="0" y2="0">',
    '<stop offset="0" class="gatefold__bow-sheen-fold"/>',
    '<stop offset="0.46" class="gatefold__bow-sheen-mid"/>',
    '<stop offset="1" class="gatefold__bow-sheen-body"/>',
    '</linearGradient>',
    '<linearGradient id="' + id + '-r" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0" class="gatefold__bow-sheen-fold"/>',
    '<stop offset="0.46" class="gatefold__bow-sheen-mid"/>',
    '<stop offset="1" class="gatefold__bow-sheen-body"/>',
    '</linearGradient>',
    '</defs>',
    // Tails first: they hang behind the loops and the knot.
    '<g class="gatefold__bow-tail gatefold__bow-tail--left" fill="' + band + '">',
    '<path d="M56 45 C 52 59, 44 69, 28 80 L 40 83 L 46 73 C 53 63, 58 54, 60 46 Z"/></g>',
    '<g class="gatefold__bow-tail gatefold__bow-tail--right" fill="' + band + '">',
    '<path d="M64 45 C 68 59, 76 69, 92 80 L 80 83 L 74 73 C 67 63, 62 54, 60 46 Z"/></g>',
    '<g class="gatefold__bow-loop gatefold__bow-loop--left" fill="' + loopL + '">',
    '<path d="M58 33 C 47 9, 15 3, 9 21 C 3 40, 28 49, 57 41 Z"/></g>',
    '<g class="gatefold__bow-loop gatefold__bow-loop--right" fill="' + loopR + '">',
    '<path d="M62 33 C 73 9, 105 3, 111 21 C 117 40, 92 49, 63 41 Z"/></g>',
    // The knot sits over everything, which is what a knot does.
    '<g class="gatefold__bow-knot" fill="' + band + '">',
    '<rect x="52" y="26" width="16" height="23" rx="7"/></g>',
    '</svg>',
  ].join('');
}

/* ---------------------------------------------------------------------------
 * createGatefold
 * ------------------------------------------------------------------------ */

/**
 * Build a gate-fold package inside `target` and return a handle to it.
 *
 * @param {string|Element} target  where to mount: a selector or an element
 * @param {object} [config]        see the block at the top of this file
 * @returns {{
 *   el: Element, stage: Element, card: Element, state: string,
 *   open: () => void, reset: () => void,
 *   update: (config: object) => void, destroy: () => void
 * }}
 */
export function createGatefold(target, config) {
  const mount = typeof target === 'string' ? document.querySelector(target) : target;
  if (!mount || !mount.appendChild) {
    throw new Error('[gatefold] createGatefold: no element to mount in (' + String(target) + ')');
  }

  let cfg = merge(DEFAULTS, config);
  let state = 'tied';
  let destroyed = false;
  const timers = [];
  const seq = ++instanceCount;
  const cardId = 'gatefold-card-' + seq;

  /* --- the markup -------------------------------------------------------- */

  const stage = el('div', 'gatefold-stage');
  const root = el('div', 'gatefold');
  root.setAttribute('data-gatefold-state', 'tied');
  // Held still until the card has been measured, so nothing animates in from
  // a position it was never in.
  root.setAttribute('data-gatefold-ready', 'false');
  // Whether this browser can interpolate a registered custom property. The
  // reveal is written as arithmetic on two eased numbers; without @property
  // they step instead of easing, and the stylesheet fades the last stage in
  // rather than growing it. Everything before it is unaffected.
  root.setAttribute('data-gatefold-tween', supportsNumberTween() ? 'ease' : 'snap');

  const button = el('button', 'gatefold__button');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', cardId);

  const pkg = el('span', 'gatefold__package');
  const breathe = el('span', 'gatefold__breathe');
  const ground = el('span', 'gatefold__ground');

  const panels = el('span', 'gatefold__panels');
  const panelLeft = el('span', 'gatefold__panel gatefold__panel--left');
  const panelRight = el('span', 'gatefold__panel gatefold__panel--right');
  [panelLeft, panelRight].forEach((panel) => {
    panel.appendChild(el('span', 'gatefold__face gatefold__face--front'));
    panel.appendChild(el('span', 'gatefold__face gatefold__face--back'));
  });
  panels.appendChild(panelLeft);
  panels.appendChild(panelRight);

  const particles = el('span', 'gatefold__particles');
  for (let i = 0; i < PARTICLES; i += 1) {
    particles.appendChild(el('span', 'gatefold__particle'));
  }

  const ribbon = el('span', 'gatefold__ribbon');
  const ribbonLeft = el('span', 'gatefold__ribbon-half gatefold__ribbon-half--left');
  const ribbonRight = el('span', 'gatefold__ribbon-half gatefold__ribbon-half--right');
  const bow = el('span', 'gatefold__bow');
  bow.innerHTML = bowMarkup('gatefold-silk-' + seq);
  ribbon.appendChild(ribbonLeft);
  ribbon.appendChild(ribbonRight);
  ribbon.appendChild(bow);

  const hint = el('span', 'gatefold__hint');
  const hintText = el('span', 'gatefold__hint-text');
  hint.appendChild(hintText);

  const glow = el('span', 'gatefold__glow');
  const well = el('span', 'gatefold__well');

  const card = el('div', 'gatefold__card');
  card.id = cardId;
  card.tabIndex = -1;
  const paper = el('div', 'gatefold__paper');
  const contentBox = el('div', 'gatefold__content');
  const shade = el('div', 'gatefold__shade');

  breathe.appendChild(ground);
  breathe.appendChild(panels);
  breathe.appendChild(particles);
  breathe.appendChild(ribbon);
  pkg.appendChild(breathe);
  button.appendChild(pkg);
  button.appendChild(hint);

  card.appendChild(paper);
  card.appendChild(contentBox);
  card.appendChild(shade);

  root.appendChild(button);
  root.appendChild(glow);
  root.appendChild(well);
  root.appendChild(card);
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
   * Put the content in the card. An element (or a selector that finds one) is
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
        warn('content cannot contain the package it is being put inside — ignoring it');
        return;
      }
      borrowed = { node, parent: node.parentNode, next: node.nextSibling };
      contentBox.appendChild(node);
      return;
    }

    // Developer-authored markup, handed over deliberately. It is written in
    // untouched, which is the whole point of the card.
    contentBox.innerHTML = html;
  }

  /* --- appearance -------------------------------------------------------- */

  function applyAppearance() {
    const theme = pick(cfg.theme, THEMES, DEFAULTS.theme, 'theme');

    // The theme class goes on the root (the documented API) and on the stage
    // (so --background, a theme variable, can reach the backdrop above it).
    root.className = 'gatefold ' + theme;
    stage.className = 'gatefold-stage ' + theme;

    // Colours and fonts from config win over the theme's own.
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

    const label = cfg.untieHint == null ? '' : String(cfg.untieHint);
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
    Object.keys(TIMING_VARS).forEach((key) => {
      root.style.setProperty(TIMING_VARS[key], m[key] + 'ms');
    });
  }

  /* --- geometry ---------------------------------------------------------- */

  /**
   * Measure the package and write down where the card sits: the rect it rests
   * in between the panels, and the two scales that shrink a viewport-sized
   * card onto it. gatefold.css builds the card's transform and its content's
   * out of these, so that the pair is a uniform scale and the invitation is
   * drawn in proportion rather than squashed.
   *
   * The rect comes from .gatefold__package, which is deliberately not the
   * element the idle breath is on: its box is the true geometry of the closed
   * package whatever the breathing is doing at the moment we ask.
   *
   * Called at build, on resize, and on every reset — never mid-reveal, where
   * changing the numbers would move the target the animation is heading for.
   */
  function measure() {
    if (destroyed || !pkg.isConnected) return;

    const rect = pkg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const doc = document.documentElement;
    // clientWidth/clientHeight, not innerWidth/innerHeight: this is the
    // viewport position:fixed resolves against, which is what the card is.
    const vw = doc.clientWidth || window.innerWidth || 1;
    const vh = doc.clientHeight || window.innerHeight || 1;

    const cardW = rect.width * CARD.width;
    const cardH = rect.height * CARD.height;
    const cardX = rect.left + (rect.width - cardW) / 2;
    const cardY = rect.top + (rect.height - cardH) / 2;

    root.style.setProperty('--gf-card-left', cardX.toFixed(2) + 'px');
    root.style.setProperty('--gf-card-top', cardY.toFixed(2) + 'px');
    root.style.setProperty('--gf-card-width', cardW.toFixed(2) + 'px');
    root.style.setProperty('--gf-card-height', cardH.toFixed(2) + 'px');

    // Never zero: the content's transform divides by these to even them out.
    root.style.setProperty('--gf-card-sx', Math.max(cardW / vw, 0.001).toFixed(5));
    root.style.setProperty('--gf-card-sy', Math.max(cardH / vh, 0.001).toFixed(5));
  }

  /* --- the state machine ------------------------------------------------- */

  function setState(next) {
    state = next;
    root.setAttribute('data-gatefold-state', next);
    const on = FLAGS[next] || [];
    ALL_FLAGS.forEach((flag) => {
      const attr = 'data-gatefold-' + flag;
      if (on.indexOf(flag) === -1) root.removeAttribute(attr);
      else if (!root.hasAttribute(attr)) root.setAttribute(attr, '');
    });
    button.setAttribute('aria-expanded', next === 'tied' ? 'false' : 'true');
    root.dispatchEvent(new CustomEvent('gatefold:state', {
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
   * The handoff. Every property the engine put on the card and its content to
   * reveal them is dropped here: no transform, no clipping, no paper, no
   * shadow, no containing block of ours. What is left is a box fixed to the
   * viewport that scrolls, with the invitation inside it exactly as it arrived.
   */
  function handoff() {
    root.setAttribute('data-gatefold-handoff', '');
    card.removeAttribute('aria-hidden');
    card.removeAttribute('inert');
    // Reading continues where the package was, for a keyboard or a screen
    // reader. preventScroll so the page does not jump under a pointer.
    try {
      card.focus({ preventScroll: true });
    } catch (error) {
      /* focus is a courtesy, never a requirement */
    }
    root.dispatchEvent(new CustomEvent('gatefold:open', { bubbles: true }));
    if (typeof cfg.onOpen === 'function') {
      try {
        cfg.onOpen();
      } catch (error) {
        warn('onOpen threw: ' + (error && error.message ? error.message : error));
      }
    }
  }

  /**
   * Stop the idle breath without the package stepping.
   *
   * Removing an animation does not start a transition: the style the browser
   * compares against does not carry the animation's effect, so the package
   * would jump the last one per cent of its breath in a single frame. Three
   * steps fix it, and the order of them is the whole trick:
   *
   *   1. read where the breath actually is and pin it as an inline transform
   *   2. switch the idle off (the caller does this, between the two halves)
   *   3. make the browser COMPUTE that pinned value, then drop the pin a frame
   *      later — which is a real style change, and the transition eases it home
   *
   * Step 3 cannot simply be a requestAnimationFrame: a tap arrives in a task,
   * and the next frame runs its animation callbacks BEFORE it recalculates
   * style, so the pin would be dropped before it had ever been drawn. Reading
   * the computed transform forces the recalculation while the pin still holds.
   */
  function settleBreath() {
    const from = currentScale(breathe);
    if (from === 1) return null;
    breathe.style.transform = 'scale(' + from.toFixed(5) + ')';
    return function release() {
      void getComputedStyle(breathe).transform;
      requestAnimationFrame(() => {
        if (!destroyed) breathe.style.transform = '';
      });
    };
  }

  function open() {
    // A tap while it is already running is not a second opening.
    if (destroyed || state !== 'tied') return;
    const m = motion();
    applyTiming();
    measure();
    const releaseBreath = settleBreath();
    setState('untying');
    if (releaseBreath) releaseBreath();
    after(m.openAt, () => setState('opening'));
    after(m.revealAt, () => setState('revealed'));
    after(m.expandAt, () => setState('expanded'));
    after(m.total, handoff);
  }

  function reset() {
    if (destroyed) return;
    clearTimers();
    const hadFocus = card.contains(document.activeElement);
    root.removeAttribute('data-gatefold-handoff');
    breathe.style.transform = '';
    card.setAttribute('aria-hidden', 'true');
    card.toggleAttribute('inert', true);
    applyTiming();
    setState('tied');
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
    // Only between reveals: re-measuring mid-flight would move the target the
    // transition is already travelling towards.
    if (state !== 'tied') return;
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

  card.setAttribute('aria-hidden', 'true');
  card.toggleAttribute('inert', true);
  applyAppearance();
  applyTiming();
  applyContent(cfg.content);
  mount.appendChild(stage);

  // Measured in the same task as the insert, before anything is painted: the
  // card is in the holder on the first frame, so there is no flash and no
  // layout shift. The ready flag is lifted a frame later, once the first paint
  // has happened with the transitions still switched off.
  measure();
  requestAnimationFrame(() => {
    if (!destroyed) root.setAttribute('data-gatefold-ready', 'true');
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
    card,
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

export default createGatefold;
