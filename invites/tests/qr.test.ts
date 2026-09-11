import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  qrSvg, qrColours, deepenToFloor, contrast, luminance,
  QR_SAFE, QR_CONTRAST_FLOOR,
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

test('nothing is left over from veiling a photograph to read a code off it', () => {
  // QR_VEIL, QR_BLOOM_MIN_UNDER_CODE and qrOnPhoto are gone with the approach
  // they served: the code sits on the invitation's own paper now, so there is
  // no photograph in its way and no white to measure over one.
  // Checked as exports rather than as mentions: the comment that replaced them
  // names all three, which is the point of it.
  const qr = readFileSync(new URL('../src/lib/qr.ts', import.meta.url), 'utf8');
  for (const gone of ['QR_VEIL', 'QR_BLOOM_MIN_UNDER_CODE', 'qrOnPhoto']) {
    assert.doesNotMatch(qr, new RegExp(`export (const|function) ${gone}\\b`), `${gone} is still exported`);
  }
  // And nothing imports them, which is what would actually break.
  for (const f of ['../src/components/invite/pass.tsx', '../src/components/invite/renderer.tsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /qrOnPhoto|QR_VEIL/, `${f} still reaches for the veil`);
  }
});






test('the three fronts are offered, and the retired backdrops read as one of them', () => {
  // A couple who chose "photo behind the card" or "photo behind the code"
  // asked for their picture behind their code; both are the photograph front.
  assert.deepEqual(PASS_LOOKS.map((l) => l.value), ['poster', 'cover', 'ground']);
  assert.equal(passLookFrom(''), 'poster');
  assert.equal(passLookFrom('photoCard'), 'poster');
  assert.equal(passLookFrom('photoBehind'), 'poster');
  assert.equal(passLookFrom('ground'), 'ground');
  // The old keys for the same idea, kept readable rather than reset to default.
  assert.equal(passLookFrom('split'), 'cover');
  assert.equal(passLookFrom('arch'), 'cover');
  assert.equal(passLookFrom('somethingElse'), 'poster');
});

test('the code on the invitation sits on paper, over a photograph at full strength', () => {
  // Never veiled under the modules: that costs the photograph everything and
  // buys the code nothing a plate does not.
  assert.match(renderer, /if \(look !== 'ground' && photo\)/, 'a missing photo would render a code onto nothing');
  assert.match(renderer, /className="inv-pass-plate"/, 'the code has no paper of its own');
  assert.doesNotMatch(renderer, /qrOnPhoto/, 'the code is drawn onto the photograph again');
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.inv-pass {'), css.indexOf('.inv-btn {'));
  assert.doesNotMatch(block, /rgba\(255, 255, 255/, 'a white veil is back over the photograph');
});
