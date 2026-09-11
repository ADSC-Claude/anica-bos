import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinDesign, designOf, documentOf, elementStyle, frameCount, pageRatio, peekEndPage, place, valueAt, pageOfSection,
  photoStyle, maskRadius, cropStyle, cropWindow, cropAt, shapeStyle, colourVar, COLOR_ROLES, coverOf, coverStyle,
  starterDesign, sliceHeights, fillPageWithClip,
  BABYBLUE_PAGES, BABYBLUE_GROUNDS, CAPIZ_PAGES, isPicture, LEGIBLE_CQW,
  type PhotoEl, type TextEl, type ShapeEl, type VideoEl, type PageSpec, type Element, type DesignDoc,
} from '../src/lib/design';
import { sectionAnchor } from '../src/lib/anchors';
import { sectionOrder } from '../src/lib/sections';
import { pageNeeds } from '../src/lib/needs';
import { STORY_SLOTS, STORY_LABELS, STORY_HEAD, PHOTO_SLOTS, PHOTO_HEAD, slotStyle, labelStyle, captionStyle } from '../src/lib/babyblue';
import { templateData } from '../prisma/templates';
import { TEMPLATES } from '../prisma/templates';

const doc = builtinDesign('babyblue')!;
const base = doc;
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

/**
 * How a text box is set — its face, its size, its weight, the spacing, what
 * sits behind it, and each line's own alignment — is part of the design, so
 * it has to survive the column like everything else.
 */
test('the way a box is set survives the column', () => {
  const doc = JSON.parse(JSON.stringify(base ?? builtinDesign('babyblue')));
  const head = doc.pages[1].elements[0];
  Object.assign(head, { face: 'script', size: 4.25, weight: 600, tracking: 0.12, backing: 'scrim' });
  head.lines[0].align = 'left';
  head.lines[0].color = 'accent';
  head.lines[1].size = 2.1;
  const read = designOf(doc, 'babyblue');
  assert.deepEqual(read.dropped, []);
  const back = read.doc!.pages[1].elements![0] as TextEl;
  assert.equal(back.face, 'script');
  assert.equal(back.size, 4.25);
  assert.equal(back.weight, 600);
  assert.equal(back.tracking, 0.12);
  assert.equal(back.backing, 'scrim');
  assert.equal(back.lines[0].align, 'left');
  assert.equal(back.lines[0].color, 'accent');
  assert.equal(back.lines[1].size, 2.1);

  // a face the design does not have, and a weight nothing could load, are refused
  const bent = JSON.parse(JSON.stringify(doc));
  bent.pages[1].elements[0].face = 'comic';
  assert.equal(designOf(bent, 'babyblue').dropped.length, 1);

  // the floor the studio warns at is a real size, not a placeholder
  assert.ok(LEGIBLE_CQW > 1 && LEGIBLE_CQW < 5);
});

/**
 * A page that grows places by its width, not by its height.
 *
 * y stays what it always was — a share of the page's base height — but on a
 * page whose height can move, a percentage would carry every element down as
 * the page grew. The same number therefore comes out as `cqw`: y% of the base
 * height is y × ratio hundredths of the width, which is the same place on a
 * page that has not grown and the *same* place on one that has.
 */
test('elementStyle: a growing page measures from the width, and the foot holds', () => {
  const el = { id: 'a', kind: 'text', block: 'free', y: 40, x: 50, w: 60, lines: [] } as unknown as Element;
  assert.equal(elementStyle(el).top, '40%');
  assert.equal(elementStyle(el).bottom, undefined);
  // 40% of a page 1.777 times its width is 71.08 hundredths of the width
  assert.equal(elementStyle(el, 1.777).top, '71.08cqw');
  assert.equal(elementStyle(el, 1.777).bottom, undefined);
  // measured from the foot: the remaining 60% of the height
  const foot = { ...el, from: 'bottom' } as Element;
  assert.equal(elementStyle(foot, 1.777).bottom, '106.62cqw');
  assert.equal(elementStyle(foot, 1.777).top, undefined);
  // on a page of fixed proportion the two edges cannot move apart, so it is ignored
  assert.equal(elementStyle(foot).top, '40%');
  assert.equal(elementStyle(foot).bottom, undefined);
  // the numbers are held to the same ten places as everything else
  assert.equal(elementStyle({ ...el, y: 33.3333333333 } as Element, 2.989).top, '99.6333333332cqw');
});

