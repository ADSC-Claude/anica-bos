import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinDesign, type DesignDoc, type PhotoEl, type TextEl } from '../src/lib/design';
import { pageNeeds, needCount, publishable, NEED_RULES, type Need, type NeedRule } from '../src/lib/needs';

const base = builtinDesign('babyblue')!;
const clone = (d: DesignDoc = base): DesignDoc => JSON.parse(JSON.stringify(d));
const run = (doc: DesignDoc, content?: Record<string, unknown>) =>
  pageNeeds({ doc, occasion: 'CHRISTENING' as never, content });
/** the same, plus what only the design's own row knows: weights, and the shop */
const runRow = (doc: DesignDoc, row: Partial<Parameters<typeof pageNeeds>[0]>) =>
  pageNeeds({ doc, occasion: 'CHRISTENING' as never, ...row });
const rules = (n: Need[]): NeedRule[] => [...new Set(n.map((x) => x.rule))].sort();
const on = (doc: DesignDoc, key: string) => doc.pages.find((p) => p.key === key)!;
const el = (doc: DesignDoc, page: string, id: string) => on(doc, page).elements!.find((e) => e.id === id)!;

/**
 * The checklist has to be silent on a design that is right, or it is noise
 * and she will stop reading it. Both shipped designs are right.
 */
test('the two designs as shipped need nothing', () => {
  assert.deepEqual(run(base), []);
  assert.deepEqual(pageNeeds({ doc: builtinDesign('capiz'), occasion: 'WEDDING' as never }), []);
  assert.equal(publishable(run(base)), true);
  assert.deepEqual(pageNeeds({ doc: null, occasion: 'WEDDING' as never }), []);
});

// Each of these breaks the design one way and expects that one line. A rule
// that cannot be made to fire is a rule that is not there.

test('a drawn page with no background blocks', () => {
  const d = clone();
  on(d, 'story').ground = undefined;
  const n = run(d).filter((x) => x.rule === 'ground');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'blocks');
  assert.match(n[0].text, /has no background yet/);
  assert.equal(publishable(run(d)), false);
});

test('a flow page carrying nothing says so', () => {
  const d = clone();
  on(d, 'venue').sections = [];
  const n = run(d).filter((x) => x.rule === 'carries-nothing');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'says');
  // it is hers to make: a page she has just added is not a fault
  assert.equal(publishable(run(d)), true);
});

test('a frame off the page blocks; one merely overhanging says', () => {
  const d = clone();
  (el(d, 'story', 'story-photo-1') as PhotoEl).x = 104;
  let n = run(d).filter((x) => x.rule === 'off-page');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'blocks');
  assert.equal(n[0].id, 'story-photo-1');

  const bleed = clone();
  (el(bleed, 'story', 'story-photo-1') as PhotoEl).x = 97;
  n = run(bleed).filter((x) => x.rule === 'off-page');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'says');
  assert.match(n[0].text, /partly off the page/);
  assert.equal(publishable(run(bleed)), true);
});

/**
 * Baby Blue's polaroids are scattered and touching on purpose, so the line
 * is drawn where one frame is eating another rather than resting on it.
 */
test('frames that lean on each other pass; one on top of another does not', () => {
  assert.deepEqual(run(base).filter((x) => x.rule === 'overlap'), []);
  const d = clone();
  const a = el(d, 'baby-photos', 'photos-photo-1') as PhotoEl;
  const b = el(d, 'baby-photos', 'photos-photo-2') as PhotoEl;
  b.x = a.x;
  b.y = a.y;
  b.w = a.w;
  const n = run(d).filter((x) => x.rule === 'overlap');
  assert.equal(n.length, 1);
  assert.match(n[0].text, /Frames 1 and 2 overlap/);
});

