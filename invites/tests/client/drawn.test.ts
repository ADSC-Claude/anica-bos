import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { DrawnPage, FlowDecor, FlowFloats } from '../../src/components/invite/drawn';
import { builtinDesign, type PageSpec } from '../../src/lib/design';
import { STORY_SLOTS, STORY_LABELS, STORY_HEAD, PHOTO_SLOTS, PHOTO_HEAD, slotStyle, labelStyle, captionStyle } from '../../src/lib/babyblue';
import { t } from '../../src/lib/copy';

const doc = builtinDesign('babyblue')!;
const page = (key: string) => doc.pages.find((p) => p.key === key) as PageSpec;

/** Six milestones, and four photographs with an empty row in front of them. */
const content = {
  story: {
    line: 'A little prayer, answered',
    timeline: STORY_SLOTS.map((_, i) => ({ title: `Moment ${i + 1}`, text: `What happened, number ${i + 1}.`, photo: `/story-${i + 1}.jpg` })),
  },
  gallery: {
    line: 'Little moments, big love',
    photos: [
      { url: '', caption: 'a row with no picture' },
      ...PHOTO_SLOTS.map((_, i) => ({ url: `/photo-${i + 1}.jpg`, caption: `Month ${i + 1}` })),
    ],
  },
};

const html = (key: string, c: Record<string, unknown> = content) =>
  renderToStaticMarkup(DrawnPage({ page: page(key), content: c, look: undefined, lang: 'en' }) as ReactElement);
const studio = (key: string, c: Record<string, unknown> = content) =>
  renderToStaticMarkup(DrawnPage({ page: page(key), content: c, look: undefined, lang: 'en', edit: { label: (el) => `fills ${el.id}` } }) as ReactElement);

/** Every style attribute in the markup, in order, parsed back into an object. */
function styles(markup: string): Record<string, string>[] {
  return [...markup.matchAll(/style="([^"]*)"/g)].map(([, s]) =>
    Object.fromEntries(s.split(';').filter(Boolean).map((d) => {
      const at = d.indexOf(':');
      return [d.slice(0, at).trim(), d.slice(at + 1).trim()];
    })),
  );
}
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

/**
 * The document draws Our Story exactly as StoryMilestones does: one header at
 * the designer's top, then frame, label, frame, label down the timeline, each
 * at the place slotStyle and labelStyle put it.
 */
test('the story page draws the header, then a frame and a label per milestone', () => {
  const markup = html('story');
  assert.match(markup, /^<section id="story" class="inv-section inv-bb-art inv-bb-story">/);
  const got = styles(markup);
  assert.equal(got.length, 1 + STORY_SLOTS.length * 2);
  assert.deepEqual(got[0], { top: `${STORY_HEAD.titleTop}%` });
  STORY_SLOTS.forEach((slot, i) => {
    assert.deepEqual(got[1 + i * 2], slotStyle(slot), `frame ${i + 1}`);
    assert.deepEqual(got[2 + i * 2], labelStyle(STORY_LABELS[i]), `label ${i + 1}`);
  });
  // the header: the app's heading, because no look is set, and the client's own line
  assert.match(markup, new RegExp(`<header class="inv-bb-head"[^>]*><h2 class="inv-title">${t('en', 'story.title')}</h2><p class="inv-bb-sub">A little prayer, answered</p></header>`));
  // a milestone: its name and its sentence, in one box
  assert.match(markup, /<div class="inv-bb-label"[^>]*><p class="t">Moment 3<\/p><p class="x">What happened, number 3\.<\/p><\/div>/);
  assert.match(markup, /<figure class="inv-bb-slot"[^>]*><img src="[^"]*story-2[^"]*" alt="" loading="lazy"\/><\/figure>/);
});

/**
 * The photographs page counts the rows that have a picture, so the empty row
 * in front of them is skipped and each caption belongs to its own frame.
 */
