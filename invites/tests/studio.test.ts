import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinDesign, designChange, blastRadius, filledRows, frameLists, studioDoc,
  type DesignDoc, type PhotoEl,
} from '../src/lib/design';
import { can, PERMISSIONS } from '../src/lib/rbac';

const base = builtinDesign('babyblue')!;
const clone = (d: DesignDoc): DesignDoc => JSON.parse(JSON.stringify(d));

/** Frames added and taken away, per list, with the page they are drawn on. */
test('frameLists names every list a design gives frames to', () => {
  assert.deepEqual(frameLists(base).map((f) => `${f.page}:${f.section}.${f.field}=${f.count}`).sort(), [
    'baby-photos:gallery.photos=4',
    'story:story.timeline=6',
  ]);
  assert.deepEqual(frameLists(null), []);
  assert.deepEqual(frameLists(builtinDesign('capiz')), []);
});

test('designChange: nothing changed is nothing reported', () => {
  const c = designChange(base, clone(base));
  assert.deepEqual(c.frames, []);
  assert.deepEqual(c.pagesAdded, []);
  assert.deepEqual(c.pagesRemoved, []);
  assert.deepEqual(c.sectionsAdded, []);
  assert.deepEqual(c.sectionsRemoved, []);
});

test('designChange: a page gone, a page added, a section no longer carried', () => {
  const after = clone(base);
  after.pages = after.pages.filter((p) => p.key !== 'sponsors');
  after.pages.push({ key: 'thanks', sections: ['closing'] });
  const c = designChange(base, after);
  assert.deepEqual(c.pagesRemoved, ['sponsors']);
  assert.deepEqual(c.pagesAdded, ['thanks']);
  assert.deepEqual(c.sectionsRemoved, ['sponsors']);
  assert.deepEqual(c.sectionsAdded, []);
});

test('designChange: a fifth frame, and a timeline cut to four', () => {
  const after = clone(base);
  const photos = after.pages.find((p) => p.key === 'baby-photos')!;
  const fifth = JSON.parse(JSON.stringify(photos.elements!.find((e) => e.id === 'photos-photo-4'))) as PhotoEl;
  fifth.id = 'photos-photo-5';
  (fifth.bind as { index: number }).index = 4;
  fifth.y = 90;
  photos.elements!.push(fifth);
  const story = after.pages.find((p) => p.key === 'story')!;
  story.elements = story.elements!.filter((e) => !/story-(photo|label)-[56]$/.test(e.id));

  const c = designChange(base, after);
  assert.deepEqual(c.frames.map((f) => `${f.section}.${f.field} ${f.from}->${f.to}`).sort(), [
    'gallery.photos 4->5',
    'story.timeline 6->4',
  ]);
  assert.equal(c.frames.find((f) => f.field === 'photos')!.page, 'baby-photos');
});

/** A row counts as filled when anything in it is filled — or, where the design counts by a field, by that one. */
test('filledRows counts what a customer actually gave', () => {
  const content = {
    gallery: { photos: [{ url: '/a.jpg', caption: 'A' }, { url: '', caption: 'a caption and no picture' }, { url: '/c.jpg' }] },
    story: { timeline: [{ title: 'One' }, { title: '', text: '' }, { text: 'Three' }] },
  };
  assert.equal(filledRows(content, 'gallery', 'photos'), 3);
  assert.equal(filledRows(content, 'gallery', 'photos', 'url'), 2);
  assert.equal(filledRows(content, 'story', 'timeline'), 2);
  assert.equal(filledRows(content, 'story', 'nothing'), 0);
  assert.equal(filledRows(null, 'story', 'timeline'), 0);
});

/**
 * What she reads before she presses Publish. The wording in the studio is
 * built from these numbers, so the numbers have to be the true ones.
 */
test('blastRadius counts the invitations a change touches', () => {
  const after = clone(base);
  const story = after.pages.find((p) => p.key === 'story')!;
  story.elements = story.elements!.filter((e) => !/story-(photo|label)-[56]$/.test(e.id));

  const six = { story: { timeline: Array.from({ length: 6 }, (_, i) => ({ title: `M${i + 1}` })) } };
  const four = { story: { timeline: Array.from({ length: 4 }, (_, i) => ({ title: `M${i + 1}` })) } };
  const r = blastRadius(base, after, [
    { status: 'PUBLISHED', content: six },
    { status: 'PUBLISHED', content: six },
    { status: 'PUBLISHED', content: four },
    { status: 'DRAFT', content: six },
  ]);
  assert.equal(r.live, 3);
  assert.equal(r.drafts, 1);
  const cut = r.frames.find((f) => f.field === 'timeline')!;
  assert.equal(cut.from, 6);
  assert.equal(cut.to, 4);
  // three of the four hold a fifth and sixth milestone; their words are kept, not deleted
  assert.equal(cut.beyond, 3);

  // publishing an unchanged design touches nobody's pages
  assert.deepEqual(blastRadius(base, clone(base), [{ status: 'PUBLISHED', content: six }]).frames, []);
});

/** A design opened for the first time is drawn from its base, or there is nothing to draw. */
test('studioDoc: the draft, then what is published, then the built-in', () => {
  const draft = clone(base);
  draft.pages = draft.pages.slice(0, 3);
  assert.equal(studioDoc({ designDraft: draft, layout: 'babyblue' })!.pages.length, 3);
  const published = clone(base);
  published.pages = published.pages.slice(0, 5);
  assert.equal(studioDoc({ design: published, designDraft: {}, layout: 'babyblue' })!.pages.length, 5);
  assert.deepEqual(studioDoc({ design: {}, designDraft: {}, layout: 'babyblue' }), base);
  assert.equal(studioDoc({ layout: 'classic' }), null);
});

/**
 * Saving a draft touches nobody. Publishing redraws every invitation already
 * built on the design, live ones included, so it is not an encoder's to press.
 */
test('publishing a design is the owner’s, drawing one is not', () => {
  assert.ok(PERMISSIONS.includes('templates.publish'));
  assert.equal(can('ADMIN', 'templates.publish'), true);
  assert.equal(can('ENCODER', 'templates.publish'), false);
  assert.equal(can('ENCODER', 'templates.edit'), true);
  assert.equal(can('SUPPORT', 'templates.publish'), false);
  assert.equal(can('CUSTOMER', 'templates.publish'), false);
});
