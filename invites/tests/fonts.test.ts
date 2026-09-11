import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtInBook, bookSets, fontsOf, mergeWeights, familyOf, faceKey, loadEntry,
  PRESET_VOICE, RENAMED_SETS, DEFAULT_WEIGHTS, type FaceRow, type SetRow,
} from '../src/lib/fonts';
import { FONT_PRESETS, faceRules, fontsFrom, googleFontsUrl } from '../src/lib/theme';
import { LOOKS, LOOK_MIN_TIER, isLook } from '../src/lib/looks';

const book = builtInBook();
const faces = new Map(book.faces.map((f) => [f.key, f]));
const setOf = (key: string) => book.sets.find((s) => s.key === key)!;

test('a family a look names and a pairing names is one face', () => {
  assert.equal(book.faces.filter((f) => f.family === 'Cormorant Garamond').length, 1);
  // the fuller of the two chains in the lists, not whichever was met first
  assert.equal(faces.get('cormorant-garamond')!.stack, "'Cormorant Garamond', 'Hoefler Text', Georgia, serif");
  assert.equal(faces.get('cinzel')!.stack, "'Cinzel', 'Trajan Pro', 'Cormorant Garamond', serif");
});

test('every look and every pairing is a set, and no two share a key', () => {
  const keys = book.sets.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, 'two sets share a key');
  for (const look of LOOKS) assert.ok(keys.includes(look.key), `no set for the ${look.key} look`);
  for (const preset of FONT_PRESETS) assert.ok(keys.includes(RENAMED_SETS[preset.key] ?? preset.key), `no set for ${preset.key}`);
  assert.equal(book.sets.length, LOOKS.length + FONT_PRESETS.length);
});

test('a set draws the same families in the same parts as the list it came from', () => {
  const originals = [
    ...LOOKS.map((l) => ({ key: l.key, fonts: l.fonts })),
    ...FONT_PRESETS.map((p) => ({ key: RENAMED_SETS[p.key] ?? p.key, fonts: p.fonts })),
  ];
  for (const original of originals) {
    const fonts = fontsOf(setOf(original.key), faces);
    assert.ok(fonts, `${original.key} resolves to nothing`);
    for (const part of ['display', 'body', 'names', 'script'] as const) {
      const was: string | undefined = original.fonts[part];
      const now: string | undefined = fonts[part];
      assert.equal(!!was, !!now, `${original.key}.${part} appeared or vanished`);
      if (was && now) assert.equal(familyOf(now), familyOf(was), `${original.key}.${part} changed family`);
    }
    assert.equal(fonts.scriptStyle ?? 'normal', original.fonts.scriptStyle ?? 'normal');
    const families = (list: string[]) => [...list.map((e) => e.split(':')[0])].sort();
    assert.deepEqual(families(fonts.load), families(original.fonts.load), `${original.key} loads different families`);
  }
});

test("a family the set loads but never names survives as one it also loads", () => {
  // Capiz draws its headings in Cinzel and its lines in Pinyon Script from
  // its own stylesheet, so neither is any of the four parts.
  const capiz = setOf('capiz');
  assert.deepEqual([...capiz.alsoKeys].sort(), ['cinzel', 'pinyon-script']);
  assert.deepEqual([...fontsOf(capiz, faces)!.load.map((e) => e.split(':')[0])].sort(), ['Cinzel', 'Cormorant Garamond', 'Pinyon Script']);
  // and it is the only set that needs it
  assert.deepEqual(book.sets.filter((s) => s.alsoKeys.length).map((s) => s.key), ['capiz']);
});

test('merging weights keeps every weight both specs asked for', () => {
  // The bare form is four weights including 700, and the longest italic spec
  // in the lists has no 700 in it — so "keep the longer string" would lose it.
  assert.equal(mergeWeights('ital,wght@0,400;0,500;1,400', ''), 'ital,wght@0,400;0,500;0,600;0,700;1,400');
  assert.equal(mergeWeights('', ''), DEFAULT_WEIGHTS);
  assert.equal(mergeWeights('wght@300;400', 'wght@400;500'), 'wght@300;400;500');
});