test('a frame linked to nothing and not asked for blocks', () => {
  const d = clone();
  (el(d, 'story', 'story-photo-1') as PhotoEl).bind = { asset: '' };
  const n = run(d).filter((x) => x.rule === 'unlinked');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'blocks');
  // asked for but naming no field is still a fault, and a quieter one: the
  // form is built from the field, so nobody is ever asked and it stays empty
  (el(d, 'story', 'story-photo-1') as PhotoEl).ask = true;
  const asked = run(d).filter((x) => x.rule === 'unlinked');
  assert.equal(asked.length, 1);
  assert.match(asked[0].text, /does not say which field/);
  // named, it is the customer's to fill and no longer a fault
  (el(d, 'story', 'story-photo-1') as PhotoEl).bind = { section: 'gallery', field: 'photos', index: 0 };
  assert.deepEqual(run(d).filter((x) => x.rule === 'unlinked'), []);
});

test('more frames than the occasion allows blocks, and says both numbers', () => {
  const d = clone();
  const page = on(d, 'story');
  const last = clone({ pages: [{ key: 'x', sections: [], elements: [el(d, 'story', 'story-photo-6')] }], v: 1 } as DesignDoc);
  const extra = last.pages[0].elements![0] as PhotoEl;
  extra.id = 'story-photo-7';
  (extra.bind as { index: number }).index = 6;
  page.elements!.push(extra);
  const n = run(d).filter((x) => x.rule === 'too-many');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'blocks');
  assert.match(n[0].text, /allows up to 6 on a christening; this page has 7 frames/);
});

test('English with no Tagalog blocks; an empty Tagalog is how a design says English only', () => {
  const d = clone();
  const head = el(d, 'baby-photos', 'photos-head') as TextEl;
  // the eyebrow ships as { en: 'Share', tl: '' } — deliberately English
  assert.deepEqual(run(d).filter((x) => x.rule === 'no-tagalog'), []);
  const src = head.lines[0].sources[0] as { fixed: { en: string; tl?: string } };
  delete src.fixed.tl;
  const n = run(d).filter((x) => x.rule === 'no-tagalog');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'blocks');
  assert.equal(n[0].id, 'photos-head');
});

test('words under the legible floor block, on the block or on one line', () => {
  const d = clone();
  (el(d, 'baby-photos', 'photos-caption-1') as TextEl).size = 1.2;
  assert.equal(run(d).filter((x) => x.rule === 'too-small').length, 1);
  const line = clone();
  (el(line, 'baby-photos', 'photos-caption-1') as TextEl).lines[0].size = 2;
  assert.equal(run(line).filter((x) => x.rule === 'too-small').length, 1);
  // at the floor exactly it passes: the floor is what is still readable
  const edge = clone();
  (el(edge, 'baby-photos', 'photos-caption-1') as TextEl).size = 2.6;
  assert.deepEqual(run(edge).filter((x) => x.rule === 'too-small'), []);
});

test('a page drawn to a screen says what sits under the browser bar', () => {
  const d = clone();
  // baby-photos is exactly one screen; the band is the last tenth of it
  (el(d, 'baby-photos', 'photos-caption-1') as TextEl).y = 96;
  const n = run(d).filter((x) => x.rule === 'browser-bar');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'says');
  // the story page is 2.99 screens: its foot is nowhere near the first screen
  const tall = clone();
  (el(tall, 'story', 'story-label-6') as TextEl).y = 99;
  assert.deepEqual(run(tall).filter((x) => x.rule === 'browser-bar'), []);
});

// --- what the design asks for ----------------------------------------------

const asked = (): DesignDoc => {
  const d = clone();
  const frame = el(d, 'baby-photos', 'photos-photo-1') as PhotoEl;
  frame.ask = true;
  return d;
};

test('an asked frame with nothing to show when empty says so, and stops when it has', () => {
  const d = asked();
  assert.equal(run(d).filter((x) => x.rule === 'if-empty').length, 1);
  (el(d, 'baby-photos', 'photos-photo-1') as PhotoEl).ifEmpty = { piece: '/babyblue/cloud.webp' };
  assert.deepEqual(run(d).filter((x) => x.rule === 'if-empty'), []);
});

test('a frame pointing at a field the occasion does not have says where it stays empty', () => {
  const d = asked();
  const frame = el(d, 'baby-photos', 'photos-photo-1') as PhotoEl;
  frame.bind = { section: 'entourage', field: 'photo' };
  const n = run(d).filter((x) => x.rule === 'orphan');
  assert.equal(n.length, 1);
  assert.match(n[0].text, /a christening does not have/);
});

