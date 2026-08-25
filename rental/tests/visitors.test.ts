import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeRows, fillDays, lastDayKeys } from '../src/lib/vercel-analytics';

test('shapeRows reads the dimension column and tolerates either count spelling', () => {
  const rows = shapeRows('requestPath', [
    { requestPath: '/', pageviews: 12, visitors: 9 },
    { requestPath: '/stays', count: 5, visitors: 4 },
  ]);
  assert.deepEqual(rows, [
    { label: '/', views: 12, visitors: 9 },
    { label: '/stays', views: 5, visitors: 4 },
  ]);
});

test('shapeRows survives junk without throwing', () => {
  assert.deepEqual(shapeRows('country', undefined), []);
  assert.deepEqual(shapeRows('country', 'not an array'), []);
  const rows = shapeRows('country', [{ country: null }, {}, null]);
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.equal(r.label, '(none)');
    assert.equal(r.views, 0);
    assert.equal(r.visitors, 0);
  }
});

test('fillDays fills the gaps and matches dates by their day prefix', () => {
  const days = ['2026-08-23', '2026-08-24', '2026-08-25'];
  const filled = fillDays(days, [
    // The API may spell a day as a full timestamp; the prefix still matches.
    { label: '2026-08-24T00:00:00.000Z', views: 7, visitors: 5 },
  ]);
  assert.deepEqual(
    filled.map((d) => d.views),
    [0, 7, 0],
  );
  assert.deepEqual(
    filled.map((d) => d.label),
    days,
  );
});

test('lastDayKeys ends today and counts back without skipping', () => {
  const keys = lastDayKeys(3, new Date('2026-08-25T10:00:00Z'));
  assert.deepEqual(keys, ['2026-08-23', '2026-08-24', '2026-08-25']);
});
