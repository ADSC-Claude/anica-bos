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
  // the long shape is the one the shipped grounds are
  assert.equal(PAGE_SHAPES.find((s) => s.key === 'long')!.ratio, BABYBLUE_GROUNDS.cover.ratio);
});

/**
 * A label that overstates its own height is worse than no label: this list
 * is what somebody sizes a Canva page from, and a row reading "Three
 * screens" against a ratio of 2.989 sent them to a page two thirds the
 * height they asked for. It had been wrong since the list was written.
 *
 * So every label that counts screens is checked against its own ratio. A
 * label that counts none is exempt — a shape can be named for what it is
 * for rather than for how many screens it happens to be — but one that puts
 * a number in front of a reader has to mean it.
 */
test('a shape that names a number of screens is that many screens', () => {
  const WORDS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    'one and a half': 1.5, 'one and two-thirds': 5 / 3,
  };
  for (const shape of PAGE_SHAPES) {
    const said = shape.label.toLowerCase().replace(/\s+screens?$/, '');
    const many = WORDS[said];
    if (many === undefined) continue;
    const is = shape.ratio / ONE_SCREEN;
    assert.ok(
      Math.abs(is - many) < 0.03,
      `"${shape.label}" is ${is.toFixed(2)} screens, not ${many}`,
    );
  }
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
