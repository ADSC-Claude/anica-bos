import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  builtinDesign, designOf, documentOf, elementStyle, frameCount, pageRatio, peekEndPage, place, valueAt, pageOfSection,
  photoStyle, maskRadius, cropStyle, cropWindow, cropAt, shapeStyle, colourVar, COLOR_ROLES, coverOf, coverStyle,
  starterDesign, studioDoc, sliceHeights, fillPageWithClip, drawnSections, offeredSections, floatShape, floatAt,
  invitationPages, bookletsOf, reachablePages, stdPage, sheetRules, SHEET_SIZES,
  flowFloats, flowDecor, decorOver, decorStyle, outsideOf, bleeds, runOf, pinOf, groundKind, kindOfShape, screensOf, sizeOf, sizeToFit, TITLE_ON, LINE_ON, wordsFor, sectionDress, designVars, APP_NIGHT, motionOf, moves,
  BABYBLUE_PAGES, BABYBLUE_GROUNDS, CAPIZ_PAGES, isPicture, LEGIBLE_CQW,
  type PhotoEl, type TextEl, type ShapeEl, type VideoEl, type PageSpec, type Element, type DesignDoc,
} from '../src/lib/design';
import { sectionAnchor } from '../src/lib/anchors';
import { sectionOrder, OCCASION_SECTIONS, SECTION_BY_KEY, sectionsFor, fieldsFor } from '../src/lib/sections';
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
    // the verse came off at the owner's word: a christening can be Catholic,
    // Born Again or Aglipayan, and a lettered psalm chooses for the family
    { key: 'cover', bg: 'cover', sections: ['cover'] },
    { key: 'story', bg: 'story', seam: 0.18, drawn: true, sections: ['story'] },
    { key: 'invitation', bg: 'invitation', sections: ['ceremony'] },
    // the parents with the ninongs: the owner's grouping, and what actually
    // places Parents on a page rather than after the Closing
    { key: 'sponsors', bg: 'sponsors', sections: ['parents', 'sponsors'] },
    { key: 'baby-photos', bg: 'babyphotos', seam: 0.18, drawn: true, sections: ['gallery'] },
    { key: 'venue', bg: 'venue', sections: ['reception'] },
    { key: 'dress-code', bg: 'dresscode', sections: ['dressCode'] },
    { key: 'program', bg: 'program', sections: ['gift', 'program'] },
    { key: 'share', bg: 'share', sections: ['social', 'photos'] },
    // the FAQ with the assistance, now that the FAQ is switched back on
    { key: 'closing', bg: 'closing', sections: ['rsvp', 'countdown', 'contact', 'faq', 'closing'] },
  ]);
});

