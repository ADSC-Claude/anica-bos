import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPENINGS, OPENING_KEYS, OPENING_BY_KEY, isOpening, openingName, openingsFor, openingAssets, resolveOpening } from '../src/lib/openings';
import { COLLECTIONS, COLLECTION_KEYS, collectionsPresent, isCollection } from '../src/lib/collections';
import { BACKDROPS, availableBackdrops, isBackdrop, resolveBackdrop } from '../src/lib/backdrops';
import { TEMPLATES } from '../prisma/templates';
import { fieldsFor, cleanSection, defaultContent, OCCASION_SECTIONS } from '../src/lib/sections';
import { tierAtLeast } from '../src/lib/tiers';
import { PALETTE_PRESETS } from '../src/lib/theme';

test('the opening catalogue is complete and every key is declared', () => {
  assert.equal(OPENINGS.length, OPENING_KEYS.length);
  for (const key of OPENING_KEYS) {
    const def = OPENING_BY_KEY[key];
    assert.ok(def, key);
    assert.equal(def.key, key);
    assert.ok(def.name, `${key} has a name`);
    assert.ok(isOpening(key));
    if (key !== 'none') assert.ok(def.tagline, `${key} has a tagline`);
    // The drawn openings put a line of the couple's words on the closed
    // screen. "none" has no screen, and the cinematic one's screen is
    // artwork that was composed without room for type.
    if (key !== 'none' && !def.staffOnly) {
      assert.ok(def.line.en && def.line.tl, `${key} has a line in both languages`);
    }
  }
  assert.equal(isOpening('sparkles'), false);
  assert.equal(openingName('sparkles'), 'No opening');
  assert.equal(openingName('drape'), 'The Drape');
});

test('a tier only offers the openings it has paid for', () => {
  const keys = (tier: 'BASIC' | 'STANDARD' | 'COMPLETE') => openingsFor(tier).map((o) => o.key);
  assert.deepEqual(keys('BASIC'), ['none', 'envelope']);
  assert.ok(keys('STANDARD').includes('curtain'));
  assert.ok(!keys('STANDARD').includes('seal'));
  // Everything except the cinematic one, which no tier can pick: it is
  // artwork attached to an order, not an option.
  assert.deepEqual(keys('COMPLETE'), OPENING_KEYS.filter((k) => k !== 'cinematic'));
  for (const tier of ['BASIC', 'STANDARD', 'COMPLETE'] as const) {
    assert.ok(!keys(tier).includes('cinematic'), `${tier} is not offered the cinematic opening`);
  }
});

test('the customer choice wins, then the design, then nothing', () => {
  const base = { chosen: '', templateDefault: '', legacyEnvelope: false, tier: 'COMPLETE' as const };
  assert.equal(resolveOpening({ ...base, chosen: 'drape', templateDefault: 'seal' }), 'drape');
  assert.equal(resolveOpening({ ...base, templateDefault: 'seal' }), 'seal');
  assert.equal(resolveOpening(base), 'none');
  // An explicit "none" is a decision, not a blank — the design must not
  // override it.
  assert.equal(resolveOpening({ ...base, chosen: 'none', templateDefault: 'seal' }), 'none');
  // Nonsense in the database falls through to the design rather than crashing.
  assert.equal(resolveOpening({ ...base, chosen: 'fireworks', templateDefault: 'line' }), 'line');
});

test('an invitation built before openings existed keeps its envelope', () => {
  const base = { chosen: '', templateDefault: '', tier: 'BASIC' as const };
  assert.equal(resolveOpening({ ...base, legacyEnvelope: true }), 'envelope');
  assert.equal(resolveOpening({ ...base, legacyEnvelope: false }), 'none');
  // The old toggle loses to both the new choice and the design.
  assert.equal(resolveOpening({ ...base, legacyEnvelope: true, chosen: 'none' }), 'none');
  assert.equal(resolveOpening({ ...base, legacyEnvelope: true, templateDefault: 'envelope' }), 'envelope');
});

