import test from 'node:test';
import assert from 'node:assert/strict';
import { OCCASIONS, templateOccasions, templateSuits, offeredFor } from '../src/lib/occasions';

/** A design's home occasion comes first; the ticked ones follow in launch order, never repeated. */
test('templateOccasions: home first, the ticked ones in launch order, no repeats', () => {
  assert.deepEqual(templateOccasions({ occasion: 'WEDDING' }), ['WEDDING']);
  assert.deepEqual(templateOccasions({ occasion: 'WEDDING', occasions: [] }), ['WEDDING']);
  assert.deepEqual(templateOccasions({ occasion: 'WEDDING', occasions: ['ENGAGEMENT', 'WEDDING', 'ANNIVERSARY'] }), ['WEDDING', 'ANNIVERSARY', 'ENGAGEMENT']);
  // a design whose home occasion launches late still leads with it
  assert.deepEqual(templateOccasions({ occasion: 'CORPORATE', occasions: ['WEDDING'] }), ['CORPORATE', 'WEDDING']);
  const order = OCCASIONS.map((o) => o.key);
  assert.ok(order.indexOf('ANNIVERSARY') < order.indexOf('ENGAGEMENT'));
});

test('templateSuits: the home occasion and every ticked one, nothing else', () => {
  const t = { occasion: 'CHRISTENING' as const, occasions: ['BABY_SHOWER' as const] };
  assert.equal(templateSuits(t, 'CHRISTENING'), true);
  assert.equal(templateSuits(t, 'BABY_SHOWER'), true);
  assert.equal(templateSuits(t, 'WEDDING'), false);
  assert.equal(templateSuits({ occasion: 'WEDDING' }, 'WEDDING'), true);
});

test('offeredFor: the filter reads the home column and the ticked list', () => {
  assert.deepEqual(offeredFor('DEBUT'), { OR: [{ occasion: 'DEBUT' }, { occasions: { has: 'DEBUT' } }] });
});