test('a box smaller than the question it asks says both numbers', () => {
  const d = clone();
  const head = el(d, 'baby-photos', 'photos-head') as TextEl;
  head.ask = true;
  head.room = 12;
  head.lines[2].sources = [{ bind: { section: 'gallery', field: 'line' } }, ...head.lines[2].sources];
  const n = run(d).filter((x) => x.rule === 'room');
  assert.equal(n.length, 1);
  assert.match(n[0].text, /fits about 12 letters; the question on the form still asks for \d+/);
});

test('the demo having nothing for an asked frame is information, never a blocker', () => {
  const d = asked();
  const n = run(d, {}).filter((x) => x.rule === 'demo-blank');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'says');
  assert.equal(publishable(run(d, {})), true);
  // and it is silent when nothing is passed, because nothing was asked of it
  assert.deepEqual(run(d).filter((x) => x.rule === 'demo-blank'), []);
});

test('the running total of what a design asks for is about the design, not a page', () => {
  const d = asked();
  const n = run(d).filter((x) => x.rule === 'asks');
  assert.equal(n.length, 1);
  assert.equal(n[0].page, '');
  assert.match(n[0].text, /asks for 1 photograph and 0 writings/);
  // so it is not counted against any page in the strip
  assert.deepEqual(needCount(run(d), 'cover'), { blocks: 0, says: 0 });
});

// --- counting ---------------------------------------------------------------

test('needCount counts the whole design or one page', () => {
  const d = clone();
  on(d, 'story').ground = undefined;
  on(d, 'venue').sections = [];
  const n = run(d);
  assert.deepEqual(needCount(n), { blocks: 1, says: 1 });
  assert.deepEqual(needCount(n, 'story'), { blocks: 1, says: 0 });
  assert.deepEqual(needCount(n, 'venue'), { blocks: 0, says: 1 });
  assert.deepEqual(needCount(n, 'closing'), { blocks: 0, says: 0 });
});

/**
 * What a background weighs. Only ever said about a picture this design
 * uploaded and whose weight the row recorded — the ten the app ships with
 * have no row, so nothing is said about them, which is the difference
 * between a checklist that knows and one that guesses.
 */
test('a heavy background says so, and an unrecorded one says nothing', () => {
  const d = clone();
  const ground = on(d, 'story').ground!;
  const url = (ground as { url: string }).url;
  assert.deepEqual(runRow(d, {}), [], 'nothing is claimed with no weights handed in');
  assert.deepEqual(runRow(d, { weights: { [url]: 200 * 1024 } }), [], 'a background within the budget is silent');
  const n = runRow(d, { weights: { [url]: 1_800_000 } }).filter((x) => x.rule === 'ground-weight');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'says');
  assert.equal(n[0].page, 'story');
  assert.match(n[0].text, /1758 kB/);
  assert.match(n[0].text, /under 400 kB/);
  // a ground cut in three is the sum of its cuts: a guest fetches all of them
  const cut = clone();
  const cover = on(cut, 'cover').ground as { url: string; slices: { top: string; mid: string; foot: string } };
  const each = Object.fromEntries([cover.url, cover.slices.top, cover.slices.mid, cover.slices.foot].map((u) => [u, 120 * 1024]));
  assert.equal(runRow(cut, { weights: each }).filter((x) => x.rule === 'ground-weight').length, 1, '4 × 120 kB is over the budget together');
});

/**
 * A ground she typed rather than named. The night palette turns the words
 * pale and a colour of her own does not turn down with them, so a pale
 * ground and pale words meet at night — the one case the six roles cannot
 * produce, which is why only a typed colour is checked.
 */
