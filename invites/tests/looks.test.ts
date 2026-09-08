import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, LOOK_BY_KEY, LOOK_KEYS, isLook, lookLine, lookTitle, looksFor, lookAllowed, lookForTier, BASE_LOOK, type LineKey } from '../src/lib/looks';
import { hasFeature, COMPARISON } from '../src/lib/tiers';
import { googleFontsUrl } from '../src/lib/theme';
import { resolveTheme } from '../src/lib/invitations';
import { TEMPLATES } from '../prisma/templates';

const LINE_KEYS: LineKey[] = ['cover', 'verse', 'verseRef', 'moment1', 'moment2', 'moment3', 'story', 'invitation', 'entourage', 'gallery', 'venue', 'interlude2', 'dressCode', 'gentsNote', 'ladiesNote', 'dressNote', 'giftThanks', 'program', 'social', 'socialCta', 'guestbook', 'photos', 'photosIntro', 'countdown', 'contact', 'contactNote', 'closingMessage', 'closing'];

test('there are at least four looks, each complete in both languages', () => {
  assert.ok(LOOKS.length >= 4);
  assert.equal(new Set(LOOKS.map((l) => l.key)).size, LOOKS.length);
  for (const look of LOOKS) {
    assert.ok(LOOK_KEYS.includes(look.key));
    assert.ok(look.name && look.tagline, look.key);
    // every line exists; English and Tagalog agree on whether it is written
    for (const key of LINE_KEYS) {
      const line = look.lines[key];
      assert.ok(line, `${look.key} ${key}`);
      assert.equal(Boolean(line.en), Boolean(line.tl), `${look.key} ${key} in both languages`);
    }
    // the heading lines a card cannot do without
    for (const key of ['invitation', 'closing', 'countdown'] as const) assert.ok(look.lines[key].en, `${look.key} ${key}`);
    for (const [key, title] of Object.entries(look.titles)) assert.ok(title.en && title.tl, `${look.key} title ${key}`);
    // three or four faces, no more: each is a download on a phone
    assert.ok(look.fonts.load.length >= 2 && look.fonts.load.length <= 4, look.key);
    assert.ok(look.fonts.names && look.fonts.script && look.fonts.display && look.fonts.body, look.key);
    assert.ok(['and', '&'].includes(look.joiner));
  }
});

test('a look writes a line or stays quiet, and names a heading or defers', () => {
  const heritage = LOOK_BY_KEY.heritage;
  assert.equal(lookLine(heritage, 'en', 'invitation'), 'Join us as we say I do!');
  assert.equal(lookLine(heritage, 'tl', 'closing'), 'Kita-kits! ♡');
  assert.equal(lookLine(heritage, 'en', 'story'), undefined, 'a blank line is no line');
  assert.equal(lookLine(undefined, 'en', 'invitation'), undefined, 'no look, no lines');
  assert.equal(lookTitle(heritage, 'en', 'gallery'), 'Prenup Photos');
  assert.equal(lookTitle(undefined, 'en', 'gallery'), undefined);
  assert.ok(isLook('modern') && !isLook('') && !isLook('capiz'));
});

test('the font sheet carries each family with its own axes when a look asks for them', () => {
  const url = googleFontsUrl(LOOK_BY_KEY.heritage.fonts);
  assert.ok(url.includes('family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500'));
  assert.ok(url.includes('family=Pinyon+Script:wght@400;500;600;700'), 'a bare family gets the default weights');
  assert.ok(url.endsWith('&display=swap'));
});

test('a design carries a look, the customer can pick another, and a font preset alone drops it', () => {
  const capiz = TEMPLATES.find((t) => t.slug === 'capiz')!;
  assert.equal(capiz.look, 'heritage');
  const template = { palette: capiz.palette, fonts: capiz.fonts, look: 'heritage' };
  const own = resolveTheme(template, {});
  assert.equal(own.look?.key, 'heritage');
  assert.equal(own.fonts, LOOK_BY_KEY.heritage.fonts, 'the look brings its fonts');
  const chosen = resolveTheme(template, { theme: { lookKey: 'modern' } });
  assert.equal(chosen.look?.key, 'modern');
  assert.equal(chosen.fonts.body, LOOK_BY_KEY.modern.fonts.body);
  const preset = resolveTheme(template, { theme: { fontsKey: 'editorial' } });
  assert.equal(preset.look, undefined, 'a font preset on its own is the old way: fonts, no lines');
  const bogus = resolveTheme({ ...template, look: 'nope' }, { theme: { lookKey: 'nope' } });
  assert.equal(bogus.look, undefined);
  const plain = resolveTheme({ palette: capiz.palette, fonts: capiz.fonts }, {});
  assert.equal(plain.look, undefined);
});