test('elementStyle: a foot-held element with no x of its own is pulled up by its own half', () => {
  const centred = { id: 'a', kind: 'photo', y: 90, from: 'bottom', anchor: 'centre', bind: { asset: '' } } as unknown as Element;
  assert.equal(elementStyle(centred, 1.777).transform, 'translateY(50%)');
  // with an x it already has the pair, and nothing is added
  assert.equal(elementStyle({ ...centred, x: 50 } as Element, 1.777).transform, 'translate(-50%, -50%)');
});

test('grow and from survive the column', () => {
  const doc = builtinDesign('babyblue')!;
  const raw = JSON.parse(JSON.stringify(doc)) as DesignDoc;
  raw.pages[1].grow = true;
  (raw.pages[1].elements![0] as { from?: string }).from = 'bottom';
  const { doc: back, dropped } = designOf(raw, 'babyblue');
  assert.deepEqual(dropped, []);
  assert.equal(back!.pages[1].grow, true);
  assert.equal(back!.pages[1].elements![0].from, 'bottom');
  // nothing else sets them, so the two designs as shipped carry neither
  assert.equal(doc.pages.some((p) => p.grow), false);
  assert.equal(builtinDesign('capiz')!.pages.some((p) => p.grow), false);
});

test('photoStyle: a square frame says nothing, and any other shape says exactly one thing', () => {
  const square = { id: 'a', kind: 'photo', y: 10, x: 50, w: 30, aspect: 1, bind: { asset: 'x.jpg' } } as PhotoEl;
  // the stylesheet's `.inv-bb-slot { aspect-ratio: 1 }` is already the square,
  // so Baby Blue's markup is the markup it always was
  assert.deepEqual(photoStyle(square), {});
  assert.deepEqual(photoStyle({ ...square, aspect: undefined }), {});
  assert.deepEqual(photoStyle({ ...square, aspect: 1.4 }), { aspectRatio: '1 / 1.4' });
  // and every measurement is held to ten places, here as everywhere
  assert.deepEqual(photoStyle({ ...square, aspect: 1 / 3 }), { aspectRatio: '1 / 0.3333333333' });
});

test('maskRadius: a circle, and an arch that is a semicircle on straight sides', () => {
  const frame = (aspect: number, mask: PhotoEl['mask']) =>
    maskRadius({ id: 'a', kind: 'photo', y: 0, aspect, mask, bind: { asset: 'x' } } as PhotoEl);
  assert.equal(frame(1, undefined), undefined);
  assert.equal(frame(1, 'none'), undefined);
  assert.equal(frame(1.5, 'circle'), '50%');
  // a frame twice as tall as it is wide: half a width is a quarter of the height
  assert.equal(frame(2, 'arch'), '50% 50% 0 0 / 25% 25% 0 0');
  // a square: half a width is half the height, and the arch is a half-circle
  assert.equal(frame(1, 'arch'), '50% 50% 0 0 / 50% 50% 0 0');
  // wider than it is tall: a semicircle that wide will not fit, so it is capped
  // and becomes a half-ellipse rather than being silently rescaled by the browser
  assert.equal(frame(0.4, 'arch'), '50% 50% 0 0 / 100% 100% 0 0');
});

test('cropWindow: the window takes the frame’s shape, whatever shape the picture is', () => {
  // a wide picture in a square frame shows a square: half its width, all its height
  assert.deepEqual(cropWindow({ aspect: 1, nw: 1000, nh: 500 }), { x: 0.25, y: 0, w: 0.5, h: 1 });
  // a tall picture in a square frame shows a square the other way about
  assert.deepEqual(cropWindow({ aspect: 1, nw: 500, nh: 1000 }), { x: 0, y: 0.25, w: 1, h: 0.5 });
  // a square picture in a square frame is the whole of it, which is why an
  // unfitted frame and one fitted at rest are the same picture
  assert.deepEqual(cropWindow({ aspect: 1, nw: 800, nh: 800 }), { x: 0, y: 0, w: 1, h: 1 });
  // a tall frame on a square picture
  assert.deepEqual(cropWindow({ aspect: 1.5, nw: 900, nh: 900 }), { x: 0.1666666667, y: 0, w: 0.6666666667, h: 1 });
});

