import test from 'node:test';
import assert from 'node:assert/strict';
import { framesFromDifference, mergeBoxes, overlap, photoFromRect, CHANGED, type Pixels, type Rect } from '../src/lib/importing';

/**
 * The two-picture import, against a fixture pair whose rectangles are known.
 *
 * The pair is made here rather than kept as two files, because what the
 * reader has to survive is the *difference* between two exports of one page:
 * the compression noise, the edge softening, and the fact that everything
 * except the photographs is meant to be identical and never quite is. All of
 * that is reproducible arithmetic, and a checked-in pair of PNGs would hide
 * it behind a decoder.
 */

const W = 800, H = 1200;   // 1% is 8px across and 12px down, so whole percents land exactly

/** The same every run: a test that passes four times in five is not a test. */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

type Paint = { rect: Rect; rgb: [number, number, number] };

function page(extra: Paint[], seed: number): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  const rnd = noise(seed);
  // The page itself: cream, with a band of "writing" near the foot and a
  // hairline border — both in every export, so neither may come back.
  const paint: Paint[] = [
    { rect: { left: 0, top: 0, width: 100, height: 100 }, rgb: [246, 241, 232] },
    { rect: { left: 20, top: 82, width: 60, height: 3 }, rgb: [60, 55, 48] },
    { rect: { left: 30, top: 88, width: 40, height: 2 }, rgb: [60, 55, 48] },
    ...extra,
  ];
  for (const { rect, rgb } of paint) {
    const x0 = Math.round((rect.left / 100) * W), x1 = Math.round(((rect.left + rect.width) / 100) * W);
    const y0 = Math.round((rect.top / 100) * H), y1 = Math.round(((rect.top + rect.height) / 100) * H);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  }
  // What a second export of the same page costs: a few levels either way on
  // every channel, well under the threshold and different in each file.
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.round((rnd() - 0.5) * (CHANGED - 2));
    data[i] += n; data[i + 1] += n; data[i + 2] += n;
  }
  return { data, width: W, height: H };
}

const FRAMES: Paint[] = [
  { rect: { left: 8, top: 6, width: 40, height: 20 }, rgb: [120, 130, 140] },
  { rect: { left: 54, top: 6, width: 38, height: 20 }, rgb: [90, 80, 70] },
  { rect: { left: 8, top: 34, width: 84, height: 30 }, rgb: [150, 120, 100] },
];

test('the difference between the two exports is the frames, within a percent', () => {
  const plain = page([], 7);
  const filled = page(FRAMES, 91);
  const found = framesFromDifference(plain, filled);
  assert.equal(found.length, FRAMES.length);
  // reading order: the two across the top, then the wide one below
  for (const [i, want] of FRAMES.map((f) => f.rect).entries()) {
    const got = found[i];
    for (const side of ['left', 'top', 'width', 'height'] as const) {
      assert.ok(Math.abs(got[side] - want[side]) <= 1, `${side} of frame ${i + 1}: wanted ${want[side]}, got ${got[side]}`);
    }
  }
});

test('nothing comes back when the two exports are the same page', () => {
  assert.deepEqual(framesFromDifference(page([], 7), page([], 91), { }), []);
});

test('a speck is noise, not a frame', () => {
  const speck: Paint = { rect: { left: 40, top: 50, width: 2, height: 1 }, rgb: [20, 20, 20] };
  assert.deepEqual(framesFromDifference(page([], 3), page([speck], 4)), []);
});

test('the two pictures have to be the same size', () => {
  const small: Pixels = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
  assert.throws(() => framesFromDifference(page([], 1), small), /different sizes/);
});

test('a picture whose placeholders were never deleted reads as one big frame, not the page', () => {
  // the whole page repainted: one rectangle, which is the honest answer, and
  // the confirm screen is where somebody says that is not a frame
  const all: Paint = { rect: { left: 0, top: 0, width: 100, height: 100 }, rgb: [10, 10, 10] };
  const found = framesFromDifference(page([], 5), page([all], 6));
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], { left: 0, top: 0, width: 100, height: 100 });
});

test('boxes that are mostly the same box become one, and the rest stay apart', () => {
  const big: Rect = { left: 10, top: 10, width: 40, height: 40 };
  const inside: Rect = { left: 12, top: 12, width: 34, height: 34 };   // almost all of it is in `big`
  const beside: Rect = { left: 45, top: 10, width: 40, height: 40 };   // an eighth of it is
  assert.ok(overlap(big, inside) > 0.75);
  assert.ok(overlap(big, beside) < 0.75);
  const out = mergeBoxes([big, inside, beside]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], big);
  assert.deepEqual(out[1], beside);
});

test('boxes that only touch are two boxes', () => {
  const a: Rect = { left: 0, top: 0, width: 10, height: 10 };
  const b: Rect = { left: 10, top: 0, width: 10, height: 10 };
  assert.equal(overlap(a, b), 0);
  assert.equal(mergeBoxes([a, b]).length, 2);
});

test('a proposed rectangle becomes a frame at the same place, asked for', () => {
  // a page half again as tall as it is wide; a box 40% across and 20% down
  const el = photoFromRect('shot-1', { left: 10, top: 20, width: 40, height: 20 }, 1.5, { section: 'gallery', field: 'photos', index: 0 });
  assert.equal(el.kind, 'photo');
  assert.equal(el.x, 30);          // the centre, because a frame is placed from its middle
  assert.equal(el.y, 30);
  assert.equal(el.w, 40);
  assert.equal(el.anchor, 'centre');
  assert.equal(el.ask, true);
  // 20% of 1.5 widths tall over 40% of one width wide
  assert.equal(el.aspect, 0.75);
});