test('a pale ground of her own says the words will be lost at night', () => {
  const d = clone();
  on(d, 'story').ground = { color: '#fef5df', ratio: 2.989 };
  const n = run(d).filter((x) => x.rule === 'night-ink');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'says');
  assert.match(n[0].text, /#fef5df at night/);
  assert.ok(n[0].id, 'it points at a box with no backing');
  // a role colour follows the palette, so it is never the subject of this line
  const role = clone();
  on(role, 'story').ground = { color: 'bg', ratio: 2.989 };
  assert.deepEqual(run(role).filter((x) => x.rule === 'night-ink'), []);
  // and words that carry their own halo are fine on any ground
  const haloed = clone();
  on(haloed, 'story').ground = { color: '#fef5df', ratio: 2.989 };
  for (const e of on(haloed, 'story').elements!) if (e.kind === 'text') (e as TextEl).backing = 'scrim';
  assert.deepEqual(run(haloed).filter((x) => x.rule === 'night-ink'), []);
});

/**
 * The grey a frame shows while it waits for a photograph is fixed in both
 * modes — it is the one colour on the page that cannot be relied on to move
 * with the ground — so a ground within a hair of it hides every empty frame.
 */
test('a ground the colour of the waiting grey hides the empty frames', () => {
  const d = clone();
  on(d, 'story').ground = { color: '#e9e4de', ratio: 2.989 };
  const n = run(d).filter((x) => x.rule === 'slot-lost');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'says');
  assert.match(n[0].text, /will not be visible/);
  // a ground plainly darker than the grey is not the subject of it
  const deep = clone();
  on(deep, 'story').ground = { color: '#1c2e56', ratio: 2.989 };
  assert.deepEqual(run(deep).filter((x) => x.rule === 'slot-lost'), []);
});

/** A design in the shop with no cover: not broken, but the card nobody taps. */
test('a design shown in the shop with no thumbnail says so once', () => {
  const n = runRow(clone(), { shop: { shown: true, thumbnail: false } }).filter((x) => x.rule === 'no-thumbnail');
  assert.equal(n.length, 1);
  assert.equal(n[0].level, 'says');
  assert.equal(n[0].page, '', 'it is about the design, not any one page');
  assert.deepEqual(runRow(clone(), { shop: { shown: true, thumbnail: true } }).filter((x) => x.rule === 'no-thumbnail'), []);
  assert.deepEqual(runRow(clone(), { shop: { shown: false, thumbnail: false } }).filter((x) => x.rule === 'no-thumbnail'), []);
});

