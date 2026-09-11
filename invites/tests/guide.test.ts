import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SHAPES, KINDS, RULES, pixelsFor, canvaSize, shippedExamples } from '../src/lib/guide';
import { ONE_SCREEN, LEGIBLE_CQW, MAX_GROUND, BABYBLUE_GROUNDS } from '../src/lib/design';

/**
 * The Guide is only worth having if it cannot be wrong. Every number in it
 * is read from the constants the studio and the renderer actually work in,
 * so these tests are about that chain holding rather than about the words.
 */

test('the sizes are the page’s own proportions, at a width a phone can use', () => {
  const screen = PAGE_SHAPES.find((s) => s.key === 'screen')!;
  assert.equal(screen.ratio, ONE_SCREEN);
  assert.deepEqual(pixelsFor(screen.ratio).small, [1080, Math.round(1080 * ONE_SCREEN)]);
  assert.deepEqual(pixelsFor(screen.ratio).small, [1080, 1919]);
  assert.equal(pixelsFor(screen.ratio).large[0], MAX_GROUND);
  // and every shape is taller than it is wide, which a page always is
  for (const s of PAGE_SHAPES) assert.ok(s.ratio > 1, s.key);
  // the three-screen shape is the one the shipped grounds are
  assert.equal(PAGE_SHAPES.find((s) => s.key === 'three')!.ratio, BABYBLUE_GROUNDS.cover.ratio);
});

test('a Canva custom size is the same pair of numbers, and each shipped ground has one', () => {
  assert.equal(canvaSize(ONE_SCREEN), '1080 × 1919 px');
  const shipped = shippedExamples();
  assert.equal(shipped.length, Object.keys(BABYBLUE_GROUNDS).length);
  for (const e of shipped) {
    assert.match(e.size, /^\d{3,4} × \d{3,4} px$/, e.name);
    // the size quoted is this ground's own proportion, not a rounded guess
    const [, h] = e.size.match(/× (\d+) px/)!;
    assert.equal(Number(h), Math.round(1080 * e.ratio), e.name);
  }
});

test('the guide says the numbers the checklist enforces', () => {
  const all = RULES.join(' ');
  assert.match(all, new RegExp(String(LEGIBLE_CQW)), 'the legible floor');
  assert.match(all, new RegExp(String(MAX_GROUND)), 'the width a ground is stored at');
  assert.match(all, /90%/, 'the band a phone keeps');
  // and it covers the four kinds of page a design can carry
  assert.equal(KINDS.length, 4);
  assert.ok(KINDS.every((k) => k.label && k.wants.length > 40));
});
