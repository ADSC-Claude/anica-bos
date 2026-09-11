import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  qrSvg, qrColours, deepenToFloor, contrast, luminance,
  QR_SAFE, QR_CONTRAST_FLOOR, QR_VEIL, QR_BLOOM_MIN_UNDER_CODE, qrOnPhoto, bloomColours,
} from '../src/lib/qr';
import { PASS_LOOKS, passLookFrom } from '../src/lib/pass';
import { PALETTE_PRESETS } from '../src/lib/theme';

const renderer = readFileSync(new URL('../src/components/invite/renderer.tsx', import.meta.url), 'utf8');
const qr = readFileSync(new URL('../src/lib/qr.ts', import.meta.url), 'utf8');
const URL_ = 'https://youreinvitedto.com/liza-and-mark/K7tq2XbNp3Wm9ZaLc8vR';

test('a dot fills its cell, because a reader averages rather than samples a point', () => {
  // Measured against a decoder: at 0.42 of the cell these stop decoding above
  // about 160px and at 0.48 above about 320px. Sparse dots average light.
  // This is the single number in the file that a tidy-minded edit would shave,
  // so it is checked on the drawing rather than on the source: at 144px with
  // the four-module quiet zone a code is 41 cells across, and each arc has to
  // sweep exactly one of them.
  const cell = 144 / 41;
  const svg = qrSvg(URL_, { size: 144, module: 'dot' });
  const r = (cell / 2).toFixed(2);
  assert.match(svg, new RegExp(`a${r} ${r} 0 1 0 ${cell.toFixed(2)} 0`), 'a dot no longer spans its whole cell');
});

test('the quiet zone is the four modules the specification asks for', () => {
  // It was 2. The blank border is part of the code, and a code on a patterned
  // ground had less of it than it was owed.
  assert.match(qr, /const margin = opts\.margin \?\? 4;/);
});

test('a code can be drawn with no paper of its own', () => {
  // What the photo-behind backdrop needs: the photograph is the paper.
  assert.doesNotMatch(qrSvg(URL_, { light: 'none' }), /<rect width="\d+" height="\d+" fill=/, 'it still paints a background');
  assert.match(qrSvg(URL_, { light: '#ffffff' }), /<rect width="240" height="240" fill="#ffffff"\/>/);
});

test('every module shape is one path, however fancy it gets', () => {
  // A wedding code runs to some five hundred modules and this markup is
  // inlined into every personal invitation page. An element each is how a
  // 14 KB code becomes a 60 KB one.
  for (const module of ['square', 'rounded', 'dot'] as const) {
    const svg = qrSvg(URL_, { size: 144, module });
    assert.equal((svg.match(/<path /g) ?? []).length, 1, `${module}: not a single path`);
    assert.doesNotMatch(svg, /<circle/, `${module}: drew an element per module`);
  }
});

test('every eye keeps its ring and its centre, whatever its corners do', () => {
  // The proportions are what a reader looks for; only the radius is ours.
  for (const eye of ['square', 'rounded', 'circle'] as const) {
    const svg = qrSvg(URL_, { size: 300, eye });
    assert.equal((svg.match(/stroke-width=/g) ?? []).length, 3, `${eye}: not three rings`);
    assert.equal((svg.match(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" rx="[^"]+" fill="#111111"\/>/g) ?? []).length, 3, `${eye}: not three centres`);
  }
});

test('every palette the app ships gets a code that clears the floor', () => {
  // The whole point of letting a code take the design's colours: it must never
  // produce a code that is prettier and less readable than the one before.
  for (const preset of PALETTE_PRESETS) {
    const ink = qrColours(preset.palette);
    const ratio = contrast(ink.dark, ink.light);
    assert.ok(ratio >= QR_CONTRAST_FLOOR, `${preset.key}: ${ratio.toFixed(2)}:1 is under the floor`);
    assert.ok(luminance(ink.dark)! < luminance(ink.light)!, `${preset.key}: the code is inverted`);
  }
});

test('a design keeps its own hue rather than borrowing somebody else’s black', () => {
  // Baby Blue's own slate is 6.84:1 on white — a hair under — and a
  // christening invitation should not be printed with near-black for the sake
  // of that. Deepening the same colour clears the floor and keeps the hue.
  const babyblue = PALETTE_PRESETS.find((p) => p.key === 'babyblue')!.palette;
  const ink = qrColours(babyblue);
  assert.notDeepEqual(ink, QR_SAFE, 'Baby Blue fell back to near-black');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.dark.slice(i, i + 2), 16));
  assert.ok(b > r && b > g, `${ink.dark} is no longer a blue`);
});

