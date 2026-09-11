import test from 'node:test';
import assert from 'node:assert/strict';
import type { Occasion } from '@prisma/client';
import { builtinDesign, documentOf, type DesignDoc, type PhotoEl, type TextEl } from '../src/lib/design';
import { asksOf, askable, roomFor, askCounts, shapeOf, SHAPE_GUIDANCE, fieldOf, designForm, askedFields, askedLimits, asksNothing, designBinds, designMedia } from '../src/lib/asks';
import { sectionsFor, fieldsFor, OCCASION_SECTIONS } from '../src/lib/sections';
import { pageNeeds } from '../src/lib/needs';

const base = builtinDesign('babyblue')!;
const clone = (): DesignDoc => JSON.parse(JSON.stringify(base));

/** Marking a frame is the whole gesture; everything else follows from the document. */
function marked(): DesignDoc {
  const doc = clone();
  const story = doc.pages.find((p) => p.key === 'story')!;
  (story.elements!.find((e) => e.id === 'story-photo-3') as PhotoEl).ask = true;
  const label = story.elements!.find((e) => e.id === 'story-label-3') as TextEl;
  label.ask = true;
  label.room = 24;
  const photos = doc.pages.find((p) => p.key === 'baby-photos')!;
  const frame = photos.elements!.find((e) => e.id === 'photos-photo-1') as PhotoEl;
  frame.ask = true;
  frame.ifEmpty = 'leave';
  return doc;
}

test('nothing is asked for until she marks something', () => {
  assert.deepEqual(asksOf(base, 'CHRISTENING'), []);
  assert.deepEqual(asksOf(null, 'CHRISTENING'), []);
});

test('a marked frame becomes a question, named where a customer would look for it', () => {
  const asks = asksOf(marked(), 'CHRISTENING');
  assert.equal(asks.length, 3);
  const [photo, words, first] = asks;
  assert.equal(photo.id, 'story-photo-3');
  assert.equal(photo.page, 'story');
  assert.equal(photo.kind, 'photo');
  assert.deepEqual(photo.ref, { section: 'story', field: 'timeline', index: 2, sub: 'photo' });
  // the frame is one of six, and the label says so
  assert.match(photo.label, /\(3 of 6\)/);
  assert.equal(photo.orphan, undefined);

  assert.equal(words.kind, 'text');
  assert.equal(words.room, 24);
  assert.equal(words.shape, undefined);

  assert.equal(first.id, 'photos-photo-1');
  assert.equal(first.ifEmpty, 'leave');
  // the pages run in order, and so does the list
  assert.deepEqual(asks.map((a) => a.page), ['story', 'story', 'baby-photos']);
});

/** A square frame is not a portrait, and a customer should be told which. */
test('a frame tells the customer what shape to send', () => {
  assert.equal(shapeOf(1), 'square');
  assert.equal(shapeOf(1.5), 'portrait');
  assert.equal(shapeOf(2.2), 'tall');
  assert.equal(shapeOf(0.7), 'landscape');
  assert.equal(shapeOf(0.4), 'wide');
  assert.equal(shapeOf(undefined), 'square');
  const asks = asksOf(marked(), 'CHRISTENING');
  assert.equal(asks[0].shape, 'square');
  assert.equal(asks[0].guidance, SHAPE_GUIDANCE.square);
  assert.match(asks[0].guidance!, /middle/);
});

/**
 * A design ticked for several occasions can point at a field one of them
 * does not have. That is not an error — the frame simply stays empty there —
 * but it has to be said, not discovered by a customer.
 */
test('a field the occasion does not have is named as one', () => {
  const doc = marked();
  const story = doc.pages.find((p) => p.key === 'story')!;
  (story.elements!.find((e) => e.id === 'story-photo-3') as PhotoEl).bind = { section: 'entourage', field: 'nope', index: 0, sub: 'photo' };
  const asks = asksOf(doc, 'CHRISTENING');
  assert.equal(asks[0].orphan, true);
  assert.equal(asks[0].field, undefined);
  assert.equal(askCounts(asks).orphans, 1);
  // and the same binding on an occasion that does have it is not an orphan
  assert.equal(fieldOf({ section: 'story', field: 'timeline', sub: 'photo' }, 'CHRISTENING')?.type, 'image');
  assert.equal(fieldOf({ section: 'story', field: 'timeline', sub: 'photo' }, 'DEBUT'), undefined, 'a debut has no Our Story block');
});

