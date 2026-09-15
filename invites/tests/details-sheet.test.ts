import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailsSheet, sheetFilename } from '../src/lib/details-sheet';
import { SECTION_BY_KEY, fieldsFor, sectionOrder } from '../src/lib/sections';

test('a Basic wedding asks for what Basic has, and nothing above it', () => {
  const sheet = detailsSheet({ occasion: 'WEDDING', tier: 'BASIC' });
  const keys = sheet.parts.map((p) => p.key);
  assert.ok(keys.includes('cover') && keys.includes('ceremony') && keys.includes('rsvp') && keys.includes('closing'));
  assert.ok(!keys.includes('entourage'), 'the entourage is Standard');
  assert.ok(!keys.includes('guestbook') && !keys.includes('photos'), 'the guestbook and the album are Signature and Luxury');
  assert.equal(sheet.packageLabel, 'Basic');
  assert.equal(sheet.occasionLabel, 'Wedding');
});

test('a Luxury wedding asks for everything the form does, in the form\'s order', () => {
  const sheet = detailsSheet({ occasion: 'WEDDING', tier: 'LUXURY' });
  const keys = sheet.parts.map((p) => p.key);
  assert.ok(keys.includes('entourage') && keys.includes('guestbook') && keys.includes('photos'));
  const order = sectionOrder('WEDDING', '').filter((k) => keys.includes(k));
  assert.deepEqual(keys, order, 'the same order as the tab');
  assert.deepEqual(sheet.parts.map((p) => p.n), sheet.parts.map((_, i) => i + 1), 'numbered from one');
});

test('the packages nest: each asks for at least what the one below it does', () => {
  const at = (tier: 'BASIC' | 'STANDARD' | 'COMPLETE' | 'LUXURY') => new Set(detailsSheet({ occasion: 'WEDDING', tier }).parts.map((p) => p.key));
  const [b, s, c, l] = [at('BASIC'), at('STANDARD'), at('COMPLETE'), at('LUXURY')];
  for (const k of b) assert.ok(s.has(k));
  for (const k of s) assert.ok(c.has(k));
  for (const k of c) assert.ok(l.has(k));
  assert.ok(l.size > b.size);
});

test('our fixed writings are not on the sheet, and neither is a hidden part', () => {
  const sheet = detailsSheet({ occasion: 'WEDDING', tier: 'LUXURY' });
  for (const part of sheet.parts) {
    const fields = fieldsFor(part.key, 'WEDDING', 'LUXURY');
    const theirs = new Set(fields.filter((f) => !f.staff && !f.byDesign).map((f) => f.label));
    const labels = new Set(part.items.map((i) => i.label.replace(/ \*$/, '')));
    for (const f of fields) {
      // a fixed writing that happens to share its label with a box of theirs is not told apart by name
      if ((f.staff || f.byDesign) && !theirs.has(f.label)) assert.ok(!labels.has(f.label), `${part.key}.${f.key} is ours`);
    }
    assert.equal(labels.size, part.items.length, `${part.key}: no two boxes with one label`);
  }
  assert.ok(!sheet.parts.some((p) => SECTION_BY_KEY[p.key].hidden));
});

test('a christening asks for the ninongs and ninangs as a table with two columns of names', () => {
  const sheet = detailsSheet({ occasion: 'CHRISTENING', tier: 'STANDARD' });
  const sponsors = sheet.parts.find((p) => p.key === 'sponsors');
  assert.ok(sponsors, 'the part is there');
  const tables = sponsors.items.filter((i) => i.kind === 'table');
  assert.deepEqual(tables.map((t) => t.label), ['Ninongs', 'Ninangs']);
  assert.deepEqual(tables[0].kind === 'table' ? tables[0].columns : [], ['Name']);
});

test('every photo and song the sheet asks for has a name to send it under, and no two the same', () => {
  const sheet = detailsSheet({ occasion: 'WEDDING', tier: 'LUXURY' });
  assert.ok(sheet.files.length >= 3);
  assert.equal(new Set(sheet.files.map((f) => f.name)).size, sheet.files.length);
  const cover = sheet.parts.find((p) => p.key === 'cover');
  assert.ok(cover?.items.some((i) => i.kind === 'file' && i.what === 'photo' && i.name === 'cover-cover-photo.jpg'), 'the cover photo is cover-cover-photo.jpg');
});

test('the sheet is named for the invitation', () => {
  assert.equal(sheetFilename('juan-and-maria'), 'juan-and-maria-details.docx');
  assert.equal(sheetFilename(''), 'invitation-details.docx');
});
