import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVED, lost, restoreCodes, type Moved } from '../src/lib/grandfather';
import { ADDON_FEATURE, FEATURE_MIN_TIER, hasFeature, entitled } from '../src/lib/tiers';
import { ADDONS } from '../src/lib/addon-catalogue';

const BEFORE = new Date('2026-09-01T00:00:00Z');
const AFTER = new Date('2026-09-30T00:00:00Z');

test('a Signature invitation sold before the move gets back what it lost', () => {
  const inv = { tier: 'COMPLETE' as const, addOns: [], createdAt: BEFORE };
  assert.deepEqual(lost(inv).map((m) => m.feature).sort(), ['checkin', 'photoSharing', 'seating']);
  assert.deepEqual(restoreCodes(inv).sort(), ['QR_CHECKIN', 'SEATING_VIEWER']);
});

test('a Signature invitation sold after the move is owed nothing', () => {
  // It was never sold the seating chart, so handing it one is a gift nobody
  // agreed to — and on a hundred rows, a gift nobody can explain later.
  const inv = { tier: 'COMPLETE' as const, addOns: [], createdAt: AFTER };
  assert.deepEqual(lost(inv), []);
  assert.deepEqual(restoreCodes(inv), []);
});

test('nothing is given back twice', () => {
  // The run is safe to repeat: once the codes are on, the invitation has the
  // features, so it is no longer owed them.
  const inv = { tier: 'COMPLETE' as const, addOns: ['SEATING_VIEWER', 'QR_CHECKIN'], createdAt: BEFORE };
  assert.deepEqual(lost(inv).map((m) => m.feature), ['photoSharing']);
  assert.deepEqual(restoreCodes(inv), []);

  // and a couple who bought the add-on themselves is not counted as owed it
  const bought = { tier: 'COMPLETE' as const, addOns: ['SEATING_VIEWER'], createdAt: BEFORE };
  assert.equal(lost(bought).some((m) => m.feature === 'seating'), false);
});

test('packages that never had the feature, and packages that still do, are left alone', () => {
  // Basic and Standard never had any of the three.
  for (const tier of ['BASIC', 'STANDARD'] as const) {
    assert.deepEqual(lost({ tier, addOns: [], createdAt: BEFORE }), [], tier);
  }
  // Luxury has all three today, so it lost nothing.
  assert.deepEqual(lost({ tier: 'LUXURY', addOns: [], createdAt: BEFORE }), []);
});

test('every move on record is a feature that really did move up', () => {
  // A row here claiming a feature left Signature, while the table says
  // Signature still has it, would hand out add-ons for nothing.
  for (const m of MOVED) {
    assert.ok(FEATURE_MIN_TIER[m.feature], `${m.feature} is not a feature`);
    assert.equal(hasFeature(m.was, m.feature), false, `${m.feature} did not move: ${m.was} still has it`);
    assert.ok(!Number.isNaN(Date.parse(m.on)), `${m.feature}: ${m.on} is not a date`);
  }
});

test('a code named as the way back really does grant the feature, and is for sale', () => {
  for (const m of MOVED) {
    if (m.restoreWith === null) continue;
    const grants = ADDON_FEATURE[m.restoreWith];
    assert.ok(grants, `${m.restoreWith} grants nothing`);
    assert.ok(grants.includes(m.feature), `${m.restoreWith} does not grant ${m.feature}`);
    const row = ADDONS.find((a) => a.code === m.restoreWith);
    assert.ok(row, `${m.restoreWith} is not in the catalogue`);
    assert.notEqual(row.held, true, `${m.restoreWith} is not for sale`);

    // and writing it onto an invitation is enough — the check the app makes
    assert.equal(entitled({ tier: 'COMPLETE', addOns: [m.restoreWith] }, m.feature), true);
  }
});

test('a feature with no way back is admitted, not quietly skipped', () => {
  // The shared album is the one that has no add-on. If somebody later adds a
  // code for it, this test is what reminds them to say so here — and if it
  // stays null, the script still has to report the loss rather than count it
  // fixed. Both halves matter, so both are asserted.
  const album = MOVED.find((m) => m.feature === 'photoSharing');
  assert.ok(album, 'the album move is not on record');
  if (album.restoreWith === null) {
    assert.equal(ADDON_FEATURE.PHOTO_SHARING, undefined, 'there is a code for it now — set restoreWith');
    const inv = { tier: 'COMPLETE' as const, addOns: [], createdAt: BEFORE };
    assert.ok(lost(inv).some((m) => m.feature === 'photoSharing'), 'reported');
    assert.equal(restoreCodes(inv).includes('PHOTO_SHARING'), false, 'and not pretended fixed');
  } else {
    assert.ok(ADDON_FEATURE[album.restoreWith]?.includes('photoSharing'));
  }
});

test('the rule reads the move it is given, not only the ones on record', () => {
  // So a future move is one row here, not a rewrite: this is the same logic
  // with a different history.
  const invented: Moved[] = [
    { feature: 'guestbook', was: 'STANDARD', on: '2026-09-20T00:00:00Z', restoreWith: null },
  ];
  const sold = { tier: 'STANDARD' as const, addOns: [], createdAt: BEFORE };
  assert.deepEqual(lost(sold, invented).map((m) => m.feature), ['guestbook']);
  assert.deepEqual(lost({ ...sold, createdAt: AFTER }, invented), []);
});