test('every rule the type names can be made to fire', () => {
  const fired = new Set<NeedRule>();
  const add = (d: DesignDoc, content?: Record<string, unknown>) => run(d, content).forEach((x) => fired.add(x.rule));
  const a = clone(); on(a, 'story').ground = undefined; add(a);
  const b = clone(); on(b, 'venue').sections = []; add(b);
  const c = clone(); (el(c, 'story', 'story-photo-1') as PhotoEl).x = 104; add(c);
  const e = clone();
  const f1 = el(e, 'baby-photos', 'photos-photo-1') as PhotoEl;
  const f2 = el(e, 'baby-photos', 'photos-photo-2') as PhotoEl;
  Object.assign(f2, { x: f1.x, y: f1.y, w: f1.w }); add(e);
  const g = clone(); (el(g, 'story', 'story-photo-1') as PhotoEl).bind = { asset: '' }; add(g);
  const h = clone();
  const seven = JSON.parse(JSON.stringify(el(h, 'story', 'story-photo-6'))) as PhotoEl;
  seven.id = 'story-photo-7'; (seven.bind as { index: number }).index = 6;
  on(h, 'story').elements!.push(seven); add(h);
  const i = clone();
  delete ((el(i, 'baby-photos', 'photos-head') as TextEl).lines[0].sources[0] as { fixed: { en: string; tl?: string } }).fixed.tl;
  add(i);
  const j = clone(); (el(j, 'baby-photos', 'photos-caption-1') as TextEl).size = 1.2; add(j);
  const k = clone(); (el(k, 'baby-photos', 'photos-caption-1') as TextEl).y = 96; add(k);
  const l = clone(); on(l, 'story').elements = on(l, 'story').elements!.filter((x) => x.id !== 'story-head'); add(l);
  add(asked(), {});
  const m = asked(); (el(m, 'baby-photos', 'photos-photo-1') as PhotoEl).bind = { section: 'entourage', field: 'photo' }; add(m);
  const n2 = clone();
  const head = el(n2, 'baby-photos', 'photos-head') as TextEl;
  head.ask = true; head.room = 12;
  head.lines[2].sources = [{ bind: { section: 'gallery', field: 'line' } }, ...head.lines[2].sources];
  add(n2);

  // a line the design offers as an example, longer than the box it measured:
  // the customer taps it and the counter goes red on the design's own words
  const o = clone();
  const cap = el(o, 'baby-photos', 'photos-caption-1') as TextEl;
  cap.room = 8;
  cap.offerLine = true;
  cap.lines[0].sources = [...cap.lines[0].sources, { fixed: { en: 'Much longer than eight letters' } }];
  add(o);

  // the four about clips: one too heavy, one too long, bare words on a
  // bright one, and every clip in the design over the budget together
  runRow(withClip({ glare: 240 }), { weights: { 'u/c.mp4': 5_000_000 }, lengths: { 'u/c.mp4': 20_000 } }).forEach((x) => fired.add(x.rule));
  runRow(withClip({ clips: 3 }), { weights: { 'u/c.mp4': 7_000_000, 'u/c-2.mp4': 7_000_000, 'u/c-3.mp4': 7_000_000 } }).forEach((x) => fired.add(x.rule));

  // and the three the row knows about: a heavy background, a ground she typed
  // that the night palette cannot save, and a shop card with no cover
  const q = clone();
  const heavy = on(q, 'story').ground as { url: string };
  runRow(q, { weights: { [heavy.url]: 2_000_000 } }).forEach((x) => fired.add(x.rule));
  const r = clone();
  on(r, 'story').ground = { color: '#fef5df', ratio: 2.989 };
  add(r);
  runRow(clone(), { shop: { shown: true, thumbnail: false } }).forEach((x) => fired.add(x.rule));

  // the list is the type's own, so a rule added and never exercised fails here
  assert.deepEqual([...fired].sort(), [...NEED_RULES].sort());
});

// --- clips on a page ------------------------------------------------------

/**
 * A design with clips on its story page, built to order.
 *
 * `glare` is what the studio measured while it chose the poster, so leaving
 * it out is the real state of an element the studio did not add — which the
 * checklist is supposed to say rather than assume. `words` puts a bare text
 * box on top of the clip, which is the case a backing exists for.
 */
function withClip({ glare, clips = 1, poster = 'u/p.webp', words = true }: { glare?: number; clips?: number; poster?: string; words?: boolean } = {}): DesignDoc {
  const d = clone();
  const page = on(d, 'story');
  page.elements = [];
  for (let i = 1; i <= clips; i++) {
    page.elements.push({
      id: `clip-${i}`, kind: 'video', x: 50, y: 30, w: 60, anchor: 'centre', aspect: 1,
      url: i === 1 ? 'u/c.mp4' : `u/c-${i}.mp4`, poster, ...(glare === undefined ? {} : { glare }),
    } as never);
  }
  if (words) {
    page.elements.push({
      id: 'over', kind: 'text', block: 'free', x: 50, y: 30, w: 40, anchor: 'centre',
      lines: [{ role: 'body', sources: [{ fixed: { en: 'Words', tl: 'Salita' } }] }],
    } as never);
  }
  return d;
}

test('a clip with no still behind it blocks, because three kinds of guest never see the clip', () => {
  const need = run(withClip({ poster: '' })).filter((n) => n.rule === 'clip-glare');
  assert.equal(need.length, 1);
  assert.equal(need[0].level, 'blocks');
  assert.match(need[0].text, /prints|data|Low Power/);
  assert.equal(need[0].id, 'clip-1');
  // with a still it is not a blocker at all
  assert.equal(run(withClip({ glare: 100 })).some((n) => n.level === 'blocks'), false);
});