test('the photographs page skips the empty row and keeps each caption with its frame', () => {
  const markup = html('baby-photos');
  const got = styles(markup);
  assert.equal(got.length, 1 + PHOTO_SLOTS.length * 2);
  assert.deepEqual(got[0], { top: `${PHOTO_HEAD.eyebrowTop}%` });
  PHOTO_SLOTS.forEach((slot, i) => {
    assert.deepEqual(got[1 + i * 2], slotStyle(slot), `frame ${i + 1}`);
    // captionStyle works in cqw; the document holds y as a share of the page's
    // height. Same place: the transform is identical and left and width agree.
    const mine = got[2 + i * 2];
    const theirs = captionStyle(slot) as Record<string, string>;
    assert.equal(unescape(mine.transform), theirs.transform, `caption ${i + 1}`);
    assert.equal(Number(mine.left.replace('%', '')).toFixed(6), Number(theirs.left.replace('cqw', '')).toFixed(6));
  });
  assert.match(markup, new RegExp(`<p class="inv-bb-eyebrow">Share</p><h2 class="inv-bb-script">${t('en', 'gallery.title')}</h2>`));
  // the first frame holds the first row that has a picture, and reads its caption out
  assert.match(markup, /<img src="[^"]*photo-1[^"]*" alt="Month 1"/);
  assert.match(markup, /<p class="inv-bb-caption"[^>]*>Month 1<\/p>/);
  assert.doesNotMatch(markup, /a row with no picture/);
});

/** Nothing is drawn for a frame with no picture or a label with no words. */
test('an empty frame and an empty label draw nothing at all', () => {
  const markup = html('story', { story: { timeline: [{ title: '', text: '', photo: '' }, { title: 'Second', text: '', photo: '/two.jpg' }] } });
  // the header still stands (its heading falls back to the app's copy)
  assert.equal(styles(markup).length, 1 + 2);
  assert.match(markup, /<p class="t">Second<\/p>/);
  assert.doesNotMatch(markup, /class="x"/);
  assert.equal([...markup.matchAll(/inv-bb-slot/g)].length, 1);
});

/** Tagalog: the design's English-only eyebrow stays unwritten rather than printed in English. */
test('a fixed line written in one language only stays out of the other', () => {
  const markup = renderToStaticMarkup(DrawnPage({ page: page('baby-photos'), content, look: undefined, lang: 'tl' }) as ReactElement);
  assert.doesNotMatch(markup, /inv-bb-eyebrow/);
  assert.match(markup, /inv-bb-script/);
});

/**
 * The studio's view of the same page. A frame with nothing in it is never
 * invisible while she is drawing — it shows where it is and says what fills
 * it — and every element is findable, so a handle can sit exactly on the box
 * a guest will see. A guest passes no `edit`, so a guest sees none of it.
 */
