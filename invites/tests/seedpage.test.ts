import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFromSection } from '../src/lib/seed-page';
import { designOf, type PageSpec, type TextEl } from '../src/lib/design';
import { askable } from '../src/lib/asks';
import { fieldsFor } from '../src/lib/sections';

/**
 * Turning a flow page into a drawn one that already carries the section's
 * writings — the thing that was missing between "the app writes the words and
 * you cannot move them" and "here is a blank sheet".
 */

const flow = (key: string, sections: string[]): PageSpec =>
  ({ key, sections, ground: { color: 'bg' } }) as PageSpec;

const texts = (page: PageSpec) => (page.elements ?? []).filter((e): e is TextEl => e.kind === 'text');

test('a flow page comes back drawn, with a box for every writing and a frame for every photograph', () => {
  const { page, boxes, photos } = drawFromSection(flow('reception', ['reception']), 'WEDDING');
  assert.equal(page.drawn, true);
  assert.equal(page.sections.join(), 'reception', 'it keeps its section: the page and the questions hang off that');

  const words = askable('WEDDING', 'text').filter((a) => a.section === 'reception');
  const pics = askable('WEDDING', 'photo').filter((a) => a.section === 'reception');
  // the design's own two lines on the venue, plus everything it asks for
  assert.equal(boxes, words.length + 2, `${words.length} writings and the design's own venue lines`);
  assert.equal(photos, pics.length);
  assert.equal(page.elements!.length, boxes + photos);
});

test('every box asks a question or reads the design, and nothing behind it', () => {
  const { page } = drawFromSection(flow('reception', ['reception']), 'WEDDING');
  for (const el of texts(page)) {
    assert.equal(el.lines.length, 1, `${el.id} is one line`);
    const [first, ...rest] = el.lines[0].sources;
    assert.ok('bind' in first || 'word' in first, `${el.id} reads an answer or the design's own word`);
    if ('bind' in first) {
      assert.equal(first.bind.section, 'reception');
      /*
       * The one that matters for a guest. A fixed fallback would print the
       * name of the question — "Reception venue" — on the invitation of
       * every customer who left it blank. An empty box has to draw nothing;
       * the canvas labels it for her separately.
       */
      assert.equal(rest.length, 0, `${el.id} has nothing typed behind its binding`);
    }
  }
  for (const el of page.elements ?? []) {
    if (el.kind === 'photo') assert.ok('section' in el.bind, `${el.id} is bound to a field, not to a file`);
  }
});

/**
 * The one that would otherwise be found by hand, weeks later: `zPage` is
 * strict, so a single key it does not know makes the whole document fail to
 * parse and the design falls back to the built-in. A seeded page that cannot
 * be read back is a page that saves and then vanishes.
 */
test('a seeded page survives the round trip through the document schema', () => {
  for (const [occasion, section] of [['WEDDING', 'ceremony'], ['CHRISTENING', 'sponsors'], ['DEBUT', 'program'], ['WEDDING', 'entourage']] as const) {
    const { page } = drawFromSection(flow(section, [section]), occasion);
    const doc = { v: 1, pages: [page] };
    const back = designOf(JSON.parse(JSON.stringify(doc)), 'classic').doc;
    assert.ok(back, `${occasion}/${section} parses`);
    assert.deepEqual(back!.pages[0], page, `${occasion}/${section} comes back exactly as it went in`);
  }
});

/**
 * A list is the trap. `valueAt` reads a row by its index, and a binding with
 * no index reads the whole array, which is not a word or a picture: the box
 * shows nothing and never will. `frameLists` also counts frames by index, so
 * an indexless frame does not even raise the customer's cap.
 */
