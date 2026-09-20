import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestionsFor, familyOf } from '../src/lib/suggestions';
import { defaultContent, fieldsFor, type Field } from '../src/lib/sections';

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
 * A chip is an offer, and blank is the answer that prints nothing.
 *
 * "Ohh its fine to retain the note since its like a reminder. So we can just
 * leave it blank if we dont want to put any note or reminder for it."
 *
 * That is the distinction an earlier pass got wrong, taking the smart-casual
 * chip away because the drawn page already says the attire. The three lines
 * that came *off* the page were printed whether or not anybody asked for
 * them — captions under the drawn figures, and a palette line falling back
 * twice to wording nobody wrote. A chip is different in kind: it sits under
 * an empty box and does nothing until somebody taps it.
 *
 * So the rule is not "no chip may repeat the page". The rule is that a
 * family who writes nothing gets nothing, which is what these two hold: the
 * examples are all there to be taken, and none of them has been written into
 * a new invitation on the family's behalf.
 */
test('the dress code still offers its reminders, the smart casual one included', () => {
  for (const occasion of ['CHRISTENING', 'KIDS_BIRTHDAY'] as const) {
    const chips = suggestionsFor('dressCode.note', occasion) ?? [];
    assert.ok(chips.some((c) => /smart casual/i.test(c.en)),
      `${occasion}: the attire reminder is on offer again`);
    assert.ok(chips.length >= 3, `${occasion}: and it is not the only one`);
    for (const c of chips) assert.ok(c.en && c.tl, `${occasion}/${c.key}: both readings`);
  }
});

test('no chip is written into an invitation for the family: every box starts empty', () => {
  for (const occasion of ['CHRISTENING', 'WEDDING', 'KIDS_BIRTHDAY'] as const) {
    const content = defaultContent(occasion) as Record<string, Record<string, unknown>>;
    // Every customer box that offers examples starts blank. A chip that had
    // been pre-taken would print on a page nobody had visited.
    for (const section of ['dressCode', 'reception', 'closing'] as const) {
      for (const f of fieldsFor(section, occasion)) {
        if (!f.examples?.length || f.staff) continue;
        const value = content[section]?.[f.key];
        assert.ok(value === '' || value === undefined,
          `${occasion}:${section}.${f.key} starts empty, not filled with an example — got ${JSON.stringify(value)}`);
      }
    }
  }
});