test('merging two different axis lists fills the axis the other one lacks', () => {
  // ital defaults to upright; an optical size is taken from whichever spec
  // has one, because a family with an opsz axis has no other sensible value.
  assert.equal(
    mergeWeights('ital,wght@0,400;1,400', 'opsz,wght@6..96,400;6..96,700'),
    'ital,opsz,wght@0,6..96,400;0,6..96,700;1,6..96,400',
  );
  // Google refuses the whole request unless the axes are alphabetical and the
  // tuples ascending, which would leave every face on the page in its fallback
  const merged = faces.get('bodoni-moda')!.weights;
  assert.equal(merged.split('@')[0], 'ital,opsz,wght');
  const rows = merged.split('@')[1].split(';');
  assert.deepEqual([...rows].sort(), rows);
});

test('every pairing is told whose wording to speak in', () => {
  for (const preset of FONT_PRESETS) {
    const voice = PRESET_VOICE[preset.key];
    assert.ok(voice && isLook(voice), `${preset.key} has no voice`);
  }
  for (const look of LOOKS) assert.equal(setOf(look.key).voice, look.key);
});

test("a pairing is a Complete choice and a look keeps the package it had", () => {
  for (const look of LOOKS) assert.equal(setOf(look.key).minTier, LOOK_MIN_TIER[look.key]);
  for (const preset of FONT_PRESETS) assert.equal(setOf(RENAMED_SETS[preset.key] ?? preset.key).minTier, 'COMPLETE');
});

test('a set whose body face is gone falls back to its display face', () => {
  const only: FaceRow[] = [
    { key: 'a', name: 'A', family: 'A', stack: "'A', serif", source: 'google', weights: '', url: '', licence: '', enabled: true, sortOrder: 0 },
    { key: 'b', name: 'B', family: 'B', stack: "'B', serif", source: 'google', weights: '', url: '', licence: '', enabled: false, sortOrder: 1 },
  ];
  const set: SetRow = { key: 's', name: 'S', displayKey: 'a', bodyKey: 'b', namesKey: '', scriptKey: '', scriptStyle: 'normal', alsoKeys: [], voice: 'modern', minTier: 'BASIC', enabled: true, sortOrder: 0 };
  const map = new Map(only.map((f) => [f.key, f]));
  assert.equal(fontsOf(set, map)!.body, "'A', serif");
  // but a set with no display face at all is no set: the caller keeps what it had
  assert.equal(fontsOf({ ...set, displayKey: 'b' }, map), null);
  assert.deepEqual(bookSets({ faces: only, sets: [{ ...set, displayKey: 'b' }] }), []);
});

test('a face she uploaded is served from our bucket, once, and a Google one is not', () => {
  const file: FaceRow = { key: 'hers', name: 'Hers', family: 'Hers', stack: "'Hers', serif", source: 'file', weights: '', url: 'https://b/x/hers.woff2', licence: 'Bought from the foundry, 10 Sep', enabled: true, sortOrder: 0 };
  const set: SetRow = { key: 's', name: 'S', displayKey: 'hers', bodyKey: 'hers', namesKey: 'hers', scriptKey: '', scriptStyle: 'normal', alsoKeys: [], voice: 'modern', minTier: 'BASIC', enabled: true, sortOrder: 0 };
  const fonts = fontsOf(set, new Map([['hers', file]]))!;
  assert.deepEqual(fonts.files, [{ family: 'Hers', url: 'https://b/x/hers.woff2' }]);
  assert.deepEqual(fonts.load, [], 'a file face must not be asked of Google');
  const rules = faceRules(fonts);
  assert.equal(rules.match(/@font-face/g)?.length, 1, 'one rule for a face named in three parts');
  assert.match(rules, /font-family:"Hers"/);
  assert.match(rules, /format\("woff2"\)/);
  assert.match(rules, /font-display:swap/);
  // and the shipped sets, which are Google's, emit nothing at all
  assert.equal(faceRules(fontsOf(setOf('heritage'), faces)!), '');
  // a stored set keeps its files through the reader that guards the column
  assert.deepEqual(fontsFrom(JSON.parse(JSON.stringify(fonts))).files, fonts.files);
});

test('a face key is the family, and a Google entry is the family and its axes', () => {
  assert.equal(faceKey('Mrs Saint Delafield'), 'mrs-saint-delafield');
  assert.equal(familyOf("'Cormorant Garamond', 'Hoefler Text', Georgia, serif"), 'Cormorant Garamond');
  assert.equal(familyOf('Georgia, serif'), 'Georgia');
  assert.equal(loadEntry(faces.get('italiana')!), 'Italiana:wght@400');
  assert.match(googleFontsUrl(fontsOf(setOf('heritage'), faces)!), /family=Cormorant\+Garamond:ital,wght@/);
});