/** The box she drew is the cap the form counts down from, and the smallest box wins. */
test('two boxes asking the same field agree on the smaller', () => {
  const doc = marked();
  const story = doc.pages.find((p) => p.key === 'story')!;
  const second = JSON.parse(JSON.stringify(story.elements!.find((e) => e.id === 'story-label-3'))) as TextEl;
  second.id = 'story-label-3b';
  second.room = 16;
  story.elements!.push(second);
  const room = roomFor(asksOf(doc, 'CHRISTENING'));
  assert.equal(room['story.timeline.title'], 16);
});

test('the counts are what the publish line quotes', () => {
  const c = askCounts(asksOf(marked(), 'CHRISTENING'));
  assert.equal(c.photos, 2);
  assert.equal(c.writings, 1);
  assert.equal(c.orphans, 0);
});

/**
 * The picker offers the customer's own fields and not the encoder's: a
 * design should never be able to ask a customer for a writing that is ours
 * to set.
 */
test('the picker offers a customer’s fields, by kind, and never a staff one', () => {
  const photos = askable('CHRISTENING', 'photo');
  const words = askable('CHRISTENING', 'text');
  assert.ok(photos.some((a) => a.section === 'story' && a.field === 'timeline' && a.sub === 'photo' && a.list));
  assert.ok(photos.every((a) => a.type === 'image'));
  assert.ok(words.every((a) => a.type === 'text' || a.type === 'textarea'));
  assert.equal(photos.some((a) => a.type === 'textarea'), false);
  // story.line is ours to write, so it is not on offer
  assert.equal(words.some((a) => a.section === 'story' && a.field === 'line'), false);
  // and a debut, which has no Our Story, is never offered its fields
  assert.equal(askable('DEBUT', 'photo').some((a) => a.section === 'story'), false);
  assert.ok(askable('DEBUT', 'photo').some((a) => a.section === 'gallery'));
});

// ---------------------------------------------------------------------------
// The form this design asks for
// ---------------------------------------------------------------------------

/**
 * The contract, and the reason this can be wired into a live form at all: a
 * design that says nothing about a field gives back the very field it was
 * given, and a section it says nothing about gives back the very array. Not
 * an equal one — the same one. Identity is the plainest way to say "today's
 * form, untouched", and every design in the catalogue today says nothing.
 */
test('a design asking for nothing leaves every form exactly as it is', () => {
  const nothing = designForm(null, 'WEDDING' as never);
  assert.equal(asksNothing(nothing), true);
  let checked = 0;
  for (const occasion of Object.keys(OCCASION_SECTIONS) as Occasion[]) {
    const form = designForm(null, occasion);
    for (const def of sectionsFor(occasion)) {
      const fields = fieldsFor(def.key, occasion);
      assert.equal(askedFields(fields, def.key, form), fields);
      assert.deepEqual(askedLimits(def.key, form), {});
      checked++;
    }
  }
  assert.ok(checked > 100, `only ${checked} sections checked`);
});

test('the two designs as published say nothing about the form', () => {
  // their `design` column is empty: the document is the studio's, not theirs
  assert.equal(asksNothing(designForm(documentOf({ design: {}, layout: 'babyblue' }), 'CHRISTENING' as never)), true);
});

test('a design drawn with frames caps the list at what it draws', () => {
  const form = designForm(builtinDesign('babyblue'), 'CHRISTENING' as never);
  assert.equal(form.rows['gallery.photos'], 4);
  assert.equal(form.rows['story.timeline'], 6);
  assert.deepEqual(askedLimits('gallery', form), { photos: 4 });
  assert.deepEqual(askedLimits('story', form), { timeline: 6 });
  assert.deepEqual(askedLimits('closing', form), {});

  const fields = fieldsFor('gallery', 'CHRISTENING' as never);
  const photos = fields.find((f) => f.key === 'photos')!;
  assert.ok((photos.max ?? 0) > 4, 'the occasion allows more than the design draws');
  const asked = askedFields(fields, 'gallery', form);
  assert.notEqual(asked, fields);
  assert.equal(asked.find((f) => f.key === 'photos')!.max, 4);
  // and nothing else in the section moved
  for (const f of asked) if (f.key !== 'photos') assert.equal(f, fields.find((x) => x.key === f.key));
});

