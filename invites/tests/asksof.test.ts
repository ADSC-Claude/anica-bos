import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinDesign, type DesignDoc, type PhotoEl, type TextEl } from '../src/lib/design';
import { asksOf, askable, roomFor, askCounts, shapeOf, SHAPE_GUIDANCE, fieldOf } from '../src/lib/asks';

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
