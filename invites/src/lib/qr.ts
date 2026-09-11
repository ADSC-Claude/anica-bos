import qrcode from 'qrcode-generator';

/**
 * QR codes as inline SVG. Rendered on the server, no canvas, no image host:
 * the same markup goes into the share modal, the printable card and the
 * check-in pass.
 *
 * Everything here that looks like a magic number was measured rather than
 * reasoned about. Codes were rendered at both the sizes this app uses, put
 * through a decoder, and the numbers that survived are the ones written down.
 * Where a comment says "measured", that is what it means.
 */

/** How much damage each level survives, as a share of the code. */
const RECOVERY: Record<Ec, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };
export type Ec = 'L' | 'M' | 'Q' | 'H';

/** The little squares. */
export type QrModule = 'square' | 'rounded' | 'dot';
/** The three big squares in the corners — the part a reader finds first. */
export type QrEye = 'square' | 'rounded' | 'circle';

export type QrOptions = {
  size?: number;
  /** The blank border, in modules. Four is what the specification asks for. */
  margin?: number;
  dark?: string;
  /** `'none'` draws no paper at all, for a code sitting on a photograph. */
  light?: string;
  module?: QrModule;
  eye?: QrEye;
  ec?: Ec;
};

const eyesOf = (n: number): [number, number][] => [[0, 0], [0, n - 7], [n - 7, 0]];

function inEye(r: number, c: number, n: number): boolean {
  return eyesOf(n).some(([er, ec]) => r >= er && r < er + 7 && c >= ec && c < ec + 7);
}

export function qrSvg(text: string, opts: QrOptions = {}): string {
  const size = opts.size ?? 240;
  // Four, not two. The quiet zone is part of the code, and the old default
  // left a code on a patterned ground with less border than it is owed.
  const margin = opts.margin ?? 4;
  const dark = opts.dark ?? '#111111';
  const light = opts.light ?? '#ffffff';
  const shape = opts.module ?? 'square';
  const eye = opts.eye ?? 'square';

  const qr = qrcode(0, opts.ec ?? 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + margin * 2);
  const at = (i: number) => (i + margin) * cell;
  const f = (v: number) => v.toFixed(2);

  // One path for every module rather than an element each: a wedding code is
  // 33 modules square and runs to some five hundred of them, and this markup
  // is inlined into every personal invitation page.
  const body: string[] = [];
  // Radius exactly half the cell for a dot. Measured: at 0.42 of the cell
  // these stop decoding above about 160px and at 0.48 above about 320px,
  // because a reader averages a block of pixels rather than reading one point,
  // and sparse dots average light. A dot fills its cell.
  const dotR = cell * 0.5;
  const round = cell * 0.3;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || inEye(r, c, n)) continue;
      const x = at(c);
      const y = at(r);
      if (shape === 'dot') {
        body.push(`M${f(x + cell / 2 - dotR)} ${f(y + cell / 2)}a${f(dotR)} ${f(dotR)} 0 1 0 ${f(dotR * 2)} 0a${f(dotR)} ${f(dotR)} 0 1 0 ${f(-dotR * 2)} 0z`);
      } else if (shape === 'rounded') {
        const mid = cell - round * 2;
        body.push(
          `M${f(x + round)} ${f(y)}h${f(mid)}a${f(round)} ${f(round)} 0 0 1 ${f(round)} ${f(round)}` +
            `v${f(mid)}a${f(round)} ${f(round)} 0 0 1 ${f(-round)} ${f(round)}` +
            `h${f(-mid)}a${f(round)} ${f(round)} 0 0 1 ${f(-round)} ${f(-round)}` +
            `v${f(-mid)}a${f(round)} ${f(round)} 0 0 1 ${f(round)} ${f(-round)}z`,
        );
      } else {
        // A hair of overlap, so neighbours print as one block rather than as a
        // grid with white seams running through it.
        const w = cell + 0.35;
        body.push(`M${f(x)} ${f(y)}h${f(w)}v${f(w)}h${f(-w)}z`);
      }
    }
  }

  // The eyes are drawn on their own: a ring one module thick around a 3×3
  // centre. Their proportions are fixed — that is what a reader looks for —
  // but the corner radius is free, and it is most of what makes a code look
  // like somebody chose it.
  const eyes = eyesOf(n).map(([er, ec]) => {
    const x = at(ec);
    const y = at(er);
    const w = cell * 7;
    const rx = eye === 'rounded' ? cell * 2 : eye === 'circle' ? w / 2 : 0;
    const irx = eye === 'rounded' ? cell * 0.8 : eye === 'circle' ? cell * 1.5 : 0;
    return (
      `<rect x="${f(x + cell / 2)}" y="${f(y + cell / 2)}" width="${f(w - cell)}" height="${f(w - cell)}" rx="${f(rx)}" fill="none" stroke="${dark}" stroke-width="${f(cell)}"/>` +
      `<rect x="${f(x + cell * 2)}" y="${f(y + cell * 2)}" width="${f(cell * 3)}" height="${f(cell * 3)}" rx="${f(irx)}" fill="${dark}"/>`
    );
  });

  const paper = light === 'none' ? '' : `<rect width="${size}" height="${size}" fill="${light}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR code">${paper}<path d="${body.join('')}" fill="${dark}"/>${eyes.join('')}</svg>`;
}