test('deepening holds the hue exactly, and gives up when the paper is the problem', () => {
  const deep = deepenToFloor('#8fb0d8', '#ffffff')!;
  const src = [0x8f, 0xb0, 0xd8];
  const got = [1, 3, 5].map((i) => parseInt(deep.slice(i, i + 2), 16));
  const k = got[0] / src[0];
  for (let i = 1; i < 3; i++) {
    assert.ok(Math.abs(got[i] / src[i] - k) < 0.02, 'the channels moved by different amounts, so the hue shifted');
  }
  assert.ok(contrast(deep, '#ffffff') >= QR_CONTRAST_FLOOR);
  // Nothing can be printed legibly on a mid grey.
  assert.equal(deepenToFloor('#8fb0d8', '#6b6b6b'), null, 'it claims to fix a paper that no ink can fix');
});

test('a dark ground is never used as paper', () => {
  // An inverted code reads beautifully and fails on a real share of readers.
  const midnight = { bg: '#1f2a3d', surface: '#26324a', ink: '#e8e4dc', muted: '#9aa4b8', accent: '#c8ad7f', accent2: '#3b4a63' };
  const ink = qrColours(midnight);
  assert.deepEqual(ink, QR_SAFE, 'a dark palette produced a code drawn on its own darkness');
});

test('a code standing on a photograph is still standing on enough light', () => {
  /*
   * The silhouette front draws the code with no paper of its own and puts the
   * light under it instead, as a bloom of the design's own paper. This is the
   * measurement that makes that safe: the worst ground a photograph can offer
   * is black, so the composite of the bloom over black is what the modules
   * actually have to be read against.
   */
  const over = (paper: string, alpha: number) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(paper.slice(i, i + 2), 16));
    return `#${[r, g, b].map((v) => Math.round(v * alpha).toString(16).padStart(2, '0')).join('')}`;
  };
  let bleached = 0;
  for (const [key, preset] of Object.entries(PALETTE_PRESETS)) {
    const { dark, paper } = bloomColours(preset.palette);
    const worst = contrast(dark, over(paper, QR_VEIL));
    assert.ok(
      worst >= QR_CONTRAST_FLOOR,
      `${key}: a code on a black photograph reads at ${worst.toFixed(2)}:1, under the ${QR_CONTRAST_FLOOR}:1 floor`,
    );
    // Nothing is allowed to fall all the way back to the safe near-black on a
    // white ground — that is the "sticker pasted on" this whole front exists
    // to avoid, and it would be silent if it happened.
    if (dark === QR_SAFE.dark && paper === '#ffffff') bleached += 1;
  }
  assert.equal(bleached, 0, 'a palette gave up its colours entirely for the bloom');

  // And it is only lightened as far as it has to be: a design already clearing
  // the floor keeps its own paper rather than being bleached white.
  const warm = bloomColours({ ink: '#2b2622', surface: '#f6f1e8', bg: '#efe7db', accent: '#1d3a2f' });
  assert.notEqual(warm.paper, '#ffffff', 'a paper that did not need lightening was lightened anyway');
  assert.ok(contrast(warm.dark, over(warm.paper, QR_VEIL)) >= QR_CONTRAST_FLOOR);
});

test('the code drawn for a photograph brings no paper and extra recovery', () => {
  // No backing rectangle: the photograph has to show between the modules, or
  // the bloom is just a plate with soft edges.
  const art = qrOnPhoto(URL_, 264);
  assert.doesNotMatch(art, /<rect width="264" height="264"/, 'it drew itself a sheet of paper after all');
  /*
   * Q rather than M. The bloom bounds how dark the ground under the code can
   * get; it cannot make it even, and a quarter of recovery covers the rest.
   *
   * Read off the drawing rather than compared to a second string: a level of
   * recovery is more modules, and the eye's stroke is exactly one cell wide,
   * so the grid size falls out of the markup. Comparing two whole SVGs would
   * pass just as well and print thirteen thousand characters when it failed.
   */
  const grid = (svg: string) => {
    const cell = Number(/stroke-width="([\d.]+)"/.exec(svg)![1]);
    return Math.round(264 / cell) - 8;
  };
  assert.ok(
    grid(art) > grid(qrSvg(URL_, { size: 264, ec: 'M' })),
    'the code for a photograph is drawn at no more recovery than an ordinary one',
  );
  assert.equal(grid(art), grid(qrSvg(URL_, { size: 264, ec: 'Q' })), 'it is not at Q');
});

