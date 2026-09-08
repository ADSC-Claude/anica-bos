import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPENINGS, OPENING_KEYS, OPENING_BY_KEY, isOpening, openingName, openingsFor, openingAssets, resolveOpening, hasPremiumOpening, PREMIUM_OPENING_CODE, UNIVERSAL_OPENING } from '../src/lib/openings';
import { COLLECTIONS, COLLECTION_KEYS, collectionsPresent, isCollection } from '../src/lib/collections';
import { BACKDROPS, availableBackdrops, isBackdrop, resolveBackdrop } from '../src/lib/backdrops';
import { TEMPLATES, templateData } from '../prisma/templates';
import { fieldsFor, cleanSection, defaultContent, OCCASION_SECTIONS, SECTION_BY_KEY, sectionOffered, sectionsFor, sectionOrder, isPaged } from '../src/lib/sections';
import { withWords } from '../src/lib/design';
import { LOOK_BY_KEY } from '../src/lib/looks';
import { STORY_SLOTS, PHOTO_SLOTS } from '../src/lib/babyblue';
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

test('every package offers every drawn opening; only the premium video is extra', () => {
  const keys = (tier: 'BASIC' | 'STANDARD' | 'COMPLETE') => openingsFor(tier).map((o) => o.key);
  // Everything except the premium one, which no tier can pick: it is
  // artwork attached to an order (the add-on), not an option.
  for (const tier of ['BASIC', 'STANDARD', 'COMPLETE'] as const) {
    assert.deepEqual(keys(tier), OPENING_KEYS.filter((k) => k !== 'cinematic'), `${tier} is offered every drawn opening`);
    assert.ok(!keys(tier).includes('cinematic'), `${tier} is not offered the premium opening as a choice`);
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

test('a drawn opening is reachable from every package', () => {
  assert.equal(resolveOpening({ chosen: 'seal', templateDefault: '', legacyEnvelope: false, tier: 'BASIC' }), 'seal');
  assert.equal(resolveOpening({ chosen: '', templateDefault: 'photo', legacyEnvelope: false, tier: 'STANDARD' }), 'photo');
  assert.equal(resolveOpening({ chosen: 'seal', templateDefault: '', legacyEnvelope: false, tier: 'COMPLETE' }), 'seal');
});

test('the cover offers every drawn opening to every package, none locked', () => {
  const opening = (tier?: 'BASIC' | 'STANDARD' | 'COMPLETE') => fieldsFor('cover', 'WEDDING', tier).find((f) => f.key === 'opening')!;
  assert.deepEqual(opening().options?.map((o) => o.value), OPENING_KEYS.filter((k) => k !== 'cinematic'));
  for (const tier of ['BASIC', 'STANDARD', 'COMPLETE'] as const) assert.ok(opening(tier).options!.every((o) => !o.lockedTier), `${tier} has nothing locked`);
  // A memorial is never unwrapped.
  assert.equal(fieldsFor('cover', 'MEMORIAL').some((f) => f.key === 'opening'), false);
});

test('a saved opening survives cleaning, and rubbish does not', () => {
  const fields = fieldsFor('cover', 'WEDDING', 'BASIC');
  const { data } = cleanSection(fields, { opening: 'seal', openingLine: '  and so it begins  ' });
  assert.equal(data.opening, 'seal');
  assert.equal(data.openingLine, 'and so it begins');
  const bad = cleanSection(fields, { opening: 'fireworks' });
  assert.equal(bad.data.opening, '');
  assert.ok(bad.issues.some((i) => i.path === 'opening'));
});

test('a new wedding starts with the Letter, and the old toggle is gone', () => {
  const c = defaultContent('WEDDING');
  assert.equal(c.cover?.opening, 'universal');
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
  // It opens with the Letter like every design; the design itself is a
  // Standard design, and its premium opening video is the add-on.
  assert.equal(capiz.opening, 'universal');
  assert.equal(capiz.premium, false);
  assert.equal(capiz.minTier, 'STANDARD');
  assert.ok(capiz.openingVideoUrl && capiz.openingPosterUrl, 'Capiz has a premium opening clip to add on');
  assert.equal(capiz.thumb, '/covers/capiz.jpg', 'the gallery shows its cover, not the clip');
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
  // every design opens with the Letter, the universal opening
  for (const t of TEMPLATES) assert.equal(t.opening, 'universal', t.slug);
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
  // The premium opening is an add-on with any package, so the package is no
  // gate: bought on Basic, the clip plays on Basic.
  assert.equal(resolveOpening({ ...base, tier: 'STANDARD', cinematic: true }), 'cinematic');
  assert.equal(resolveOpening({ ...base, tier: 'BASIC', cinematic: true }), 'cinematic');
  // Without it the design's own drawn opening carries on, in any package.
  // Never a blank.
  assert.equal(resolveOpening({ ...base, tier: 'STANDARD', cinematic: false }), 'drape');
  assert.equal(resolveOpening({ ...base, templateDefault: 'curtain', tier: 'BASIC', cinematic: false }), 'curtain');
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

test('the moment section is retired: hidden from the form, off the Capiz pages, its lines kept on the cover', () => {
  const fields = fieldsFor('moment', 'WEDDING');
  const keys = fields.map((f) => f.key);
  assert.deepEqual(keys, ['backdrop', 'preset', 'frame', 'line1', 'line2', 'line3']);
  assert.ok(OCCASION_SECTIONS.WEDDING.includes('moment'), 'the slot stays so old content is kept, not lost');
  assert.equal(SECTION_BY_KEY.moment.hidden, true, 'but it is not offered');
  assert.equal(sectionOffered('moment'), false);
  assert.ok(!sectionsFor('WEDDING').some((d) => d.key === 'moment'), 'the builder does not list it');
  assert.ok(!sectionOrder('WEDDING', 'capiz').slice(0, 2).includes('moment'), 'Capiz goes from the cover straight to the story');
  assert.deepEqual(sectionOrder('WEDDING', 'capiz').slice(0, 2), ['cover', 'story']);
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

test('Capiz ships a cinematic clip, and every clip in the catalogue has its poster', () => {
  const capiz = TEMPLATES.find((t) => t.slug === 'capiz')!;
  assert.equal(capiz.openingVideoUrl, '/openings/capiz.mp4');
  assert.equal(capiz.openingPosterUrl, '/openings/capiz-poster.jpg');
  // A clip with no poster leaves the guest on a blank screen while it buffers,
  // so templateData drops the clip rather than shipping it half-configured.
  for (const t of TEMPLATES) {
    if (t.openingVideoUrl) assert.ok(t.openingPosterUrl, `${t.slug} has a poster for its clip`);
  }
  const orphan = templateData({ ...capiz, openingPosterUrl: '' }, 0);
  assert.equal(orphan.openingVideoUrl, '', 'a clip without a poster is not shipped');
});

test('the cinematic cover says only that an invitation is here', () => {
  const def = OPENING_BY_KEY.cinematic;
  assert.equal(def.lineOnly, true, 'no names, no date on the closed screen');
  assert.equal(def.line.en, 'You are invited');
  assert.ok(def.line.tl, 'and in Tagalog too');
  // The drawn openings are title pages and do carry the names.
  for (const k of ['drape', 'seal', 'curtain', 'line', 'photo'] as const) {
    assert.ok(!OPENING_BY_KEY[k].lineOnly, `${k} still shows the names`);
  }
});

test('the premium opening is an entitlement: bought, switched on, or made for the couple', () => {
  assert.equal(PREMIUM_OPENING_CODE, 'PREMIUM_OPENING');
  // the design's clip alone is not enough — the add-on has to be on the invitation
  assert.equal(hasPremiumOpening({ premiumOpening: false, openingVideoUrl: '' }), false);
  assert.equal(hasPremiumOpening({ premiumOpening: true, openingVideoUrl: '' }), true);
  // a clip made for this couple is premium work whatever the package
  assert.equal(hasPremiumOpening({ premiumOpening: false, openingVideoUrl: '/uploads/x/clip.mp4' }), true);
  // the add-on is sold with any package: its opening is not gated by tier
  assert.equal(OPENING_BY_KEY.cinematic.minTier, 'BASIC');
  assert.equal(OPENING_BY_KEY.cinematic.name, 'Premium opening');
});

test('the Letter is the universal opening: on every design, in every package, and it carries no writing', () => {
  const letter = OPENING_BY_KEY.universal;
  assert.equal(letter.name, 'The Letter');
  assert.equal(letter.minTier, 'BASIC');
  assert.ok(!letter.staffOnly, 'a customer may pick it — it is the default, not a staff attachment');
  assert.ok(letter.lineOnly, 'no names anywhere on it: the card inside says you are invited, and the cover says who — the names on a clip are the premium opening\'s');
  assert.match(UNIVERSAL_OPENING.video, /^\/openings\/universal\.mp4$/);
  assert.match(UNIVERSAL_OPENING.poster, /^\/openings\/universal-poster\.jpg$/);
  for (const tier of ['BASIC', 'STANDARD', 'COMPLETE'] as const) assert.ok(openingsFor(tier).some((o) => o.key === 'universal'), tier);
  // the design default, reachable from any package; the premium clip still wins when it is bought
  const base = { chosen: '', templateDefault: 'universal', legacyEnvelope: false, tier: 'BASIC' as const };
  assert.equal(resolveOpening(base), 'universal');
  assert.equal(resolveOpening({ ...base, cinematic: true }), 'cinematic');
  assert.equal(resolveOpening({ ...base, chosen: 'none' }), 'none');
});

test('Baby Blue: a christening in its own collection, on its own pages, drawn in Romance with a christening’s words', () => {
  const bb = TEMPLATES.find((t) => t.slug === 'baby-blue')!;
  assert.ok(bb, 'the Baby Blue design is in the catalogue');
  assert.equal(bb.occasion, 'CHRISTENING');
  assert.equal(bb.layout, 'babyblue');
  assert.equal(bb.collection, 'babyblue');
  assert.equal(bb.minTier, 'BASIC', 'a Basic christening has a design');
  assert.equal(bb.premium, false);
  assert.equal(bb.look, 'romance');
  assert.equal(bb.opening, 'universal');
  assert.equal(bb.thumb, '/covers/baby-blue.jpg');
  assert.equal(bb.words?.en?.['title:gallery'], 'Baby Photos');
  assert.equal(bb.words?.en?.['title:sponsors'], 'Ninong & Ninang');
  assert.equal(bb.words?.tl?.['title:story'], 'Ang Aming Kuwento');
  assert.match(bb.words?.en?.verse ?? '', /Children are a gift/);
  // the words reach the row, and so the sync
  assert.deepEqual(templateData(bb, 0).words, bb.words);
  // a heading and the line under it are different words now
  const look = withWords(LOOK_BY_KEY.romance, bb.words!);
  assert.equal(look?.titles.gallery?.en, 'Baby Photos');
  assert.equal(look?.lines.gallery.en, 'Little moments, big love.');
  // the pages, in the owner's order: cover, story, invitation, ninong and ninang, baby photos, venue, dress code, gift, program, snap and share, post-event photos, RSVP, countdown, assistance, ending
  assert.deepEqual(sectionOrder('CHRISTENING', 'babyblue').slice(0, 15), ['cover', 'story', 'ceremony', 'sponsors', 'gallery', 'reception', 'dressCode', 'gift', 'program', 'social', 'photos', 'rsvp', 'countdown', 'contact', 'closing']);
  assert.ok(isPaged('babyblue') && isPaged('capiz') && !isPaged('classic'));
});

test('a christening tells its story in six milestones, the design’s own to start, the client’s to rename', () => {
  const c = defaultContent('CHRISTENING');
  const timeline = c.story?.timeline as { title: string; text: string; photo: string }[];
  assert.equal(timeline.length, 6);
  assert.equal(timeline[0].title, 'The Prayer');
  assert.equal(timeline[5].title, 'Our Greatest Blessing');
  assert.equal(timeline[0].photo, '');
  const fields = fieldsFor('story', 'CHRISTENING');
  const list = fields.find((f) => f.key === 'timeline')!;
  assert.equal(list.max, 6, 'six frames on the page');
  assert.ok(!fields.some((f) => f.key === 'howWeMet'), 'a christening has no proposal to tell');
  assert.ok(fieldsFor('story', 'WEDDING').some((f) => f.key === 'howWeMet'));
  // Our Story, Snap & Share and Assistance are a christening's now
  for (const k of ['story', 'social', 'contact'] as const) assert.ok(OCCASION_SECTIONS.CHRISTENING.includes(k), k);
  assert.equal(STORY_SLOTS.length, 6);
  assert.equal(PHOTO_SLOTS.length, 4);
  for (const s of [...STORY_SLOTS, ...PHOTO_SLOTS]) assert.ok(s.cx > 0 && s.cx < 100 && s.cy > 0 && s.cy < 100 && s.size > 20 && s.size < 35, JSON.stringify(s));
});