test('an opening above the tier falls back to the envelope, never to a blank screen', () => {
  assert.equal(resolveOpening({ chosen: 'seal', templateDefault: '', legacyEnvelope: false, tier: 'BASIC' }), 'envelope');
  assert.equal(resolveOpening({ chosen: '', templateDefault: 'photo', legacyEnvelope: false, tier: 'STANDARD' }), 'envelope');
  assert.equal(resolveOpening({ chosen: 'seal', templateDefault: '', legacyEnvelope: false, tier: 'COMPLETE' }), 'seal');
});

test('the cover offers every opening, and locks the ones the tier cannot have', () => {
  const opening = (tier?: 'BASIC' | 'STANDARD' | 'COMPLETE') => fieldsFor('cover', 'WEDDING', tier).find((f) => f.key === 'opening')!;
  // Every key is offered whatever the tier, so a saved value is never rejected
  // by cleanSection just because the customer downgraded.
  assert.deepEqual(opening().options?.map((o) => o.value), OPENING_KEYS.filter((k) => k !== 'cinematic'));
  const basic = opening('BASIC').options!;
  assert.equal(basic.find((o) => o.value === 'envelope')?.lockedTier, undefined);
  assert.equal(basic.find((o) => o.value === 'seal')?.lockedTier, 'COMPLETE');
  const complete = opening('COMPLETE').options!;
  assert.ok(complete.every((o) => !o.lockedTier));
  // A memorial is never unwrapped.
  assert.equal(fieldsFor('cover', 'MEMORIAL').some((f) => f.key === 'opening'), false);
});

test('a saved opening survives cleaning, and rubbish does not', () => {
  const fields = fieldsFor('cover', 'WEDDING', 'BASIC');
  const { data } = cleanSection(fields, { opening: 'seal', openingLine: '  and so it begins  ' });
  assert.equal(data.opening, 'seal', 'a locked option still saves — the renderer downgrades it');
  assert.equal(data.openingLine, 'and so it begins');
  const bad = cleanSection(fields, { opening: 'fireworks' });
  assert.equal(bad.data.opening, '');
  assert.ok(bad.issues.some((i) => i.path === 'opening'));
});

test('a new wedding starts with the envelope, and the old toggle is gone', () => {
  const c = defaultContent('WEDDING');
  assert.equal(c.cover?.opening, 'envelope');
  assert.equal('envelope' in (c.cover ?? {}), false, 'the boolean toggle no longer exists');
});