test('a box she measured caps the question, and never raises it', () => {
  const doc = JSON.parse(JSON.stringify(builtinDesign('babyblue'))) as DesignDoc;
  const label = doc.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.id === 'story-label-1') as TextEl;
  label.ask = true;
  label.room = 9;
  const form = designForm(doc, 'CHRISTENING' as never);
  assert.equal(form.room['story.timeline.title'], 9);

  const fields = fieldsFor('story', 'CHRISTENING' as never);
  const timeline = fields.find((f) => f.key === 'timeline')!;
  const title = timeline.item!.find((f) => f.key === 'title')!;
  assert.ok((title.max ?? 0) > 9);
  const asked = askedFields(fields, 'story', form);
  assert.equal(asked.find((f) => f.key === 'timeline')!.item!.find((f) => f.key === 'title')!.max, 9);

  // a box roomier than the question leaves the question alone
  label.room = 500;
  const roomy = designForm(doc, 'CHRISTENING' as never);
  assert.equal(askedFields(fields, 'story', roomy).find((f) => f.key === 'timeline')!.item!.find((f) => f.key === 'title')!.max, title.max);
});

test('the shape she drew becomes the hint, after whatever the field already said', () => {
  const doc = JSON.parse(JSON.stringify(builtinDesign('babyblue'))) as DesignDoc;
  const frame = doc.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.id === 'story-photo-1') as PhotoEl;
  frame.ask = true;
  frame.aspect = 1.5;
  const form = designForm(doc, 'CHRISTENING' as never);
  assert.match(form.shape['story.timeline.photo'], /Upright, taller than it is wide/);

  const fields = fieldsFor('story', 'CHRISTENING' as never);
  const own = fields.find((f) => f.key === 'timeline')!.item!.find((f) => f.key === 'photo')!;
  const asked = askedFields(fields, 'story', form).find((f) => f.key === 'timeline')!.item!.find((f) => f.key === 'photo')!;
  assert.match(asked.hint!, /Upright, taller than it is wide/);
  if (own.hint) assert.ok(asked.hint!.startsWith(own.hint), 'the field keeps what it already said');
});

test('two frames of different shapes on one field say nothing rather than half a truth', () => {
  const doc = JSON.parse(JSON.stringify(builtinDesign('babyblue'))) as DesignDoc;
  const els = doc.pages.find((p) => p.key === 'story')!.elements!;
  const a = els.find((e) => e.id === 'story-photo-1') as PhotoEl;
  const b = els.find((e) => e.id === 'story-photo-2') as PhotoEl;
  a.ask = true; a.aspect = 1.5;
  b.ask = true; b.aspect = 0.6;
  assert.equal(designForm(doc, 'CHRISTENING' as never).shape['story.timeline.photo'], undefined);
  // agreeing, they speak
  b.aspect = 1.5;
  assert.match(designForm(doc, 'CHRISTENING' as never).shape['story.timeline.photo'], /Upright/);
});

test('a cut frame tells the customer what the cut will do to their photograph', () => {
  const doc = JSON.parse(JSON.stringify(builtinDesign('babyblue'))) as DesignDoc;
  const page = doc.pages.find((p) => p.key === 'baby-photos')!;
  const frames = page.elements!.filter((e) => e.kind === 'photo') as PhotoEl[];
  frames.forEach((f) => { f.ask = true; });
  (frames[1] as PhotoEl).mask = 'circle';
  (frames[2] as PhotoEl).mask = 'arch';
  (frames[3] as PhotoEl).mask = 'none';
  const asks = asksOf(doc, 'CHRISTENING' as never).filter((a) => a.page === 'baby-photos');
  assert.equal(asks.length, 4);
  // square corners say nothing extra, and never have
  assert.equal(asks[0].guidance, SHAPE_GUIDANCE.square);
  assert.equal(asks[3].guidance, SHAPE_GUIDANCE.square);
  // a cut one says the shape first and then what the cut does to it
  assert.ok(asks[1].guidance!.startsWith(SHAPE_GUIDANCE.square));
  assert.match(asks[1].guidance!, /cut to a circle/);
  assert.match(asks[2].guidance!, /cut to an arch/);
  // and the shape itself is untouched: a cut is not a shape
  assert.equal(asks[1].shape, 'square');
});

