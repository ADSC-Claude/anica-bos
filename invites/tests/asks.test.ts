import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fieldsFor, customerFields, OCCASION_SECTIONS, SECTION_BY_KEY, blankSections, skippedSections, sectionAlwaysShows,
  type Content, type Field, type SectionKey,
} from '../src/lib/sections';

const find = (fs: Field[], key: string) => fs.find((f) => f.key === key);
const sub = (fs: Field[], key: string, item: string) => find(fs, key)?.item?.find((i) => i.key === item);

/** The ten asks the owner named on 10 September, each where a design can bind it. */
test('the new asks are offered where they belong and nowhere else', () => {
  // a landscape photo on every cover, because a cover photo is a portrait
  for (const occ of ['WEDDING', 'CHRISTENING', 'DEBUT'] as const) {
    assert.equal(find(fieldsFor('cover', occ), 'bannerPhoto')?.type, 'image', occ);
  }

  // the childhood pair: a wedding has two, a debut is one person, nobody else is asked
  // in the photographs block, because a debut has no Our Story block at all
  const wed = find(fieldsFor('gallery', 'WEDDING'), 'little');
  assert.equal(wed?.max, 2);
  assert.equal(wed?.label, 'When we were little');
  assert.equal(find(fieldsFor('gallery', 'DEBUT'), 'little')?.label, 'When I was little');
  assert.equal(find(fieldsFor('gallery', 'CHRISTENING'), 'little'), undefined);
  assert.equal(sub(fieldsFor('gallery', 'WEDDING'), 'little', 'url')?.required, true);

  // month by month: the first year, for the two occasions that have one
  for (const occ of ['CHRISTENING', 'KIDS_BIRTHDAY'] as const) {
    const months = find(fieldsFor('gallery', occ), 'months');
    assert.equal(months?.max, 12, occ);
    assert.equal(sub(fieldsFor('gallery', occ), 'months', 'label')?.required, true, occ);
  }
  assert.equal(find(fieldsFor('gallery', 'WEDDING'), 'months'), undefined);

  // the family and the parents, one photograph each, and a second clip for a spoken message
  const gal = fieldsFor('gallery', 'WEDDING');
  assert.equal(find(gal, 'familyPhoto')?.type, 'image');
  assert.equal(find(gal, 'parentsPhoto')?.type, 'image');
  assert.equal(find(gal, 'messageVideoUrl')?.type, 'url');

  // the godparents together, and their blessing
  const spon = fieldsFor('sponsors', 'CHRISTENING');
  assert.equal(find(spon, 'groupPhoto')?.type, 'image');
  assert.equal(find(spon, 'blessing')?.max, 240);

  // a message from the parents, on the closing page every package carries
  assert.equal(find(fieldsFor('closing', 'CHRISTENING'), 'parentsMessage')?.max, 240);

  // a dedication where there is somebody to dedicate it to, and the debutante's
  // own note — on the closing page, which every occasion carries in every package
  assert.equal(find(fieldsFor('closing', 'CHRISTENING'), 'dedication')?.max, 240);
  assert.equal(find(fieldsFor('closing', 'MILESTONE_BIRTHDAY'), 'dedication')?.label, 'A dedication to the celebrant');
  assert.equal(find(fieldsFor('closing', 'WEDDING'), 'dedication'), undefined);
  assert.equal(find(fieldsFor('closing', 'DEBUT'), 'debutNote')?.max, 320);
  assert.equal(find(fieldsFor('closing', 'WEDDING'), 'debutNote'), undefined);
});

/** A design promises what it shows, so the gallery cannot be handed thirty photographs. */
test('the gallery holds twelve photographs, and the extras take the rest', () => {
  assert.equal(find(fieldsFor('gallery', 'WEDDING'), 'photos')?.max, 12);
  const extras = fieldsFor('extras', 'WEDDING');
  assert.equal(find(extras, 'photos')?.max, 30);
  assert.equal(find(extras, 'videoUrl')?.type, 'url');
  assert.equal(find(extras, 'note')?.max, 300);
});