export function qrDataUrl(text: string, size = 240): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(text, { size }))}`;
}

/* ── the one hard floor ─────────────────────────────────────────────── */

function channel(v: number): number {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a `#rrggbb`, or null if it is not one. */
export function luminance(hex: string): number | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  if (x === null || y === null) return 0;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * What a code needs between its ink and its paper.
 *
 * Seven, not the 4.5 a body of text would want. A code is read from a
 * photograph taken by somebody else's phone, at an angle, in a function room,
 * and it either resolves or it does not — there is no squinting at it.
 */
export const QR_CONTRAST_FLOOR = 7;

/** The safe fallback: the pair every code fell back to before any of this. */
export const QR_SAFE: { dark: string; light: string } = { dark: '#1f1d1a', light: '#ffffff' };

/**
 * The invitation's own ink and paper, when they are safe to use.
 *
 * A code hard-coded black on white reads as a sticker somebody pasted onto a
 * sand or Baby Blue design, and that is the thing people actually notice. So
 * the code takes the design's colours — but only when they clear the floor,
 * and only the right way round. A dark ground with light text is an ordinary
 * palette (the Midnight collection is one) and a code drawn that way is an
 * inverted code, which a real share of readers will not look at.
 */
export function qrColours(palette: { ink: string; surface: string; bg: string; accent: string }): { dark: string; light: string } {
  // Most wanted first: the accent is the colour the couple thinks of as
  // theirs, and the surface is what a card is already drawn on.
  const wanted = [
    { dark: palette.accent, light: palette.surface },
    { dark: palette.ink, light: palette.surface },
    { dark: palette.accent, light: palette.bg },
    { dark: palette.ink, light: palette.bg },
  ];
  const usable = wanted.filter((pair) => {
    const ink = luminance(pair.dark);
    const paper = luminance(pair.light);
    // Dark on light, never the other way round: an inverted code reads
    // beautifully and fails on a real share of phones.
    return ink !== null && paper !== null && ink < paper;
  });

  for (const pair of usable) {
    if (contrast(pair.dark, pair.light) >= QR_CONTRAST_FLOOR) return pair;
  }
  // Nothing cleared as drawn. Rather than give up on the design and fall back
  // to near-black, take its best pair and deepen the ink until it does —
  // Baby Blue's own slate is 6.84:1 on white, a hair under, and a christening
  // invitation should not have somebody else's black on it for the sake of
  // that. Deepening keeps the hue exactly; falling back does not.
  for (const pair of usable) {
    const deepened = deepenToFloor(pair.dark, pair.light);
    if (deepened) return { dark: deepened, light: pair.light };
  }
  return QR_SAFE;
}

/**
 * The same colour, darker, until it clears the floor against its paper.
 *
 * Every channel is multiplied by the same factor, which holds the hue and the
 * saturation exactly where they were and moves only the lightness. Returns
 * null if even black would not clear it, which means the paper is the problem
 * and no ink can save it.
 */
export function deepenToFloor(ink: string, paper: string): string | null {
  const from = /^#([0-9a-fA-F]{6})$/.exec(ink);
  if (!from || luminance(paper) === null) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(from[1].slice(i, i + 2), 16));
  for (let k = 95; k >= 0; k -= 5) {
    const hex = `#${[r, g, b].map((v) => Math.round((v * k) / 100).toString(16).padStart(2, '0')).join('')}`;
    if (contrast(hex, paper) >= QR_CONTRAST_FLOOR) return hex;
  }
  return null;
}

/* ── a code standing on a photograph ────────────────────────────────── */

/**
 * How much paper-light goes over the photograph directly under a code.
 *
 * This is the silhouette front, and it is the one thing asked for that kept
 * getting built and then taken out again: the code stands *on* the picture
 * rather than on a plate laid over it. There is no card edge, no cut and no
 * trim — the photograph simply comes up into the light under the modules and
 * goes back to full strength a finger's width away.
 *
 * 0.8, measured. White at this alpha over the worst ground a photograph can
 * offer — black — composites to #cccccc, which is 10.6:1 against the safe ink
 * and clears QR_CONTRAST_FLOOR with room for a phone held at an angle. Below
 * about 0.7 a dark suit or a night sky takes the code under the floor, and
 * the failure is silent: it looks fine and it does not scan.
 */
