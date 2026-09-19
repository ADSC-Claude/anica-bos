/**
 * A ready-made answer is a starting point, never the only option.
 *
 * Two complaints, one shape. "why we dont have the suggested questions and
 * answers in the FAQs? also the one they can fill in own their own if they
 * think the FAQ we have given is enough, or they could edit out the
 * questions and answers as well that we gave beside that they can create
 * their own FAQ" — and then, about the gift page: "theres no area to write
 * their own, we already talked about all this just this morning."
 *
 * So: the FAQ offers ready-made pairs that go in as ordinary rows, to edit
 * or remove; and the writings that are the family's own voice — the gift
 * note, the closing thank-you, the words a guest is greeted with, the line
 * under the countdown — belong to the family, with the preset kept as the
 * thing they start from. What stays ours is the page's furniture: a line
 * under a heading, a verse, a note the design writes for itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldsFor, customerFields } from '../src/lib/sections';
import { faqStarters } from '../src/lib/suggestions';

test('the FAQ offers whole questions, with their answers, in the occasion’s words', () => {
  for (const occasion of ['CHRISTENING', 'WEDDING', 'CORPORATE', 'MEMORIAL', 'DEBUT'] as const) {
    const list = fieldsFor('faq', occasion).find((f) => f.key === 'items')!;
    const starters = list.starters!;
    assert.ok(starters.length >= 4, `${occasion} offers a handful`);
    for (const s of starters) {
      assert.ok(s.row.q?.en.trim() && s.row.a?.en.trim(), `${occasion}/${s.key}: a question and an answer`);
      assert.ok(s.row.q.tl.trim() && s.row.a.tl.trim(), `${occasion}/${s.key}: and both in Tagalog`);
      assert.equal(s.label, s.row.q.en, `${occasion}/${s.key}: the chip says the question`);
      // every writing the row fills is a writing the row has
      for (const key of Object.keys(s.row)) assert.ok(list.item!.some((f) => f.key === key), `${occasion}/${s.key}: ${key} is a box on the row`);
    }
    assert.equal(new Set(starters.map((s) => s.key)).size, starters.length, `${occasion}: no two the same`);
  }
  // a christening's are a christening's, not a wedding's
  assert.ok(faqStarters('CHRISTENING' as never).some((s) => /children/i.test(s.label)));
  assert.ok(faqStarters('CORPORATE' as never).some((s) => /register/i.test(s.label)));
});

test('every starter fits the room the form gives that box', () => {
  for (const occasion of ['CHRISTENING', 'WEDDING'] as const) {
    const list = fieldsFor('faq', occasion).find((f) => f.key === 'items')!;
    for (const s of list.starters!) {
      for (const [key, words] of Object.entries(s.row)) {
        const max = list.item!.find((f) => f.key === key)!.max!;
        for (const lang of ['en', 'tl'] as const) {
          assert.ok(words[lang].length <= max, `${occasion}/${s.key}.${key} (${lang}) is ${words[lang].length}, over ${max}`);
        }
      }
    }
  }
});

test('the writings in the family’s own voice are the family’s to write', () => {
  const theirs = (section: string, occasion = 'CHRISTENING') =>
    customerFields(fieldsFor(section as never, occasion as never)).map((f) => f.key);
  assert.ok(theirs('gift').includes('text'), 'the gift note is theirs, with the preset above it to start from');
  assert.ok(theirs('countdown').includes('label'), 'and the line under the countdown');
  assert.ok(theirs('closing').includes('message'), 'and the thank-you at the end');
  assert.ok(theirs('guestbook').includes('prompt'), 'and the words a guest is greeted with');
  assert.ok(theirs('photos').includes('prompt'));
  // and the page's own furniture is still ours
  for (const [section, key] of [['cover', 'verse'], ['gallery', 'line'], ['dressCode', 'gentsNote'], ['closing', 'line']] as const) {
    assert.ok(!theirs(section, 'WEDDING').includes(key), `${section}.${key} is the design's writing, not theirs`);
  }
});

/**
 * A page whose only answer is blank is not on the invitation.
 *
 * "when they opt not to fill the hashtag, the pages shouldnt appear right?"
 * It was appearing: a heading, a camera and an empty band. The reason was
 * that her unplugged wording carries a default — ours, arriving with the
 * look on every invitation ever made — and any value at all counted as the
 * family having touched the part. A fixed writing is not an answer.
 */
test('a part is filled by what the family answered, not by what we wrote for them', async () => {
  const { sectionFilled } = await import('../src/lib/sections');
  const ours = { unpluggedText: 'We kindly ask that phones stay tucked away.', unplugged: false, hashtag: '', instagram: '', tiktok: '', facebook: '' };
  assert.equal(sectionFilled('social', 'CHRISTENING' as never, ours), false, 'our wording is not their hashtag');
  assert.equal(sectionFilled('social', 'CHRISTENING' as never, { ...ours, hashtag: '#LucasIsBlessed' }), true);
  assert.equal(sectionFilled('social', 'CHRISTENING' as never, { ...ours, instagram: '@lucas' }), true, 'any answer of theirs is enough');
  assert.equal(sectionFilled('social', 'CHRISTENING' as never, undefined), false);
});

/**
 * One name is centred and speaks for itself.
 *
 * "when the customer only inputs one contact number it should be place in
 * the middle and the word US should be ME." Her page drew two columns, so
 * the first was pinned to the left column whether or not anything ever
 * stood beside it.
 */
test('the Questions page has one name in the middle and two in her columns', async () => {
  const { CHRISTENING_PAGES } = await import('../src/lib/christening');
  const page = CHRISTENING_PAGES.find((p) => p.key === 'assistance')!;
  const at = (id: string) => (page.elements ?? []).find((e) => e.id === id)!;
  assert.equal(at('help-solo').x, 50, 'one name stands in the middle');
  assert.deepEqual(at('help-solo').when, { section: 'contact', field: 'name2', filled: false });
  assert.deepEqual(at('help-one').when, { section: 'contact', field: 'name2', filled: true });
  assert.ok(at('help-one').x! < 50 && at('help-two').x! > 50, 'two names keep her columns');
  // and the note says me rather than us
  const solo = at('help-note-solo');
  assert.deepEqual(solo.when, { section: 'contact', field: 'name2', filled: false });
  assert.ok(JSON.stringify(solo).includes('message me on Messenger'));
  assert.ok(JSON.stringify(at('help-note')).includes('message us on Messenger'));
});
