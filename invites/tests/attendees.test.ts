import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendeesOf, companionsOf, relationLabel, attendeeLine, isRelation, RELATIONS } from '../src/lib/attendees';

// Replies made before there was a relationship to ask about are a plain array
// of names, and they are still in the database. Both shapes have to read.
test('a party saved as plain names still reads', () => {
  assert.deepEqual(attendeesOf(['Maria Santos', 'Juan Santos']), [
    { name: 'Maria Santos', relation: '' },
    { name: 'Juan Santos', relation: '' },
  ]);
});

test('a party saved with relationships reads as it was written', () => {
  assert.deepEqual(attendeesOf([{ name: 'Maria Santos', relation: '' }, { name: 'Juan Santos', relation: 'spouse' }]), [
    { name: 'Maria Santos', relation: '' },
    { name: 'Juan Santos', relation: 'spouse' },
  ]);
});

test('a relationship nobody offers is dropped, not stored', () => {
  const [, second] = attendeesOf([{ name: 'Maria' }, { name: 'Bruno', relation: 'dog' }]);
  assert.equal(second.relation, '', 'a word the form never offered is no answer');
  assert.equal(second.name, 'Bruno', 'and the name survives it');
});

test('nameless entries are dropped rather than counted as a person', () => {
  assert.equal(attendeesOf(['Maria', '', '   ', { name: '' }]).length, 1);
});

test('anything that is not a list is nobody', () => {
  for (const junk of [null, undefined, 'Maria', 42, {}]) assert.deepEqual(attendeesOf(junk), []);
});

test('the guest heads their own party and is not their own plus one', () => {
  const party = [{ name: 'Maria Santos', relation: '' }, { name: 'Juan Santos', relation: 'spouse' }];
  assert.deepEqual(companionsOf(party).map((a) => a.name), ['Juan Santos'], 'the plus ones are everyone after the first');
});

// The point of asking at all: three people at a table of ten is a different
// table depending on which three. What the couple does about it is theirs to
// decide — this only has to carry the answer to them intact.
test('a whole party comes back with each relationship attached', () => {
  const party = [
    { name: 'Mrs. Dela Cruz', relation: '' },
    { name: 'Mr. Dela Cruz', relation: 'spouse' },
    { name: 'Baby Dela Cruz', relation: 'child' },
    { name: 'Ate Ising', relation: 'helper' },
    { name: 'Mang Tony', relation: 'driver' },
  ];
  assert.equal(attendeesOf(party).length, 5, 'five people eat');
  assert.deepEqual(companionsOf(party).map((a) => a.relation), ['spouse', 'child', 'helper', 'driver']);
});

test('a relationship reads as words, in either language', () => {
  assert.equal(relationLabel('helper'), 'Helper / Yaya');
  assert.equal(relationLabel('helper', 'tl'), 'Kasambahay / Yaya');
  assert.equal(relationLabel('spouse', 'tl'), 'Asawa');
  assert.equal(relationLabel(''), '', 'nobody asked says nothing');
  assert.equal(relationLabel('dog'), '', 'and neither does a word nobody offers');
});

test('a companion reads as a name and what they are', () => {
  assert.equal(attendeeLine({ name: 'Juan Santos', relation: 'spouse' }), 'Juan Santos (spouse)');
  assert.equal(attendeeLine({ name: 'Juan Santos', relation: '' }), 'Juan Santos', 'no brackets around nothing');
});

test('the list is grouped, not alphabetical, so like sits beside like', () => {
  const at = (r: string) => RELATIONS.indexOf(r as (typeof RELATIONS)[number]);
  assert.ok(at('fiance') > at('spouse') && at('fiance') < at('partner'), 'a fiancé stands between a partner and a spouse');
  assert.ok(at('cousin') < at('relative'), 'a pinsan is named before the catch-all that would swallow them');
  assert.ok(at('inlaw') < at('relative') && at('nephew') < at('relative'));
  assert.ok(at('caregiver') > at('helper'), 'the people who came to attend the guest sit together');
  assert.equal(at('other'), RELATIONS.length - 1, 'and "someone else" ends the list');
});

test('the commonest Filipino companions are on offer by name', () => {
  for (const r of ['cousin', 'inlaw', 'nephew', 'fiance', 'grandparent', 'neighbour', 'caregiver']) {
    assert.ok(isRelation(r), `${r} is offered`);
  }
});

test('every relationship offered has words in both languages', () => {
  for (const r of RELATIONS) {
    assert.ok(isRelation(r));
    assert.ok(relationLabel(r, 'en'), `${r} reads in English`);
    assert.ok(relationLabel(r, 'tl'), `${r} reads in Tagalog`);
    assert.ok(!relationLabel(r, 'en').startsWith('rsvp.'), `${r} is not a missing key`);
  }
});