export const QR_VEIL = 0.8;

/**
 * The bloom is a soft circle, and softness is the risk: a gradient that has
 * begun to fade where the code still has modules is a code with a dim corner.
 *
 * So the wash holds 0.96 out to 80% of its radius, and the code's furthest
 * corner — quiet zone included — lands at 79% of it, because the disc is 180%
 * of the code's own box and a circle round a square is 141% at the very
 * least. That narrow margin is deliberate: a disc wide enough to fade
 * gracefully is a disc that reads as a torch shone at the photograph, which is
 * what the first version of this looked like. This constant is the floor the
 * CSS is checked against rather than a value the CSS reads; the check lives in
 * tests/qr.test.ts, which keeps the two in step when somebody retunes it.
 */
export const QR_BLOOM_MIN_UNDER_CODE = 0.96;

/**
 * A code with no paper of its own, for standing on the bloom.
 *
 * `light: 'none'` draws no backing rectangle, so the photograph shows between
 * the modules. Error correction goes to Q rather than M: the bloom bounds how
 * dark the ground can get under the code but it cannot make it even, and a
 * quarter of recovery is what covers the unevenness that is left.
 */
export function qrOnPhoto(text: string, size: number, dark: string = QR_SAFE.dark): string {
  return qrSvg(text, { size, dark, light: 'none', ec: 'Q', module: 'square', eye: 'rounded' });
}

/** The paper of a bloom, composited over the darkest a photograph can be. */
function overBlack(paper: string, veil: number): string {
  const from = /^#([0-9a-fA-F]{6})$/.exec(paper);
  if (!from) return '#000000';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(from[1].slice(i, i + 2), 16));
  return `#${[r, g, b].map((v) => Math.round(v * veil).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The ink and the paper of the bloom, which have to be chosen together.
 *
 * The bloom is the invitation's own paper at QR_VEIL over whatever the
 * photograph happens to be, so the worst case is that paper at that alpha over
 * black — and a cream at 0.8 over black is a mid stone rather than paper. Two
 * moves get it back over the floor, and the order matters more than it looks:
 *
 *  1. Deepen the ink, against what the paper actually composites to rather
 *     than against the paper as drawn. The ink is a hundred small modules;
 *     nobody sees its exact value, and deepening holds the hue exactly.
 *  2. Only then walk the paper toward white. The paper is a disc the width of
 *     a hand and it is the whole impression the front makes — a cream one
 *     reads as paper and a white one reads as a torch shone at the picture.
 *     So this is the move of last resort, not the first thing tried.
 *
 * Only if neither is enough does the safe near-black come back, which no
 * palette in PALETTE_PRESETS needs.
 */
export function bloomColours(
  palette: { ink: string; surface: string; bg: string; accent: string },
  veil: number = QR_VEIL,
): { dark: string; paper: string } {
  const base = qrColours(palette);
  // The design's ground before its card white: a bloom is a piece of the
  // invitation laid on a photograph, and the ground is the colour somebody
  // would call theirs. Anything genuinely dark is not paper and is skipped —
  // a Midnight palette's ground would make an inverted code.
  const papers = [palette.bg, base.light].filter((p) => (luminance(p) ?? 0) >= 0.5);
  for (const paper of papers) {
    const under = overBlack(paper, veil);
    if (contrast(base.dark, under) >= QR_CONTRAST_FLOOR) return { dark: base.dark, paper };
    const deepened = deepenToFloor(base.dark, under);
    if (deepened) return { dark: deepened, paper };
  }

  // No paper the design owns can carry any ink at this veil. Lighten the one
  // it would have used, as little as will do, deepening the ink at each step.
  const from = /^#([0-9a-fA-F]{6})$/.exec(papers[0] ?? base.light);
  if (from) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(from[1].slice(i, i + 2), 16));
    for (let k = 5; k <= 100; k += 5) {
      const paper = `#${[r, g, b]
        .map((v) => Math.round(v + ((255 - v) * k) / 100).toString(16).padStart(2, '0'))
        .join('')}`;
      const ink = deepenToFloor(base.dark, overBlack(paper, veil));
      if (ink) return { dark: ink, paper };
    }
  }
  return { dark: QR_SAFE.dark, paper: '#ffffff' };
}

/** What a level of error correction can afford to lose, as a share. */
export function recoveryBudget(ec: Ec): number {
  return RECOVERY[ec];
}
