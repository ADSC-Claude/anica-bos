import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinDesign, designOf, documentOf, elementStyle, frameCount, pageRatio, peekEndPage, place, valueAt, pageOfSection,
  BABYBLUE_PAGES, BABYBLUE_GROUNDS, CAPIZ_PAGES, isPicture,
  type PhotoEl, type TextEl, type PageSpec, type Element,
} from '../src/lib/design';
import { sectionAnchor } from '../src/lib/anchors';
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
    assert.deepEqual(e.bind, { section: 'gallery', field: 'photos', index: i, sub: 'url', skipEmpty: 'url' });
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
    assert.deepEqual(e.lines[0].sources, [{ bind: { section: 'gallery', field: 'photos', index: i, sub: 'caption', skipEmpty: 'url' } }]);
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

/**
 * A document is written to a JSON column and read back. The database keeps a
 * number to sixteen significant digits, so an unrounded product of two
 * doubles is not the number that comes back — and the studio, which refuses
 * to autosave a draft it cannot round-trip, would never save at all.
 */
test('every measurement survives the trip through the database', () => {
  const sixteen = (n: number) => Number(n.toPrecision(16));
  for (const p of doc.pages) {
    for (const el of p.elements ?? []) {
      for (const [what, v] of [['x', el.x], ['y', el.y], ['w', el.w], ['rotate', el.rotate]] as const) {
        if (v === undefined) continue;
        assert.equal(sixteen(v), v, `${el.id}.${what} is ${v}, which the column would round`);
        assert.equal(place(v), v, `${el.id}.${what} is finer than a thousandth of a pixel`);
      }
    }
  }
  // and reading a document rounds one written by anything else
  assert.equal(place(27.3 * 0.92), 25.116);
  const bent = JSON.parse(JSON.stringify(doc));
  bent.pages[1].elements[1].x = 27.3 * 0.92;
  const el = designOf(bent, 'babyblue').doc!.pages[1].elements![1];
  assert.equal(el.x, 25.116);
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

/** Capiz has no drawn page: its document is the page map, which is what a copy of it needs. */
test('Capiz is a document too, and it is the page map the renderer walks', () => {
  const capiz = builtinDesign('capiz')!;
  assert.deepEqual(capiz.pages.map((p) => p.key), CAPIZ_PAGES.map((d) => d.key));
  assert.deepEqual(capiz.pages.map((p) => p.sections), CAPIZ_PAGES.map((d) => d.sections));
  // no ground of its own: the numbered backgrounds are the layout's machinery
  assert.equal(capiz.pages.every((p) => p.ground === undefined), true);
  assert.equal(capiz.pages.every((p) => p.elements === undefined), true);
  assert.equal(capiz.pages.find((p) => p.peekEnd)?.key, 'story');
  assert.equal(builtinDesign('classic'), null);
});

/**
 * The originals must not take the document path, whatever is compiled for
 * them: an empty column is the renderer's own constants, and only a design
 * the studio wrote renders from a document.
 */
test('documentOf: an empty column is no document, however good the built-in is', () => {
  assert.equal(documentOf({ design: {}, layout: 'babyblue' }), null);
  assert.equal(documentOf({ design: null, layout: 'babyblue' }), null);
  assert.equal(documentOf({ layout: 'babyblue' }), null);
  const doc = JSON.parse(JSON.stringify(builtinDesign('babyblue')));
  assert.deepEqual(documentOf({ design: doc, layout: 'babyblue' }), builtinDesign('babyblue'));
});

/** What a design shows is what its form should ask for. */
test('frameCount: six for the timeline, four for the photographs, none for anything else', () => {
  assert.equal(frameCount(doc, 'story', 'timeline'), 6);
  assert.equal(frameCount(doc, 'gallery', 'photos'), 4);
  assert.equal(frameCount(doc, 'gallery', 'months'), 0);
  assert.equal(frameCount(null, 'story', 'timeline'), 0);
  assert.equal(frameCount(builtinDesign('capiz'), 'story', 'timeline'), 0);
});

/** A drawn page is as tall as its ground, and that is where the page's height comes from. */
test('pageRatio reads the ground, and falls back to one screen', () => {
  assert.equal(pageRatio(page('story')), BABYBLUE_GROUNDS.story.ratio);
  assert.equal(pageRatio(page('baby-photos')), BABYBLUE_GROUNDS.babyphotos.ratio);
  assert.equal(pageRatio({ key: 'x', sections: [] }), 1.777);
  assert.equal(pageRatio({ key: 'x', sections: [], ground: { color: 'bg' } }), 1.777);
  assert.equal(pageRatio({ key: 'x', sections: [], ground: { color: 'bg', ratio: 3 } }), 3);
});

/**
 * The photographs page counts the rows that have a picture and the story page
 * counts all of them. Getting this backwards would put every caption under
 * the wrong photograph the moment a customer left a row blank.
 */
test('valueAt: skipEmpty counts the rows that are filled, and nothing else does', () => {
  const content = {
    gallery: { photos: [{ url: '', caption: 'blank' }, { url: '/a.jpg', caption: 'A' }, { url: '/b.jpg', caption: 'B' }] },
    story: { line: 'A line', timeline: [{ title: '', photo: '' }, { title: 'Second', photo: '/2.jpg' }] },
  };
  assert.equal(valueAt(content, { section: 'gallery', field: 'photos', index: 0, sub: 'url', skipEmpty: 'url' }), '/a.jpg');
  assert.equal(valueAt(content, { section: 'gallery', field: 'photos', index: 0, sub: 'caption', skipEmpty: 'url' }), 'A');
  assert.equal(valueAt(content, { section: 'gallery', field: 'photos', index: 2, sub: 'url', skipEmpty: 'url' }), '');
  // no skipEmpty: row by row, blanks included, as the timeline has always been read
  assert.equal(valueAt(content, { section: 'story', field: 'timeline', index: 0, sub: 'title' }), '');
  assert.equal(valueAt(content, { section: 'story', field: 'timeline', index: 1, sub: 'title' }), 'Second');
  assert.equal(valueAt(content, { section: 'story', field: 'line' }), 'A line');
  assert.equal(valueAt(content, { section: 'nope', field: 'line' }), '');
  assert.equal(valueAt(undefined, { section: 'story', field: 'line' }), '');
});

/** A preview scrolls to the block a section is drawn in; on a drawn page that is the page. */
test('sectionAnchor follows the document when there is one', () => {
  assert.equal(sectionAnchor('gallery', 'babyblue'), 'baby-photos');
  assert.equal(sectionAnchor('gallery', 'babyblue', doc), 'baby-photos');
  assert.equal(sectionAnchor('story', 'babyblue', doc), 'story');
  // a section on a page that is not drawn keeps its own block's id
  assert.equal(sectionAnchor('reception', 'babyblue', doc), 'reception');
  assert.equal(pageOfSection(doc, 'gallery')?.key, 'baby-photos');
  assert.equal(pageOfSection(doc, 'nothing'), undefined);
  // a design renamed its pages: the anchor follows the rename
  const renamed = { ...doc, pages: doc.pages.map((p) => (p.key === 'baby-photos' ? { ...p, key: 'the-photos' } : p)) };
  assert.equal(sectionAnchor('gallery', 'babyblue', renamed), 'the-photos');
});

/**
 * The peek is a snippet of a design: the pages up to the one it ends on. It
 * used to be the page literally called 'story', which a design the owner
 * renames would lose. Now the design says so, and a design that says nothing
 * shows its first page only — the safe way round, not the whole invitation.
 */
test('the peek stops where the design says, whatever the page is called', () => {
  assert.equal(peekEndPage(doc), 'story');
  assert.equal(peekEndPage(builtinDesign('capiz')), 'story');
  assert.equal(peekEndPage(null), undefined);
  const renamed = { ...doc, pages: doc.pages.map((p) => (p.peekEnd ? { ...p, key: 'how-we-prayed' } : p)) };
  assert.equal(peekEndPage(renamed), 'how-we-prayed');
  const unmarked = { ...doc, pages: doc.pages.map(({ peekEnd, ...p }) => { void peekEnd; return p; }) };
  assert.equal(peekEndPage(unmarked), undefined);
});

/**
 * A page's background is either a picture or a plain colour. A colour costs a
 * guest nothing to download, and one named by its role follows the palette,
 * so it turns itself down at night without a second picture being made.
 */
test('a colour background survives the column, by role and by hand', () => {
  const withColour = JSON.parse(JSON.stringify(doc));
  withColour.pages.push({ key: 'thanks', sections: ['closing'], drawn: true, ground: { color: 'accent', ratio: 2.4 } });
  withColour.pages.push({ key: 'sign-off', sections: [], ground: { color: '#f6f2ea' } });
  const read = designOf(withColour, 'babyblue');
  assert.deepEqual(read.dropped, []);
  const [a, b] = read.doc!.pages.slice(-2);
  assert.deepEqual(a.ground, { color: 'accent', ratio: 2.4 });
  assert.equal(pageRatio(a), 2.4);
  assert.deepEqual(b.ground, { color: '#f6f2ea' });
  assert.equal(pageRatio(b), 1.777, 'a colour page with no height is one screen');
  assert.equal(isPicture(a.ground!), false);
  assert.equal(isPicture(doc.pages[0].ground!), true);

  // a ground that is neither loses the page rather than half-reading it
  const bent = JSON.parse(JSON.stringify(doc));
  bent.pages[0].ground = { url: '/x.webp' };
  assert.equal(designOf(bent, 'babyblue').dropped.length, 1);
});