test('one clip’s weight and length are said, and only when the row knows them', () => {
  const quiet = run(withClip({ glare: 100 }));
  assert.deepEqual(quiet.filter((n) => n.rule === 'clip-weight' || n.rule === 'clip-length'), [],
    'a clip with no row is unknown, not light and not short');
  const said = runRow(withClip({ glare: 100 }), { weights: { 'u/c.mp4': 5_000_000 }, lengths: { 'u/c.mp4': 20_000 } });
  const weight = said.find((n) => n.rule === 'clip-weight')!;
  const length = said.find((n) => n.rule === 'clip-length')!;
  assert.equal(weight.level, 'says');
  assert.match(weight.text, /4\.8 MB/, 'it says the clip’s own number');
  assert.match(length.text, /20 seconds/);
  // a small, short clip says nothing
  assert.deepEqual(
    runRow(withClip({ glare: 100 }), { weights: { 'u/c.mp4': 900_000 }, lengths: { 'u/c.mp4': 6_000 } })
      .filter((n) => n.rule === 'clip-weight' || n.rule === 'clip-length'),
    [],
  );
});

test('every clip in the design is added up, across pages, and blocks over the budget', () => {
  const three = withClip({ glare: 100, clips: 3 });
  const under = runRow(three, { weights: { 'u/c.mp4': 4_000_000, 'u/c-2.mp4': 4_000_000, 'u/c-3.mp4': 4_000_000 } });
  assert.deepEqual(under.filter((n) => n.rule === 'clip-budget'), [], '12 MB is inside the budget');
  const over = runRow(three, { weights: { 'u/c.mp4': 7_000_000, 'u/c-2.mp4': 7_000_000, 'u/c-3.mp4': 7_000_000 } });
  const need = over.find((n) => n.rule === 'clip-budget')!;
  assert.equal(need.level, 'blocks', 'a guest scrolls the whole invitation, so this is not advice');
  assert.match(need.text, /3 clips/);
  assert.match(need.text, /20 MB|20\.0 MB/);
  assert.equal(need.page, '', 'it is about the design, not any one page');
  assert.equal(publishable(over), false);
});

test('the same clip on two pages is one download and counts once', () => {
  const d = withClip({ glare: 100 });
  const second = on(d, 'baby-photos');
  second.elements = [{ id: 'clip-again', kind: 'video', x: 50, y: 30, w: 60, anchor: 'centre', aspect: 1, url: 'u/c.mp4', poster: 'u/p.webp', glare: 100 } as never];
  // 9 MB twice would be over; one file twice is 9 MB
  assert.deepEqual(runRow(d, { weights: { 'u/c.mp4': 9_000_000 } }).filter((n) => n.rule === 'clip-budget'), []);
});

test('bare words on a bright clip are warned about; a backing or a dark clip is fine', () => {
  const bright = run(withClip({ glare: 240 })).find((n) => n.rule === 'clip-glare')!;
  assert.equal(bright.level, 'says');
  assert.match(bright.text, /240 of 255/);
  assert.equal(bright.id, 'over', 'it points at the words, which are what she would change');
  // a clip that never goes pale
  assert.deepEqual(run(withClip({ glare: 90 })).filter((n) => n.rule === 'clip-glare'), []);
  // words that carry their own halo
  const backed = withClip({ glare: 240 });
  (on(backed, 'story').elements!.find((e) => e.id === 'over') as TextEl).backing = 'scrim';
  assert.deepEqual(run(backed).filter((n) => n.rule === 'clip-glare'), []);
  // no words on it at all
  assert.deepEqual(run(withClip({ glare: 240, words: false })).filter((n) => n.rule === 'clip-glare'), []);
});

test('a clip whose brightness was never measured says so rather than passing it', () => {
  const need = run(withClip({})).find((n) => n.rule === 'clip-glare')!;
  assert.equal(need.level, 'says');
  assert.match(need.text, /never measured/);
  assert.match(need.text, /a clip moves/, 'the reason matters: one still cannot answer for thirty seconds');
});

test('words beside a clip rather than on it are left alone', () => {
  const d = withClip({ glare: 250 });
  // the clip is 60 wide centred on 50, so it spans 20 to 80 across
  (on(d, 'story').elements!.find((e) => e.id === 'over')!).x = 95;
  assert.deepEqual(run(d).filter((n) => n.rule === 'clip-glare'), []);
});
