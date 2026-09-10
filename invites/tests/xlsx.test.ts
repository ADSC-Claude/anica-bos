import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx, looksLikeXlsx, columnIndex } from '../src/lib/xlsx';

// tests/fixtures/guest-list.xlsx is written by Python's zipfile — a different
// implementation from the one reading it here, so this is a real cross-check
// rather than a reader agreeing with its own writer. It carries the awkward
// parts on purpose: an ampersand, an accent, a string Excel split into two
// runs, an inline string, plain numbers, a row that skips a column, and a
// trailing empty row.
const workbook = () => readFileSync(new URL('./fixtures/guest-list.xlsx', import.meta.url));

test('a workbook reads as the rows a person typed', () => {
  assert.deepEqual(readXlsx(workbook()), [
    ['Name', 'Group', 'Seats', 'Phone'],
    ['Mr. & Mrs. Dela Cruz', "Bride's family", '2', '0917 123 4567'],
    ['Señor Ramón', '', '1'],
    ['Tita Baby', 'Ninong / Ninang', '3'],
  ]);
});

test('the awkward parts survive', () => {
  const rows = readXlsx(workbook());
  assert.ok(rows[1][0].includes('&'), 'an entity comes back as its character');
  assert.equal(rows[2][0], 'Señor Ramón', 'accents');
  assert.equal(rows[3][0], 'Tita Baby', 'a string Excel split into runs is rejoined');
  assert.equal(rows[1][3], '0917 123 4567', 'an inline string');
  assert.equal(rows[1][2], '2', 'a number is the text of it');
});

test('a skipped column keeps its place', () => {
  // Row 3 has A and C but no B. Closing the gap would shift the seat count
  // into the group column and quietly import nonsense.
  const [, , third] = readXlsx(workbook());
  assert.equal(third.length, 3);
  assert.equal(third[1], '', 'the gap is still there');
  assert.equal(third[2], '1', 'and the seats did not slide into it');
});

test('empty rows at the end are dropped', () => {
  // A spreadsheet is nearly always saved with a few blank rows under the last
  // name; importing them as guests with no name would be nonsense.
  assert.equal(readXlsx(workbook()).length, 4);
});

test('a zip is recognised before it is opened', () => {
  assert.equal(looksLikeXlsx(workbook()), true);
  assert.equal(looksLikeXlsx(Buffer.from('Name,Group,Seats\nJuan,Family,2\n')), false, 'a CSV is not a workbook');
  assert.equal(looksLikeXlsx(Buffer.from('')), false);
  assert.equal(looksLikeXlsx(Buffer.from('PK')), false, 'two bytes are not enough to say');
});

test('column letters are base-26 with no zero', () => {
  assert.equal(columnIndex('A1'), 0);
  assert.equal(columnIndex('B2'), 1);
  assert.equal(columnIndex('Z10'), 25);
  assert.equal(columnIndex('AA1'), 26, 'the place where an off-by-one lives');
  assert.equal(columnIndex('AB1'), 27);
  assert.equal(columnIndex('BC7'), 54);
});

test('something that is not a workbook says so rather than returning nonsense', () => {
  assert.throws(() => readXlsx(Buffer.from('Name,Group\nJuan,Family\n')), /not a zip/);
});