test('a line the designer marks is offered to the customer as a starting point', () => {
  const doc = clone();
  const story = doc.pages.find((p) => p.key === 'story')!;
  const label = story.elements!.find((e) => e.id === 'story-label-1') as TextEl;
  // the box already reads the customer's answer; give it words of its own
  label.lines[0].sources.push({ fixed: { en: 'The day we first prayed for you', tl: 'Ang araw na una kang ipinagdasal' } });
  label.offerLine = true;
  const form = designForm(doc, 'CHRISTENING' as never);
  const ref = label.lines[0].sources.flatMap((s) => ('bind' in s ? [s.bind] : []))[0];
  const key = `${ref.section}.${ref.field}${ref.sub ? `.${ref.sub}` : ''}`;
  assert.deepEqual(form.example[key], { en: 'The day we first prayed for you', tl: 'Ang araw na una kang ipinagdasal' });

  // and it arrives on the field, last, after anything the app already offers
  const before = fieldsFor('story', 'CHRISTENING' as never);
  const after = askedFields(before, 'story', form);
  const find = (fs: typeof before, k: string): typeof before[number] | undefined => fs.find((f) => f.key === k);
  const list = find(after, ref.field);
  assert.ok(list?.item, 'the timeline is a list of rows');
  const box = list!.item!.find((f) => f.key === ref.sub);
  assert.ok(box, `no ${ref.sub} on the row`);
  const last = box!.examples![box!.examples!.length - 1];
  assert.equal(last.key, 'design');
  assert.equal(last.en, 'The day we first prayed for you');
  assert.equal(last.tl, 'Ang araw na una kang ipinagdasal');
  // whatever the app offered is still there, first
  const was = find(before, ref.field)!.item!.find((f) => f.key === ref.sub)!;
  assert.equal(box!.examples!.length, (was.examples?.length ?? 0) + 1);
});

test('an offer needs both a customer field and words of the designer’s own', () => {
  const key = (d: ReturnType<typeof clone>) => Object.keys(designForm(d, 'CHRISTENING' as never).example);
  // marked, but the words come from the look rather than from her
  const fromLook = clone();
  const a = fromLook.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.id === 'story-label-1') as TextEl;
  a.lines[0].sources.push({ word: 'storyLine' as never });
  a.offerLine = true;
  assert.deepEqual(key(fromLook), []);

  // her words, but nothing on the form reads this box at all
  const noField = clone();
  const b = noField.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.id === 'story-head') as TextEl;
  b.lines = [{ role: 'title', sources: [{ fixed: { en: 'Our Story' } }] }];
  b.offerLine = true;
  assert.deepEqual(key(noField), []);

  // her words on a bound box, but never marked
  const unmarked = clone();
  const c = unmarked.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.id === 'story-label-1') as TextEl;
  c.lines[0].sources.push({ fixed: { en: 'Something' } });
  assert.deepEqual(key(unmarked), []);

  // and with nothing marked anywhere the form is the form it always was
  const plain = designForm(clone(), 'CHRISTENING' as never);
  assert.deepEqual(plain.example, {});
  const fields = fieldsFor('story', 'CHRISTENING' as never);
  assert.equal(askedFields(fields, 'story', plain), fields);
});

test('English only is offered in English, rather than left out of Tagalog', () => {
  const doc = clone();
  const label = doc.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.id === 'story-label-1') as TextEl;
  label.lines[0].sources.push({ fixed: { en: 'A first Christmas' } });
  label.offerLine = true;
  const one = Object.values(designForm(doc, 'CHRISTENING' as never).example)[0];
  assert.deepEqual(one, { en: 'A first Christmas', tl: 'A first Christmas' });
});

// --- the media field every part carries ------------------------------------