test('the studio marks every element and draws the empty ones', () => {
  const bare = { gallery: { photos: [] }, story: { timeline: [] } };
  const guest = html('baby-photos', bare);
  assert.doesNotMatch(guest, /data-el=/);
  assert.doesNotMatch(guest, /data-empty/);
  assert.doesNotMatch(guest, /inv-bb-ask/);

  const editing = studio('baby-photos', bare);
  // the head, four frames and four captions, every one findable
  assert.equal([...editing.matchAll(/data-el="/g)].length, 9);
  // and every one empty but the head, which carries the design's own eyebrow
  // and falls back to the app's heading: those are the design's words, not
  // the customer's, so the box is not empty and never was
  assert.equal([...editing.matchAll(/data-empty=""/g)].length, 8);
  assert.match(editing, /<header class="inv-bb-head"[^>]*data-el="photos-head">/);
  assert.match(editing, /data-el="photos-photo-2" data-empty=""/);
  assert.match(editing, /fills photos-photo-2/);
  // a filled page keeps its content and is marked but not empty
  const filled = studio('baby-photos');
  assert.equal([...filled.matchAll(/data-el="/g)].length, 9);
  assert.equal([...filled.matchAll(/data-empty=""/g)].length, 0);
  assert.match(filled, /Month 1/);
});

/** The box a handle sits on is the box the guest page gives the element. */
test('an element marked for the studio keeps exactly the style it had', () => {
  const guest = styles(html('story'));
  const editing = styles(studio('story'));
  assert.deepEqual(editing, guest);
});

/**
 * A shape, a card, a cut and a window on the picture, and none of them said
 * unless they are set. The two designs as shipped set none, which is why
 * their markup is the markup they have always served.
 */
test('a frame says nothing about its shape, its card, its cut or its fitting unless it has one', () => {
  const plain = html('baby-photos');
  for (const said of ['data-crop', 'data-frame', 'data-mask', 'aspect-ratio', 'border-radius', 'inv-bb-ghost']) {
    assert.doesNotMatch(plain, new RegExp(said), `a shipped frame says ${said}`);
  }
});

/**
 * A piece from the library is the design's own picture, not a frame waiting
 * for somebody's photograph, so the slot says so and the stylesheet gives
 * it no card — a strand of flowers drawn with transparency round it would
 * otherwise sit on a grey square.
 */
test('a picture the design supplies itself is marked as its own; a customer\'s is not', () => {
  const own = JSON.parse(JSON.stringify(page('baby-photos'))) as PageSpec;
  const frame = own.elements!.find((e) => e.kind === 'photo')!;
  Object.assign(frame, { bind: { asset: '/capiz/strand-b.webp' } });
  const markup = renderToStaticMarkup(DrawnPage({ page: own, content, look: undefined, lang: 'en' }) as ReactElement);
  assert.equal([...markup.matchAll(/data-own=""/g)].length, 1);
  assert.match(markup, /src="[^"]*strand-b/);
  // the other three frames are the customer's and say nothing
  assert.doesNotMatch(html('baby-photos'), /data-own/);
});

test('a fitted frame in a card with an arch cut says exactly those four things', () => {
  const dressed = JSON.parse(JSON.stringify(page('baby-photos'))) as PageSpec;
  const frame = dressed.elements!.find((e) => e.kind === 'photo')!;
  Object.assign(frame, { aspect: 1.25, frame: 'polaroid', mask: 'arch', crop: { x: 0.25, y: 0, w: 0.5, h: 1 } });
  const markup = renderToStaticMarkup(DrawnPage({ page: dressed, content, look: undefined, lang: 'en' }) as ReactElement);
  assert.match(markup, /data-crop="" data-frame="polaroid" data-mask="arch"/);
  // the frame's own box: a quarter taller than it is wide, arched at the top
  const box = styles(markup)[1];
  assert.equal(box['aspect-ratio'], '1 / 1.25');
  assert.equal(box['border-radius'], '50% 50% 0 0 / 40% 40% 0 0');
  // and the picture inside it, blown up twice and slid half a frame left
  const inside = styles(markup)[2];
  assert.deepEqual(inside, { width: '200%', height: '100%', left: '-50%', top: '0%' });
  // the other three frames are untouched
  assert.equal([...markup.matchAll(/data-frame=/g)].length, 1);
});

/**
 * The whole picture behind the frame she is fitting. It is the studio's, and
 * it is drawn from the element's own placement, so it lands on the frame
 * exactly — turn and all — with no second set of geometry to keep in step.
 */
test('the ghost is drawn for the frame being fitted, for the studio alone', () => {
  const editing = studio('baby-photos');
  assert.doesNotMatch(editing, /inv-bb-ghost/);

  const fitting = renderToStaticMarkup(DrawnPage({
    page: page('baby-photos'), content, look: undefined, lang: 'en',
    edit: { label: (el) => `fills ${el.id}`, cropping: 'photos-photo-2' },
  }) as ReactElement);
  assert.equal([...fitting.matchAll(/inv-bb-ghost/g)].length, 1);
  // it sits immediately before its frame and carries the frame's own
  // placement, which is what makes it land on the frame, turn and all
  const pair = fitting.match(/<div class="inv-bb-ghost" aria-hidden="true" style="([^"]*)"><img src="[^"]*photo-2[^"]*" alt="" style="width:100%;height:100%"\/><\/div><figure class="inv-bb-slot" style="([^"]*)" data-el="photos-photo-2"/);
  assert.ok(pair, 'no ghost in front of the frame being fitted');
  assert.equal(pair![1], pair![2]);
  // and a guest is never given one, however the document is fitted
  const guest = html('baby-photos');
  assert.doesNotMatch(guest, /inv-bb-ghost/);
});

/**
 * A shape is a div and nothing else, and a backing is the stylesheet's: the
 * page says which one it wants and the rules do the rest, so both scale with
 * the column and both follow the palette into night.
 */
test('a shape draws as one div, and words say what sits behind them', () => {
  const dressed = JSON.parse(JSON.stringify(page('baby-photos'))) as PageSpec;
  dressed.elements = [
    { id: 'card', kind: 'shape', shape: 'rect', x: 50, y: 30, w: 70, h: 24, z: -1, fill: 'surface', radius: 1.6 },
    { id: 'rule', kind: 'shape', shape: 'line', x: 50, y: 44, w: 40, stroke: 'muted', strokeWidth: 0.25 },
    { id: 'over', kind: 'text', block: 'free', x: 50, y: 30, w: 60, backing: 'scrim', lines: [{ role: 'body', sources: [{ fixed: { en: 'On a busy picture' } }] }] },
  ] as PageSpec['elements'];
  const markup = renderToStaticMarkup(DrawnPage({ page: dressed, content, look: undefined, lang: 'en' }) as ReactElement);
  assert.match(markup, /<div class="inv-bb-shape" aria-hidden="true" data-shape="rect" style="left:50%;top:30%;width:70%;transform:translate\(-50%, -50%\);z-index:-1;height:24cqw;background:var\(--inv-surface\);border-radius:1\.6cqw"><\/div>/);
  assert.match(markup, /data-shape="line" style="[^"]*height:0\.25cqw;background:var\(--inv-muted\)"/);
  // a shape is empty and hidden from anyone listening: it is decoration
  assert.equal([...markup.matchAll(/inv-bb-shape/g)].length, 2);
  assert.equal([...markup.matchAll(/aria-hidden="true"/g)].length, 2);
  // the words say what they want behind them and nothing more
  assert.match(markup, /<div class="inv-bb-text" style="left:50%;top:30%;width:60%;transform:translateX\(-50%\)" data-backing="scrim">/);
  assert.doesNotMatch(markup, /text-shadow/);
});

test('words with nothing behind them say nothing, as they always did', () => {
  const markup = html('story');
  assert.doesNotMatch(markup, /data-backing/);
  assert.doesNotMatch(markup, /text-shadow/);
});

// --- the decorations on a page laid out by its words ----------------------

/**
 * A flow page's band. The markup is a drawn page's markup — that is the
 * point of giving the band `inv-bb-art`: every rule a frame, a card, a cut
 * and a clip already have applies to a decoration unchanged, and there is no
 * second set of CSS to keep in step.
 */
const deco: PageSpec = {
  key: 'venue',
  sections: ['reception'],
  elements: [
    { id: 'crest', kind: 'photo', x: 50, y: 2, w: 44, aspect: 0.4, bind: { asset: '/crest.png' } },
    { id: 'rule', kind: 'shape', shape: 'line', x: 50, y: 3, w: 40, from: 'bottom', stroke: 'muted', strokeWidth: 0.25 },
    { id: 'sprig', kind: 'photo', x: 90, y: 1, w: 20, z: 3, bind: { asset: '/sprig.png' } },
    { id: 'words', kind: 'text', block: 'free', x: 50, y: 5, w: 60, lines: [{ role: 'body', sources: [{ fixed: { en: 'not here' } }] }] },
  ],
};
const band = (layer: 'under' | 'over') =>
  renderToStaticMarkup(FlowDecor({ page: deco, content: {}, look: undefined, lang: 'en', layer }) as ReactElement);

test('the band under the words holds the decorations that are not over them', () => {
  const under = band('under');
  assert.match(under, /^<div class="inv-bb-art inv-deco" data-layer="under">/);
  // the picture along the head, placed from the head by a share of the width
  assert.match(under, /<figure class="inv-bb-slot" style="left:50%;top:2cqw;width:44%;transform:translateX\(-50%\);aspect-ratio:1 \/ 0\.4" data-own="">/);
  // the rule at the foot, measured up from it
  assert.match(under, /<div class="inv-bb-shape" aria-hidden="true" data-shape="line" style="left:50%;bottom:3cqw;width:40%;transform:translateX\(-50%\);height:0\.25cqw;background:var\(--inv-muted\)"><\/div>/);
  assert.doesNotMatch(under, /sprig/, 'what asked to be over the words is not in this band');
});

test('the band over the words holds only what asked for it', () => {
  const over = band('over');
  assert.match(over, /^<div class="inv-bb-art inv-deco" data-layer="over">/);
  assert.match(over, /sprig\.png/);
  assert.doesNotMatch(over, /crest/);
  assert.doesNotMatch(over, /inv-bb-shape/);
});

test('a text box is never a decoration, in either band', () => {
  assert.doesNotMatch(band('under'), /not here|inv-bb-text/);
  assert.doesNotMatch(band('over'), /not here|inv-bb-text/);
});

test('a flow page with nothing in a band draws no band at all', () => {
  const bare: PageSpec = { key: 'contact', sections: ['contact'] };
  assert.equal(FlowDecor({ page: bare, content: {}, look: undefined, lang: 'en', layer: 'under' }), null);
  // and a page whose only element floats: the float is the words' business, not the band's
  const floated: PageSpec = { key: 'story', sections: ['story'], elements: [{ id: 'f', kind: 'photo', y: 0, w: 40, float: 'left', bind: { asset: '/f.png' } }] };
  assert.equal(FlowDecor({ page: floated, content: {}, look: undefined, lang: 'en', layer: 'under' }), null);
});

/**
 * A clip filling a flow page is the one decoration the document does not
 * place: a page as tall as its words has a height only the browser knows, so
 * the four numbers are dropped and `inset: 0` in the stylesheet answers for
 * them. Its layer is kept, because that is what holds it behind the words.
 */
test('a clip filling the page keeps its layer and none of its geometry', () => {
  const filled: PageSpec = {
    key: 'venue',
    sections: ['reception'],
    elements: [{ id: 'fill', kind: 'video', x: 50, y: 0, w: 100, z: -2, url: '/v.mp4', poster: '/v.jpg', bg: true }],
  };
  const markup = renderToStaticMarkup(FlowDecor({ page: filled, content: {}, look: undefined, lang: 'en', layer: 'under' }) as ReactElement);
  assert.match(markup, /<div class="inv-bb-clip" style="z-index:-2" data-bg="">/);
  assert.doesNotMatch(markup, /top:|width:|aspect-ratio/);
});

// --- a moving picture -----------------------------------------------------

/**
 * The one thing that must be true of a moving picture on a page: it is served
 * as the file it is, not through the transformation endpoint. That endpoint
 * returns a *still* — one frame, re-encoded — so a GIF through it is a
 * photograph of the moment the petals started falling.
 *
 * A Supabase-shaped address is used deliberately: `imageUrl` hands back
 * anything else untouched, so a local path would pass this test whether the
 * flag worked or not.
 */
const HOSTED = 'https://example.supabase.co/storage/v1/object/public/invites-public/design/t1/petals.gif';

test('a moving picture is served as it is, and a still one is transformed', () => {
  const page = JSON.parse(JSON.stringify(doc.pages.find((p) => p.key === 'story'))) as PageSpec;
  page.elements = [
    { id: 'petals', kind: 'photo', x: 50, y: 20, w: 40, aspect: 1, bind: { asset: HOSTED }, animated: true },
    { id: 'bow', kind: 'photo', x: 50, y: 60, w: 40, aspect: 1, bind: { asset: HOSTED } },
  ];
  const markup = renderToStaticMarkup(DrawnPage({ page, content, look: undefined, lang: 'en' }) as ReactElement);
  const sources = [...markup.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].replace(/&amp;/g, '&'), HOSTED, 'the moving one is the file itself');
  assert.match(sources[1], /\/render\/image\/public\//, 'the still one goes through the transform');
  assert.match(sources[1], /width=/);
});

test('a moving picture the words flow around is served as it is too', () => {
  const page: PageSpec = {
    key: 'story',
    sections: ['story'],
    elements: [{ id: 'petals', kind: 'photo', y: 0, w: 30, aspect: 1, float: 'left', bind: { asset: HOSTED }, animated: true }],
  };
  const markup = renderToStaticMarkup(FlowFloats({ page, content: {}, lang: 'en' }) as ReactElement);
  assert.match(markup.replace(/&amp;/g, '&'), new RegExp(`src="${HOSTED.replace(/[/.]/g, '\\$&')}"`));
  assert.doesNotMatch(markup, /render\/image/);
});

// --- motion in the markup --------------------------------------------------

/**
 * What the page is handed: two attributes and a variable. Nothing about when
 * — that is `data-in`, added by the guest's own page when the element is
 * actually on screen — and nothing in `transform`, which is where every
 * drawn element's placement lives and which an animation there would throw
 * across the page.
 */
test('an element that moves carries its marks and keeps its placement', () => {
  const page = JSON.parse(JSON.stringify(doc.pages.find((p) => p.key === 'story'))) as PageSpec;
  page.elements = [
    { id: 'petal', kind: 'photo', x: 50, y: 20, w: 30, aspect: 1, bind: { asset: '/p.png' }, motion: { enter: 'rise', idle: 'float', delay: 200 } },
    { id: 'card', kind: 'shape', shape: 'rect', x: 50, y: 60, w: 70, h: 20, motion: { enter: 'fade' } },
    { id: 'words', kind: 'text', block: 'free', x: 50, y: 80, w: 60, lines: [{ role: 'body', sources: [{ fixed: { en: 'Hello', tl: 'Kumusta' } }] }], motion: { idle: 'sway', delay: 90 } },
  ];
  const markup = renderToStaticMarkup(DrawnPage({ page, content, look: undefined, lang: 'en' }) as ReactElement);
  assert.match(markup, /data-enter="rise"/);
  assert.match(markup, /data-idle="float"/);
  assert.match(markup, /--motion-delay:200ms/);
  assert.match(markup, /data-enter="fade"/);
  assert.match(markup, /data-idle="sway"/);
  assert.match(markup, /--motion-delay:90ms/);
  // the placement is untouched: the motion is in translate and rotate, which
  // are properties of their own
  assert.match(markup, /transform:translate\(-50%, -50%\)/);
  assert.doesNotMatch(markup, /data-in/, 'when it arrives is the page’s to say, not the document’s');
});

test('the shipped pages carry no motion marks at all', () => {
  for (const key of ['story', 'baby-photos']) {
    const markup = html(key);
    assert.doesNotMatch(markup, /data-enter|data-idle|--motion-delay/, `${key} is as still as it ever was`);
  }
});

// --- a vector animation ----------------------------------------------------

/**
 * The markup is two boxes and a poster, and that is the whole of it: React
 * owns the poster, lottie-web owns the stage, and neither reaches into the
 * other's children. Nothing here loads a player — that happens in the
 * browser, when the element is on screen, and a page with no animation never
 * fetches a byte of it.
 */
test('an animation is a stage and a poster, in the element’s own box', () => {
  const page = JSON.parse(JSON.stringify(doc.pages.find((p) => p.key === 'story'))) as PageSpec;
  page.elements = [{ id: 'petals', kind: 'anim', x: 50, y: 30, w: 40, aspect: 0.75, url: '/a.json', poster: '/a-poster.webp' }];
  const markup = renderToStaticMarkup(DrawnPage({ page, content, look: undefined, lang: 'en' }) as ReactElement);
  assert.match(markup, /class="inv-bb-anim"/);
  assert.match(markup, /aspect-ratio:1 \/ 0\.75/);
  assert.match(markup, /left:50%;top:30%;width:40%/);
  assert.match(markup, /class="inv-anim-stage"/);
  assert.match(markup, /class="inv-anim-poster"/);
  assert.doesNotMatch(markup, /lottie/i, 'the player is the browser’s business, and only when it is needed');
});

test('an animation with no file yet is an empty box in the studio and nothing to a guest', () => {
  const page: PageSpec = { key: 'story', sections: ['story'], drawn: true, elements: [{ id: 'gap', kind: 'anim', x: 50, y: 30, w: 40, aspect: 1, url: '', poster: '' }] };
  assert.doesNotMatch(renderToStaticMarkup(DrawnPage({ page, content, look: undefined, lang: 'en' }) as ReactElement), /inv-bb-anim/);
  const studio = renderToStaticMarkup(DrawnPage({ page, content, look: undefined, lang: 'en', edit: { label: (el) => `fills ${el.id}` } }) as ReactElement);
  assert.match(studio, /inv-bb-anim/);
  assert.match(studio, /fills gap/);
});
