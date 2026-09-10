import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readForward, fieldsFor, cleanSection, rows, str } from '../src/lib/sections';
import type { Content } from '../src/lib/sections';

// The best man and the maid of honour used to be one text box each, with a
// single Title choice deciding whether the whole wedding said "Maid" or
// "Matron". Weddings that were saved that way are still in the database, and
// cleanSection drops any key the spec no longer names — so the old value has to
// be read forward on the way in or the name disappears from a live invitation.
const old = (extra: Record<string, unknown> = {}): Content => ({
  entourage: { bestMan: 'Miguel Angelo Dela Cruz', maidOfHonor: 'Ana Patricia Santos', honorTitle: 'matron', ...extra },
});

test('a name saved in the old single box is read into the new list', () => {
  const e = readForward(old()).entourage!;
  assert.deepEqual(rows(e, 'bestMen'), [{ name: 'Miguel Angelo Dela Cruz' }]);
  assert.deepEqual(rows(e, 'honors'), [{ title: 'matron', name: 'Ana Patricia Santos' }]);
});

test('the one title for the whole wedding becomes hers', () => {
  assert.equal(rows<{ title: string }>(readForward(old({ honorTitle: '' })).entourage!, 'honors')[0].title, 'maid', 'blank was Maid of Honor on the page');
  assert.equal(rows<{ title: string }>(readForward(old({ honorTitle: 'maid' })).entourage!, 'honors')[0].title, 'maid');
});

test('a list already filled in is never overwritten by the old box', () => {
  const both = readForward(old({ honors: [{ title: 'maid', name: 'Cely Uy' }], bestMen: [{ name: 'Ben Uy' }] })).entourage!;
  assert.deepEqual(rows(both, 'honors'), [{ title: 'maid', name: 'Cely Uy' }], 'what they typed most recently wins');
  assert.deepEqual(rows(both, 'bestMen'), [{ name: 'Ben Uy' }]);
});

test('an empty old box adds no empty row', () => {
  const e = readForward({ entourage: { bestMan: '', maidOfHonor: '' } }).entourage!;
  assert.equal(rows(e, 'bestMen').length, 0);
  assert.equal(rows(e, 'honors').length, 0);
});

test('content with no entourage at all is left exactly as it was', () => {
  const c: Content = { cover: { brideFirst: 'Maria' } };
  assert.equal(readForward(c), c, 'the same object, not a copy');
});

test('everything else in the section survives the read', () => {
  const e = readForward(old({ officiant: 'Rev. Fr. Benjamin Ocampo' })).entourage!;
  assert.equal(str(e, 'officiant'), 'Rev. Fr. Benjamin Ocampo');
});

// The point of the whole exercise: what is read forward must survive the very
// next save, which is the step that used to lose it.
test('the read-forward shape survives a save', () => {
  const fields = fieldsFor('entourage', 'WEDDING');
  const { data } = cleanSection(fields, readForward(old()).entourage);
  assert.deepEqual(rows(data, 'bestMen'), [{ name: 'Miguel Angelo Dela Cruz' }]);
  assert.deepEqual(rows(data, 'honors'), [{ title: 'matron', name: 'Ana Patricia Santos' }]);
  assert.equal(data.bestMan, undefined, 'and the old key is gone, as it should be');
});

test('a couple can have both a maid and a matron', () => {
  const fields = fieldsFor('entourage', 'WEDDING');
  const { data } = cleanSection(fields, {
    honors: [{ title: 'maid', name: 'Ana Santos' }, { title: 'matron', name: 'Carmen Lim' }],
    bestMen: [{ name: 'Ben Uy' }, { name: 'Jose Cruz' }],
  });
  assert.equal(rows(data, 'honors').length, 2, 'which was the whole point');
  assert.equal(rows(data, 'bestMen').length, 2, 'and two best men, for the groom');
});

test('a secondary sponsor role nobody offers can still be named', () => {
  const fields = fieldsFor('entourage', 'WEDDING');
  const { data } = cleanSection(fields, { secondarySponsors: [{ role: 'other', roleOther: 'Ring', first: 'Ben', second: 'Cely' }] });
  const [row] = rows<{ role: string; roleOther: string }>(data, 'secondarySponsors');
  assert.equal(row.role, 'other');
  assert.equal(row.roleOther, 'Ring');
});