/**
 * A place for a picture of the customer's on any part of the invitation,
 * which exists only where a design drew a frame for it. The point of it is
 * that a form does not grow for a design that does not use it, so the first
 * test is that nothing changes.
 */
test('the media field is nowhere until a design draws a frame for it', () => {
  const bare = designForm(null, 'CHRISTENING' as never);
  for (const section of ['story', 'ceremony', 'reception', 'closing'] as const) {
    const fields = fieldsFor(section, 'CHRISTENING' as never);
    const media = fields.find((f) => f.byDesign);
    // it is in the definition, and it is staff's, and it is dropped
    if (media) assert.equal(media.staff, true, section);
    const shown = designMedia(fields, section, bare);
    assert.equal(shown.some((f) => f.byDesign), false, `${section} still offers it`);
    // a section that has none hands back the very array
    if (!media) assert.equal(shown, fields, section);
  }
});

test('a design that draws a frame for it makes it the customer’s own question', () => {
  const doc = builtinDesign('babyblue')!;
  const story = doc.pages.find((p) => p.key === 'story')!;
  story.elements = [
    ...(story.elements ?? []),
    { id: 'their-picture', kind: 'photo', x: 50, y: 50, w: 40, anchor: 'centre', ask: true, bind: { section: 'story', field: 'photo' } },
  ];
  const form = designForm(doc, 'CHRISTENING' as never);
  assert.equal(designBinds(form, 'story', 'photo'), true);
  assert.equal(designBinds(form, 'invitation', 'photo'), false);

  const shown = designMedia(fieldsFor('story', 'CHRISTENING' as never), 'story', form);
  const media = shown.find((f) => f.key === 'photo')!;
  assert.ok(media, 'the field is there');
  assert.equal(media.staff, undefined, 'and it is not staff’s any more');
  assert.equal(media.type, 'image');
  // and the part next door still does not have it
  assert.equal(designMedia(fieldsFor('ceremony', 'CHRISTENING' as never), 'ceremony', form).some((f) => f.byDesign), false);
});

test('the picker offers the media fields, which is how a design can bind one', () => {
  const offers = askable('CHRISTENING' as never, 'photo');
  const story = offers.find((o) => o.section === 'story' && o.field === 'photo');
  assert.ok(story, 'the story part offers a photo of the customer’s');
  // the encoder's own writings are still never offered
  assert.equal(offers.some((o) => o.field === 'verse'), false);
});

test('a frame using a picture without asking for it still counts as a place for it', () => {
  const doc = builtinDesign('capiz')!;
  const page = doc.pages.find((p) => (p.elements ?? []).length > 0) ?? doc.pages[0];
  page.elements = [
    ...(page.elements ?? []),
    // no `ask`: the design uses it if it is there
    { id: 'quiet', kind: 'photo', x: 50, y: 50, w: 30, anchor: 'centre', bind: { section: 'social', field: 'photo' } },
  ];
  const form = designForm(doc, 'WEDDING' as never);
  assert.equal(designBinds(form, 'social', 'photo'), true);
  assert.equal(designMedia(fieldsFor('social', 'WEDDING' as never), 'social', form).some((f) => f.key === 'photo' && !f.staff), true);
});

test('a frame on the media field is not an orphan, and the sheet gives it the part’s name', () => {
  const doc = builtinDesign('babyblue')!;
  const story = doc.pages.find((p) => p.key === 'story')!;
  story.elements = [
    ...(story.elements ?? []),
    { id: 'their-picture', kind: 'photo', x: 50, y: 50, w: 40, anchor: 'centre', ask: true, bind: { section: 'story', field: 'photo' } },
  ];
  const ask = asksOf(doc, 'CHRISTENING' as never).find((a) => a.id === 'their-picture')!;
  assert.ok(ask, 'it is asked for');
  assert.equal(ask.orphan, undefined, 'and the occasion has the field');
  assert.match(ask.label, /A photo for this part/);
  assert.match(ask.label, /Our story/);
  // and the checklist says nothing about an orphan either
  assert.deepEqual(pageNeeds({ doc, occasion: 'CHRISTENING' as never }).filter((n) => n.rule === 'orphan'), []);
});
