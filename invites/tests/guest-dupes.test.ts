import test from 'node:test';
import assert from 'node:assert/strict';
import { guestKeys, duplicateRows, importNotice, isTemplateLine, TEMPLATE_NOTES } from '../src/lib/guest-dupes';

/**
 * A list sent twice must not double. A row is a repeat when its name, mobile
 * or e-mail is already there — on the list, or earlier in the same file — and
 * a blank contact is never a match.
 */

test('a name is the same name whatever the case, spacing, accents or punctuation', () => {
  assert.equal(guestKeys({ name: 'MA. TERESA  Dela Cruz' }).name, guestKeys({ name: 'ma teresa dela cruz' }).name);
  assert.equal(guestKeys({ name: 'Peña' }).name, guestKeys({ name: 'pena' }).name);
  assert.deepEqual([...duplicateRows([{ name: 'Tita Baby' }], [{ name: 'TITA BABY' }])], [0]);
});

test('a mobile written 0917…, +63 917… or 63917… is one number', () => {
  const keys = ['0917 123 4567', '+63 917 123 4567', '63917-123-4567', '9171234567'].map((phone) => guestKeys({ name: 'x', phone }).phone);
  assert.ok(keys.every((k) => k === '639171234567'), keys.join(' '));
  const dupes = duplicateRows([{ name: 'Tita Baby', phone: '0917 123 4567' }], [{ name: 'Baby Reyes', phone: '+63 917 123 4567' }]);
  assert.deepEqual([...dupes], [0], 'a different name on the same phone is the same guest');
});

test('an e-mail matches whatever its case, and the spaces around it', () => {
  assert.equal(guestKeys({ name: 'x', email: '  Fred@Email.com ' }).email, 'fred@email.com');
  const dupes = duplicateRows([{ name: 'Ninong Fred', email: 'fred@email.com' }], [{ name: 'Federico Santos', email: 'FRED@email.com' }]);
  assert.deepEqual([...dupes], [0]);
});

test('a blank mobile, e-mail or name never matches another blank', () => {
  const existing = [{ name: 'Tita Baby', phone: '', email: '' }, { name: '' }];
  const rows = [{ name: 'Ninong Fred', phone: '', email: '' }, { name: 'Tita Let', phone: null, email: undefined }, { name: '  ' }];
  assert.equal(duplicateRows(existing, rows).size, 0);
  assert.equal(duplicateRows([], [{ name: 'A' }, { name: 'B' }]).size, 0, 'nor between two rows of one file');
});

test('a row repeated inside the file is caught the second time, not the first', () => {
  const rows = [
    { name: 'Tita Baby' },
    { name: 'Ninong Fred' },
    { name: 'tita baby' },
    { name: 'Ninang Cora', phone: '0917 000 0000' },
    { name: 'Cora Santos', phone: '+63 917 000 0000' },
  ];
  assert.deepEqual([...duplicateRows([], rows)], [2, 4]);
});

test('two different people do not match', () => {
  const existing = [{ name: 'Juan Dela Cruz', phone: '0917 123 4567', email: 'juan@email.com' }];
  const rows = [{ name: 'Juana Dela Cruz', phone: '0917 123 4568', email: 'juana@email.com' }, { name: 'Juan Dela Cruz Jr.' }];
  assert.equal(duplicateRows(existing, rows).size, 0);
});

test('the notice counts in words, singular and plural, and says nothing about a zero', () => {
  assert.equal(importNotice({ added: 12, skipped: 0, duplicates: 3, examples: 0 }), 'Imported 12 guests. 3 already on the list were skipped.');
  assert.equal(importNotice({ added: 1, skipped: 0, duplicates: 1, examples: 0 }), 'Imported 1 guest. 1 already on the list was skipped.');
  assert.equal(importNotice({ added: 5, skipped: 0, duplicates: 0, examples: 0 }), 'Imported 5 guests.');
  assert.equal(importNotice({ added: 0, skipped: 2, duplicates: 4, examples: 0 }), 'Imported 0 guests. 4 already on the list were skipped. 2 blank rows were left out.');
  assert.equal(importNotice({ added: 3, skipped: 1, duplicates: 0, examples: 0 }), 'Imported 3 guests. 1 blank row was left out.');
});

test("the blank's own example guests and notes are known by sight", () => {
  assert.equal(isTemplateLine('Ninong Fred', '0918 765 4321'), true, 'the example, number and all');
  assert.equal(isTemplateLine('Ninong Fred', '0918-765-4321'), true, 'however the number is punctuated');
  assert.equal(isTemplateLine('Ninong Fred', '0917 000 0000'), false, 'a real Ninong Fred with a number of his own is a guest');
  assert.equal(isTemplateLine('Mr. & Mrs. Dela Cruz', '0917 123 4567'), true);
  for (const note of TEMPLATE_NOTES) assert.equal(isTemplateLine(note), true, note);
  assert.equal(isTemplateLine('Group can be any of:', ''), true);
  assert.equal(isTemplateLine('Tita Baby', ''), false);
});

test('the notice says when the template lines were left out', () => {
  assert.equal(importNotice({ added: 4, skipped: 0, duplicates: 0, examples: 7 }), "Imported 4 guests. The template's example rows and notes were left out.");
  assert.equal(importNotice({ added: 0, skipped: 0, duplicates: 0, examples: 7 }), "Imported 0 guests. The template's example rows and notes were left out.");
});
