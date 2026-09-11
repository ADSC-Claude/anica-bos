import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, familyPalette, colourFamilies, lightness, READABLE_INK } from '../src/lib/palette';

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
