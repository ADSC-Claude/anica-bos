import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinDesign, designOf, elementStyle, BABYBLUE_PAGES, BABYBLUE_GROUNDS,
  type PhotoEl, type TextEl, type PageSpec, type Element,
} from '../src/lib/design';
import { STORY_SLOTS, STORY_LABELS, STORY_HEAD, PHOTO_SLOTS, PHOTO_HEAD, slotStyle, labelStyle, captionStyle } from '../src/lib/babyblue';
import { templateData } from '../prisma/templates';
import { TEMPLATES } from '../prisma/templates';

const doc = builtinDesign('babyblue')!;
const page = (key: string): PageSpec => {
  const p = doc.pages.find((x) => x.key === key);
  assert.ok(p, `no page ${key}`);
  return p!;
};
const el = (p: PageSpec, id: string): Element => {
  const e = (p.elements ?? []).find((x) => x.id === id);
  assert.ok(e, `no element ${id} on ${p.key}`);
  return e!;
};

/**
 * The whole point of phase 0: the document says exactly what the code says.
 * A copy of Baby Blue is only worth making if the frames land where the
 * designer put them, to the last decimal.
 */
test('every Baby Blue photo frame lands exactly where slotStyle puts it', () => {
  const story = page('story');
  STORY_SLOTS.forEach((slot, i) => {
    const e = el(story, `story-photo-${i + 1}`) as PhotoEl;
    assert.equal(e.kind, 'photo');
    assert.deepEqual(elementStyle(e), slotStyle(slot), `story frame ${i + 1}`);
    assert.deepEqual(e.bind, { section: 'story', field: 'timeline', index: i, sub: 'photo' });
  });

  const photos = page('baby-photos');
  PHOTO_SLOTS.forEach((slot, i) => {
    const e = el(photos, `photos-photo-${i + 1}`) as PhotoEl;
    assert.deepEqual(elementStyle(e), slotStyle(slot), `photo frame ${i + 1}`);
    // the four frames read the photographs that have a picture, in order:
    // BabyPhotos filters the empty rows out before it indexes them
    assert.deepEqual(e.bind, { section: 'gallery', field: 'photos', index: i, sub: 'url', skipEmpty: true });
    assert.equal(e.aspect, 1);
  });
});

test('every milestone label lands exactly where labelStyle puts it', () => {
  const story = page('story');
  STORY_LABELS.forEach((label, i) => {
    const e = el(story, `story-label-${i + 1}`) as TextEl;
    assert.equal(e.kind, 'text');
    assert.equal(e.block, 'label');
    assert.deepEqual(elementStyle(e), labelStyle(label), `label ${i + 1}`);
    // one block, two lines, exactly as .inv-bb-label holds .t and .x
    assert.deepEqual(e.lines.map((l) => l.role), ['label-title', 'label-text']);
    assert.deepEqual(e.lines[0].sources, [{ bind: { section: 'story', field: 'timeline', index: i, sub: 'title' } }]);
    assert.deepEqual(e.lines[1].sources, [{ bind: { section: 'story', field: 'timeline', index: i, sub: 'text' } }]);
  });
});

/**
 * captionStyle works in cqw (a share of the page's width) because that is
 * what the polaroid's geometry is measured in; the document holds y as a
 * share of the page's HEIGHT, like every other element. On a drawn page the
 * height is the ground's ratio times the width, so the two are the same
 * place. This is the sum that says so.
 */
test('every polaroid caption lands exactly where captionStyle puts it', () => {
  const photos = page('baby-photos');
  const ratio = BABYBLUE_GROUNDS.babyphotos.ratio;
  const cqw = (v: string) => Number(v.replace('cqw', ''));
  const pc = (v: string) => Number(v.replace('%', ''));
  PHOTO_SLOTS.forEach((slot, i) => {
    const e = el(photos, `photos-caption-${i + 1}`) as TextEl;
    assert.equal(e.block, 'caption');
    const mine = elementStyle(e);
    const theirs = captionStyle(slot) as Record<string, string>;
    assert.equal(mine.transform, theirs.transform, `caption ${i + 1} tilt`);
    // left and width are a share of the width in both, so the number must match
    assert.ok(Math.abs(pc(mine.left) - cqw(theirs.left)) < 1e-9, `caption ${i + 1} left`);
    assert.ok(Math.abs(pc(mine.width) - cqw(theirs.width)) < 1e-9, `caption ${i + 1} width`);
    // top is a share of the height here and of the width there: the page's ratio is the bridge
    assert.ok(Math.abs(pc(mine.top) * ratio - cqw(theirs.top)) < 1e-9, `caption ${i + 1} top`);
    assert.deepEqual(e.lines[0].sources, [{ bind: { section: 'gallery', field: 'photos', index: i, sub: 'caption', skipEmpty: true } }]);
  });
});

/**
 * The two headings sit where the designer set them and nowhere else: they
 * carry a top and nothing more, because .inv-bb-head sets left and right
 * itself. An x would box them in and move the words.
 */
