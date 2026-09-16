import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestionsFor, familyOf } from '../src/lib/suggestions';
import { fieldsFor, type Field } from '../src/lib/sections';

const boxes = (fields: Field[]) => fields.flatMap((f) => (f.type === 'list' ? (f.item ?? []).map((i) => ({ ...i, key: `${f.key}.${i.key}` })) : [f]));

test('every customer writing box that asks for words offers examples in both languages', () => {
  const seen: string[] = [];
  for (const occasion of ['WEDDING', 'CHRISTENING', 'DEBUT', 'CORPORATE', 'MEMORIAL'] as const) {
    for (const section of ['cover', 'ceremony', 'reception', 'parents', 'dressCode', 'story', 'program', 'closing', 'extras'] as const) {
      for (const f of boxes(fieldsFor(section, occasion))) {
        if (!f.examples?.length) continue;
        seen.push(`${occasion}:${section}.${f.key}`);
        for (const e of f.examples) {
          assert.ok(e.key && e.label && e.en && e.tl, `${section}.${f.key} on ${occasion}: every example has a key, a label, and both readings`);
        }
        assert.equal(new Set(f.examples.map((e) => e.key)).size, f.examples.length, `${section}.${f.key}: keys are distinct`);
      }
    }
  }
  for (const box of ['WEDDING:reception.note', 'CHRISTENING:dressCode.note', 'DEBUT:closing.signature', 'CORPORATE:cover.openingLine', 'MEMORIAL:ceremony.note', 'WEDDING:story.timeline.text']) {
    assert.ok(seen.includes(box), `${box} has examples`);
  }
});

test('the words follow the occasion: a couple’s note is not a company’s', () => {
  const couple = suggestionsFor('reception.note', 'WEDDING')!;
  const company = suggestionsFor('reception.note', 'CORPORATE')!;
  assert.notDeepEqual(couple.map((e) => e.en), company.map((e) => e.en));
  assert.equal(familyOf('ANNIVERSARY'), 'couple');
  assert.equal(familyOf('KIDS_BIRTHDAY'), 'child');
  assert.equal(familyOf('GRADUATION'), 'party');
  // a car park is a car park
  assert.deepEqual(suggestionsFor('reception.parkingNote', 'WEDDING'), suggestionsFor('reception.parkingNote', 'CORPORATE'));
});

test('names, numbers and boxes with their own examples are left alone', () => {
  const cover = fieldsFor('cover', 'WEDDING');
  assert.equal(cover.find((f) => f.key === 'partnerA')?.examples, undefined, 'a name offers no wording');
  const closing = fieldsFor('closing', 'CHRISTENING');
  const parents = closing.find((f) => f.key === 'parentsMessage')!;
  assert.ok(parents.examples!.every((e) => e.key !== 'love'), 'the parents’ message keeps its own examples from copy.ts');
  assert.equal(suggestionsFor('social.hashtag', 'WEDDING'), undefined);
});

test('a staff box gets none: the look\u2019s line backs it, and the encoder is filling twenty at a time', () => {
  for (const [section, key] of [['closing', 'message'], ['cover', 'verse'], ['dressCode', 'gentsNote']] as const) {
    const f = fieldsFor(section, 'WEDDING').find((x) => x.key === key)!;
    assert.equal(f.staff, true, `${section}.${key} is ours`);
    assert.equal(f.examples, undefined, `${section}.${key} carries no chips`);
  }
});