/** A design's document is the design's. The catalogue sync must never write one. */
test('templateData emits no draft and no art, and a design only where the catalogue ships one', () => {
  for (const [i, t] of TEMPLATES.entries()) {
    const row = templateData(t, i) as Record<string, unknown>;
    for (const key of ['designDraft', 'designDraftRev', 'art']) {
      assert.equal(key in row, false, `${t.slug} carries ${key}`);
    }
    assert.equal('design' in row, Boolean(t.design), `${t.slug} ${t.design ? 'should carry' : 'carries'} a design`);
  }
  // Capiz ships its storyline; Baby Blue keeps the renderer's own path
  assert.deepEqual(templateData(TEMPLATES.find((t) => t.slug === 'capiz')!, 0).design, builtinDesign('capiz'));
  assert.equal('design' in templateData(TEMPLATES.find((t) => t.slug === 'baby-blue')!, 0), false);
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
test('Capiz is a document too: the page map the renderer walks, carrying the storyline', () => {
  const capiz = builtinDesign('capiz')!;
  assert.deepEqual(capiz.pages.map((p) => p.key), CAPIZ_PAGES.map((d) => d.key));
  assert.deepEqual(capiz.pages.map((p) => p.sections), CAPIZ_PAGES.map((d) => d.sections));
  // no ground of its own: the numbered backgrounds are the layout's machinery
  assert.equal(capiz.pages.every((p) => p.ground === undefined), true);
  // the storyline: four moments on four pages, each reading the customer's form, and nothing drawn anywhere else
  const withMoments = capiz.pages.filter((p) => (p.elements ?? []).length > 0);
  assert.deepEqual(withMoments.map((p) => p.key), ['story', 'invitation', 'prenup', 'closing']);
  assert.deepEqual(withMoments.flatMap((p) => p.elements!.map((el) => el.kind === 'moment' ? `${el.moment}${el.variant ? '/' + el.variant : ''}` : el.kind)), ['instant-camera', 'doors/church', 'curtains', 'scratch']);
  for (const p of withMoments) for (const el of p.elements!) {
    assert.equal(el.ask, true, `${el.id} asks`);
    // every photograph and every line is the customer's, never a fixed asset the demo would show for everyone
    if (el.kind === 'moment') for (const ph of el.photos ?? []) assert.equal('asset' in ph.bind, false, `${el.id} binds a field`);
  }
  // the words start below a moment hung off the head, and the scratch card has the foot to itself
  assert.equal(capiz.pages.find((p) => p.key === 'story')?.headPad, 8);
  assert.equal(capiz.pages.find((p) => p.key === 'closing')?.footPad, 6);
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
  /*
   * And it reads like an invitation rather than like the form it came from.
   *
   * The christening's order is the owner's hub order now: the cover, then the
   * countdown on a short page of its own, then the invitation — the church
   * before the venue before the dress code. The countdown moved from near
   * the end to second, which is her decision and not a drift, so the old
   * assertion that it came after the RSVP is gone rather than loosened.
   */
  assert.deepEqual(doc.pages.slice(0, 5).map((p) => p.key), ['cover', 'countdown', 'ceremony', 'reception', 'dress-code']);
  assert.ok(doc.pages.findIndex((p) => p.key === 'closing') > doc.pages.findIndex((p) => p.key === 'rsvp'), 'the ending is still last');
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

// --- what a design offers, and what it draws ------------------------------

/**
 * Two different questions, and the reason `hides` exists.
 *
 * `Template.sections` has always been a row of ticks kept by hand beside the
 * design — a second opinion that can only drift from the first. The pages
 * cannot replace it on their own: the renderer gives a section no page names
 * a plain page of its own, in its place, which is how Baby Blue's ten drawn
 * pages sit in front of a plain Contact. So "drawn here" and "offered at
 * all" are separate, and only a refusal written down can answer the second.
 */
test('the pages say what is drawn; hides says what is not offered', () => {
  const doc = builtinDesign('babyblue')!;
  const drawn = drawnSections(doc);
  assert.ok(drawn.includes('story'), 'Baby Blue draws the story');
  assert.ok(drawn.includes('gallery'), 'and the photographs');
  assert.ok(!drawn.includes('music'), 'it draws no music page — the renderer gives music a plain one');

  // and yet music is offered, because the design refuses nothing
  const offered = offeredSections(doc, 'CHRISTENING' as never);
  assert.ok(offered.includes('music'), 'a design that refuses nothing offers everything its occasion has');
  assert.deepEqual(offered, OCCASION_SECTIONS.CHRISTENING, 'which is what an empty Template.sections has always meant');
});

test('a design that hides a section stops offering it, and keeps the rest in occasion order', () => {
  const doc: DesignDoc = { ...builtinDesign('babyblue')!, hides: ['music', 'social'] };
  const offered = offeredSections(doc, 'CHRISTENING' as never);
  assert.ok(!offered.includes('music'));
  assert.ok(!offered.includes('social'));
  assert.deepEqual(offered, OCCASION_SECTIONS.CHRISTENING.filter((k) => k !== 'music' && k !== 'social'),
    'everything else, in the order the occasion has them');
  // hiding changes nothing about what the pages draw
  assert.deepEqual(drawnSections(doc), drawnSections(builtinDesign('babyblue')!));
});

test('drawnSections is in page order and names a section once', () => {
  const doc: DesignDoc = {
    v: 1,
    pages: [
      { key: 'a', sections: ['cover', 'story'] },
      { key: 'b', sections: ['story', 'ceremony'] },
      { key: 'c', sections: [] },
    ],
  };
  assert.deepEqual(drawnSections(doc), ['cover', 'story', 'ceremony']);
  assert.deepEqual(drawnSections(null), []);
  assert.deepEqual(drawnSections({ v: 1, pages: [] }), []);
});

test('a hidden section survives the document being read back', () => {
  // it has to round-trip, or a publish would quietly un-hide it
  const doc: DesignDoc = { ...builtinDesign('capiz')!, hides: ['program'] };
  const read = designOf(JSON.parse(JSON.stringify(doc)), 'capiz');
  assert.deepEqual(read.doc?.hides, ['program']);
  assert.deepEqual(read.dropped, []);
});

test('the join and the room at the foot survive a read-back', () => {
  // a page's dissolve into the one above it, and its room at the foot: both
  // in the document, so a design drawn in the studio can have what Capiz's
  // closing page gets from a CSS rule naming it by key
  const doc: DesignDoc = { v: 1, pages: [{ key: 'a', sections: ['cover'], seam: 0.42, footPad: 2.5 }] };
  const read = designOf(JSON.parse(JSON.stringify(doc)), 'capiz');
  assert.equal(read.doc?.pages[0].seam, 0.42);
  assert.equal(read.doc?.pages[0].footPad, 2.5);
  assert.deepEqual(read.dropped, []);
  // and nonsense is refused rather than carried
  const bad = designOf({ v: 1, pages: [{ key: 'a', sections: [], footPad: 40 }] }, 'capiz');
  assert.deepEqual(bad.dropped, ['page 1 (a)'], 'a foot of forty times the usual is not a page');
});

// --- motion ----------------------------------------------------------------

/**
 * The document describes; it never says when. `data-in` — the moment an
 * element is actually on a guest's screen — is the page's to add, which is
 * what makes an arrival an arrival rather than something that happened three
 * screens above the reader.
 */
test('motion is two attributes and one variable, and silence is nothing at all', () => {
  const bare: Element = { id: 'a', kind: 'shape', shape: 'rect', y: 10 };
  assert.deepEqual(motionOf(bare), { attrs: {}, vars: {} });
  assert.deepEqual(motionOf({ ...bare, motion: { enter: 'none', idle: 'none' } }), { attrs: {}, vars: {} }, 'none is not a motion');
  assert.deepEqual(motionOf({ ...bare, motion: { enter: 'rise' } }), { attrs: { 'data-enter': 'rise' }, vars: {} });
  assert.deepEqual(motionOf({ ...bare, motion: { idle: 'float', delay: 300 } }), {
    attrs: { 'data-idle': 'float' },
    vars: { '--motion-delay': '300ms' },
  });
  assert.deepEqual(motionOf({ ...bare, motion: { enter: 'drift', idle: 'sway', delay: 120 } }), {
    attrs: { 'data-enter': 'drift', 'data-idle': 'sway' },
    vars: { '--motion-delay': '120ms' },
  });
  // a delay on nothing is nothing: it would be a variable no rule reads
  assert.deepEqual(motionOf({ ...bare, motion: { delay: 400 } }), { attrs: {}, vars: {} });
});

test('what counts as moving, for the page that counts them', () => {
  const bare: Element = { id: 'a', kind: 'shape', shape: 'rect', y: 10 };
  assert.equal(moves(bare), false);
  assert.equal(moves({ ...bare, motion: {} }), false);
  assert.equal(moves({ ...bare, motion: { enter: 'none', idle: 'none', delay: 500 } }), false, 'a delay alone moves nothing');
  assert.equal(moves({ ...bare, motion: { enter: 'fade' } }), true);
  assert.equal(moves({ ...bare, motion: { idle: 'sway' } }), true);
});

test('the two shipped designs move nothing at all', () => {
  for (const layout of ['babyblue', 'capiz']) {
    const d = builtinDesign(layout)!;
    const moving = d.pages.flatMap((pg) => (pg.elements ?? []).filter(moves));
    assert.deepEqual(moving, [], `${layout} is as still as it ever was`);
  }
});

// --- the colours a design gives itself ------------------------------------

/**
 * The column's colour, the colour beside it and the whole of the night were
 * literals in globals.css keyed by the layout's name, so a design drawn in
 * the studio wore whatever its layout happened to be and had no way to say
 * otherwise. They are the document's now, and every one of them falls back
 * in the stylesheet to what it always was.
 */
test('a design with no colours of its own sets no variables at all', () => {
  assert.deepEqual(designVars(null), {});
  assert.deepEqual(designVars({ v: 1, pages: [] }), {}, 'so the stylesheet answers exactly as it did');
});

test('the column and the colour beside it are the design’s', () => {
  assert.deepEqual(designVars({ v: 1, pages: [], paper: '#f0dccb', surround: '#e9dfd2' }), {
    '--inv-paper': '#f0dccb',
    '--inv-surround': '#e9dfd2',
  });
  // a role rather than a colour follows the palette, as it does everywhere else
  assert.equal(designVars({ v: 1, pages: [], paper: 'surface' })['--inv-paper'], 'var(--inv-surface)');
});

test('the two shipped designs carry the four colours the stylesheet used to', () => {
  const bb = builtinDesign('babyblue')!;
  const cap = builtinDesign('capiz')!;
  assert.equal(bb.paper, '#eef3f9');
  assert.equal(bb.surround, '#e4ecf5');
  assert.equal(cap.paper, '#f0dccb');
  assert.equal(cap.surround, '#e9dfd2');
  // and the stylesheet no longer carries them, so there is one answer and not two
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  for (const literal of ['#eef3f9', '#f0dccb']) {
    assert.ok(!css.includes(`background: ${literal}`), `${literal} is the design's now, not the stylesheet's`);
  }
  /*
   * And the variable is read at both places a column colour is painted. This
   * is not a formality: the two layout literals were hiding a third rule,
   * `.inv[data-paged] { background-color: #f2e8dc }`, which reaches further
   * than `.inv` does — so taking the literals out turned both designs that
   * colour until the variable was read there too. The browser found it; this
   * keeps it found.
   */
  assert.ok(css.includes('background: var(--inv-paper, var(--inv-bg))'), 'the column reads the design’s paper');
  assert.ok(css.includes('background-color: var(--inv-paper, #f2e8dc)'), 'and so does the paged rule, which reaches further');
  // the surround is a colour and, since the picture behind the whole page, an image over it: the colour keeps its own property
  assert.ok(css.includes('background-color: var(--inv-surround, var(--inv-bg))'), 'what is beside the column is the design’s too');
});

/**
 * The last thing a copy of Capiz took from the `art` column. The numbered
 * backgrounds a page-by-page copy does not use — a page with a ground of its
 * own sits on that one ground whatever the strips say, which is PageGround's
 * own rule and was measured in the browser on a copy whose first three pages
 * carry their own: they drew their own pictures, the strips were then
 * consumed in order by the pages that still used them (bg-1, bg-3, bg-4…),
 * and the original Capiz drew exactly what it always drew. The night is each
 * ground's own. This was the remainder.
 */
test('the piece under the prenup photograph can be the design’s own', () => {
  const doc: DesignDoc = { v: 1, pages: [{ key: 'prenup', sections: ['gallery'] }], strand: '/pieces/strand.webp' };
  const read = designOf(JSON.parse(JSON.stringify(doc)), 'capiz');
  assert.deepEqual(read.dropped, []);
  assert.equal(read.doc?.strand, '/pieces/strand.webp');
  // and the two shipped designs say nothing about it, so they read the column
  assert.equal(builtinDesign('capiz')!.strand, undefined);
  assert.equal(builtinDesign('babyblue')!.strand, undefined);
});

test('a design’s night is a set of overrides, one variable each', () => {
  assert.deepEqual(designVars({ v: 1, pages: [], nightColours: { ink: '#ffe9c9' } }), { '--night-ink': '#ffe9c9' });
  const all = designVars({
    v: 1,
    pages: [],
    nightColours: { ink: '#a', muted: '#b', surface: '#c', accent: '#d', accent2: '#e', paper: '#f', surround: '#g' },
  });
  assert.deepEqual(Object.keys(all).sort(), [
    '--night-accent', '--night-accent2', '--night-ink', '--night-muted', '--night-paper', '--night-surface', '--night-surround',
  ]);
});

/**
 * The app's own night is written twice — here, where the checklist reads the
 * ink and the studio shows her what she is changing, and in the stylesheet,
 * where it is the fallback of every one of those variables. Two copies of a
 * colour is one too many, so this is the test that keeps them in step: it
 * reads the stylesheet.
 */
test('the app’s own night is the stylesheet’s fallback, colour for colour', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const want: Record<string, string> = {
    '--night-ink': APP_NIGHT.ink,
    '--night-muted': APP_NIGHT.muted,
    '--night-surface': APP_NIGHT.surface,
    '--night-accent': APP_NIGHT.accent,
    '--night-accent2': APP_NIGHT.accent2,
    '--night-paper': APP_NIGHT.paper,
    '--night-surround': APP_NIGHT.surround,
  };
  for (const [name, colour] of Object.entries(want)) {
    assert.ok(css.includes(`var(${name}, ${colour})`), `${name} should fall back to ${colour} in globals.css`);
  }
});

// --- how a page dresses the sections it carries ---------------------------

/**
 * The sections are the app's own components, the same on every design, and
 * everything about their dress used to be written once for all of them —
 * which is why an invitation built in the studio came out looking like the
 * app. Four fields on the page answer it, and this is the whole of what the
 * markup gets: one attribute and a few variables.
 */
test('a page that says nothing about its sections is dressed as it always was', () => {
  assert.deepEqual(sectionDress(undefined), { vars: {} });
  assert.equal(sectionDress(undefined).kind, undefined, 'and carries no attribute, so no rule of the new block bites');
});

test('the alignment is one choice and carries the divider with it', () => {
  const left = sectionDress({ align: 'left' });
  assert.equal(left.kind, 'plain');
  assert.deepEqual(left.vars, { '--sec-align': 'left', '--sec-rule-x': 'left' });
  // centred is what every design already was, and it is said out loud rather
  // than left out, because she chose it
  assert.deepEqual(sectionDress({ align: 'center' }).vars, { '--sec-align': 'center', '--sec-rule-x': 'center' });
});

test('a card is the attribute, not a variable', () => {
  assert.equal(sectionDress({ card: true }).kind, 'card');
  assert.deepEqual(sectionDress({ card: true }).vars, {}, 'nothing about a card is a measurement');
  assert.equal(sectionDress({ align: 'right' }).kind, 'plain');
});

/**
 * The divider's height is a multiple of the page's own gap for the same
 * reason `footPad` is: the gap is viewport-relative with a cap, so it holds
 * on a phone and on a laptop, and a number of pixels would be right on only
 * one of them.
 */
test('the divider is a piece and a height in the page’s own unit', () => {
  const one = sectionDress({ rule: '/pieces/bow.webp' });
  assert.equal(one.vars['--sec-rule'], 'url(/pieces/bow.webp)');
  assert.equal(one.vars['--sec-rule-h'], 'calc(1 * min(11vw, 3.5rem))', 'absent is one gap tall');
  assert.equal(sectionDress({ rule: '/p.png', ruleHeight: 2.5 }).vars['--sec-rule-h'], 'calc(2.5 * min(11vw, 3.5rem))');
  // no piece, no height at all: the stylesheet falls back to nought, so the
  // box is nought high and the gap under it — a share of that height — nought too
  assert.equal(sectionDress({ align: 'left' }).vars['--sec-rule-h'], undefined);
  assert.equal(sectionDress({ ruleHeight: 3 }).vars['--sec-rule-h'], undefined, 'a height with nothing to draw draws nothing');
});

test('a page’s dress survives a read-back, and nonsense in it is refused', () => {
  const doc: DesignDoc = {
    v: 1,
    pages: [{ key: 'a', sections: ['rsvp'], sectionStyle: { align: 'left', card: true, rule: '/pieces/bow.webp', ruleHeight: 1.5 } }],
  };
  const read = designOf(JSON.parse(JSON.stringify(doc)), 'capiz');
  assert.deepEqual(read.dropped, []);
  assert.deepEqual(read.doc?.pages[0].sectionStyle, { align: 'left', card: true, rule: '/pieces/bow.webp', ruleHeight: 1.5 });
  const bad = designOf({ v: 1, pages: [{ key: 'a', sections: [], sectionStyle: { align: 'middle' } }] }, 'capiz');
  assert.deepEqual(bad.dropped, ['page 1 (a)'], 'there is no such alignment');
});

// --- a picture the words flow around --------------------------------------

/**
 * `float` and `transform` do not know about each other: a float reserves the
 * un-rotated box and a rotation draws outside it, so a tilted frame would
 * hang over the words. So a box big enough for the turned frame is floated,
 * with a polygon tracing the frame's real corners — which is trigonometry,
 * and can be asserted without a browser.
 */
test('an untilted frame floats as its own box', () => {
  const square = floatShape(1, 0);
  assert.equal(square.width, 1);
  assert.equal(square.height, 1);
  assert.equal(square.inner, 100, 'the frame fills the box it floats');
  assert.equal(square.polygon, 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)');

  // a portrait frame: taller than it is wide, and still no wider than itself
  const tall = floatShape(1.5, 0);
  assert.equal(tall.width, 1);
  assert.equal(tall.height, 1.5);
  assert.equal(tall.polygon, 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)');
});

/**
 * A float has a place of its own now: she drags it where she wants it and the
 * words flow past it there. `floatAt` is the whole of that rule — the side
 * from which half of the column the middle of the box is in, and the two
 * margins that put it where she left it.
 */
test('a float lands where she put it, on the side of the words its middle is nearer', () => {
  // a 40-wide box whose middle is a quarter across: on the left, 5 in from it
  assert.deepEqual(floatAt({ x: 25, y: 8 }, 40), { side: 'left', inset: 5, down: 8 });
  // the same box dragged across the middle changes sides, and the inset is
  // measured off the right edge
  assert.deepEqual(floatAt({ x: 75, y: 8 }, 40), { side: 'right', inset: 5, down: 8 });
  // hard against its own edge
  assert.deepEqual(floatAt({ x: 20, y: 0 }, 40), { side: 'left', inset: 0, down: 0 });
  // and a place that would push it out past the other edge is held inside
  assert.deepEqual(floatAt({ x: 5, y: 0 }, 40), { side: 'left', inset: 0, down: 0 });
  assert.deepEqual(floatAt({ x: 49, y: 0 }, 90), { side: 'left', inset: 4, down: 0 });
  assert.equal(floatAt({ x: 10, y: 0 }, 120).inset, 0, 'a box wider than the page has nowhere to be inset to');
  // no place at all: the side it names, against that edge, at the top — which
  // is exactly where every float drawn before this sat
  assert.deepEqual(floatAt({ float: 'right' }, 40), { side: 'right', inset: 0, down: 0 });
  assert.deepEqual(floatAt({}, 40), { side: 'left', inset: 0, down: 0 });
  // a downward place is never negative, whatever a hand-written document says
  assert.equal(floatAt({ x: 25, y: -10 }, 40).down, 0);
  // and it survives the parse, on a float as on anything else
  const read = designOf({ v: 1, pages: [{ key: 'p', sections: ['countdown'], elements: [
    { id: 'photo-1', kind: 'photo', x: 25, y: 8, w: 40, aspect: 1, float: 'left', frame: 'none', bind: { asset: '/x.webp' } },
  ] }] }, 'classic');
  assert.deepEqual(read.dropped, []);
  const el = read.doc?.pages[0].elements?.[0] as PhotoEl;
  assert.equal(el.x, 25);
  assert.equal(el.y, 8);
  assert.equal(el.float, 'left');
});

test('a square turned 45° floats a bigger box and its shape is a diamond', () => {
  const d = floatShape(1, 45);
  // the bounding box of a square turned an eighth of a turn is √2 on a side
  assert.ok(Math.abs(d.width - Math.SQRT2) < 0.001, `${d.width} should be about 1.414`);
  assert.ok(Math.abs(d.height - Math.SQRT2) < 0.001);
  assert.ok(Math.abs(d.inner - 70.71) < 0.1, 'the frame is about 70% of the box it floats');
  // the four corners land on the middles of the box's sides
  assert.equal(d.polygon, 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)');
});

test('a small tilt grows the box a little and tips the shape', () => {
  const t = floatShape(1.25, 8);
  assert.ok(t.width > 1 && t.width < 1.2, `${t.width} is a little wider than the frame`);
  assert.ok(t.height > 1.25 && t.height < 1.5, `${t.height} is a little taller`);
  // four corners, none of them at a box corner any more
  const points = t.polygon.replace(/^polygon\(|\)$/g, '').split(', ');
  assert.equal(points.length, 4);
  assert.ok(!points.includes('0% 0%'), 'a tilted frame does not reach the box’s corner');
  // and the shape is the frame turned the same way in both directions
  const back = floatShape(1.25, -8);
  assert.equal(back.width, t.width);
  assert.equal(back.height, t.height);
  assert.notEqual(back.polygon, t.polygon, 'tilted the other way is a different outline');
});

test('a turn of a quarter swaps the box’s sides', () => {
  const q = floatShape(2, 90);
  assert.ok(Math.abs(q.width - 2) < 0.001, 'a frame twice as tall as wide, turned upright, is twice as wide');
  assert.ok(Math.abs(q.height - 1) < 0.001);
});

// --- a decoration on a page laid out by its words --------------------------

/**
 * The three answers a flow page can give about something on it, and the rule
 * that leaves no fourth: a picture naming a side floats, words belong to the
 * sections, and everything else hangs off the head or the foot. Before this
 * the last of those was "drawn nowhere", which a document could say and no
 * page would show.
 */
const flowPage = (elements: Element[]): PageSpec => ({ key: 'story', sections: ['story'], elements });

test('a flow page sorts what it carries into floats, decorations and words', () => {
  const page = flowPage([
    { id: 'a', kind: 'photo', y: 0, w: 40, float: 'left', bind: { asset: '/a.png' } },
    { id: 'b', kind: 'photo', y: 0, w: 100, bind: { asset: '/b.png' } },
    { id: 'c', kind: 'shape', shape: 'line', y: 2, w: 60, from: 'bottom' },
    { id: 'd', kind: 'text', block: 'free', y: 0, lines: [{ role: 'body', sources: [{ fixed: { en: 'no' } }] }] },
    { id: 'e', kind: 'video', y: 0, url: '/e.mp4', poster: '/e.jpg', bg: true, z: -2 },
  ]);
  assert.deepEqual(flowFloats(page).map((e) => e.id), ['a'], 'only the one that names a side floats');
  // words too: a box of words hung off the head is a caption or a title over the section's own words, which keep flowing under it
  assert.deepEqual(flowDecor(page).map((e) => e.id), ['b', 'c', 'd', 'e'], 'the picture, the rule, the words and the clip are decorations');
});

test('a decoration hangs off an edge by a share of the page’s width', () => {
  const head = decorStyle({ id: 'b', kind: 'photo', y: 4, x: 50, w: 100, bind: { asset: '/b.png' } });
  assert.deepEqual(head, { left: '50%', width: '100%', top: '4cqw', transform: 'translateX(-50%)' });

  const foot = decorStyle({ id: 'c', kind: 'shape', shape: 'line', y: 4, x: 50, w: 60, from: 'bottom' });
  assert.equal(foot.bottom, '4cqw', 'measured up from the foot');
  assert.equal(foot.top, undefined, 'and not down from the head as well');
});

/**
 * The whole point of cqw here. A drawn page's y is a share of its height, and
 * `elementStyle` needs the page's ratio to place it. A flow page's height is
 * its customer's words, so there is no ratio to hand over and none is taken:
 * the gap is the same number of hundredths of the page's width whatever the
 * words come to, which is why a long sentence cannot drag a flourish down the
 * page with it.
 */
test('a decoration’s gap does not move when the words grow', () => {
  const el: Element = { id: 'b', kind: 'photo', y: 6, x: 50, w: 30, bind: { asset: '/b.png' } };
  assert.equal(decorStyle(el).top, '6cqw');
  assert.equal(decorStyle(el).top, decorStyle({ ...el }).top, 'nothing about the page is passed in at all');
  assert.equal(decorStyle(el).height, undefined, 'and a decoration is never given one');
});

test('a decoration is behind the words unless its layer is above zero', () => {
  const bare: Element = { id: 'b', kind: 'photo', y: 0, bind: { asset: '/b.png' } };
  assert.equal(decorOver(bare), false, 'behind by default');
  assert.equal(decorOver({ ...bare, z: 0 }), false, 'and behind at nought, which is auto’s own layer');
  assert.equal(decorOver({ ...bare, z: -2 }), false, 'a clip filling the page is as far behind as it gets');
  assert.equal(decorOver({ ...bare, z: 1 }), true, 'over the words is asked for');
  assert.equal(decorStyle({ ...bare, z: 1 }).zIndex, '1', 'and the layer is kept, for the order among themselves');
});

test('a decoration keeps its turn and its opacity, and its middle is its x', () => {
  const st = decorStyle({ id: 'b', kind: 'photo', y: 1, x: 20, w: 30, rotate: -6, opacity: 0.5, bind: { asset: '/b.png' } });
  assert.equal(st.transform, 'translateX(-50%) rotate(-6deg)');
  assert.equal(st.opacity, '0.5');
  assert.equal(st.left, '20%');
});

/**
 * What the studio opens on, for every design rather than the two built as
 * pages. A flat design used to have no document and no base to make one
 * from, so the studio refused it and a design made from the Templates list
 * led to a form and stopped there.
 */
test('a design with pages of its own opens on them, and the draft wins', () => {
  const drawn = starterDesign(['cover', 'story']);
  const draft = starterDesign(['cover', 'rsvp']);
  assert.deepEqual(studioDoc({ design: drawn, designDraft: draft, layout: 'classic' }), draft);
  assert.deepEqual(studioDoc({ design: drawn, designDraft: {}, layout: 'classic' }), drawn);
});

test('the two built as pages still open on their own built-ins, not a starter', () => {
  for (const layout of ['capiz', 'babyblue']) {
    assert.deepEqual(
      studioDoc({ design: {}, designDraft: {}, layout, occasion: 'WEDDING' }),
      builtinDesign(layout),
      `${layout} must keep its built-in`,
    );
  }
});

test('a flat design opens on a starter made from its occasion', () => {
  const doc = studioDoc({ design: {}, designDraft: {}, layout: 'classic', occasion: 'CHRISTENING' });
  assert.ok(doc, 'the studio has something to open');
  assert.equal(doc!.pages[0].key, 'cover', 'the cover comes first');
  assert.ok(doc!.pages.length > 3, `one page per section, not ${doc!.pages.length}`);
  // Every page carries exactly the one section it stands for, which is what
  // makes the starter a place to draw rather than a design already drawn.
  for (const page of doc!.pages.slice(1)) assert.equal(page.sections.length, 1, page.key);
  // A christening's sections, not a wedding's: no entourage on this one.
  const sections = doc!.pages.flatMap((p) => p.sections);
  assert.ok(sections.includes('sponsors'), 'ninong and ninang');
  assert.ok(!sections.includes('entourage'), 'no wedding entourage');
});

test('without an occasion there is nothing to make a starter from', () => {
  assert.equal(studioDoc({ design: {}, designDraft: {}, layout: 'classic' }), null);
});

test('the colour beside a page follows the page, unless the page says otherwise', () => {
  const blue: PageSpec = { key: 'p', sections: ['countdown'], ground: { color: '#a9c6e8' } };
  // a page on a plain colour carries it out to the window's edges
  assert.equal(outsideOf(blue), '#a9c6e8');
  // by role too, so night can turn it down with the palette
  assert.equal(outsideOf({ key: 'p', sections: [], ground: { color: 'surface' } }), 'surface');
  // a page on a picture keeps the design's own surround
  assert.equal(outsideOf({ key: 'p', sections: [], ground: { url: '/x.webp', ratio: 2, top: '#fff', bottom: '#eee' } }), undefined);
  // and so does a page with no ground at all
  assert.equal(outsideOf({ key: 'p', sections: [] }), undefined);
  // kept to the column: the design's surround, or a colour said beside it
  assert.equal(outsideOf({ ...blue, bleed: false }), undefined);
  assert.equal(outsideOf({ ...blue, bleed: false, outside: 'accent' }), 'accent');
  assert.equal(outsideOf({ ...blue, bleed: false, outside: '#123456' }), '#123456');
  // a colour said beside a page that reaches the edges is not read: the page's own colour is beside it
  assert.equal(outsideOf({ ...blue, outside: 'accent' }), '#a9c6e8');
  // a plain colour reaches unless told not to; a picture stays in the column unless told to reach; nothing reaches with nothing
  assert.equal(bleeds(blue), true);
  assert.equal(bleeds({ ...blue, bleed: false }), false);
  const pic: PageSpec = { key: 'p', sections: [], ground: { url: '/x.webp', ratio: 2, top: '#fff', bottom: '#eee' } };
  assert.equal(bleeds(pic), false);
  assert.equal(bleeds({ ...pic, bleed: true }), true);
  assert.equal(outsideOf({ ...pic, bleed: true }), undefined, 'a picture that reaches is laid by the ground, not as a colour');
  assert.equal(bleeds({ key: 'p', sections: [] }), false);
  assert.equal(designOf({ v: 1, pages: [{ ...pic, bleed: true }] }, 'classic').doc?.pages[0].bleed, true);
  // it is in the document and survives the parse
  const read = designOf({ v: 1, pages: [{ ...blue, outside: 'accent' }] }, 'classic');
  assert.equal(read.doc?.pages[0].outside, 'accent');
  assert.deepEqual(read.dropped, []);
});

test('words are decorations on a page laid out by its words, and floats are not', () => {
  const page = {
    key: 'p', sections: ['countdown'],
    elements: [
      { id: 'photo-1', kind: 'photo', y: 0, w: 40, aspect: 1, float: 'left', frame: 'none', bind: { asset: '' } },
      { id: 'photo-2', kind: 'photo', x: 50, y: 4, w: 40, anchor: 'centre', aspect: 1, frame: 'none', bind: { asset: '' } },
      { id: 'words-1', kind: 'text', block: 'free', x: 50, y: 4, w: 70, z: 1, lines: [{ role: 'body', sources: [{ fixed: { en: 'A line beside the numbers' } }] }] },
      { id: 'shape-1', kind: 'shape', shape: 'rect', x: 50, y: 0, w: 70, h: 30, z: -1, fill: 'surface' },
    ],
  } as unknown as Parameters<typeof flowDecor>[0];
  assert.deepEqual(flowFloats(page).map((e) => e.id), ['photo-1']);
  assert.deepEqual(flowDecor(page).map((e) => e.id), ['photo-2', 'words-1', 'shape-1']);
  // the words go over the section's own, which is what the studio sets them to
  assert.equal(decorOver(flowDecor(page)[1]), true);
  assert.equal(decorOver(flowDecor(page)[2]), false);
  // and hang off the head like any other decoration
  assert.equal(decorStyle(flowDecor(page)[1]).top, '4cqw');
});

test('a picture that runs on is laid down the pages after it, until one has a ground of its own', () => {
  const pic = { url: '/tall.webp', ratio: 5, top: '#fff', bottom: '#eee' };
  const doc = {
    v: 1 as const,
    pages: [
      { key: 'cover', sections: ['cover'], ground: { ...pic, runsOn: 2 } },
      { key: 'countdown', sections: ['countdown'] },
      { key: 'parents', sections: ['parents'] },
      { key: 'sponsors', sections: ['sponsors'] },
      { key: 'ceremony', sections: ['ceremony'], ground: { ...pic, runsOn: 3 } },
      { key: 'reception', sections: ['reception'] },
      { key: 'dress-code', sections: ['dress-code'], ground: { color: 'bg' } },
      { key: 'gift', sections: ['gift'] },
      { key: 'rsvp', sections: ['rsvp'], ground: { ...pic, runsOn: 4 } },
      { key: 'story', sections: ['story'], drawn: true as const, ground: { color: 'bg', ratio: 1.777 } },
      { key: 'closing', sections: ['closing'] },
    ],
  } as unknown as Parameters<typeof runOf>[0];
  const runs = runOf(doc);
  // the two after the cover, and not the third
  assert.equal(runs.get('countdown'), 'cover');
  assert.equal(runs.get('parents'), 'cover');
  assert.equal(runs.has('sponsors'), false);
  // a page with a ground of its own ends the run early, whatever the number says
  assert.equal(runs.get('reception'), 'ceremony');
  assert.equal(runs.has('dress-code'), false);
  assert.equal(runs.has('gift'), false);
  // so does a page placed by hand
  assert.equal(runs.has('story'), false);
  assert.equal(runs.has('closing'), false);
  // a head sits on its own picture and is not in the map
  assert.equal(runs.has('cover'), false);
  // the number is the document's and survives the parse
  const read = designOf(doc, 'classic');
  assert.deepEqual(read.dropped, []);
  const head = read.doc?.pages[0].ground;
  assert.equal(head && 'url' in head ? head.runsOn : undefined, 2);
});

test('a picture pinned behind the words is the pages after it too, until one brings a picture of its own', () => {
  const pic = { url: '/screen.webp', ratio: 0.5625, top: '#fff', bottom: '#eee' };
  const tall = { url: '/long.webp', ratio: 2.989, top: '#fff', bottom: '#eee' };
  const doc = {
    v: 1 as const,
    pages: [
      { key: 'cover', sections: ['cover'], ground: { ...pic, runsOn: 2 }, pin: true as const },
      { key: 'countdown', sections: ['countdown'] },
      { key: 'parents', sections: ['parents'], ground: { color: 'surface' } },
      { key: 'ceremony', sections: ['ceremony'], ground: { ...pic, url: '/church.webp', runsOn: 1 } },
      { key: 'reception', sections: ['reception'] },
      { key: 'dress-code', sections: ['dress-code'], ground: { ...pic, url: '/dress.webp' }, pin: 'column' as const },
      { key: 'gift', sections: ['gift'] },
      { key: 'story', sections: ['story'], drawn: true as const, ground: { color: 'bg', ratio: 1.777 } },
      { key: 'closing', sections: ['closing'], ground: tall },
      { key: 'thanks', sections: ['thanks'], ground: { color: 'bg' }, pin: true as const },
      { key: 'map', sections: ['map'] },
    ],
  } as unknown as Parameters<typeof pinOf>[0];
  const pins = pinOf(doc);
  // the head is on its own picture, and reaches as far as it says: two pages
  // after it here, a colour of their own or not
  assert.equal(pins.get('cover'), 'cover');
  assert.equal(pins.get('countdown'), 'cover');
  assert.equal(pins.get('parents'), 'cover');
  /*
   * A page with a picture of its own starts afresh — and a picture wider
   * than it is tall pins whether or not the page was ever told to. It is
   * the website's background: there is no length of it to flow down a page,
   * and the page after it rides on it like any other pin.
   */
  assert.equal(pins.get('ceremony'), 'ceremony');
  assert.equal(pins.get('reception'), 'ceremony');
  // the phone's background pins too, to the column rather than the window —
  // and this one was given no pages after it, so it is this page only
  assert.equal(pins.get('dress-code'), 'dress-code');
  assert.equal(pins.has('gift'), false, 'a background reaches only the pages she picked');
  // a page placed by hand ends it and pins nothing
  assert.equal(pins.has('story'), false);
  // a picture drawn to flow down the pages is the one that does not pin
  assert.equal(pins.has('closing'), false);
  // a pin on a colour pins nothing
  assert.equal(pins.has('thanks'), false);
  assert.equal(pins.has('map'), false);
  // the pin is the document's and survives the parse; a false one is not a pin
  const read = designOf(doc, 'classic');
  assert.deepEqual(read.dropped, []);
  assert.equal(read.doc?.pages[0].pin, true);
  assert.equal(read.doc?.pages[1].pin, undefined);
  assert.equal(read.doc?.pages[5].pin, 'column');
  assert.equal(designOf({ v: 1, pages: [{ key: 'p', sections: ['countdown'], ground: pic, pin: false }] }, 'classic').doc?.pages.length, 0);
});

/**
 * The three backgrounds, which is the whole of what a picture behind a page
 * can be. The rule that matters most is the last one: a picture wider than it
 * is tall is never cut in three and stretched down a page, whatever an older
 * draft says, because that is what turned a 1920-by-1080 upload into a long
 * band of pulled middle.
 */
test('a picture behind a page is one of three backgrounds, and a wide one is never stretched', () => {
  const wide = { url: '/w.webp', ratio: 0.5625, top: '#fff', bottom: '#eee' };
  const phone = { url: '/p.webp', ratio: 1.777, top: '#fff', bottom: '#eee' };
  const long = { url: '/l.webp', ratio: 2.989, top: '#fff', bottom: '#eee' };
  const on = (ground: unknown, rest: Partial<PageSpec> = {}): PageSpec => ({ key: 'p', sections: [], ground, ...rest } as PageSpec);
  // what the page says
  assert.equal(groundKind(on(phone, { pin: 'column' })), 'phone');
  assert.equal(groundKind(on(long, { pin: true })), 'website');
  assert.equal(groundKind(on(long)), 'flow');
  assert.equal(groundKind(on(phone)), 'flow');
  // a picture wider than it is tall is the website's background, told or not
  assert.equal(groundKind(on(wide)), 'website');
  assert.equal(groundKind(on(wide, { pin: 'column' })), 'phone');
  // a colour is no kind of picture, and neither is a page drawn by hand
  assert.equal(groundKind(on({ color: 'bg' })), undefined);
  assert.equal(groundKind({ key: 'p', sections: [] }), undefined);
  assert.equal(groundKind(on(long, { drawn: true })), undefined);
  // what a picture of each shape arrives as, so that uploading one is the whole job
  assert.equal(kindOfShape(0.5625), 'website');
  assert.equal(kindOfShape(1), 'phone');
  assert.equal(kindOfShape(1.777), 'phone');
  assert.equal(kindOfShape(2.989), 'flow');
  // the website's background is the whole page by definition; the phone's is the column
  assert.equal(bleeds(on(wide)), true);
  assert.equal(bleeds(on(phone, { pin: 'column' })), false);
  assert.equal(bleeds(on(phone, { pin: 'column', bleed: true })), false, 'the choice answers it, not a leftover tick');
  assert.equal(outsideOf(on(wide, { outside: 'accent' })), undefined, 'the picture is what is beside the column');
  assert.equal(outsideOf(on(phone, { pin: 'column', outside: 'accent' })), 'accent');
  // and a page with a background pinned behind it is a screen tall unless it says otherwise
  assert.equal(screensOf(on(wide)), 1);
  assert.equal(screensOf(on(phone, { pin: 'column' })), 1);
  assert.equal(screensOf(on(wide, { minScreens: 2.5 })), 2.5);
  assert.equal(screensOf(on(long)), undefined);
  assert.equal(screensOf({ key: 'p', sections: [] }), undefined);
  assert.equal(screensOf(on(long, { drawn: true, minScreens: 2 })), undefined);
});

/**
 * The two backgrounds and how far they reach, which is the whole of what she
 * has to say about a background now: one picture for the phone, one for the
 * whole website, and the pages either of them stands behind.
 */
test('a page can carry a background for the phone and one for the website, and say how far it reaches', () => {
  const wide = { url: '/wide.webp', ratio: 0.5625, top: '#fff', bottom: '#eee' };
  const tall = { url: '/tall.webp', ratio: 1.777, top: '#fff', bottom: '#eee' };
  // both, the wide one the page's and the phone's riding along beside it
  const both = { v: 1 as const, pages: [{ key: 'cover', sections: ['cover'] as const, ground: { ...wide, phone: tall }, pin: true as const }] };
  const read = designOf(both, 'classic');
  assert.deepEqual(read.dropped, []);
  const g = read.doc?.pages[0].ground;
  assert.ok(g && 'phone' in g && g.phone, 'the phone-size picture survives the parse');
  assert.equal(g && 'phone' in g ? g.phone?.url : '', '/tall.webp');
  assert.equal(groundKind(read.doc!.pages[0]), 'website', "the wide one is the page's background; the phone's is the alternative");
  // the phone's picture alone is the page's background, pinned to the column
  const one = designOf({ v: 1, pages: [{ key: 'cover', sections: ['cover'], ground: tall, pin: 'column' }] }, 'classic');
  assert.deepEqual(one.dropped, []);
  assert.equal(groundKind(one.doc!.pages[0]), 'phone');
  assert.equal(bleeds(one.doc!.pages[0]), false, 'it keeps to the column, with the surround beside it');
  // a phone picture that is not a picture at all is not a background
  assert.equal(designOf({ v: 1, pages: [{ key: 'p', sections: ['cover'], ground: { ...wide, phone: { url: '/x.webp' } } }] }, 'classic').doc?.pages.length, 0);
  // how far it reaches: the pages she picked, and no further
  const doc = {
    v: 1 as const,
    pages: [
      { key: 'a', sections: ['cover'], ground: { ...wide, runsOn: 1 }, pin: true as const },
      { key: 'b', sections: ['countdown'] },
      { key: 'c', sections: ['parents'] },
    ],
  } as unknown as Parameters<typeof pinOf>[0];
  const pins = pinOf(doc);
  assert.equal(pins.get('a'), 'a');
  assert.equal(pins.get('b'), 'a');
  assert.equal(pins.has('c'), false);
});

test('a page laid out by its words can be told to be at least so many screens tall', () => {
  const read = designOf({ v: 1, pages: [{ key: 'p', sections: ['countdown'], minScreens: 1.5 }] }, 'classic');
  assert.deepEqual(read.dropped, []);
  assert.equal(read.doc?.pages[0].minScreens, 1.5);
  // and not to be smaller than a third of one, or taller than six
  assert.equal(designOf({ v: 1, pages: [{ key: 'p', sections: ['countdown'], minScreens: 9 }] }, 'classic').doc?.pages.length, 0);
});

test('a writing lifted off the page is remembered on the page and on the box that took its place', () => {
  const read = designOf({
    v: 1,
    pages: [{
      key: 'p', sections: ['ceremony'], offFlow: ['ceremony.title'],
      elements: [{ id: 'words-1', kind: 'text', block: 'head', x: 50, y: 6, w: 80, anchor: 'top', z: 1, lifted: 'ceremony.title', lines: [{ role: 'title', align: 'center', sources: [{ word: 'ceremonyTitle' }, { fixed: { en: 'Ceremony' } }], size: 5.6 }] }],
    }],
  }, 'classic');
  assert.deepEqual(read.dropped, []);
  assert.deepEqual(read.doc?.pages[0].offFlow, ['ceremony.title']);
  const el = read.doc?.pages[0].elements?.[0];
  assert.equal(el && el.kind === 'text' ? el.lifted : undefined, 'ceremony.title');
  // and it is a decoration of the page, over the words, hung off the head
  assert.equal(flowDecor(read.doc!.pages[0]).length, 1);
  assert.equal(decorOver(flowDecor(read.doc!.pages[0])[0]), true);
});

test('a page too tall for a screen can be made smaller, and the studio works out by how much', () => {
  const read = designOf({ v: 1, pages: [{ key: 'p', sections: ['countdown', 'closing'], size: 0.6 }] }, 'classic');
  assert.deepEqual(read.dropped, []);
  assert.equal(read.doc?.pages[0].size, 0.6);
  // a size of 1 is the size the design was written at, so the page says nothing
  assert.equal(sizeOf({ key: 'p', sections: [], size: 1 }), undefined);
  assert.equal(sizeOf({ key: 'p', sections: [], size: 0.6 }), 0.6);
  // a drawn page has no size of this kind: its size is its proportion
  assert.equal(sizeOf({ key: 'p', sections: [], drawn: true, size: 0.6 }), undefined);
  // and it is kept inside its bounds
  assert.equal(designOf({ v: 1, pages: [{ key: 'p', sections: ['countdown'], size: 4 }] }, 'classic').doc?.pages.length, 0);

  // "Fit it to one screen": 1910px of page in an 800px screen is 800/1910 of the
  // size, down to the step the slider counts in — 0.418… becomes 0.41, never 0.42,
  // so the thumb and the page agree and the page is never left a hair too tall
  assert.equal(sizeToFit(1910, 800), 0.41);
  // from whatever size it is already drawn at
  assert.equal(sizeToFit(955, 800, 0.5), 0.41);
  // a page told to be two screens tall is fitted to two
  assert.equal(sizeToFit(1910, 800, 1, 2), 0.83);
  // a page that already fits is left alone rather than blown up
  assert.equal(sizeToFit(600, 800), 1);
  assert.equal(sizeToFit(600, 800, 0.8), 0.8);
  // and nothing measured is nothing done
  assert.equal(sizeToFit(0, 800, 0.7), 0.7);
});

test('the parents are a part a design can carry, with a heading and a line of its own', () => {
  // it is offered to a customer again, and never counted as missing
  const def = SECTION_BY_KEY.parents;
  assert.equal(def.hidden, undefined);
  assert.equal(def.optional, true);
  assert.equal(sectionsFor('WEDDING').some((d) => d.key === 'parents'), true);
  // a wedding is asked for the two sides; every other occasion for its hosts
  assert.equal(fieldsFor('parents', 'WEDDING').some((f) => f.key === 'brideFather'), true);
  assert.equal(fieldsFor('parents', 'REUNION').some((f) => f.key === 'hosts'), true);
  // the design names the heading and writes the line under it
  assert.equal(TITLE_ON.parents, 'parents');
  assert.equal(LINE_ON.parents.on, 'parents');
  const words = wordsFor('WEDDING');
  assert.equal(words.titles.includes('parents'), true);
  assert.equal(words.lines.includes('parents'), true);
  // a memorial carries the family instead, so it is offered neither
  assert.equal(wordsFor('MEMORIAL').titles.includes('parents'), false);
  assert.equal(sectionsFor('MEMORIAL').some((d) => d.key === 'parents'), false);
  // and a page can hold it
  const read = designOf({ v: 1, pages: [{ key: 'p', sections: ['parents'] }] }, 'classic');
  assert.deepEqual(read.dropped, []);
  assert.deepEqual(read.doc?.pages[0].sections, ['parents']);
});

/**
 * The guest's list of parts survives being saved.
 *
 * `zDoc` is `.strict()`, so a field the *type* knows and the schema does not
 * is not quietly stripped — the whole parse fails and the design falls back
 * to its built-in. That caught the Save the Date and the paper settings out
 * twice: both saved perfectly and rendered nothing at all. So this asserts
 * the round trip rather than the type.
 */
test('a design that offers a list of parts still says so after a save', () => {
  const base = builtinDesign('capiz')!;
  const written = JSON.parse(JSON.stringify({ ...base, contents: true }));
  const read = designOf(written, 'capiz');
  assert.deepEqual(read.dropped, [], 'the document did not survive the schema');
  assert.equal(read.doc?.contents, true, 'the list was stripped on the way through');

  // and the designs that have not asked for one say nothing, which is what
  // keeps the two originals exactly as they were
  assert.equal(builtinDesign('capiz')!.contents, undefined);
  assert.equal(builtinDesign('babyblue')!.contents, undefined);

  // anything else is a design document somebody hand-edited, and refused
  assert.equal(designOf({ ...written, contents: false }, 'capiz').doc, null, 'false is not a thing a document may say');
  assert.equal(designOf({ ...written, contents: 3 }, 'capiz').doc, null);
});

/**
 * A shortlist, because seventeen rows is not a menu.
 *
 * `true` lists every part a guest could reach, which is a table of contents.
 * A design that knows what people arrive wanting can name those instead, in
 * the order it wants them offered — which need not be the order the
 * invitation is read in.
 */
test('a design can name the few parts worth jumping to', () => {
  const base = builtinDesign('capiz')!;
  const few = ['ceremony', 'reception', 'dressCode', 'rsvp'];
  const written = JSON.parse(JSON.stringify({ ...base, contents: few }));
  const read = designOf(written, 'capiz');
  assert.deepEqual(read.dropped, []);
  assert.deepEqual(read.doc?.contents, few, 'the shortlist did not survive the schema');

  // the keys have to look like keys, and the list has a ceiling
  assert.equal(designOf({ ...written, contents: ['not a key!'] }, 'capiz').doc, null);
  const none = designOf({ ...written, contents: [] }, 'capiz').doc?.contents;
  assert.deepEqual(none, [], 'an empty list is allowed and simply offers nothing');
  assert.equal(designOf({ ...written, contents: Array(25).fill('rsvp') }, 'capiz').doc, null, 'a list this long is a table of contents again');
});

/**
 * A page kept for the Save the Date leaves the invitation.
 *
 * The hazard this is really about: a Save the Date names the cover section,
 * because a card is names and a date. If `coverOf` found that page it would
 * hand the invitation's hero the *card's* settings, and which one won would
 * come down to the order of the page list — the same shape of fault as two
 * lists sharing a key. So every question about the invitation goes through
 * `invitationPages`, and this asserts it of each one.
 */
test('a Save the Date page is not part of the invitation, and is not its cover', () => {
  const base = builtinDesign('babyblue')!;
  const card: PageSpec = {
    key: 'the-card',
    sections: ['cover'],
    drawn: true,
    peekEnd: true,
    only: 'std',
    // settings that would be wrong on the invitation if they leaked
    cover: { names: 'bottom' },
  };
  const withCard: DesignDoc = { ...base, pages: [card, ...base.pages] };

  // it is in the document, and it is the card
  assert.equal(withCard.pages.length, base.pages.length + 1);
  assert.equal(stdPage(withCard)?.key, 'the-card');
  assert.equal(stdPage(base), undefined, 'a design that has not drawn one has none');

  // and it is in none of the invitation's answers
  assert.deepEqual(invitationPages(withCard).map((p) => p.key), base.pages.map((p) => p.key));
  assert.equal(invitationPages(null).length, 0);
  // the card is listed first *and* marks the peek end, so order cannot save us
  assert.notEqual(coverOf(withCard)?.names, 'bottom');
  assert.deepEqual(coverOf(withCard), coverOf(base), 'the invitation keeps its own cover settings');
  assert.equal(peekEndPage(withCard), peekEndPage(base), 'the peek ends where the invitation says');
  assert.equal(pageOfSection(withCard, 'cover')?.key, pageOfSection(base, 'cover')?.key);
  assert.deepEqual(drawnSections(withCard), drawnSections(base));
  assert.deepEqual(offeredSections(withCard, 'CHRISTENING'), offeredSections(base, 'CHRISTENING'));
});

/**
 * What a design says about paper. Before this, `globals.css` carried one
 * `@page` rule — a 14mm margin, put there for the account's printable
 * sheets, and unscopable, so every printed page took it — but nothing about
 * size or breaks, so the browser cut the column wherever it landed. A design
 * that still says nothing must print exactly as it did, which is the first
 * case.
 */
test('the paper settings come to the CSS a browser needs, and nothing when unset', () => {
  const base = builtinDesign('capiz')!;
  assert.equal(sheetRules(base), '', 'a design with no paper settings adds no rules');
  assert.equal(sheetRules(null), '');
  assert.equal(sheetRules({ ...base, sheet: {} }), '', 'an empty sheet is the same as none');

  const sized = sheetRules({ ...base, sheet: { size: 'a5', margin: 0 } });
  assert.match(sized, /@page \{ size: A5; margin: 0mm; \}/);
  // 0 is a real answer and must not be dropped as falsy — a ground running to
  // the edge of the sheet is exactly why somebody would ask for it
  assert.match(sheetRules({ ...base, sheet: { margin: 0 } }), /margin: 0mm/);
  assert.equal(sheetRules({ ...base, sheet: { size: 'a4' } }).includes('margin'), false);

  const each = sheetRules({ ...base, sheet: { perPage: true } });
  assert.match(each, /break-after: page/);
  assert.match(each, /break-inside: avoid/, 'a page given its own sheet must not then be split');
  assert.match(each, /:last-of-type \{ break-after: auto/, 'no blank sheet after the last page');

  const hidden = sheetRules({ ...base, sheet: { hide: ['rsvp', 'contact'] } });
  assert.match(hidden, /\[data-page="rsvp"\] \{ display: none/);
  assert.match(hidden, /\[data-page="contact"\] \{ display: none/);

  // every size offered is a real CSS page size
  for (const [key, css] of Object.entries(SHEET_SIZES)) {
    assert.match(sheetRules({ ...base, sheet: { size: key as keyof typeof SHEET_SIZES } }), new RegExp(`size: ${css.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`));
  }
});

/**
 * A page key reaches the stylesheet inside a quoted selector, and the studio
 * makes keys from names she types. A quote or a backslash in one would end
 * the string and let the rest of the key be read as CSS, so it is escaped.
 */
test('a page key cannot break out of the rule it is quoted in', () => {
  const base = builtinDesign('capiz')!;
  const nasty = sheetRules({ ...base, sheet: { hide: ['a"] { color: red } .x ['] } });
  /*
   * The text of the key is still in there — it is the selector's own string
   * and is meant to be. What must not happen is that it stops being a
   * string: the check is on the *delimiters*, not on the payload. Strip
   * every escaped pair and exactly two quotes may remain, the two this rule
   * opened and closed with. A first attempt asserted the payload was absent
   * and failed for the right reason: quoted data survives, and should.
   */
  const unescaped = nasty.replace(/\\./g, '');
  assert.equal((unescaped.match(/"/g) ?? []).length, 2, 'the key closed the string early');
  assert.match(nasty, /\\"/, 'the quote is escaped');
  const lines = sheetRules({ ...base, sheet: { hide: ['a\nb'] } });
  assert.equal(lines.split('\n').length, 1, 'a newline cannot split the rule in two');
});


/**
 * The settings survive being written to the column and read back.
 *
 * This is here because a browser probe found the fault it guards, and a
 * unit test is what would have found it first. `zDoc` and `zPage` are
 * `.strict()`, so a key they do not know is not quietly dropped — the page
 * is discarded and named, and an unknown key on the document fails the
 * whole parse and falls the design back to its built-in. Adding a field to
 * the *type* therefore does nothing at all until the schema knows it: the
 * studio would save a card and paper settings, and a guest would be served
 * the design as though neither had been asked for.
 *
 * `designOf` is the round trip, so this asserts on what comes back out.
 */
test('a Save the Date page and the paper settings survive the column', () => {
  const base = builtinDesign('capiz')!;
  const card: PageSpec = { key: 'the-card', sections: ['cover'], drawn: true, only: 'std' };
  const sheet = { size: 'a5' as const, margin: 8, perPage: true as const, hide: ['rsvp'] };
  const written = JSON.parse(JSON.stringify({ ...base, pages: [...base.pages, card], sheet }));

  const { doc, dropped } = designOf(written, 'capiz');
  assert.deepEqual(dropped, [], 'nothing was dropped on the way in');
  assert.ok(doc, 'the document parsed at all — an unknown key on it fails the lot');
  assert.equal(stdPage(doc)?.key, 'the-card', 'the card page came back, and is still the card');
  assert.equal(doc!.pages.length, base.pages.length + 1);
  assert.deepEqual(doc!.sheet, sheet, 'the paper settings came back whole');
  assert.match(sheetRules(doc), /size: A5/);

  // and the two ways it used to go wrong, asserted as the failures they are
  const strayOnDoc = designOf({ ...written, notAThing: 1 }, 'capiz');
  assert.equal(strayOnDoc.doc, null, 'an unknown key on the document is refused, not ignored');
  const strayOnPage = designOf({ ...written, pages: [{ ...card, notAThing: 1 }] }, 'capiz');
  assert.deepEqual(strayOnPage.dropped, ['page 1 (the-card)'], 'an unknown key on a page drops it by name');

  // the bounds the schema puts on the paper settings
  assert.equal(designOf({ ...written, sheet: { margin: 41 } }, 'capiz').doc, null, '41mm leaves no page to print on');
  assert.equal(designOf({ ...written, sheet: { size: 'a3' } }, 'capiz').doc, null, 'a size we do not offer');
  assert.equal(designOf({ ...written, sheet: { hide: ['not a key'] } }, 'capiz').doc, null, 'a hidden page must be named like a page');
  assert.deepEqual(designOf({ ...written, sheet: { margin: 0 } }, 'capiz').doc?.sheet, { margin: 0 }, '0mm is a real answer');
});

/**
 * A booklet leaves the column, and does not leave the invitation.
 *
 * The distinction this is really about. `invitationPages` has always meant
 * "every page except the card", and half a dozen questions lean on it —
 * where the peek stops, what the cover's settings are. A booklet page must
 * leave that list, because it is not scrolled to. But it must *not* leave
 * the invitation: its frames want the customer's photographs, its bytes
 * reach whoever opens it, its parts count as drawn, and paper has to print
 * it because paper has nothing to tap. So there are two lists now and the
 * whole of the risk is a reader asking the wrong one.
 */
test('a booklet page leaves the column, stays in the invitation, and is not the card', () => {
  const base = builtinDesign('babyblue')!;
  const behind: PageSpec[] = [
    { key: 'invitation-details', sections: ['ceremony', 'reception'], booklet: 'invitation' },
    { key: 'invitation-dress', sections: ['dressCode'], booklet: 'invitation' },
    { key: 'invitation-program', sections: ['program', 'gift'], booklet: 'invitation' },
    { key: 'rsvp-card', sections: ['rsvp'], booklet: 'rsvp' },
  ];
  const hub: DesignDoc = { ...base, pages: [...base.pages, ...behind] };

  // off the column
  assert.deepEqual(invitationPages(hub).map((p) => p.key), base.pages.map((p) => p.key));
  // a booklet is not the Save the Date, and asking for one does not find the other
  assert.equal(stdPage(hub), undefined);

  // grouped, in the order the booklets first appear, pages in list order
  assert.deepEqual(bookletsOf(hub).map((b) => b.key), ['invitation', 'rsvp']);
  assert.deepEqual(bookletsOf(hub)[0].pages.map((p) => p.key), ['invitation-details', 'invitation-dress', 'invitation-program']);
  assert.deepEqual(bookletsOf(hub)[1].pages.map((p) => p.key), ['rsvp-card']);
  assert.deepEqual(bookletsOf(base), [], 'a design without a hub has no booklets');

  // and still in the invitation: the column first, then each booklet in turn
  assert.deepEqual(
    reachablePages(hub).map((p) => p.key),
    [...base.pages.map((p) => p.key), 'invitation-details', 'invitation-dress', 'invitation-program', 'rsvp-card'],
  );
  /*
   * The invariant the renderer leans on. It marks a section `placed` as it
   * draws the page carrying it, and anything left unplaced gets a plain page
   * of its own at the end. Walk a list that misses a booklet and every part
   * inside it is drawn twice — once behind the hub and once on a bare
   * overflow ground — which is the fault this line exists to catch.
   */
  assert.equal(new Set(reachablePages(hub).map((p) => p.key)).size, hub.pages.length);
});

/** Pages of one booklet are gathered by name, not by sitting together. */
test('a scattered booklet is still one booklet', () => {
  const base = builtinDesign('babyblue')!;
  const doc2: DesignDoc = {
    ...base,
    pages: [
      { key: 'a', sections: [], booklet: 'one' },
      { key: 'b', sections: [], booklet: 'two' },
      { key: 'c', sections: [], booklet: 'one' },
    ],
  };
  assert.deepEqual(bookletsOf(doc2).map((b) => [b.key, b.pages.map((p) => p.key)]), [['one', ['a', 'c']], ['two', ['b']]]);
});

/** A part behind a hub is still a part, and the preview must be able to reach it. */
test('pageOfSection finds a part drawn inside a booklet', () => {
  const base = builtinDesign('babyblue')!;
  const hub: DesignDoc = {
    ...base,
    pages: [...base.pages.filter((p) => !p.sections.includes('dressCode')), { key: 'invitation-dress', sections: ['dressCode'], booklet: 'invitation' }],
  };
  assert.equal(pageOfSection(hub, 'dressCode')?.key, 'invitation-dress');
});

/**
 * Both fields survive the strict schema.
 *
 * `zDoc` and `zPage` are `.strict()`, so a field the *type* knows and the
 * schema does not fails the whole parse and the design falls silently back
 * to its built-in — a fault that has been shipped twice on this document and
 * looks, from the outside, exactly like the feature not working.
 */
test('booklet and opens round-trip through the strict schema', () => {
  const base = builtinDesign('babyblue')!;
  const raw: DesignDoc = {
    ...base,
    pages: [
      {
        key: 'menu',
        sections: [],
        drawn: true,
        elements: [
          { id: 'the-door', kind: 'shape', shape: 'rect', x: 50, y: 30, w: 40, opens: 'invitation' },
          { id: 'no-door', kind: 'shape', shape: 'rect', x: 50, y: 60, w: 40 },
        ],
      },
      { key: 'invitation-details', sections: ['ceremony'], booklet: 'invitation' },
    ],
  };
  const { doc: parsed, dropped } = designOf(JSON.parse(JSON.stringify(raw)), 'babyblue');
  assert.deepEqual(dropped, []);
  assert.ok(parsed, 'the document survived the parse');
  assert.equal(parsed!.pages.find((p) => p.key === 'invitation-details')?.booklet, 'invitation');
  const els = parsed!.pages.find((p) => p.key === 'menu')?.elements ?? [];
  assert.equal(els.find((e) => e.id === 'the-door')?.opens, 'invitation');
  assert.equal(els.find((e) => e.id === 'no-door')?.opens, undefined, 'an object that opens nothing says nothing');
});

/**
 * A picture cannot run, and a pin cannot stand, across a booklet's edge.
 *
 * Both reach forward through the page list by counting pages, and the list
 * is now two surfaces rather than one. Left alone, a tall ground at the foot
 * of the column would lend its head to the first page of a booklet nobody
 * has opened — so the guest who taps the door meets the bottom half of a
 * picture whose top they never saw.
 */
test('a ground that runs on, and a pin, both stop at a booklet', () => {
  const doc2: DesignDoc = {
    ...builtinDesign('babyblue')!,
    pages: [
      { key: 'tall', sections: [], ground: { url: '/a.webp', ratio: 3, runsOn: 2, top: '#eef3f9', bottom: '#eef3f9' } },
      { key: 'next', sections: [] },
      { key: 'behind', sections: [], booklet: 'invitation' },
    ],
  };
  assert.equal(runOf(doc2).get('next'), 'tall', 'the page after it in the same surface still sits on it');
  assert.equal(runOf(doc2).get('behind'), undefined, 'the booklet page does not');

  const pinned: DesignDoc = {
    ...doc2,
    pages: [
      { key: 'tall', sections: [], ground: { url: '/a.webp', ratio: 3, runsOn: 2, top: '#eef3f9', bottom: '#eef3f9' }, pin: true },
      { key: 'next', sections: [] },
      { key: 'behind', sections: [], booklet: 'invitation' },
    ],
  };
  assert.equal(pinOf(pinned).get('next'), 'tall');
  assert.equal(pinOf(pinned).get('behind'), undefined, 'a pin does not stand behind a booklet it cannot be on screen with');
});
