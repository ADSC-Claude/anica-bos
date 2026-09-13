import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteFromForm, fontsFromForm, sitterContent, COLOUR_ROLES } from '../src/lib/preview';
import { PALETTE_PRESETS, FONT_PRESETS } from '../src/lib/theme';
import { colourFamilies } from '../src/lib/palette';

/**
 * The rules the template form's fields are read by — the ones the save
 * action and the preview panel both go through, so that the picture beside
 * the form cannot disagree with what Save stores.
 */

const from = (o: Record<string, string>) => (k: string) => o[k] ?? '';

test('the six boxes win when they are filled', () => {
  const six = { bg: '#111111', surface: '#222222', ink: '#333333', muted: '#444444', accent: '#555555', accent2: '#666666' };
  // a preset and a family both asked for as well, and both ignored
  const got = paletteFromForm(from({ ...six, paletteKey: 'ivory', paletteFamily: colourFamilies()[0].key }));
  assert.deepEqual(got, six);
});

test('with the boxes empty a colour family beats a preset', () => {
  const family = colourFamilies()[0];
  const got = paletteFromForm(from({ paletteFamily: family.key, paletteKey: 'ivory' }));
  assert.deepEqual(got, family.palette);
  assert.notDeepEqual(got, PALETTE_PRESETS.find((p) => p.key === 'ivory')!.palette);
});

test('a preset applies when no family is named', () => {
  const ivory = PALETTE_PRESETS.find((p) => p.key === 'ivory')!.palette;
  assert.deepEqual(paletteFromForm(from({ paletteKey: 'ivory' })), ivory);
});

test('nothing asked for leaves the six blank, which is the house default on the way back out', () => {
  const got = paletteFromForm(from({}));
  assert.deepEqual(Object.keys(got).sort(), [...COLOUR_ROLES].sort());
  assert.deepEqual(Object.values(got), ['', '', '', '', '', '']);
});

test('an unknown preset or family is not a colour', () => {
  assert.deepEqual(paletteFromForm(from({ paletteKey: 'nope', paletteFamily: 'nope' })), paletteFromForm(from({})));
});

test('the pairing is the named preset, and the first one when the name is not a preset', () => {
  const script = FONT_PRESETS.find((f) => f.key === 'script')!.fonts;
  assert.deepEqual(fontsFromForm(from({ fontsKey: 'script' })), script);
  assert.deepEqual(fontsFromForm(from({ fontsKey: 'nonsense' })), FONT_PRESETS[0].fonts);
  assert.deepEqual(fontsFromForm(from({})), FONT_PRESETS[0].fonts);
});

/**
 * The one that keeps the panel honest.
 *
 * The preview stands the design on a real invitation, and `resolveTheme`
 * lets that invitation's own theme win over the design's. Left in, every
 * colour she typed would be answered with the sitter's colours — a panel
 * that looks like it is working and is showing somebody else's design.
 */
test('the sitter brings its content but never its theme', () => {
  const content = {
    couple: { one: 'Lucas', two: '' },
    theme: { palette: { bg: '#ff0000' }, lookKey: 'heritage', fontsKey: 'script', mode: 'night' },
  };
  const day = sitterContent(content, 'day');
  assert.equal(day.theme, undefined, 'the customer’s colours and pairing are dropped');
  assert.deepEqual(day.couple, content.couple, 'everything else is left alone');
  // Night is the design's own second palette, so that one flag is kept —
  // and nothing else comes with it.
  assert.deepEqual(sitterContent(content, 'night').theme, { mode: 'night' });
});

test('the same rule serves a form post and a query string', () => {
  const fd = new FormData();
  fd.set('paletteKey', 'ivory');
  const search = new URLSearchParams({ paletteKey: 'ivory' });
  assert.deepEqual(
    paletteFromForm((k) => String(fd.get(k) ?? '')),
    paletteFromForm((k) => search.get(k) ?? ''),
  );
});
