/**
 * The colour reaches the whole outfit.
 *
 * "also the colors of the clothes are not fully coated." The figures on the
 * dress code page are cut into two layers: the garment as its shading alone,
 * which the page fills with the colour the family picked, and the parts that
 * keep their colour as drawn. A shirt's trousers had been put in the second
 * layer — so on her invitation a sage shirt stood over cream chinos, a blue
 * shirt over cream chinos, and the ladies wore a white blouse with the only
 * coloured thing on them their trousers. The colour reached less than half of
 * some figures.
 *
 * A whole outfit is one garment. What stays as drawn is what is not the
 * garment: the white shirt and tie inside a coat, a bow tie, the shirt sleeves
 * under a boy's waistcoat, a leg through a slit. `coat` is measured at the cut
 * (scripts/wardrobe/) and kept in the registry, so a future recut that leaves
 * half a figure uncoloured fails here rather than on her page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WARDROBE } from '../src/lib/attire-art';

/** A coat and a waistcoat are worn over a shirt, and a slit shows a leg. */
const OVER_SOMETHING = new Set(['tuxedo', 'tuxedo-2', 'suit-cream', 'boy-tuxedo', 'boy-suit-navy', 'boy-vest', 'boy-vest-blue', 'gown-slit', 'gown-slip-slit']);

test('every garment says how much of it the picked colour reaches', () => {
  assert.equal(WARDROBE.length, 109);
  for (const d of WARDROBE) {
    assert.equal(typeof d.coat, 'number', `${d.id} has no coat`);
    assert.ok(d.coat! > 0 && d.coat! <= 1, `${d.id}: ${d.coat}`);
  }
});

test('an outfit is coloured whole, not from the waist up', () => {
  for (const d of WARDROBE) {
    if (OVER_SOMETHING.has(d.id)) continue;
    assert.ok(d.coat! >= 0.95, `${d.id} takes the colour on only ${Math.round(d.coat! * 100)}% of the figure`);
  }
  // the four gentlemen and the two ladies on her christening: all of them, once 0.47–0.65
  for (const id of ['shirt-short-sage', 'white-shirt', 'shirt-short-cream', 'shirt-blue', 'blouse-trousers']) {
    assert.equal(WARDROBE.find((d) => d.id === id)!.coat, 1, `${id} is coloured end to end`);
  }
});

test('and what is worn over something else still keeps what is underneath', () => {
  for (const id of OVER_SOMETHING) {
    const d = WARDROBE.find((x) => x.id === id)!;
    assert.ok(d.coat! < 0.95, `${id} is meant to show a shirt, a tie or a leg`);
    assert.ok(d.coat! >= 0.8, `${id} still takes the colour on most of the figure, not ${d.coat}`);
  }
});