test('a list is drawn row by row, each row saying which row it is', () => {
  const { page, short } = drawFromSection(flow('story', ['story']), 'CHRISTENING');
  const rows = (page.elements ?? []).flatMap((el) => {
    const bind = el.kind === 'photo' ? el.bind : el.kind === 'text' ? el.lines[0].sources.flatMap((s) => ('bind' in s ? [s.bind] : []))[0] : undefined;
    return bind && 'field' in bind && bind.field === 'timeline' ? [bind] : [];
  });
  assert.ok(rows.length, 'the story asks for a timeline');
  for (const b of rows) assert.ok(b.index !== undefined, 'a row of a list names its index');
  assert.deepEqual([...new Set(rows.map((b) => b.index))].sort(), [0, 1, 2], 'three rows to start with');

  // A photograph comes before the writings that caption it, so a caption is
  // never three screens from its picture, and the rows run 0, 0, 1, 1, 2, 2
  // rather than every photograph and then every caption. Three writings to a
  // row on a christening, not two: a milestone is a date, a title and a few
  // words about it.
  const timeline = (page.elements ?? []).flatMap((el) => {
    const bind = el.kind === 'photo' ? el.bind : el.kind === 'text' ? el.lines[0].sources.flatMap((s) => ('bind' in s ? [s.bind] : []))[0] : undefined;
    return bind && 'field' in bind && bind.field === 'timeline' ? [`${el.kind}${bind.index}`] : [];
  });
  assert.deepEqual(timeline, ['photo0', 'text0', 'text0', 'text0', 'photo1', 'text1', 'text1', 'text1', 'photo2', 'text2', 'text2', 'text2']);

  assert.ok(short.some((s) => s.includes('timeline')), 'and it says the customer may fill more rows than were drawn');
});

test('a list shorter than three rows is not drawn a row that can never be filled', () => {
  const little = fieldsFor('gallery', 'WEDDING').find((f) => f.key === 'little');
  assert.equal(little?.max, 2, 'the childhood pair holds two');
  const { page } = drawFromSection(flow('gallery', ['gallery']), 'WEDDING');
  const indexes = (page.elements ?? []).flatMap((el) => (el.kind === 'photo' && 'field' in el.bind && el.bind.field === 'little' ? [el.bind.index] : []));
  assert.deepEqual(indexes, [0, 1], 'two frames, not three');
});

test('the design’s own writings come too, not only the customer’s answers', () => {
  const { page } = drawFromSection(flow('dress-code', ['dressCode']), 'WEDDING');
  const words = texts(page).flatMap((el) => el.lines[0].sources.flatMap((s) => ('word' in s ? [s.word] : [])));
  // the heading, and the four writings the renderer reads off the look
  assert.ok(words.includes('title:dressCode'), 'the heading');
  for (const line of ['dressCode', 'dressNote', 'gentsNote', 'ladiesNote']) {
    assert.ok(words.includes(line as never), `${line} is on the page`);
  }
});

test('a section with no heading of its own is not given one', () => {
  // A cover has the names on it; the word "Cover" is not a thing a guest
  // should ever be shown.
  const { page } = drawFromSection(flow('cover', ['cover']), 'CHRISTENING');
  assert.equal((page.elements ?? []).filter((e) => e.kind === 'text' && e.block === 'head').length, 0);
  const fixed = texts(page).flatMap((el) => el.lines[0].sources.flatMap((s) => ('fixed' in s ? [s.fixed.en] : [])));
  assert.deepEqual(fixed, [], 'and nothing on it is typed in');
});

/**
 * The page keeps the height it already had.
 *
 * The first cut of this grew the page's ground to fit a single column of
 * boxes, and the owner caught it at once: a page's proportion is what the
 * background was drawn for, so growing the page stretched the artwork and the
 * page stopped looking like the design. The boxes fit the page now, never the
 * other way round.
 */
test('the page it was drawn at is the page it comes back at', () => {
  const one: PageSpec = { key: 'rsvp', sections: ['rsvp'], ground: { color: 'bg', ratio: 1.777 } } as PageSpec;
  const { page } = drawFromSection(one, 'WEDDING');
  assert.deepEqual(page.ground, one.ground, 'the ground is untouched, ratio and all');

  const ys = (page.elements ?? []).map((e) => e.y);
  assert.ok(Math.min(...ys) >= 8 && Math.max(...ys) <= 92, `inside the page: ${Math.min(...ys)}\u2013${Math.max(...ys)}`);
  // it fits in one column, so everything is centred and in order
  assert.deepEqual([...new Set((page.elements ?? []).map((e) => e.x))], [50]);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] > ys[i - 1], `box ${i} sits below box ${i - 1}`);
});

