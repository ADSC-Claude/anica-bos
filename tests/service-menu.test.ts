/**
 * The public price list groups services under headings. A service can be listed
 * under more than one, which is display-only — these cover the merge, not the
 * accounting, which is guaranteed by a service having exactly one categoryId.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceMenu } from '../src/lib/service-menu';

const svc = (id: string, name: string, sortRank: number) => ({ id, name, sortRank });

test('an also-listed service appears under both headings', () => {
  const foot = svc('foot30', 'Foot Massage (30 min)', 9);
  const menu = buildServiceMenu([
    { id: 'massage', name: 'Massage', services: [svc('swed', 'Swedish', 1), foot], alsoListed: [] },
    { id: 'addons', name: 'Add-ons', services: [svc('sauna', 'Sauna', 13)], alsoListed: [foot] },
  ]);

  assert.deepEqual(
    menu.map((c) => c.services.map((s) => s.id)),
    [['swed', 'foot30'], ['foot30', 'sauna']],
  );
});

test('it sorts into position rather than being appended', () => {
  const [addons] = buildServiceMenu([
    {
      id: 'addons',
      name: 'Add-ons',
      services: [svc('a', 'Late', 20), svc('b', 'Later', 30)],
      alsoListed: [svc('c', 'Early', 10)],
    },
  ]);
  assert.deepEqual(addons.services.map((s) => s.id), ['c', 'a', 'b']);
});

test('equal ranks fall back to name, so the order does not shift between loads', () => {
  const [cat] = buildServiceMenu([
    {
      id: 'x',
      name: 'X',
      services: [svc('z', 'Zebra', 0), svc('a', 'Aloe', 0)],
      alsoListed: [],
    },
  ]);
  assert.deepEqual(cat.services.map((s) => s.id), ['a', 'z']);
});

test('a service listed under its own primary is shown once', () => {
  const dup = svc('dup', 'Duplicated', 1);
  const [cat] = buildServiceMenu([
    { id: 'x', name: 'X', services: [dup], alsoListed: [dup] },
  ]);
  assert.equal(cat.services.length, 1);
});

test('empty categories are dropped', () => {
  const menu = buildServiceMenu([
    { id: 'empty', name: 'Empty', services: [], alsoListed: [] },
    { id: 'full', name: 'Full', services: [svc('s', 'Something', 1)], alsoListed: [] },
  ]);
  assert.deepEqual(menu.map((c) => c.id), ['full']);
});