/** Examples are for the customer's own writing. An encoder filling twenty boxes gets none. */
test('ready-made examples sit only on fields a customer writes', () => {
  const withExamples: string[] = [];
  for (const occ of Object.keys(OCCASION_SECTIONS) as (keyof typeof OCCASION_SECTIONS)[]) {
    for (const key of OCCASION_SECTIONS[occ]) {
      for (const f of fieldsFor(key, occ)) {
        if (!f.examples?.length) continue;
        assert.notEqual(f.staff, true, `${key}.${f.key} is a staff field with examples`);
        assert.ok(f.type === 'text' || f.type === 'textarea', `${key}.${f.key}`);
        for (const e of f.examples) {
          assert.ok(e.en.length > 0 && e.tl.length > 0, `${key}.${f.key} example ${e.key}`);
          // an example that does not fit the box it fills would be cut on save
          if (f.max) assert.ok(e.en.length <= f.max && e.tl.length <= f.max, `${key}.${f.key} example ${e.key} is longer than ${f.max}`);
        }
        withExamples.push(`${key}.${f.key}`);
      }
    }
  }
  for (const path of ['story.howWeMet', 'story.proposal', 'closing.dedication', 'closing.debutNote', 'sponsors.blessing', 'closing.parentsMessage']) {
    assert.ok(withExamples.includes(path), `${path} has no examples`);
  }
  // and they survive the cut that hides our own fields from the customer
  const shown = customerFields(fieldsFor('closing', 'DEBUT'));
  assert.ok(find(shown, 'debutNote')?.examples?.length);
});

/** The extras block is last, and is never something a customer has left undone. */
test('extras come last, and never count as missing', () => {
  for (const occ of Object.keys(OCCASION_SECTIONS) as (keyof typeof OCCASION_SECTIONS)[]) {
    const list = OCCASION_SECTIONS[occ];
    assert.equal(list[list.length - 1], 'extras', occ);
  }
  assert.equal(SECTION_BY_KEY.extras.optional, true);
  assert.equal(SECTION_BY_KEY.extras.hidden, undefined);
  const empty = {} as Content;
  assert.equal(blankSections('WEDDING', empty, 'COMPLETE').includes('extras' as SectionKey), false);
});

/** Nothing vanishes as a surprise: what is blank is named, and what would not show is separated out. */
test('blank and skipped sections read the way the form says they will', () => {
  const empty = {} as Content;
  const blanks = blankSections('CHRISTENING', empty, 'COMPLETE');
  assert.ok(blanks.includes('story' as SectionKey));
  assert.ok(blanks.includes('cover' as SectionKey));

  const skipped = skippedSections('CHRISTENING', empty, 'COMPLETE');
  // the cover is the invitation, the RSVP is its own form and the countdown is a switch
  for (const key of ['cover', 'rsvp', 'countdown'] as SectionKey[]) {
    assert.equal(sectionAlwaysShows(key), true, key);
    assert.equal(skipped.includes(key), false, key);
  }
  assert.ok(skipped.includes('story' as SectionKey));
  assert.ok(skipped.every((k) => blanks.includes(k)));

  // a filled section is neither blank nor skipped
  const withStory = { story: { timeline: [{ title: 'The Prayer', text: 'It started with a prayer.' }] } } as unknown as Content;
  assert.equal(blankSections('CHRISTENING', withStory, 'COMPLETE').includes('story' as SectionKey), false);

  // a section above the package is not the customer's to fill, so it is not counted
  assert.equal(blankSections('CHRISTENING', empty, 'BASIC').includes('story' as SectionKey), false);
});

/** An ask placed in a section an occasion does not have is an ask nobody is ever made. */
test('every new ask sits in a section its occasion is offered', () => {
  const has = (occ: keyof typeof OCCASION_SECTIONS, key: SectionKey) => OCCASION_SECTIONS[occ].includes(key);
  assert.equal(has('DEBUT', 'story' as SectionKey), false, 'a debut has no Our Story block');
  for (const occ of ['WEDDING', 'DEBUT'] as const) assert.ok(has(occ, 'gallery' as SectionKey), occ);
  for (const occ of ['CHRISTENING', 'COMMUNION', 'KIDS_BIRTHDAY', 'MILESTONE_BIRTHDAY', 'BABY_SHOWER', 'DEBUT'] as const) assert.ok(has(occ, 'closing' as SectionKey), occ);
  assert.ok(has('CHRISTENING', 'sponsors' as SectionKey));
  for (const occ of ['CHRISTENING', 'KIDS_BIRTHDAY'] as const) assert.ok(has(occ, 'gallery' as SectionKey), occ);
});
