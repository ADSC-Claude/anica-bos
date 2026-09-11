import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SWATCHES, familyPalette, colourFamilies, contrast, lightness, READABLE_INK } from '../src/lib/palette';

/**
 * Six colours from a family in one tap. The two things that must hold for
 * every family in the book: the ground is paler than the ink, and the ink
 * can actually be read.
 */

test('every family in the book makes a palette that can be read', () => {
  const families = colourFamilies();
  assert.ok(families.length >= 10, `only ${families.length} families`);
  for (const { key, palette: p } of families) {
    for (const role of ['bg', 'surface', 'ink', 'muted', 'accent', 'accent2'] as const) {
      assert.match(p[role], /^#[0-9a-f]{6}$/i, `${key}.${role}`);
    }
    assert.equal(p.surface, '#ffffff', `${key}: a card lifts off the page`);
    assert.ok(lightness(p.bg) > lightness(p.ink) + 0.3, `${key}: the ink does not stand off the ground`);
    assert.ok(lightness(p.ink) <= 0.36, `${key}: the ink is too pale to read`);
  }
});

test('the shape of it: palest, second palest, the middle two, darkest', () => {
  const blues = familyPalette('blues');
  const shades = [...PALETTE.find((g) => g.key === 'blues')!.swatches].sort((a, b) => lightness(b.hex) - lightness(a.hex));
  assert.equal(blues.bg, shades[0].hex, 'the ground is the palest');
  assert.equal(blues.accent2, shades[1].hex, 'the quiet accent is the second palest');
  assert.equal(blues.ink, shades[shades.length - 1].hex, 'the ink is the darkest');
  // Baby Blue is the palest blue in the book and Midnight Blue the darkest
  assert.equal(blues.bg, '#cde3fc');
  assert.equal(blues.ink, '#1c2c4b');
});

test('a family of pale shades borrows an ink that can be read', () => {
  // every neutral in the book is paler than a readable grey
  const neutrals = familyPalette('neutrals');
  assert.equal(neutrals.ink, READABLE_INK);
  const darkest = [...PALETTE.find((g) => g.key === 'neutrals')!.swatches].sort((a, b) => lightness(a.hex) - lightness(b.hex))[0];
  assert.ok(lightness(darkest.hex) > 0.36, 'the guard fired because it had to');
  // and the deep greens keep their own, because theirs is dark enough
  assert.notEqual(familyPalette('greens-deep').ink, READABLE_INK);
});

test('a family that is not in the book is refused rather than guessed at', () => {
  assert.throws(() => familyPalette('mauveish'), /No colour family/);
});


/**
 * The book as it stands, key by key and hex by hex.
 *
 * Not a test of taste — a test that a saved motif keeps its name. What an
 * invitation stores is the hex, and the page reads the name back out of the
 * book; change a hex and somebody's "Dusty Rose" quietly becomes an unnamed
 * colour, change a key and the seed stops building. The plan's next step
 * for the book is to take every family to ten shades or more from a sheet
 * the owner approves, and this is what that expansion must not disturb.
 */
const shadesOf = (key: string) => PALETTE.find((g) => g.key === key)!.swatches.map((s) => s.hex);

const BOOK = [
  'white #ffffff',
  'off-white #f7f5f0',
  'ivory #fcf8eb',
  'cream #fef5df',
  'ecru #faf1e4',
  'champagne #f0e1c9',
  'beige #ead4bf',
  'nude #ead0bd',
  'sand #dcccc0',
  'khaki #d5bfa7',
  'kaupe #cdbbaa',
  'taupe #c8b9ac',
  'greige #c5b4a6',
  'baby-pink #fbe4e7',
  'pastel-pink #fddce1',
  'blush #f8cfcc',
  'dusty-pink #f3c8c7',
  'dusty-rose #dba8a8',
  'rose-pink #e0abb3',
  'old-rose #ca9ba1',
  'mauve-pink #d4a1aa',
  'salmon #f4a99f',
  'hot-pink #f73b8e',
  'fuchsia #cc1b72',
  'red #b9202f',
  'scarlet #c81921',
  'cherry #a31727',
  'ruby #9e172f',
  'crimson #80092c',
  'burgundy #661129',
  'wine #5f1b2d',
  'maroon #582120',
  'oxblood #512120',
  'peach #fdc1a6',
  'apricot #fdbca0',
  'coral #fa9b8c',
  'salmon-orange #fba78f',
  'orange #f47940',
  'burnt-orange #c76b43',
  'terracotta #b36446',
  'rust #b55838',
  'butter-yellow #fef4c0',
  'pastel-yellow #feefac',
  'lemon #fef098',
  'canary #fddc56',
  'mustard #d5a546',
  'golden-yellow #e6b244',
  'mint #dbf3e2',
  'pastel-green #ccdcc8',
  'pistachio #c4cca9',
  'sage #a2aa8b',
  'eucalyptus #6c9385',
  'olive #727955',
  'moss #6c7550',
  'emerald #026742',
  'forest-green #1b5039',
  'hunter-green #024f3c',
  'teal #0f8288',
  'baby-blue #cde3fc',
  'powder-blue #bbd6f0',
  'sky-blue #9ec9ef',
  'dusty-blue #8fa6c7',
  'cornflower #84a3d6',
  'periwinkle #a6a2e0',
  'cobalt #1550b4',
  'royal-blue #053b99',
  'navy #1c2e56',
  'midnight-blue #1c2c4b',
  'lavender #dbc7ef',
  'lilac #d8ccf1',
  'mauve #c197ac',
  'orchid #cb93b7',
  'wisteria #c3b2e2',
  'violet #9772ad',
  'amethyst #8b599c',
  'plum #713e68',
  'eggplant #492153',
  'tan #d9b89c',
  'camel #cda480',
  'caramel #ba8d6e',
  'cinnamon #b97753',
  'mocha #7b5e4e',
  'coffee #73594b',
  'cocoa #765b4d',
  'chocolate #432a1e',
  'espresso #32231c',
  'pearl-gray #e0dfdf',
  'dove-gray #d8d7d7',
  'light-gray #cbcbcc',
  'silver-gray #b8b8b9',
  'steel-gray #8a8b8c',
  'slate #6d7073',
  'charcoal #484848',
  'graphite #454545',
  'black #000000',
  'soft-black #1a1a1a',
  'gold #dcb46b',
  'champagne-gold #e9d5bf',
  'rose-gold #e8baa4',
  'silver-metallic #c4c6c8',
  'bronze #c8824d',
  'copper #d89b6a',
];

test('the book keeps every key and every hex it had', () => {
  const now = PALETTE.flatMap((g) => g.swatches.map((s) => `${s.key} ${s.hex}`));
  for (const line of BOOK) assert.ok(now.includes(line), `gone from the book: ${line}`);
  assert.equal(new Set(PALETTE.flatMap((g) => g.swatches.map((s) => s.key))).size, now.length, 'two swatches share a key');
  // adding is allowed; the families are meant to grow
  assert.ok(now.length >= BOOK.length);
});

test('every palette the button makes can carry its own headings', () => {
  /*
   * Found by measuring, two phases after the button shipped: nine of the
   * thirteen families made a heading nobody could read, because the accent
   * was taken from the middle of the family by lightness. The accent is not
   * only headings — .inv-eyebrow sets eleven-pixel words in it and .inv-btn
   * puts white words on it — so it is asked both questions here.
   */
  for (const { key, palette: p } of colourFamilies()) {
    assert.ok(contrast(p.ink, p.bg) >= 4.5, `${key}: body words at ${contrast(p.ink, p.bg).toFixed(1)} on the paper`);
    assert.ok(contrast(p.muted, p.bg) >= 4.5, `${key}: the muted ink at ${contrast(p.muted, p.bg).toFixed(1)}`);
    assert.ok(contrast(p.accent, p.bg) >= 4.5, `${key}: the eyebrow at ${contrast(p.accent, p.bg).toFixed(1)} on the paper`);
    assert.ok(contrast(p.accent, '#ffffff') >= 4.5, `${key}: a button's white label at ${contrast(p.accent, '#ffffff').toFixed(1)}`);
    assert.notEqual(p.accent, p.muted, `${key}: the heading is the caption`);
  }
});

test('a family with nothing deep enough has its own colour taken down, not replaced', () => {
  // Every yellow in the book is pale, so none of them can carry an eyebrow.
  const yellows = familyPalette('yellows');
  const shades = shadesOf('yellows');
  assert.ok(!shades.includes(yellows.accent), 'it had to be derived');
  assert.ok(contrast(yellows.accent, yellows.bg) >= 4.5);
  // and it is still yellow: the red and green channels lead, as in the family
  const n = parseInt(yellows.accent.slice(1), 16);
  assert.ok(((n >> 16) & 255) > (n & 255) && ((n >> 8) & 255) > (n & 255), `${yellows.accent} is not a yellow`);
  // where a family has a deep shade of its own, that shade is used as it is
  assert.ok(shadesOf('purples').includes(familyPalette('purples').accent));
  assert.ok(shadesOf('browns').includes(familyPalette('browns').accent));
});


/** The distance between two colours as the eye roughly sees it, in RGB. */
const apart = (a: string, b: string) => {
  const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [p, q] = [rgb(a), rgb(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

test('every family is a range to pick from, not a choice between two', () => {
  /*
   * Ten shades a family, which is what the plan asks of the book: a couple
   * matching a gown to a sash to a table runner needs the steps in between,
   * and light green used to have four.
   */
  for (const g of PALETTE) {
    if (g.key === 'blacks') continue;
    assert.ok(g.swatches.length >= 10, `${g.key} has only ${g.swatches.length}`);
  }
  assert.equal(PALETTE.length, 13);
  assert.ok(SWATCHES.length >= 135, `${SWATCHES.length} swatches`);
});

test('blacks stop at six, because ten blacks is the same square ten times', () => {
  /*
   * The one family the ten-shade rule does not fit, and the numbers are why:
   * the whole family lives inside a contrast ratio of about 1.5, and no two
   * neighbours are even 1.2 apart, where the standards call two colours
   * *different* at 3. Six is where a person can still tell one from the next
   * on a phone in daylight.
   */
  const blacks = shadesOf('blacks');
  assert.equal(blacks.length, 6);
  const sorted = [...blacks].sort((a, b) => lightness(a) - lightness(b));
  assert.ok(contrast(sorted[0], sorted[sorted.length - 1]) < 2, 'the whole family is one colour to the eye');
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(contrast(sorted[i - 1], sorted[i]) < 1.3, `${sorted[i - 1]} and ${sorted[i]} are further apart than expected`);
  }
  // and six is enough to make a palette, where two was not: under three
  // shades a family is not offered at all
  assert.ok(colourFamilies().some((f) => f.key === 'blacks'), 'blacks should now make a palette');
  const mono = familyPalette('blacks');
  assert.equal(mono.ink, '#000000');
  assert.ok(contrast(mono.ink, mono.bg) >= 4.5);
});

test('no two swatches are the same colour, and no new one crowds an old one', () => {
  // What an invitation stores is the hex and the page reads the name back
  // out of the book, so two swatches on one hex would silently rename one.
  const hexes = SWATCHES.map((s) => s.hex);
  assert.equal(new Set(hexes).size, hexes.length, 'two swatches share a hex');
  /*
   * And a shade added to a family must not sit on top of one she chose. The
   * bar is her own: the closest pair in the book before any of this was
   * Coffee and Cocoa, about 4 apart in RGB, so nothing new may be closer to
   * its neighbour than that.
   */
  const HERS = 4;
  for (const g of PALETTE) {
    for (const s of g.swatches.filter((x) => x.added)) {
      for (const other of g.swatches) {
        if (other.key === s.key) continue;
        assert.ok(apart(s.hex, other.hex) > HERS, `${s.name} crowds ${other.name} (${apart(s.hex, other.hex).toFixed(1)})`);
      }
    }
  }
});

test('a shade added to the book is marked as added, so the sheet can show it', () => {
  const added = SWATCHES.filter((s) => s.added);
  assert.equal(added.length, SWATCHES.length - BOOK.length, 'the marked ones are exactly the ones the snapshot does not hold');
  // and nothing from her original sheet is marked
  for (const line of BOOK) {
    const key = line.split(' ')[0];
    assert.equal(SWATCHES.find((s) => s.key === key)?.added, undefined, `${key} is hers, not ours`);
  }
});
