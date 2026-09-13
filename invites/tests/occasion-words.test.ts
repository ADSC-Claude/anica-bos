import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_BY_KEY, lookLine, lookTitle } from '../src/lib/looks';
import { withWords, wordsOf, wordsFor, lineLabel, titleLabel, LINE_ON, TITLE_ON } from '../src/lib/design';
import { OCCASION_SECTIONS, sectionLabel, SECTION_BY_KEY } from '../src/lib/sections';

/**
 * A look's words are written for a wedding. These are about what happens when
 * one is asked to speak for a christening — which the owner found by making a
 * christening design and reading "THE WEDDING OF" over the child's name.
 */

test('a look does not put its wedding words in another occasion’s mouth', () => {
  // the one that reached guests: the modern look's cover line is the phrase
  // itself, and a look's cover line replaces the eyebrow the app words per
  // occasion ("The Christening of").
  assert.equal(lookLine(LOOK_BY_KEY.modern, 'en', 'cover'), 'The wedding of', 'as written');
  assert.equal(lookLine(LOOK_BY_KEY.modern, 'en', 'cover', 'WEDDING'), 'The wedding of');
  assert.equal(lookLine(LOOK_BY_KEY.modern, 'en', 'cover', 'CHRISTENING'), undefined, 'so the app’s own eyebrow stands');
  assert.equal(lookLine(LOOK_BY_KEY.modern, 'en', 'cover', 'KIDS_BIRTHDAY'), undefined);

  // and the rest of the wedding wording
  assert.match(lookLine(LOOK_BY_KEY.heritage, 'en', 'invitation', 'WEDDING') ?? '', /I do/);
  assert.doesNotMatch(lookLine(LOOK_BY_KEY.heritage, 'en', 'invitation', 'CHRISTENING') ?? '', /I do/);
  assert.match(lookLine(LOOK_BY_KEY.heritage, 'en', 'galleryClose', 'WEDDING') ?? '', /love stories/);
  assert.doesNotMatch(lookLine(LOOK_BY_KEY.heritage, 'en', 'galleryClose', 'CHRISTENING') ?? '', /love stories/);
});

test('a christening has words of its own, in both languages, whichever look is set', () => {
  for (const look of ['heritage', 'romance', 'modern', 'editorial', 'regal'] as const) {
    const en = lookLine(LOOK_BY_KEY[look], 'en', 'invitation', 'CHRISTENING');
    const tl = lookLine(LOOK_BY_KEY[look], 'tl', 'invitation', 'CHRISTENING');
    assert.match(en ?? '', /little one/, `${look} in English`);
    assert.match(tl ?? '', /munting anghel/, `${look} in Tagalog`);
  }
  // the verse on a christening's cover is a baptism verse, not a wedding one
  assert.match(lookLine(LOOK_BY_KEY.heritage, 'en', 'verse', 'CHRISTENING') ?? '', /little children/);
  assert.equal(lookLine(LOOK_BY_KEY.heritage, 'en', 'verseRef', 'CHRISTENING'), 'Matthew 19:14');
  // and the heading over the photographs is the baby's, not a prenup's
  assert.equal(lookTitle(LOOK_BY_KEY.heritage, 'en', 'gallery', 'WEDDING'), 'Prenup Photos');
  assert.equal(lookTitle(LOOK_BY_KEY.heritage, 'en', 'gallery', 'CHRISTENING'), 'Baby Photos');
});

/**
 * The rule is about a look's stock wording and must never touch words somebody
 * typed for this design. They are the same shape once `withWords` has folded
 * them in, so the provenance is recorded as it happens.
 */
test('what a design writes for itself is never withheld', () => {
  const own = withWords(LOOK_BY_KEY.modern, wordsOf({ en: { cover: 'The christening of' } }));
  assert.equal(lookLine(own, 'en', 'cover', 'CHRISTENING'), 'The christening of');
  // the language she did not write falls to the occasion's own words rather
  // than to the look's "Ang kasal nina"
  assert.notEqual(lookLine(own, 'tl', 'cover', 'CHRISTENING'), LOOK_BY_KEY.modern.lines.cover.tl);
  // a heading too
  const head = withWords(LOOK_BY_KEY.heritage, wordsOf({ en: { 'title:gallery': 'Our Little One' } }));
  assert.equal(lookTitle(head, 'en', 'gallery', 'CHRISTENING'), 'Our Little One');
});

/**
 * And the names of the boxes. "Prenup — under the heading" was offered on a
 * christening for a part the app itself calls Baby photos, alongside boxes for
 * Entourage and The Moment, which a christening has not got.
 */
test('a writing is named in the occasion’s own words', () => {
  assert.equal(lineLabel('gallery', 'WEDDING'), 'Prenup photos & video — under the heading');
  assert.equal(lineLabel('gallery', 'CHRISTENING'), 'Baby photos — under the heading');
  assert.equal(lineLabel('invitation', 'CHRISTENING'), 'Church & Mass — under the heading');
  assert.equal(titleLabel('gallery', 'CHRISTENING'), 'Baby photos');
  assert.equal(titleLabel('venue', 'DEBUT'), 'Venue');
  // two headings name the same part, so the second says which it is
  assert.equal(titleLabel('getting', 'DEBUT'), 'Venue \u2014 getting there');
  assert.notEqual(titleLabel('getting', 'WEDDING'), titleLabel('venue', 'WEDDING'));
});

test('only the writings an occasion actually has are offered', () => {
  const c = wordsFor('CHRISTENING');
  assert.ok(!c.lines.includes('entourage'), 'a christening has no entourage');
  assert.ok(!c.lines.includes('moment1'), 'and no Moment');
  assert.ok(c.lines.includes('gallery') && c.lines.includes('verse'));
  assert.ok(!c.titles.includes('entourage'));

  const w = wordsFor('WEDDING');
  assert.ok(w.lines.includes('entourage') && w.lines.includes('moment1'));
  assert.ok(!w.lines.includes('sponsors'), 'a wedding’s sponsors are in its entourage, not a part of their own');
});

/**
 * Every writing has to name a part the occasion could carry, or `sectionLabel`
 * throws and the form goes down. This is the test that would have caught the
 * map being wrong at all.
 */
test('every writing and heading names a part the app knows', () => {
  for (const [key, { on }] of Object.entries(LINE_ON)) {
    assert.ok(on in SECTION_BY_KEY, `${key} names ${on}`);
  }
  for (const [key, on] of Object.entries(TITLE_ON)) {
    assert.ok(on in SECTION_BY_KEY, `heading ${key} names ${on}`);
  }
  // and every occasion can be asked about every writing it carries
  for (const occasion of ['WEDDING', 'CHRISTENING', 'DEBUT', 'MEMORIAL', 'KIDS_BIRTHDAY'] as const) {
    const offered = wordsFor(occasion);
    for (const k of offered.lines) assert.ok(lineLabel(k, occasion).length > 3, `${occasion}/${k}`);
    for (const k of offered.titles) assert.ok(titleLabel(k, occasion).length > 1, `${occasion}/${k}`);
    // what is offered is a subset of what the occasion carries
    const has = new Set<string>(OCCASION_SECTIONS[occasion]);
    for (const k of offered.lines) assert.ok(has.has(LINE_ON[k].on), `${occasion} carries ${LINE_ON[k].on}`);
  }
  // the labels really are the occasion's own words, not a second list
  assert.equal(titleLabel('gallery', 'KIDS_BIRTHDAY'), sectionLabel('gallery', 'KIDS_BIRTHDAY'));
});
