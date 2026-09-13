import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seatingStats, seatRows } from '../src/lib/seating';
import { TABLE_SHAPES, TABLE_SHAPE_LABELS, tableShape } from '../src/lib/guests';

/**
 * The three numbers at the top of the Seating chart tab, and the rows on each
 * table card. Everything counts through seatsHeld, so the chart cannot
 * disagree with the guest list or the desk about who is holding what.
 */
const tables = [{ id: 't1', capacity: 8 }, { id: 't2', capacity: 4 }];

test('the counters: tables, seats taken, chairs still empty', () => {
  const s = seatingStats(tables, [
    // waiting: holds what was set aside
    { tableId: 't1', seatsAllotted: 2, response: null },
    // came alone: two places released
    { tableId: 't1', seatsAllotted: 3, response: { response: 'ACCEPT', seats: 1 } },
    // not coming: holds nothing
    { tableId: 't2', seatsAllotted: 4, response: { response: 'DECLINE', seats: 4 } },
    // not seated: counts nowhere
    { tableId: null, seatsAllotted: 2, response: null },
  ]);
  assert.equal(s.tables, 2);
  assert.equal(s.seated, 3);
  assert.equal(s.empty, 9, 'five left at the eight, four at the four');
  assert.deepEqual(s.byTable, { t1: { seated: 3, capacity: 8 }, t2: { seated: 0, capacity: 4 } });
});

test('what the couple settled on counts, not what the guest claimed', () => {
  const s = seatingStats([{ id: 't1', capacity: 10 }], [{ tableId: 't1', seatsAllotted: 1, response: { response: 'ACCEPT', seats: 6, seatsApproved: 2 } }]);
  assert.equal(s.seated, 2);
  assert.equal(s.empty, 8);
});

test('a table with more people than chairs has no empty seats, not a negative number', () => {
  const s = seatingStats([{ id: 't1', capacity: 2 }], [
    { tableId: 't1', seatsAllotted: 2, response: null },
    { tableId: 't1', seatsAllotted: 2, response: { response: 'ACCEPT', seats: 2 } },
  ]);
  assert.equal(s.seated, 4);
  assert.equal(s.empty, 0);
  assert.equal(s.byTable.t1.seated, 4, 'the card reads 4/2 and turns red');
});

test('nothing to count is nought everywhere, and a guest at a table that is gone counts nowhere', () => {
  assert.deepEqual(seatingStats([], []), { tables: 0, seated: 0, empty: 0, byTable: {} });
  const s = seatingStats(tables, [{ tableId: 'gone', seatsAllotted: 5, response: null }]);
  assert.equal(s.seated, 0);
  assert.equal(s.empty, 12);
});

test('seat rows: a party takes as many rows as it holds, the rest are empty chairs', () => {
  const couple = { name: 'Mr. & Mrs. Dela Cruz', seatsAllotted: 2, response: null };
  const alone = { name: 'Ninong Fred', seatsAllotted: 3, response: { response: 'ACCEPT' as const, seats: 1 } };
  const rows = seatRows(5, [couple, alone]);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.seat), [1, 2, 3, 4, 5]);
  assert.deepEqual(rows.map((r) => r.guest?.name ?? '—'), ['Mr. & Mrs. Dela Cruz', 'Mr. & Mrs. Dela Cruz', 'Ninong Fred', '—', '—']);
  assert.deepEqual(rows.map((r) => r.first), [true, false, true, false, false], 'the name on the first row, "with" on the rest');
});

test('a guest who declined keeps one row so they can be found and moved, and a full table runs past its chairs', () => {
  const declined = { name: 'Tita Baby', seatsAllotted: 4, response: { response: 'DECLINE' as const, seats: 4 } };
  const rows = seatRows(1, [declined, { name: 'Kuya Jun', seatsAllotted: 1, response: null }]);
  assert.equal(rows.length, 2, 'one chair, two rows: nobody is hidden');
  assert.equal(rows[0].guest?.name, 'Tita Baby');
  assert.equal(rows[0].first, true);
  assert.equal(rows[1].guest?.name, 'Kuya Jun');
  assert.deepEqual(seatRows(0, []), []);
  assert.equal(seatRows(3, []).filter((r) => r.guest === null).length, 3, 'an empty table is all chairs');
});

test('a table is round unless it is one of the shapes the chart draws', () => {
  assert.deepEqual([...TABLE_SHAPES], ['round', 'rectangle', 'long']);
  for (const s of TABLE_SHAPES) {
    assert.equal(tableShape(s), s);
    assert.ok(TABLE_SHAPE_LABELS[s].length > 0, `${s} has a label`);
  }
  assert.equal(tableShape('oval'), 'round');
  assert.equal(tableShape(''), 'round');
  assert.equal(tableShape(undefined), 'round');
  assert.equal(tableShape(null), 'round');
});

test('the locked sentences name the package the feature table says, not one written in', () => {
  // Both said Signature for a while after the seating chart and check-in moved
  // up to Luxury. Read off FEATURE_MIN_TIER they cannot drift again.
  const guests = readFileSync(new URL('../src/lib/guests.ts', import.meta.url), 'utf8');
  assert.match(guests, /const seatingLocked = `[^`]*\$\{TIER_LABELS\[FEATURE_MIN_TIER\.seating\]\}/);
  assert.match(guests, /const checkinLocked = `[^`]*\$\{TIER_LABELS\[FEATURE_MIN_TIER\.checkin\]\}/);
  // and a saved shape goes through the same rule the chart draws by
  const i = guests.indexOf('export async function saveTable(');
  assert.notEqual(i, -1);
  assert.match(guests.slice(i, i + 1200), /tableShape\(input\.shape\)/, 'a shape is stored unchecked');
});
