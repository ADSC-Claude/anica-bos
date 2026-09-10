import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listToGrid, gridToList, sheetFilename } from '../src/lib/sheet';
import { fieldsFor } from '../src/lib/sections';
import type { Field } from '../src/lib/sections';

// The shape every repeatable list has: a `list` field with an `item` of
// sub-fields. These stand in for one, so the test says what it means rather
// than depending on a particular occasion's wording.
const PAIR: Field[] = [
  { key: 'ninong', label: 'Ninong', type: 'text' },
  { key: 'ninang', label: 'Ninang', type: 'text' },
];
const ROLE: Field[] = [
  { key: 'role', label: 'Role', type: 'select', options: [{ value: 'candle', label: 'Candle' }, { value: 'veil', label: 'Veil' }] },
  { key: 'first', label: 'Name', type: 'text' },
  { key: 'late', label: 'The late', type: 'toggle' },
];

test('a list goes out as its labels and what is in it', () => {
  assert.deepEqual(listToGrid(PAIR, [{ ninong: 'Jose Santos', ninang: 'Ana Santos' }]), [
    ['Ninong', 'Ninang'],
    ['Jose Santos', 'Ana Santos'],
  ]);
});

test('an empty list still gives the blank to fill', () => {
  assert.deepEqual(listToGrid(PAIR, []), [['Ninong', 'Ninang']]);
});

test('a select goes out as the words a person reads, and comes back as the value', () => {
  const grid = listToGrid(ROLE, [{ role: 'veil', first: 'Ben', late: true }]);
  assert.deepEqual(grid[1], ['Veil', 'Ben', 'Yes'], 'the label, not the stored value');
  assert.deepEqual(gridToList(ROLE, grid), [{ role: 'veil', first: 'Ben', late: true }], 'and back again');
});

test('a round trip is the same list', () => {
  const rows = [
    { ninong: 'Jose Santos', ninang: 'Ana Santos' },
    { ninong: 'Ramón Cruz', ninang: 'Ma. Teresa Cruz' },
  ];
  assert.deepEqual(gridToList(PAIR, listToGrid(PAIR, rows)), rows);
});

test('headers are matched on their letters, not their punctuation', () => {
  const grid = [
    ['  NINANG  ', 'ninong'],
    ['Ana Santos', 'Jose Santos'],
  ];
  // Note the columns are the other way round: the header decides, not position.
  assert.deepEqual(gridToList(PAIR, grid), [{ ninong: 'Jose Santos', ninang: 'Ana Santos' }]);
});

test('a file with no header row is read from the top by position', () => {
  const grid = [
    ['Jose Santos', 'Ana Santos'],
    ['Ramón Cruz', 'Ma. Teresa Cruz'],
  ];
  assert.deepEqual(gridToList(PAIR, grid), [
    { ninong: 'Jose Santos', ninang: 'Ana Santos' },
    { ninong: 'Ramón Cruz', ninang: 'Ma. Teresa Cruz' },
  ]);
});

test('a column the header never mentions comes back empty rather than shifted', () => {
  const grid = [['Ninong'], ['Jose Santos']];
  assert.deepEqual(gridToList(PAIR, grid), [{ ninong: 'Jose Santos', ninang: '' }]);
});

test('blank rows are dropped, wherever they are', () => {
  const grid = [
    ['Ninong', 'Ninang'],
    ['Jose Santos', 'Ana Santos'],
    ['', ''],
    ['   ', ''],
    ['Ramón Cruz', ''],
  ];
  assert.deepEqual(gridToList(PAIR, grid), [
    { ninong: 'Jose Santos', ninang: 'Ana Santos' },
    { ninong: 'Ramón Cruz', ninang: '' },
  ]);
});

test('a list stops at its own limit', () => {
  const grid = [['Ninong', 'Ninang'], ...Array.from({ length: 30 }, (_, i) => [`N${i}`, `A${i}`])];
  assert.equal(gridToList(PAIR, grid, 6).length, 6, 'six secondary sponsors is six');
});

test('a tick is read the way people write one', () => {
  for (const yes of ['Yes', 'y', 'TRUE', '1', '✓', 'x', 'Opo']) {
    assert.equal(gridToList(ROLE, [['Role', 'Name', 'The late'], ['Candle', 'Ben', yes]])[0].late, true, yes);
  }
  for (const no of ['No', '', 'n', 'false', '0']) {
    assert.equal(gridToList(ROLE, [['Role', 'Name', 'The late'], ['Candle', 'Ben', no]])[0].late, false, no || '(blank)');
  }
});

test('a select value that is not on offer is dropped, not invented', () => {
  const [row] = gridToList(ROLE, [['Role', 'Name'], ['Bouquet', 'Ben']]);
  assert.equal(row.role, '', 'a role nobody offers is no role');
  assert.equal(row.first, 'Ben', 'and the rest of the row survives it');
});

test('a filename is the list, without the aside that helps on screen', () => {
  assert.equal(sheetFilename('Principal Sponsors (Ninong & Ninang)'), 'principal-sponsors.csv');
  assert.equal(sheetFilename('FAQ'), 'faq.csv');
  assert.equal(sheetFilename('(only an aside)'), 'list.csv', 'never a bare .csv');
});

// The point of writing this against the field shape rather than per section:
// every list in every occasion is carried by it, including ones added later.
test('the real sections are all made of the shape this reads', () => {
  const lists = fieldsFor('entourage', 'WEDDING').filter((f) => f.type === 'list');
  assert.ok(lists.length > 3, 'a wedding entourage is mostly lists');
  for (const l of lists) {
    assert.ok(l.item && l.item.length > 0, `${l.key} has sub-fields`);
    // Round-tripping an empty list of each gives back exactly its headers.
    assert.deepEqual(listToGrid(l.item!, []), [l.item!.map((f) => f.label)]);
  }
});