test('the two headings keep their top and take no box of their own', () => {
  const head = el(page('story'), 'story-head') as TextEl;
  assert.deepEqual(elementStyle(head), { top: `${STORY_HEAD.titleTop}%` });
  assert.equal(head.block, 'head');
  assert.deepEqual(head.lines.map((l) => l.role), ['title', 'sub']);
  // the look's heading with the design's word over it, then the app's copy
  assert.deepEqual(head.lines[0].sources, [{ word: 'title:story' }, { copy: 'story.title' }]);
  // the client's own line, then the look's — never the app's, as today
  assert.deepEqual(head.lines[1].sources, [{ bind: { section: 'story', field: 'line' } }, { word: 'story' }]);

  const photoHead = el(page('baby-photos'), 'photos-head') as TextEl;
  assert.deepEqual(elementStyle(photoHead), { top: `${PHOTO_HEAD.eyebrowTop}%` });
  assert.deepEqual(photoHead.lines.map((l) => l.role), ['eyebrow', 'script', 'sub']);
  assert.deepEqual(photoHead.lines[0].sources, [{ fixed: { en: 'Share', tl: '' } }]);
  assert.deepEqual(photoHead.lines[1].sources, [{ word: 'title:gallery' }, { copy: 'gallery.title' }]);
  assert.deepEqual(photoHead.lines[2].sources, [{ bind: { section: 'gallery', field: 'line' } }, { word: 'gallery' }]);
});

/** The pages, their grounds and their seams are the ones the renderer walks today. */
test('the document walks the same pages, on the same grounds, in the same order', () => {
  const keys = doc.pages.map((p) => p.key);
  const expected = BABYBLUE_PAGES.flatMap((d) => (d.key === 'baby-photos' ? [d.key, 'baby-photos-more'] : [d.key]));
  assert.deepEqual(keys, expected);
  for (const def of BABYBLUE_PAGES) {
    const p = page(def.key);
    assert.deepEqual(p.sections, def.sections, def.key);
    assert.deepEqual(p.ground, BABYBLUE_GROUNDS[def.bg!], def.key);
    assert.equal(p.seam, def.seam, def.key);
    assert.equal(p.drawn, def.drawn ? true : undefined, def.key);
  }
  // the clip that no frame can hold, on the ground a page the map does not name gets
  const more = page('baby-photos-more');
  assert.deepEqual(more.sections, ['gallery-video']);
  assert.deepEqual(more.ground, BABYBLUE_GROUNDS.venue);
  assert.deepEqual(doc.overflowGround, BABYBLUE_GROUNDS.venue);
  // the peek stops after Our Story, by name and not by position
  assert.equal(page('story').peekEnd, true);
  assert.equal(doc.pages.filter((p) => p.peekEnd).length, 1);
  // only the two drawn pages carry elements
  assert.deepEqual(doc.pages.filter((p) => p.elements?.length).map((p) => p.key), ['story', 'baby-photos']);
});

/**
 * BABYBLUE_PAGES moved out of the renderer and into design.ts, so the
 * document could be compiled from it rather than from a second copy. Written
 * out here literally: the guest page is drawn from this list, and a change to
 * it has to be a change someone meant to make.
 */
test('the ten Baby Blue pages are the ten the renderer has always walked', () => {
  assert.deepEqual(BABYBLUE_PAGES, [
    { key: 'cover', bg: 'cover', sections: ['cover', 'verse'] },
    { key: 'story', bg: 'story', seam: 0.18, drawn: true, sections: ['story'] },
    { key: 'invitation', bg: 'invitation', sections: ['ceremony'] },
    { key: 'sponsors', bg: 'sponsors', sections: ['sponsors'] },
    { key: 'baby-photos', bg: 'babyphotos', seam: 0.18, drawn: true, sections: ['gallery'] },
    { key: 'venue', bg: 'venue', sections: ['reception'] },
    { key: 'dress-code', bg: 'dresscode', sections: ['dressCode'] },
    { key: 'program', bg: 'program', sections: ['gift', 'program'] },
    { key: 'share', bg: 'share', sections: ['social', 'photos'] },
    { key: 'closing', bg: 'closing', sections: ['rsvp', 'countdown', 'contact', 'closing'] },
  ]);
});

/** A design's document is the design's. The catalogue sync must never write one. */
test('templateData emits no design, no draft and no art', () => {
  for (const [i, t] of TEMPLATES.entries()) {
    const row = templateData(t, i) as Record<string, unknown>;
    for (const key of ['design', 'designDraft', 'designDraftRev', 'art']) {
      assert.equal(key in row, false, `${t.slug} carries ${key}`);
    }
  }
});

/** An empty column is the built-in, and a broken element is dropped by name, not silently. */
test('designOf: empty means the built-in, and what will not parse is named', () => {
  assert.deepEqual(designOf({}, 'babyblue').doc, builtinDesign('babyblue'));
  assert.deepEqual(designOf(null, 'babyblue').doc, builtinDesign('babyblue'));
  assert.equal(designOf({}, 'classic').doc, null);

  const good = JSON.parse(JSON.stringify(builtinDesign('babyblue')));
  const read = designOf(good, 'babyblue');
  assert.deepEqual(read.dropped, []);
  assert.deepEqual(read.doc, builtinDesign('babyblue'), 'the built-in must survive its own schema');

  const bent = JSON.parse(JSON.stringify(good));
  bent.pages[1].elements[1] = { id: 'broken', kind: 'photo', x: 'over there', y: 3, w: 4 };
  const after = designOf(bent, 'babyblue');
  assert.equal(after.dropped.length, 1);
  assert.match(after.dropped[0], /story/);
  assert.equal(after.doc!.pages[1].elements!.length, good.pages[1].elements.length - 1);

  // a page with no key at all cannot be placed, so the page goes, not the design
  const noKey = JSON.parse(JSON.stringify(good));
  delete noKey.pages[2].key;
  const third = designOf(noKey, 'babyblue');
  assert.equal(third.doc!.pages.length, good.pages.length - 1);
  assert.equal(third.dropped.length, 1);

  // and something that is not a document at all is not half a document
  assert.equal(designOf({ v: 9, pages: [] }, 'babyblue').doc, null);
});