test('the font style is what a package buys: Modern at Basic, three at Standard, five at the top', () => {
  assert.deepEqual(looksFor('BASIC').map((l) => l.key), ['modern'], 'Basic is set in Modern and picks nothing');
  assert.deepEqual(looksFor('STANDARD').map((l) => l.key), ['modern', 'romance', 'editorial']);
  assert.deepEqual(looksFor('COMPLETE').map((l) => l.key), ['modern', 'romance', 'editorial', 'heritage', 'regal']);
  assert.equal(LOOKS.length, 5);
  // the design's own — the blank choice — is every package's
  for (const tier of ['BASIC', 'STANDARD', 'COMPLETE'] as const) assert.equal(lookAllowed(tier, ''), true, tier);
  assert.equal(lookAllowed('BASIC', 'modern'), true);
  assert.equal(lookAllowed('BASIC', 'romance'), false);
  assert.equal(lookAllowed('STANDARD', 'editorial'), true);
  assert.equal(lookAllowed('STANDARD', 'heritage'), false, 'Heritage and Regal are the top package’s');
  assert.equal(lookAllowed('COMPLETE', 'regal'), true);
  assert.equal(lookAllowed('COMPLETE', 'nonsense'), false);
  assert.equal(BASE_LOOK, 'modern');
  assert.equal(lookForTier('BASIC', 'regal'), 'modern');
  assert.equal(lookForTier('STANDARD', 'romance'), 'romance');
});

test('a design above the package is set in Modern; a look chosen and then downgraded falls back the same way', () => {
  const capiz = TEMPLATES.find((t) => t.slug === 'capiz')!;
  const template = { palette: capiz.palette, fonts: capiz.fonts, look: 'heritage' };
  // Capiz ships in Heritage, a top-package look: below that it is set in Modern
  assert.equal(resolveTheme(template, {}, 'COMPLETE').look?.key, 'heritage');
  assert.equal(resolveTheme(template, {}, 'STANDARD').look?.key, 'modern');
  assert.equal(resolveTheme(template, {}, 'BASIC').look?.key, 'modern');
  // a chosen look the package has stays; one above it is ignored
  assert.equal(resolveTheme(template, { theme: { lookKey: 'romance' } }, 'STANDARD').look?.key, 'romance');
  assert.equal(resolveTheme(template, { theme: { lookKey: 'regal' } }, 'STANDARD').look?.key, 'modern');
  assert.equal(resolveTheme(template, { theme: { lookKey: 'regal' } }, 'COMPLETE').look?.key, 'regal');
  // without a tier — the showcase, staff previews — nothing is clamped
  assert.equal(resolveTheme(template, {}).look?.key, 'heritage');
  assert.equal(resolveTheme(template, { theme: { lookKey: 'regal' } }).look?.key, 'regal');
});

test('colours are every package’s, and the old font presets stay staff’s', () => {
  for (const tier of ['BASIC', 'STANDARD', 'COMPLETE'] as const) {
    assert.equal(hasFeature(tier, 'palette.presets'), true, tier);
    assert.equal(hasFeature(tier, 'palette.custom'), true, tier);
  }
  assert.equal(hasFeature('BASIC', 'fonts.choice'), false);
  assert.equal(hasFeature('STANDARD', 'fonts.choice'), true);
  assert.equal(hasFeature('STANDARD', 'fonts.all'), false);
  assert.equal(hasFeature('COMPLETE', 'fonts.all'), true);
  assert.equal(hasFeature('STANDARD', 'fonts.custom'), false);
  // the table the landing page draws says the same thing
  const fonts = COMPARISON.find((r) => r.label === 'Font style')!;
  assert.match(String(fonts.cells.STANDARD), /3/);
  assert.match(String(fonts.cells.COMPLETE), /5/);
  const colours = COMPARISON.find((r) => r.label === 'Colours')!;
  assert.equal(colours.cells.BASIC, colours.cells.COMPLETE);
});
