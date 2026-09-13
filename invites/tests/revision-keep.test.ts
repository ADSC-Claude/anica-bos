import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revisionsToDrop, KEEP_RECENT, KEEP_DAYS } from '../src/lib/revision-keep';

const at = (iso: string) => new Date(iso);
const now = at('2026-09-14T12:00:00Z');

test('the last thirty versions are kept whole, whatever day they fall on', () => {
  // forty saves in one afternoon: the newest thirty stay, the older ten collapse to that day's one
  const revs = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, createdAt: new Date(now.getTime() - i * 60_000) }));
  const drop = revisionsToDrop(revs, now);
  assert.equal(drop.length, 9, 'ten beyond the thirty on one day: the newest of them stays, nine go');
  for (let i = 0; i < KEEP_RECENT; i++) assert.ok(!drop.includes(`r${i}`), `r${i} is within the thirty`);
  assert.ok(!drop.includes('r30'), 'the newest of the older ones is that day’s keeper');
});

test('beyond the thirty, one version a day stays for sixty days, and nothing older', () => {
  const revs = [
    ...Array.from({ length: KEEP_RECENT }, (_, i) => ({ id: `new${i}`, createdAt: new Date(now.getTime() - i * 1000) })),
    { id: 'd1a', createdAt: at('2026-09-10T02:00:00Z') },
    { id: 'd1b', createdAt: at('2026-09-10T01:00:00Z') },
    { id: 'd2', createdAt: at('2026-09-01T09:00:00Z') },
    { id: 'old', createdAt: new Date(now.getTime() - (KEEP_DAYS + 1) * 86_400_000) },
  ];
  const drop = revisionsToDrop(revs, now);
  assert.deepEqual(drop.sort(), ['d1b', 'old'], 'the older of the two on the 10th goes, the one past sixty days goes, the rest stay');
});

test('days are Manila days: two saves either side of Manila midnight are two days', () => {
  const revs = [
    ...Array.from({ length: KEEP_RECENT }, (_, i) => ({ id: `new${i}`, createdAt: new Date(now.getTime() - i * 1000) })),
    { id: 'lateEve', createdAt: at('2026-09-09T15:30:00Z') }, // 23:30 Manila on the 9th
    { id: 'earlyMorn', createdAt: at('2026-09-09T16:30:00Z') }, // 00:30 Manila on the 10th
  ];
  assert.deepEqual(revisionsToDrop(revs, now), [], 'one each side of midnight, both kept');
});

test('nothing to drop when there is nothing beyond the thirty', () => {
  assert.deepEqual(revisionsToDrop([], now), []);
  assert.deepEqual(revisionsToDrop([{ id: 'a', createdAt: now }], now), []);
});