test('a page with more than one column\u2019s worth puts them in two, and says it is close', () => {
  // Our Story on a christening is a heading, a line, a photograph and three
  // rows of frame-and-three-writings: far more than one screen holds, and
  // more than two columns hold comfortably either since the milestone gained
  // its date — so it lays out in two and says it is close, which is the whole
  // point of saying so.
  const { page, tight } = drawFromSection(flow('story', ['story']), 'CHRISTENING');
  const xs = [...new Set((page.elements ?? []).map((e) => e.x))].sort((a, b) => (a ?? 0) - (b ?? 0));
  assert.deepEqual(xs, [28, 72], 'two columns, the way Baby Blue runs its own Our Story');
  const ys = (page.elements ?? []).map((e) => e.y);
  assert.ok(Math.min(...ys) >= 8 && Math.max(...ys) <= 92, 'and still inside the page');
  assert.equal(tight, true, 'and she is told they are set close, because the height is hers to change');

  // the frames are narrower for sharing the width, and none is wider than its half
  for (const el of page.elements ?? []) {
    assert.ok((el.w ?? 0) <= 44, `${el.id} fits its column`);
    assert.ok((el.x ?? 50) - (el.w ?? 0) / 2 >= 4, `${el.id} keeps the gutter`);
    assert.ok((el.x ?? 50) + (el.w ?? 0) / 2 <= 96, `${el.id} keeps the gutter`);
  }
});

test('a page with more than even two columns hold says so rather than growing', () => {
  // Eight frames and eight captions on a one-screen page: they are set close
  // together and she is told, because the height is hers to change.
  const one: PageSpec = { key: 'gallery', sections: ['gallery'], ground: { color: 'bg', ratio: 1.777 } } as PageSpec;
  const { page, tight } = drawFromSection(one, 'WEDDING');
  assert.equal(tight, true);
  assert.deepEqual(page.ground, one.ground, 'and the page is still the page');
  const ys = (page.elements ?? []).map((e) => e.y);
  assert.ok(Math.min(...ys) >= 8 && Math.max(...ys) <= 92, 'nothing has run off the foot');
});

test('a page carrying a picture keeps the picture’s own proportions', () => {
  const page: PageSpec = { key: 'venue', sections: ['reception'], ground: { url: '/a.webp', ratio: 2.4, top: '#fff', bottom: '#fff' } } as PageSpec;
  const { page: made } = drawFromSection(page, 'WEDDING');
  assert.deepEqual(made.ground, page.ground, 'the picture is not restretched to fit the stack');
});

test('a long section is capped, and says what it left off', () => {
  const { page, boxes, photos, left } = drawFromSection(flow('entourage', ['entourage']), 'WEDDING');
  assert.equal(boxes + photos, 24, 'as much as one page can be worked on');
  assert.ok(left > 0, 'and the rest is counted rather than dropped in silence');
  assert.equal(page.elements!.length, 24);
});

test('a page already placed by hand is left exactly alone', () => {
  const drawn: PageSpec = {
    ...flow('story', ['story']),
    drawn: true,
    elements: [{ id: 'mine-1', kind: 'text', block: 'head', y: 10, lines: [{ role: 'title', sources: [{ fixed: { en: 'Ours' } }] }] }],
  } as PageSpec;
  const { page, boxes, photos } = drawFromSection(drawn, 'WEDDING');
  assert.deepEqual(page, drawn, 'her work is not overwritten');
  assert.equal(boxes + photos, 0, 'and it says it seeded nothing');
});

test('a page carrying no section has nothing to seed from', () => {
  const { page, boxes } = drawFromSection(flow('interlude', []), 'WEDDING');
  assert.equal(page.drawn, undefined, 'it stays a flow page rather than becoming an empty drawn one');
  assert.equal(boxes, 0);
});

/**
 * `verse` and `gallery-video` are page sections rather than sections of the
 * form — Capiz's cover carries the verse — and asking the occasion to name
 * one throws. Seeding must survive a page that carries one.
 */
test('a page carrying the verse is seeded rather than throwing', () => {
  const { page, boxes } = drawFromSection(flow('cover', ['cover', 'verse']), 'WEDDING');
  assert.equal(page.drawn, true);
  assert.ok(boxes >= 3, 'the cover line and the verse with its source');
  const words = texts(page).flatMap((el) => el.lines[0].sources.flatMap((s) => ('word' in s ? [s.word] : [])));
  assert.ok(words.includes('verse') && words.includes('verseRef'), 'the verse and where it is from');
  const back = designOf(JSON.parse(JSON.stringify({ v: 1, pages: [page] })), 'classic').doc;
  assert.deepEqual(back!.pages[0], page, 'and it still survives the schema');
});
