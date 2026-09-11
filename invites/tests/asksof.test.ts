import test from 'node:test';
import assert from 'node:assert/strict';
import type { Occasion } from '@prisma/client';
import { builtinDesign, documentOf, type DesignDoc, type PhotoEl, type TextEl } from '../src/lib/design';
import { asksOf, askable, roomFor, askCounts, shapeOf, SHAPE_GUIDANCE, fieldOf, designForm, askedFields, askedLimits, asksNothing } from '../src/lib/asks';
import { sectionsFor, fieldsFor, OCCASION_SECTIONS } from '../src/lib/sections';

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
