/**
 * The child's name is two answers, because her cover sets it at two sizes:
 * the given names large in script, the surname small and bold underneath.
 *
 * Asked as one "full name" it came back as one string, and all of it went
 * into the big line — "the first name and last name is same size therefore
 * it doesnt fit the space for it". So the form asks twice, and everything
 * that reads the name has to agree about which half it wants.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valueAt } from '../src/lib/design';
import { fieldsFor, FIT } from '../src/lib/sections';
import { CHRISTENING_PAGES } from '../src/lib/christening';
import type { Line } from '../src/lib/design';

const bigLine = { section: 'cover', field: 'childFull', show: 'given' as const };

test('the cover asks for the given names and the surname apart', () => {
  for (const occasion of ['CHRISTENING', 'COMMUNION'] as const) {
    const keys = fieldsFor('cover', occasion).map((f) => f.key);
    assert.ok(keys.includes('childFull'), `${occasion}: the given names are still asked under their old key`);
    assert.ok(keys.includes('childLast'), `${occasion}: and the surname is asked beside them`);
    assert.equal(
      keys.indexOf('childLast'),
      keys.indexOf('childFull') + 1,
      `${occasion}: the surname follows the given names — one name, two boxes, next to each other`,
    );
  }
  assert.ok(FIT['cover.childLast'], 'and it is given a length, like every other box on a drawn page');
});

test('the surname is no longer asked a second time in the Parents part', () => {
  for (const occasion of ['CHRISTENING', 'COMMUNION'] as const) {
    const keys = fieldsFor('parents', occasion).map((f) => f.key);
    assert.ok(!keys.includes('familyName'), `${occasion}: one question, not two`);
  }
});

test('the big line takes the given names, whichever box the surname went in', () => {
  // the way it is asked now
  assert.equal(
    valueAt({ cover: { childFull: 'Lucas Andrei', childLast: 'Reyes - Cruz' } }, bigLine),
    'Lucas Andrei',
  );
  // a family who typed the whole name into the first box anyway
  assert.equal(
    valueAt({ cover: { childFull: 'Lucas Andrei Reyes - Cruz', childLast: 'Reyes - Cruz' } }, bigLine),
    'Lucas Andrei',
  );
  // written before the question moved: the surname is still in Parents
  assert.equal(
    valueAt({ cover: { childFull: 'Lucas Andrei Reyes - Cruz' }, parents: { familyName: 'Reyes - Cruz' } }, bigLine),
    'Lucas Andrei',
  );
  // the cover's own answer wins over the old one
  assert.equal(
    valueAt({ cover: { childFull: 'Lucas Andrei Cruz', childLast: 'Cruz' }, parents: { familyName: 'Reyes - Cruz' } }, bigLine),
    'Lucas Andrei',
  );
  // nothing to take off, and nothing taken off
  assert.equal(valueAt({ cover: { childFull: 'Lucas Andrei' } }, bigLine), 'Lucas Andrei');
  assert.equal(
    valueAt({ cover: { childFull: 'Lucas Andrei Santos', childLast: 'Reyes - Cruz' } }, bigLine),
    'Lucas Andrei Santos',
    'a child who does not carry that surname keeps the whole of their name',
  );
});

test('the surname lines read the cover first and the old field after it', () => {
  const boxes: { id: string; lines: Line[] }[] = [];
  for (const page of CHRISTENING_PAGES) {
    for (const el of page.elements ?? []) {
      if (el.id !== 'cover-family' && el.id !== 'inv-family') continue;
      const lines = 'lines' in el ? el.lines : undefined;
      assert.ok(lines, `${el.id} is a box of writing`);
      boxes.push({ id: el.id, lines });
    }
  }
  assert.equal(boxes.length, 2, 'the cover and the ceremony page each carry one');
  for (const el of boxes) {
    const fields = (el.lines[0]?.sources ?? []).map((s) => ('bind' in s ? `${s.bind.section}.${s.bind.field}` : ''));
    assert.deepEqual(fields, ['cover.childLast', 'parents.familyName'], `${el.id} tries the cover's answer, then the one written before the move`);
  }
});
