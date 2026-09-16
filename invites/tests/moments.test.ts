import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOMENTS, MOMENT_BY_KEY, MOMENT_KEYS, SHELVES, SHELF_KEYS, SPEED_FACTOR, libraryHolds, shelvesOf, momentName, momentOf, triggerOf, momentHint,
} from '../src/lib/moments';
import { designOf, builtinDesign, type DesignDoc, type MomentEl } from '../src/lib/design';
import { asksOf } from '../src/lib/asks';
import { OPENING_KEYS, OPENINGS } from '../src/lib/openings';

/**
 * The library as she listed it: six shelves, seven to a shelf, 42 rows, and
 * a scene on two shelves built once.
 */
test('six shelves of seven: the 42, and every row a scene', () => {
  assert.deepEqual(libraryHolds(), []);
  assert.equal(SHELF_KEYS.length, 6);
  assert.equal(SHELF_KEYS.reduce((n, s) => n + SHELVES[s].length, 0), 42);
  for (const s of SHELF_KEYS) assert.equal(SHELVES[s].length, 7, s);
  // every key is one scene, and the keys are what the schema accepts
  assert.equal(new Set(MOMENTS.map((m) => m.key)).size, MOMENTS.length);
  assert.deepEqual([...MOMENT_KEYS].sort(), MOMENTS.map((m) => m.key).sort());
});

test('a scene on more than one shelf is one scene with two tags, as she asked', () => {
  // the ones her list names twice
  assert.deepEqual(shelvesOf('instant-camera'), ['tap', 'photo']);
  assert.deepEqual(shelvesOf('ring-box'), ['tap', 'occasion']);
  assert.deepEqual(shelvesOf('scratch'), ['swipe', 'surprise']);
  assert.deepEqual(shelvesOf('ribbon'), ['opening', 'swipe']);
  assert.deepEqual(shelvesOf('curtains'), ['opening', 'swipe']);
  assert.deepEqual(shelvesOf('doors'), ['opening', 'occasion']);
  assert.deepEqual(shelvesOf('gift'), ['tap', 'occasion', 'surprise']);
  assert.deepEqual(shelvesOf('light'), ['tap', 'surprise']);
  // a shelf's version of a scene is a variant the scene knows
  const church = SHELVES.occasion.find((e) => e.name === 'Church Doors')!;
  assert.equal(church.key, 'doors');
  assert.equal(church.variant, 'church');
  assert.equal(momentName(church.key, church.variant), 'Church Doors');
  assert.equal(momentName('doors'), 'Doors');
  assert.equal(momentOf(church).built, true);
  // 31 scenes carry the 42 rows
  assert.equal(MOMENTS.length, 31);
});

test('the openings, Tap & Reveal, Swipe & Pull and Surprise are built; the rest are marked as coming', () => {
  for (const e of SHELVES.opening) assert.equal(MOMENT_BY_KEY[e.key].built, true, e.key);
  const built = MOMENTS.filter((m) => m.built).map((m) => m.key).sort();
  assert.deepEqual(built, ['bloom', 'candle', 'capiz', 'code', 'curtains', 'doors', 'envelope', 'flip', 'frame', 'frost', 'gift', 'hold', 'instant-camera', 'letter', 'light', 'pull-card', 'puzzle', 'ribbon', 'ring-box', 'scratch', 'scroll', 'seal', 'sticker']);
  // every row on Tap & Reveal, Swipe & Pull and Surprise is built
  for (const e of [...SHELVES.tap, ...SHELVES.swipe, ...SHELVES.surprise]) assert.equal(MOMENT_BY_KEY[e.key].built, true, e.key);
  // and the four new openings are in the openings catalogue, every package's, with their own line
  for (const k of ['ribbon', 'doors', 'capiz', 'letter'] as const) {
    assert.ok(OPENING_KEYS.includes(k), k);
    const def = OPENINGS.find((o) => o.key === k)!;
    assert.equal(def.minTier, 'BASIC');
    assert.ok(def.line.en && def.line.tl);
  }
});