test('the bloom holds full strength everywhere the code covers', () => {
  /*
   * The geometry, checked rather than asserted in a comment. A circle drawn
   * round a square touches its corners at 141% of the square's width, so a
   * disc of D times the code reaches the code's furthest corner — quiet zone
   * included, since the drawn box is the quiet zone — at (√2 / 2) / (D / 2)
   * of its own radius. The gradient must still be at full strength there.
   */
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const width = (block: string) => Number(/width: ([\d.]+)rem/.exec(block)?.[1]);
  const after = (sel: string) => css.slice(css.indexOf(sel));
  const floor = Math.round(QR_BLOOM_MIN_UNDER_CODE * 100);

  const discs: [string, number][] = [
    // The pass: both in rem, so the ratio is the two widths.
    ['.pass-bloom {', width(after('.pass-bloom {')) / width(after('.pass-code-art {'))],
    // The invitation: the code is a share of its own disc.
    ['.inv-pass-bloom {', 100 / Number(/width: ([\d.]+)%/.exec(after('.inv-pass-bloom > span'))?.[1] ?? 0)],
  ];

  for (const [sel, ratio] of discs) {
    assert.ok(ratio >= Math.SQRT2, `${sel} is ${ratio.toFixed(2)}× its code — the disc does not reach the corners`);
    const corner = Math.SQRT2 / 2 / (ratio / 2);
    const block = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
    const held = /var\(--pass-paper[^)]*\) (\d+)%, transparent\) (\d+)%/g;
    const stops = [...block.matchAll(held)].map((m) => ({ alpha: Number(m[1]), at: Number(m[2]) }));
    const last = stops.filter((x) => x.alpha >= floor).sort((a, b) => b.at - a.at)[0];
    assert.ok(last, `${sel} never holds the paper at ${floor}% — the code stands on a fade`);
    assert.ok(
      corner * 100 <= last.at,
      `${sel}: the code reaches ${(corner * 100).toFixed(0)}% of the bloom but it holds only to ${last.at}%`,
    );
  }
});

test('the three fronts are offered, and the retired backdrops read as one of them', () => {
  // A couple who chose "photo behind the card" or "photo behind the code"
  // asked for their picture behind their code; both are the photograph front.
  // In the order they were asked for: the photograph, then the invitation's
  // own design, then the masthead.
  assert.deepEqual(PASS_LOOKS.map((l) => l.value), ['silhouette', 'ground', 'cover']);
  assert.equal(passLookFrom(''), 'silhouette');
  assert.equal(passLookFrom('photoCard'), 'silhouette');
  assert.equal(passLookFrom('photoBehind'), 'silhouette');
  // The poster front that stood here for a day meant the same picture.
  assert.equal(passLookFrom('poster'), 'silhouette');
  assert.equal(passLookFrom('ground'), 'ground');
  // The old keys for the same idea, kept readable rather than reset to default.
  assert.equal(passLookFrom('split'), 'cover');
  assert.equal(passLookFrom('arch'), 'cover');
  assert.equal(passLookFrom('somethingElse'), 'silhouette');
});

test('the invitation and the door draw the code the same way', () => {
  // One language across the product: the block on the invitation is the same
  // silhouette as the pass, not a plate laid over the picture.
  assert.match(renderer, /if \(look !== 'ground' && photo\)/, 'a missing photo would render a code onto nothing');
  assert.match(renderer, /className="inv-pass-bloom"/, 'the code is back on a plate');
  assert.doesNotMatch(renderer, /inv-pass-plate/, 'the plate came back alongside the bloom');
  // Both draw with the measured pair rather than with the card ink, which is
  // the mistake that would look right and scan badly on a dark photograph.
  for (const [name, src] of [['the invitation', renderer], ['the pass', readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8')]] as const) {
    assert.match(src, /qrOnPhoto\(url, \d+, bloom\.dark\)/, `${name} draws the code in an unmeasured ink`);
    assert.match(src, /'--pass-paper': bloom\.paper/, `${name} paints the bloom in an unmeasured colour`);
  }
});
