import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  qrSvg, qrOnPhoto, qrColours, deepenToFloor, contrast, luminance,
  QR_VEIL, QR_SAFE, QR_CONTRAST_FLOOR, QR_BLOOM_MIN_UNDER_CODE,
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

test('the veil is the measured one, and the code on a photo has recovery in hand', () => {
  // Six grounds bracketing what a photograph does were composited under a real
  // code and decoded at both sizes; 0.70 was the floor across all of them.
  // 0.80 ships because the couple's own photograph is not one of the six.
  assert.ok(QR_VEIL >= 0.7, `a veil of ${QR_VEIL} is under the measured floor`);
  assert.match(qrOnPhoto(URL_, 144), /^<svg/);
  assert.doesNotMatch(qrOnPhoto(URL_, 144), /<rect width="144" height="144" fill=/, 'the code on a photo paints over it');
  assert.match(qr, /ec: 'Q'/, 'the code on a photo dropped back to less recovery');
});

test('the two looks are offered, and the retired backdrops read as one of them', () => {
  // A couple who chose "photo behind the card" or "photo behind the code"
  // asked for their picture behind their code; both are the silhouette now.
  assert.deepEqual(PASS_LOOKS.map((l) => l.value), ['silhouette', 'ground']);
  assert.equal(passLookFrom(''), 'silhouette');
  assert.equal(passLookFrom('photoCard'), 'silhouette');
  assert.equal(passLookFrom('photoBehind'), 'silhouette');
  assert.equal(passLookFrom('ground'), 'ground');
  assert.equal(passLookFrom('somethingElse'), 'silhouette');
});

test('nothing offers to put the code on a card over a photograph any more', () => {
  // The card was the code cut out of the design and pasted back on, which is
  // the thing the backdrop work exists to stop.
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  for (const dead of ['inv-pass-plate', 'inv-pass-photo', 'pass-code-photo', 'pass-tear', 'pass-hero']) {
    assert.doesNotMatch(css, new RegExp(`\\.${dead}[\\s,{:]`), `${dead} is still in the stylesheet`);
    assert.doesNotMatch(renderer, new RegExp(dead), `${dead} is still rendered`);
  }
});

test('a look that wants a photograph and has none falls back rather than breaking', () => {
  assert.match(renderer, /const mode: PassLook = photo \? look : 'ground';/, 'a missing photo would render a code onto nothing');
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.match(pass, /wanted === 'silhouette' && !photo \? 'ground' : wanted/, 'the pass would float a code over nothing');
});

test('the code over a photograph uses the safe ink, not the palette’s', () => {
  // The bloom bounds how dark the photograph gets under the code; the pair has
  // to clear the floor against that darkest point, not against a card.
  const fn = renderer.slice(renderer.indexOf("if (mode === 'silhouette')"), renderer.indexOf('return (\n    <div className="inv-card mt-6 text-center">'));
  assert.match(fn, /qrOnPhoto\(url, 144\)/);
  assert.match(fn, /color: QR_SAFE\.dark/, 'the caption takes a palette colour over a bloomed photograph');
  assert.doesNotMatch(fn, /ink\.dark/, 'the palette ink is drawn onto a photograph');
});

test('the bloom is at full strength everywhere the code covers', () => {
  /*
   * The old rule was "flat, never a gradient", because a linear gradient is
   * safe at one end and under the floor at the other. A radial wash centred on
   * the code is a different shape of thing: the fall-off happens outside the
   * code, not across it. That only holds if the stops say so, so this checks
   * the geometry rather than trusting the comment.
   *
   * The wash is sized to 260% of the code, so its radius is 1.3 code-widths.
   * The code's furthest point is its corner, at half its diagonal — 0.707
   * code-widths, or 54.4% of that radius. White therefore has to still be at
   * full strength at 54.4%.
   */
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const bloom = css.slice(css.indexOf('.pass-bloom::before'), css.indexOf('.pass-bloom .pass-code-body'));
  const width = Number(/width:\s*(\d+)%/.exec(bloom)?.[1]);
  assert.ok(width >= 200, `a wash ${width}% of the code is too small to clear its corners`);
  const corner = (Math.SQRT2 / 2) / (width / 200) * 100; // % of the wash's radius

  const stops = [...bloom.matchAll(/rgba\(255, 255, 255, ([\d.]+)\) (\d+)%/g)]
    .map((m) => ({ alpha: Number(m[1]), at: Number(m[2]) }));
  assert.ok(stops.length >= 3, 'the wash has no stops to check');

  // Linear interpolation between the two stops the corner falls between.
  const below = [...stops].reverse().find((s) => s.at <= corner)!;
  const above = stops.find((s) => s.at >= corner)!;
  const alpha = below.at === above.at
    ? below.alpha
    : below.alpha + ((above.alpha - below.alpha) * (corner - below.at)) / (above.at - below.at);

  assert.ok(
    alpha >= QR_BLOOM_MIN_UNDER_CODE,
    `at the code's corner (${corner.toFixed(1)}% of the wash) the white is ${alpha.toFixed(3)}, under the ${QR_BLOOM_MIN_UNDER_CODE} this design claims`,
  );
  assert.ok(alpha >= QR_VEIL, `the bloom drops to ${alpha.toFixed(3)} under the code, below the measured veil of ${QR_VEIL}`);
});