test('the trigger is the scene\'s unless the scene takes the one chosen; the hint says what to do', () => {
  assert.equal(triggerOf('envelope'), 'tap');
  assert.equal(triggerOf('envelope', 'swipe'), 'swipe');
  assert.equal(triggerOf('envelope', 'hold'), 'tap', 'the envelope is not held');
  assert.equal(triggerOf('ribbon'), 'swipe');
  assert.equal(triggerOf('scratch'), undefined, 'a scratch card is rubbed, and that is not a choice');
  assert.equal(momentHint('curtains', 'swipe', 'en'), 'Swipe apart');
  assert.equal(momentHint('ribbon', 'swipe', 'tl'), 'I-swipe pababa');
  assert.equal(momentHint('hold', 'hold', 'en'), 'Press and hold');
  assert.equal(momentHint('scratch', undefined, 'en'), 'Rub to reveal');
  assert.equal(momentHint('doors', 'tap', 'en'), 'Tap to open');
  // slow is slower and fast is faster, and normal is the scene's own clock
  assert.ok(SPEED_FACTOR.slow > 1 && SPEED_FACTOR.fast < 1 && SPEED_FACTOR.normal === 1);
});

test('a moment in the document round-trips, and a moment the library has not got is dropped', () => {
  const doc: DesignDoc = JSON.parse(JSON.stringify(builtinDesign('babyblue')));
  const page = doc.pages.find((p) => p.key === 'story')!;
  const moment: MomentEl = {
    id: 'doors-1', kind: 'moment', moment: 'doors', variant: 'church', x: 50, y: 40, w: 84, anchor: 'top', trigger: 'swipe', speed: 'slow', plays: 'always', ask: true,
    photos: [{ bind: { section: 'ceremony', field: 'photo' } }],
    lines: [{ role: 'body', align: 'center', sources: [{ bind: { section: 'ceremony', field: 'venue' } }, { fixed: { en: 'San Agustin', tl: 'San Agustin' } }] }],
  };
  page.elements!.push(moment);
  const back = designOf(JSON.parse(JSON.stringify(doc)), 'babyblue');
  assert.deepEqual(back.dropped, []);
  const kept = back.doc!.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.id === 'doors-1');
  assert.deepEqual(kept, moment);
  // a scene the library does not have never reaches a guest
  const bad = JSON.parse(JSON.stringify(doc));
  bad.pages.find((p: { key: string }) => p.key === 'story').elements.find((e: { id: string }) => e.id === 'doors-1').moment = 'fireworks';
  const dropped = designOf(bad, 'babyblue');
  assert.ok(dropped.dropped.length > 0 || !dropped.doc!.pages.find((p) => p.key === 'story')!.elements!.some((e) => e.id === 'doors-1'));
});

test('a moment marked Ask the customer asks for each photograph it opens onto, and for its words', () => {
  const doc: DesignDoc = JSON.parse(JSON.stringify(builtinDesign('babyblue')));
  const page = doc.pages.find((p) => p.key === 'story')!;
  page.elements!.push({
    id: 'stack-1', kind: 'moment', moment: 'polaroid-stack', x: 50, y: 40, w: 80, ask: true,
    photos: [
      { bind: { section: 'gallery', field: 'photos', index: 0, sub: 'url' } },
      { bind: { asset: '/babyblue/cloud.webp' } },
      { bind: { section: 'gallery', field: 'photos', index: 2, sub: 'url' } },
    ],
    lines: [{ role: 'body', sources: [{ bind: { section: 'gallery', field: 'line' } }] }],
  });
  const asks = asksOf(doc, 'CHRISTENING').filter((a) => a.id === 'stack-1');
  // two of the three photographs are the customer's; the third is the design's own
  assert.equal(asks.filter((a) => a.kind === 'photo').length, 2);
  assert.deepEqual(asks.filter((a) => a.kind === 'photo').map((a) => a.slot), [0, 2]);
  assert.match(asks[0]!.label, /Polaroid Stack: a photograph in the stack/);
  assert.equal(asks[0]!.shape, 'square');
  assert.equal(asks.filter((a) => a.kind === 'text').length, 1);
  // not marked: nothing is asked, however it is bound
  const quiet: DesignDoc = JSON.parse(JSON.stringify(doc));
  delete quiet.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.id === 'stack-1')!.ask;
  assert.deepEqual(asksOf(quiet, 'CHRISTENING').filter((a) => a.id === 'stack-1'), []);
});