test('cropWindow: zoom shrinks the window and panning cannot leave the paper', () => {
  const at = (zoom: number, cx?: number, cy?: number) => cropWindow({ aspect: 1, nw: 600, nh: 600, zoom, cx, cy });
  assert.deepEqual(at(2), { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  // pushed hard to one corner it stops at the edge rather than showing bare frame
  assert.deepEqual(at(2, 9, -9), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  assert.deepEqual(at(2, -9, 9), { x: 0, y: 0.5, w: 0.5, h: 0.5 });
  // zooming out past the fit is not a thing: the fit is as far out as it goes
  assert.deepEqual(at(0.2), at(1));
});

test('cropStyle: the picture is blown up by the window and slid so the window lands on the frame', () => {
  assert.deepEqual(cropStyle({ x: 0.25, y: 0, w: 0.5, h: 1 }), {
    width: '200%', height: '100%', left: '-50%', top: '0%',
  });
  assert.deepEqual(cropStyle({ x: 0.1, y: 0.2, w: 0.4, h: 0.4 }), {
    width: '250%', height: '250%', left: '-25%', top: '-50%',
  });
});

test('cropAt reads back the zoom and the middle cropWindow was given', () => {
  for (const [aspect, nw, nh, zoom, cx, cy] of [
    [1, 1000, 500, 1, 0.5, 0.5],
    [1, 1000, 500, 2.5, 0.3, 0.5],
    [1.5, 800, 1200, 3, 0.6, 0.35],
    [0.6, 400, 400, 1.8, 0.5, 0.7],
  ] as const) {
    const win = cropWindow({ aspect, nw, nh, zoom, cx, cy });
    const back = cropAt(win, aspect, nw, nh);
    assert.ok(Math.abs(back.zoom - zoom) < 1e-6, `zoom ${back.zoom} is not ${zoom}`);
    // and the window it makes is the window it came from. Not to the bit: the
    // window in the document is rounded to ten places before cropAt ever sees
    // it, so re-deriving can land one ten-billionth away. That is a
    // thousandth of a pixel on a phone, and it does not accumulate — the
    // second read-back gives the same number as the first.
    const again = cropWindow({ aspect, nw, nh, ...back });
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      assert.ok(Math.abs(again[k] - win[k]) <= 1e-9, `${k}: ${again[k]} is not ${win[k]}`);
    }
    assert.deepEqual(cropWindow({ aspect, nw, nh, ...cropAt(again, aspect, nw, nh) }), again);
  }
});

test('nothing shipped carries a crop, a cut or a drawn frame', () => {
  // the two designs draw their frames into the artwork, and the checklist,
  // the asks sheet and the renderer all lean on that being true
  for (const layout of ['babyblue', 'capiz'] as const) {
    for (const p of builtinDesign(layout)!.pages) {
      for (const e of p.elements ?? []) {
        if (e.kind !== 'photo') continue;
        assert.equal(e.crop, undefined, `${layout} ${p.key} ${e.id} has a crop`);
        assert.equal(e.mask, undefined, `${layout} ${p.key} ${e.id} has a cut`);
        assert.ok(e.frame === undefined || e.frame === 'none', `${layout} ${p.key} ${e.id} has a drawn frame`);
        assert.deepEqual(photoStyle(e), {}, `${layout} ${p.key} ${e.id} would style its own box`);
      }
    }
  }
});

test('a crop, a cut and a drawn frame survive the column', () => {
  const raw = JSON.parse(JSON.stringify(builtinDesign('babyblue'))) as DesignDoc;
  const frame = raw.pages[1].elements!.find((e) => e.kind === 'photo') as PhotoEl;
  frame.crop = { x: 0.1234567890123, y: 0.25, w: 0.5, h: 0.5 };
  frame.mask = 'arch';
  frame.frame = 'polaroid';
  frame.aspect = 1.25;
  const { doc: back, dropped } = designOf(raw, 'babyblue');
  assert.deepEqual(dropped, []);
  const got = back!.pages[1].elements!.find((e) => e.id === frame.id) as PhotoEl;
  assert.deepEqual(got.crop, { x: 0.1234567890, y: 0.25, w: 0.5, h: 0.5 });
  assert.equal(got.mask, 'arch');
  assert.equal(got.frame, 'polaroid');
  // a window outside the picture is not a window, and is refused rather than drawn
  const bad = JSON.parse(JSON.stringify(raw)) as DesignDoc;
  (bad.pages[1].elements!.find((e) => e.id === frame.id) as PhotoEl).crop = { x: 0, y: 0, w: 1.4, h: 1 };
  assert.equal(designOf(bad, 'babyblue').dropped.length, 1);
});

test('a starter is one page per section, cover first, and it is publishable the moment it is made', () => {
  // in the layout's own order, which is the order the action hands it in
  const sections = sectionOrder('CHRISTENING' as never, 'babyblue');
  assert.ok(sections.includes('cover'));
  const doc = starterDesign([...sections]);
  assert.equal(doc.pages.length, sections.length);
  assert.equal(doc.pages[0].key, 'cover');
  assert.deepEqual(doc.pages[0].sections, ['cover']);
  // one page per section, in the order the occasion offers them, and nothing twice
  assert.deepEqual(doc.pages.flatMap((p) => p.sections), [...sections]);
  assert.equal(new Set(doc.pages.map((p) => p.key)).size, doc.pages.length);
  // a page key is the section's, spelled the way a page spells it
  assert.ok(doc.pages.some((p) => p.key === 'dress-code'));
  // and it reads like an invitation rather than like the form it came from:
  // the story after the cover, the countdown near the end
  assert.deepEqual(doc.pages.slice(0, 4).map((p) => p.key), ['cover', 'story', 'ceremony', 'sponsors']);
  assert.ok(doc.pages.findIndex((p) => p.key === 'countdown') > doc.pages.findIndex((p) => p.key === 'rsvp'));
  // plain colours, alternating so the seam between two pages can be seen at all
  assert.deepEqual(doc.pages.map((p) => (p.ground && !isPicture(p.ground) ? p.ground.color : '?')).slice(0, 4), ['bg', 'surface', 'bg', 'surface']);
  // nothing is drawn by hand and nothing asks for a picture
  assert.equal(doc.pages.some((p) => p.drawn || p.elements?.length), false);
  // the peek stops after the second page, which is where it falls back to anyway
  assert.equal(peekEndPage(doc), doc.pages[1].key);
  // it survives the column whole, and there is nothing to fix before publishing
  const { doc: back, dropped } = designOf(JSON.parse(JSON.stringify(doc)), 'babyblue');
  assert.deepEqual(dropped, []);
  assert.deepEqual(back, doc);
  assert.deepEqual(pageNeeds({ doc, occasion: 'CHRISTENING' as never }), []);
});

test('a starter of an occasion without a cover still opens on one', () => {
  const doc = starterDesign(['story', 'rsvp']);
  assert.equal(doc.pages[0].key, 'cover');
  assert.deepEqual(doc.pages[0].sections, []);
  assert.deepEqual(doc.pages.map((p) => p.key), ['cover', 'story', 'rsvp']);
});

test('colourVar: a role follows the palette, a colour of her own does not', () => {
  assert.equal(colourVar('accent'), 'var(--inv-accent)');
  assert.equal(colourVar('surface'), 'var(--inv-surface)');
  assert.equal(colourVar('#f0dccb'), '#f0dccb');
  // every role in the list resolves, and nothing else does
  for (const r of COLOR_ROLES) assert.equal(colourVar(r), `var(--inv-${r})`);
  assert.equal(colourVar('paper'), 'paper');
});

test('shapeStyle: a card, an ellipse and a rule, all measured against the width', () => {
  const base = { id: 's', kind: 'shape', y: 40, x: 50, w: 70 } as const;
  // a card: its height, its fill and its corners, all in cqw off the width
  assert.deepEqual(shapeStyle({ ...base, shape: 'rect', h: 30, fill: 'surface', radius: 1.6 } as ShapeEl), {
    height: '30cqw', background: 'var(--inv-surface)', borderRadius: '1.6cqw',
  });
  // an outline needs a thickness to draw at all, and corners are a rectangle's
  assert.deepEqual(shapeStyle({ ...base, shape: 'ellipse', h: 70, stroke: '#333', strokeWidth: 0.4, radius: 9 } as ShapeEl), {
    height: '70cqw', border: '0.4cqw solid #333',
  });
  assert.equal(shapeStyle({ ...base, shape: 'rect', h: 10, stroke: 'ink' } as ShapeEl).border, undefined);
  // a line is the thin rectangle: its thickness is its height, in its own colour
  assert.deepEqual(shapeStyle({ ...base, shape: 'line', strokeWidth: 0.25, stroke: 'muted' } as ShapeEl), {
    height: '0.25cqw', background: 'var(--inv-muted)',
  });
  // a line with no thickness is still a hairline rather than nothing at all
  assert.equal(shapeStyle({ ...base, shape: 'line', stroke: 'ink' } as ShapeEl).height, '0.3cqw');
  // with no height of its own a shape is as tall as it is wide
  assert.equal(shapeStyle({ ...base, shape: 'ellipse' } as ShapeEl).height, '70cqw');
  // and everything is held to the same ten places as every other measurement
  assert.equal(shapeStyle({ ...base, shape: 'rect', h: 1 / 3 } as ShapeEl).height, '0.3333333333cqw');
});

test('a shape survives the column, and nothing shipped carries one', () => {
  const raw = JSON.parse(JSON.stringify(builtinDesign('capiz'))) as DesignDoc;
  raw.pages[0].elements = [{ id: 'card', kind: 'shape', shape: 'rect', x: 50, y: 40, w: 70, h: 30, z: -1, fill: 'surface', radius: 1.6 } as ShapeEl];
  const { doc: back, dropped } = designOf(raw, 'capiz');
  assert.deepEqual(dropped, []);
  assert.deepEqual(back!.pages[0].elements![0], raw.pages[0].elements[0]);
  for (const layout of ['babyblue', 'capiz'] as const) {
    assert.equal(builtinDesign(layout)!.pages.some((p) => (p.elements ?? []).some((e) => e.kind === 'shape')), false);
  }
});

test('the cover says nothing until she says something, and then only that', () => {
  assert.deepEqual(coverStyle(undefined), {});
  assert.deepEqual(coverStyle({}), {});
  // a scale of exactly one is the size it was drawn, which is not a setting
  assert.deepEqual(coverStyle({ photoScale: 1 }), {});
  // the photograph's style is the hero's to read, not a style on the box
  assert.deepEqual(coverStyle({ photoStyle: 'arch' }), {});
  assert.deepEqual(coverStyle({ names: 'top' }), { alignItems: 'flex-start' });
  assert.deepEqual(coverStyle({ names: 'middle' }), { alignItems: 'center' });
  assert.deepEqual(coverStyle({ names: 'bottom' }), { alignItems: 'flex-end' });
  assert.deepEqual(coverStyle({ inset: 7.5 }), { paddingBlock: '7.5%' });
  assert.deepEqual(coverStyle({ photoScale: 1.25 }), { '--inv-portrait-scale': '1.25' });
  // and all of it together, held to the same ten places as everything else
  assert.deepEqual(coverStyle({ names: 'middle', inset: 1 / 3, photoScale: 2 / 3, photoStyle: 'none' }), {
    alignItems: 'center', paddingBlock: '0.3333333333%', '--inv-portrait-scale': '0.6666666667',
  });
});

test('coverOf finds the page that carries the cover, whatever it is called', () => {
  const doc = JSON.parse(JSON.stringify(builtinDesign('capiz'))) as DesignDoc;
  assert.equal(coverOf(doc), undefined, 'nothing shipped sets one');
  assert.equal(coverOf(null), undefined);
  const page = doc.pages.find((p) => p.sections.includes('cover'))!;
  page.key = 'the-front';
  page.cover = { names: 'bottom', photoStyle: 'oval', photoScale: 1.4, inset: 6 };
  assert.deepEqual(coverOf(doc), { names: 'bottom', photoStyle: 'oval', photoScale: 1.4, inset: 6 });
  // and it survives the column whole
  const { doc: back, dropped } = designOf(JSON.parse(JSON.stringify(doc)), 'capiz');
  assert.deepEqual(dropped, []);
  assert.deepEqual(coverOf(back), page.cover);
  // a scale outside what a cover can hold is refused rather than drawn
  const silly = JSON.parse(JSON.stringify(doc)) as DesignDoc;
  silly.pages.find((p) => p.sections.includes('cover'))!.cover!.photoScale = 40;
  assert.equal(designOf(silly, 'capiz').dropped.length, 1);
});

/**
 * A ground cut in the browser and one cut by hand when Baby Blue shipped
 * have to behave identically, because the renderer measures the foot slice
 * as 44% of the ground's height and draws the band stretched between them.
 * So the arithmetic is pinned to the files that shipped.
 */
test('a ground is cut the way the shipped ones were cut', () => {
  // the cover: 725 x 2167, cut by hand into 953, 261 and 953
  const cover = sliceHeights(2167);
  assert.deepEqual(cover, { head: 953, band: 261 });
  assert.equal(cover.head * 2 + cover.band, 2167, 'the three tile the picture exactly');

  // and it holds for any height: nothing is lost and nothing overlaps
  for (const h of [800, 1080, 1777, 2167, 2990, 3001]) {
    const { head, band } = sliceHeights(h);
    assert.equal(head * 2 + band, h, `${h} does not tile`);
    assert.ok(band > 0, `${h} leaves no band`);
    assert.ok(Math.abs(head / h - 0.44) < 0.001, `${h} is not cut at 44%`);
  }
  // one screen and a bit is the shortest that can be cut at all
  assert.ok(sliceHeights(100).band > 0);
});

// --- a clip behind a whole page -------------------------------------------

/**
 * The page's background becomes the clip's own poster, through the machinery
 * a background has always used — so the page gets its height, its edge
 * strips and its seams the ordinary way, and a guest who never sees the clip
 * still sees the page.
 */
test('a clip put behind a page fills it, sits under everything, and its poster becomes the ground', () => {
  const page: PageSpec = {
    key: 'p', sections: [],
    elements: [
      { id: 'clip', kind: 'video', x: 20, y: 40, w: 44, anchor: 'centre', rotate: 6, aspect: 1.7778, url: 'u/c.mp4', poster: 'u/p.webp', glare: 120 },
      { id: 'words', kind: 'text', block: 'free', x: 50, y: 50, w: 60, lines: [{ role: 'body', sources: [{ fixed: { en: 'Hi', tl: 'Oy' } }] }] },
    ],
  };
  const out = fillPageWithClip(page, 'clip', { ratio: 1.4, top: '#f0e9dd', bottom: '#111827' });
  const clip = out.elements!.find((e) => e.id === 'clip')! as VideoEl;
  // A flag, not an aspect. A page that grows is as tall as its words, so the
  // height to fill is not known until the browser lays the page out — the
  // stylesheet's `inset: 0` answers that and no number here could. An aspect
  // taken off the poster would make the clip the poster's shape and leave the
  // foot of a long page bare, which is what the first attempt at this did.
  assert.equal(clip.bg, true);
  assert.equal(clip.aspect, 1.7778, 'its own aspect is left alone, so taking the flag off restores it');
  assert.deepEqual({ x: clip.x, y: clip.y, w: clip.w, anchor: clip.anchor }, { x: 50, y: 0, w: 100, anchor: 'top' },
    'set anyway, so taking the flag off leaves it somewhere sensible');
  assert.equal(clip.rotate, undefined, 'a background is not turned');
  // -2, not 0: an element with no z is `auto`, and CSS paints auto and 0
  // together in tree order, so a clip at 0 would cover words added before it
  assert.equal(clip.z, -2);
  const words = out.elements!.find((e) => e.id === 'words')!;
  assert.ok((words.z ?? 0) > clip.z!, 'the words are above it');
  assert.equal(out.drawn, true);
  assert.ok(out.ground && isPicture(out.ground));
  assert.deepEqual(out.ground, { url: 'u/p.webp', ratio: 1.4, top: '#f0e9dd', bottom: '#111827' });
  // the clip itself is untouched otherwise
  assert.equal(clip.url, 'u/c.mp4');
  assert.equal(clip.glare, 120);
});

test('the slices of a tall poster are carried onto the ground, and only when there are any', () => {
  const page: PageSpec = { key: 'p', sections: [], elements: [{ id: 'c', kind: 'video', x: 50, y: 0, w: 50, url: 'u/c.mp4', poster: 'u/p.webp' }] };
  const cut = fillPageWithClip(page, 'c', { ratio: 3, top: '#fff', bottom: '#000', slices: { top: 'a', mid: 'b', foot: 'c' } });
  assert.deepEqual((cut.ground as { slices?: unknown }).slices, { top: 'a', mid: 'b', foot: 'c' });
  assert.equal('slices' in (fillPageWithClip(page, 'c', { ratio: 1, top: '#fff', bottom: '#000' }).ground as object), false);
});

test('a clip with no poster, or an id that is not a clip, changes nothing', () => {
  const page: PageSpec = { key: 'p', sections: [], elements: [
    { id: 'bare', kind: 'video', x: 50, y: 0, w: 50, url: 'u/c.mp4', poster: '' },
    { id: 'frame', kind: 'photo', x: 50, y: 0, w: 50, bind: { asset: '' } },
  ] };
  // no poster means no colours to measure and nothing to show while it loads
  assert.equal(fillPageWithClip(page, 'bare', { ratio: 1, top: '#fff', bottom: '#000' }), page);
  assert.equal(fillPageWithClip(page, 'frame', { ratio: 1, top: '#fff', bottom: '#000' }), page);
  assert.equal(fillPageWithClip(page, 'nobody', { ratio: 1, top: '#fff', bottom: '#000' }), page);
});
