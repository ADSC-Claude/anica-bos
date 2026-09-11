import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinDesign, type DesignDoc, type PhotoEl, type TextEl } from '../src/lib/design';
import { pageNeeds, needCount, publishable, type Need, type NeedRule } from '../src/lib/needs';

const base = builtinDesign('babyblue')!;
const clone = (d: DesignDoc = base): DesignDoc => JSON.parse(JSON.stringify(d));
const run = (doc: DesignDoc, content?: Record<string, unknown>) =>
  pageNeeds({ doc, occasion: 'CHRISTENING' as never, content });
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
  // asked for, it is the customer's to fill and no longer a fault
  (el(d, 'story', 'story-photo-1') as PhotoEl).ask = true;
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

  assert.deepEqual([...fired].sort(), rules([
    'ground', 'carries-nothing', 'off-page', 'overlap', 'unlinked', 'too-many', 'no-tagalog',
    'too-small', 'orphan', 'if-empty', 'room', 'browser-bar', 'no-heading', 'demo-blank', 'asks',
  ].map((rule) => ({ rule }) as Need)));
});