test('every collection is declared once and has a swatch', () => {
  assert.equal(new Set(COLLECTION_KEYS).size, COLLECTIONS.length);
  for (const c of COLLECTIONS) {
    assert.ok(c.label && c.tagline, c.key);
    assert.equal(c.swatch.length, 3, c.key);
    for (const hex of c.swatch) assert.match(hex, /^#[0-9a-f]{6}$/i, c.key);
    assert.ok(isCollection(c.key));
  }
  assert.equal(isCollection('puce'), false);
  // Present-and-declared only, in declared order, deduplicated.
  assert.deepEqual(collectionsPresent(['white', '', 'white', 'puce', 'blush']).map((c) => c.key), ['white', 'blush']);
  assert.deepEqual(collectionsPresent([]), []);
});

test('every design points at a real collection, opening and palette', () => {
  assert.equal(new Set(TEMPLATES.map((t) => t.slug)).size, TEMPLATES.length, 'slugs are unique');
  for (const t of TEMPLATES) {
    if (t.collection) assert.ok(isCollection(t.collection), `${t.slug} collection`);
    if (t.opening) {
      assert.ok(isOpening(t.opening) && t.opening !== 'none', `${t.slug} opening`);
      // A design must not ship with an opening its own tier cannot reach —
      // a Standard customer picking it would silently get the envelope.
      const needed = OPENING_BY_KEY[t.opening as keyof typeof OPENING_BY_KEY].minTier;
      const reach = t.premium ? 'COMPLETE' : t.minTier;
      assert.ok(tierAtLeast(reach, needed), `${t.slug} is ${reach} but its opening needs ${needed}`);
    }
    assert.ok(PALETTE_PRESETS.some((p) => p.palette.bg === t.palette.bg), `${t.slug} palette`);
    assert.ok(t.description.length > 10, `${t.slug} description`);
  }
});

test('Capiz is the Filipiniana flagship and its opening is one it can reach', () => {
  const capiz = TEMPLATES.find((t) => t.slug === 'capiz')!;
  assert.ok(capiz, 'the Capiz design is in the catalogue');
  assert.equal(capiz.collection, 'filipiniana');
  assert.equal(capiz.occasion, 'WEDDING');
  assert.equal(capiz.layout, 'capiz');
  // It opens with the wax seal, which is Complete-only — so the design has to
  // be Complete-reachable or a customer would pick it and get the envelope.
  assert.equal(capiz.opening, 'seal');
  assert.equal(capiz.premium, true);
  const filipiniana = TEMPLATES.filter((t) => t.collection === 'filipiniana');
  assert.ok(filipiniana.length >= 1);
  for (const t of filipiniana) assert.equal(t.occasion, 'WEDDING');
});

test('the designs from the cancelled decks are gone, and nothing points at them', () => {
  const slugs = TEMPLATES.map((t) => t.slug);
  for (const dropped of ['the-drape', 'the-seal', 'the-curtain', 'the-line', 'photo-story']) {
    assert.ok(!slugs.includes(dropped), `${dropped} was withdrawn from the catalogue`);
  }
  // The drawn openings themselves stay: they are the self-serve set, and
  // other designs still ship with them.
  assert.ok(TEMPLATES.some((t) => t.opening === 'seal'));
  assert.ok(TEMPLATES.some((t) => t.opening === 'line'));
  assert.ok(TEMPLATES.some((t) => t.opening === 'curtain'));
});

test('artwork supplies the cinematic opening; it is never chosen', () => {
  const base = { chosen: '', templateDefault: 'drape', legacyEnvelope: false, tier: 'COMPLETE' as const };
  // A clip beats the design's own opening — someone made it for this couple.
  assert.equal(resolveOpening({ ...base, cinematic: true }), 'cinematic');
  assert.equal(resolveOpening({ ...base, cinematic: false }), 'drape');
  // It beats an explicit choice too, for the same reason.
  assert.equal(resolveOpening({ ...base, chosen: 'seal', cinematic: true }), 'cinematic');
  // But not an explicit "none": turning the opening off is a decision, and a
  // clip attached afterwards must not quietly undo it.
  assert.equal(resolveOpening({ ...base, chosen: 'none', cinematic: true }), 'none');
  // Below Complete the clip is not served at all: the design's own opening
  // carries on, itself downgraded to the envelope here because The Drape is
  // Complete-only too. Either way the guest gets an opening, never a blank.
  assert.equal(resolveOpening({ ...base, tier: 'STANDARD', cinematic: true }), 'envelope');
  assert.equal(resolveOpening({ ...base, tier: 'BASIC', cinematic: true }), 'envelope');
  assert.equal(resolveOpening({ ...base, templateDefault: 'curtain', tier: 'STANDARD', cinematic: true }), 'curtain');
});

test('a clip made for one couple beats the one their design ships with', () => {
  const design = { openingVideoUrl: 'https://cdn/shared.webm', openingPosterUrl: 'https://cdn/shared.webp' };
  const bespoke = { openingVideoUrl: 'https://cdn/theirs.webm', openingPosterUrl: 'https://cdn/theirs.webp' };
  const none = { openingVideoUrl: '', openingPosterUrl: '' };
  assert.deepEqual(openingAssets(bespoke, design), { video: 'https://cdn/theirs.webm', poster: 'https://cdn/theirs.webp' });
  assert.deepEqual(openingAssets(none, design), { video: 'https://cdn/shared.webm', poster: 'https://cdn/shared.webp' });
  assert.deepEqual(openingAssets(none, none), { video: '', poster: '' });
});

test('a backdrop is the couple photo, else a painted scene, else nothing', () => {
  const painted = BACKDROPS[0].key;
  assert.deepEqual(resolveBackdrop('/uploads/theirs.jpg', painted), { url: '/uploads/theirs.jpg', kind: 'photo' });
  // Every scene is unpainted today, so a preset alone still resolves to
  // nothing — the frame holds the page's own colour rather than a broken img.
  assert.deepEqual(resolveBackdrop('', painted), { url: '', kind: 'none' });
  assert.deepEqual(resolveBackdrop('', 'nowhere'), { url: '', kind: 'none' });
  assert.deepEqual(availableBackdrops(), BACKDROPS.filter((b) => b.url));
});

test('every painted scene is somewhere in the Philippines, and declared once', () => {
  assert.equal(new Set(BACKDROPS.map((b) => b.key)).size, BACKDROPS.length);
  for (const b of BACKDROPS) {
    assert.ok(b.label && b.place && b.brief, b.key);
    assert.ok(isBackdrop(b.key));
  }
  assert.equal(isBackdrop('lakecomo'), false);
});

test('the moment section is editable end to end, and skips a memorial', () => {
  const fields = fieldsFor('moment', 'WEDDING');
  const keys = fields.map((f) => f.key);
  // The photo, the fallback scene, the frame and all three lines are fields —
  // nothing on this section is fixed copy.
  assert.deepEqual(keys, ['backdrop', 'preset', 'frame', 'line1', 'line2', 'line3']);
  assert.ok(OCCASION_SECTIONS.WEDDING.includes('moment'));
  assert.ok(!OCCASION_SECTIONS.MEMORIAL.includes('moment'), 'a scenic view is the wrong register for a memorial');
  const { data, issues } = cleanSection(fields, {
    backdrop: 'https://cdn/theirs.jpg', preset: 'elnido', frame: 'arch',
    line1: '  Same horizons  ', line2: 'A brighter', line3: 'Tomorrow',
  });
  assert.equal(issues.length, 0);
  assert.equal(data.line1, 'Same horizons');
  assert.equal(data.preset, 'elnido');
  assert.equal(defaultContent('WEDDING').moment?.frame, 'arch');
});

test('both lines of the opening are the customer’s own words', () => {
  const cover = fieldsFor('cover', 'WEDDING').map((f) => f.key);
  assert.ok(cover.includes('openingLine'), 'the closed screen line is editable');
  assert.ok(cover.includes('openingLine2'), 'the line shown as it opens is editable');
  const { data } = cleanSection(fieldsFor('cover', 'WEDDING'), { openingLine: "You're invited", openingLine2: 'Good things begin together' });
  assert.equal(data.openingLine, "You're invited");
  assert.equal(data.openingLine2, 'Good things begin together');
});

test('a design cannot name the cinematic opening into existence', () => {
  // staffOnly openings are supplied by artwork, never selected. A template or
  // a stale saved choice naming one must fall through, or the guest gets an
  // empty <video> and a screen that never opens.
  const base = { legacyEnvelope: false, tier: 'COMPLETE' as const, cinematic: false };
  assert.equal(resolveOpening({ ...base, chosen: '', templateDefault: 'cinematic' }), 'none');
  assert.equal(resolveOpening({ ...base, chosen: 'cinematic', templateDefault: '' }), 'none');
  assert.equal(resolveOpening({ ...base, chosen: 'cinematic', templateDefault: 'seal' }), 'seal');
  assert.equal(resolveOpening({ ...base, chosen: '', templateDefault: 'cinematic', legacyEnvelope: true }), 'envelope');
  // Only the artwork flag reaches it.
  assert.equal(resolveOpening({ ...base, chosen: '', templateDefault: '', cinematic: true }), 'cinematic');
});
