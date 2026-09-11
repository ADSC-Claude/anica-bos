import test from 'node:test';
import assert from 'node:assert/strict';
import { FONT_PRESETS, googleFontsUrl, fontsFrom, allFacesUrl, fontSetKey } from '../src/lib/theme';

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

/**
 * The studio's font menu draws every set in its own faces, which means the
 * page has to load every family in the list — in one request, and without
 * asking any family for a weight it has not got. One bad family is a 400
 * for the whole stylesheet, and then every face in the menu is drawn in the
 * fallback and the menu is a lie.
 */
test('one stylesheet for the whole menu: every family once, none asked for a weight it lacks', () => {
  const url = allFacesUrl();
  assert.match(url, /^https:\/\/fonts\.googleapis\.com\/css2\?family=/);
  const asked = [...url.matchAll(/family=([^:&]+):([^&]+)/g)].map(([, family, axes]) => [decodeURIComponent(family.replace(/\+/g, ' ')), axes] as const);
  const families = asked.map(([f]) => f);
  assert.equal(new Set(families).size, families.length, 'a family is asked for twice');
  // every family any set names is in it, and every one carries an axis spec
  const wanted = new Set(FONT_PRESETS.flatMap((p) => p.fonts.load.map((l) => l.split(':')[0])));
  assert.equal(families.length, wanted.size);
  for (const f of wanted) assert.ok(families.includes(f), `${f} is not loaded for the menu`);
  for (const [family, axes] of asked) assert.match(axes, /^(wght|opsz,wght|ital,wght)@/, family);
  // a family named twice keeps the fuller spec: Great Vibes is bare in the
  // Script pairing and explicit in another, and the explicit one wins
  assert.equal(asked.find(([f]) => f === 'Great Vibes')?.[1], 'wght@400');
});

/** The set a stored pair of faces is, so a menu can show what the design is already in. */
test('a stored pair of faces knows which set it is', () => {
  for (const p of FONT_PRESETS) assert.equal(fontSetKey(p.fonts), p.key);
  assert.equal(fontSetKey({ display: "'Comic Sans MS', cursive", body: 'serif', load: [] }), '');
  // the same faces with another family loaded is still the same set: what
  // makes two sets the same is that they draw the same letters
  assert.equal(fontSetKey({ ...FONT_PRESETS[0].fonts, load: ['Jost:wght@400'] }), 'serif');
});
