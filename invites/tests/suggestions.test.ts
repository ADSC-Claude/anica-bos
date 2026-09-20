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
  // closing.message was here and is not any more: a thank-you at the end of
  // an invitation is the family speaking, so it is theirs and it carries
  // chips like every other box of theirs
  for (const [section, key] of [['closing', 'line'], ['cover', 'verse'], ['dressCode', 'gentsNote']] as const) {
    const f = fieldsFor(section, 'WEDDING').find((x) => x.key === key)!;
    assert.equal(f.staff, true, `${section}.${key} is ours`);
    assert.equal(f.examples, undefined, `${section}.${key} carries no chips`);
  }
});

/**
 * The dress code page says the attire; a chip must not offer to say it again.
 *
 * "In the dress code still remove the 'smart casual, in the colours above
 * etc' no need for that"
 *
 * Her christening's dress code page is headed with the attire, draws the
 * clothes and names every swatch. A ready-made note repeating any of that
 * is a fourth redundant line waiting to be tapped into place, after the
 * three that were taken out of the page itself.
 */
test('no dress-code chip hands a family back what the page already shows', () => {
  for (const occasion of ['CHRISTENING', 'KIDS_BIRTHDAY'] as const) {
    const chips = suggestionsFor('dressCode.note', occasion) ?? [];
    assert.ok(chips.length, `${occasion} still offers examples`);
    for (const c of chips) {
      for (const words of [c.en, c.tl]) {
        assert.doesNotMatch(words, /colours above|colors above|kulay sa itaas/i,
          `${occasion}/${c.key}: the palette is drawn and named on the page — "${words}"`);
        assert.doesNotMatch(words, /^smart casual[,.]/i,
          `${occasion}/${c.key}: the attire is the page's own heading — "${words}"`);
      }
    }
  }
});
