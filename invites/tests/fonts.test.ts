import test from 'node:test';
import assert from 'node:assert/strict';
import { FONT_PRESETS, googleFontsUrl, fontsFrom } from '../src/lib/theme';

/** The owner's pairings ship as presets; every one loads from Google Fonts with explicit axes. */
test('font presets: unique keys, the classic serif first, thirty pairings after the six originals', () => {
  const keys = FONT_PRESETS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0], 'serif');
  assert.equal(FONT_PRESETS.length, 36);
  for (const key of ['italiana-open-sans', 'montserrat-pinyon', 'bodoni-muellerhoff', 'great-vibes-league-gothic']) assert.ok(keys.includes(key), key);
});

test('every pairing names its axes, keeps to four families, and survives fontsFrom', () => {
  for (const p of FONT_PRESETS.slice(6)) {
    assert.ok(p.fonts.load.length >= 1 && p.fonts.load.length <= 4, p.key);
    for (const l of p.fonts.load) assert.match(l, /^[A-Za-z ]+:(wght|opsz,wght|ital,wght)@/, `${p.key}: ${l}`);
    assert.match(googleFontsUrl(p.fonts), /^https:\/\/fonts\.googleapis\.com\/css2\?family=/, p.key);
    assert.deepEqual(fontsFrom(p.fonts), p.fonts, p.key);
    // every face the preset sets is a family it loads
    const families = p.fonts.load.map((l) => l.split(':')[0]);
    for (const face of [p.fonts.display, p.fonts.body, p.fonts.names, p.fonts.script].filter(Boolean) as string[]) {
      const fam = /^'([^']+)'/.exec(face)?.[1];
      assert.ok(fam && families.includes(fam), `${p.key}: ${face} is not loaded`);
    }
  }
});
