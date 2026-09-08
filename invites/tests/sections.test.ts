import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OCCASION_SECTIONS, sectionsFor, sectionOffered, fieldsFor, customerFields, keepStaffFields, defaultContent, cleanSection, publishProblems, displayTitle, eventInstant, sectionUnlocked, sectionMinTier, sectionLabel, sectionFilled, emptySection, guestGroups, GUEST_GROUP_PRESETS, sectionOnCard, SAVE_THE_DATE_SECTIONS, type SectionKey } from '../src/lib/sections';
import { OCCASION_KEYS } from '../src/lib/occasions';
import { saveTheDateOffered, addOnAvailable } from '../src/lib/pricing';

test('every occasion has a cover, an RSVP and a closing, and every section it lists is defined', () => {
  for (const o of OCCASION_KEYS) {
    const keys = OCCASION_SECTIONS[o];
    assert.ok(keys.includes('cover'), o);
    assert.ok(keys.includes('rsvp'), o);
    assert.ok(keys.includes('closing'), o);
    assert.equal(sectionsFor(o).length, keys.filter((k) => sectionOffered(k)).length);
    for (const k of keys) assert.ok(fieldsFor(k, o).length > 0, `${o}.${k} has fields`);
  }
});

test('Basic gets a cover photo and no gallery; the gallery is named for the occasion', () => {
  for (const o of OCCASION_KEYS) {
    // The promise on the landing page is "1 cover photo" for Basic. That photo
    // is the cover's, so every occasion must have one to give.
    assert.ok(fieldsFor('cover', o).some((f) => f.key === 'coverPhoto'), `${o} cover has a photo`);
    if (!OCCASION_SECTIONS[o].includes('gallery')) continue;
    assert.equal(sectionUnlocked('gallery', o, 'BASIC'), false, `${o} gallery is locked on Basic`);
    assert.equal(sectionUnlocked('gallery', o, 'STANDARD'), true, `${o} gallery opens on Standard`);
    // "Prenup photos" on a christening would be nonsense.
    assert.doesNotMatch(sectionLabel('gallery', o), o === 'WEDDING' ? /^$/ : /Prenup/, `${o} gallery label`);
  }
  assert.match(sectionLabel('gallery', 'WEDDING'), /Prenup/);
  assert.match(sectionLabel('gallery', 'CHRISTENING'), /Baby/);
  assert.match(sectionLabel('gallery', 'KIDS_BIRTHDAY'), /Celebrant/);
});

test('default content carries every section for the occasion, and nothing else', () => {
  for (const o of OCCASION_KEYS) {
    const c = defaultContent(o);
    assert.deepEqual(Object.keys(c).sort(), [...OCCASION_SECTIONS[o]].sort(), o);
  }
  const w = defaultContent('WEDDING', 'tl');
  assert.match(String(w.gift?.text), /presensya/, 'Tagalog preset chosen');
  assert.equal(w.countdown?.enabled, true);
});

test('cleaning drops unknown keys, trims, caps lists and rejects bad links', () => {
  const fields = fieldsFor('gift', 'WEDDING');
  const { data, issues } = cleanSection(fields, {
    text: '  hello  ',
    hacker: 'nope',
    gcashQr: 'javascript:alert(1)',
    registry: [{ label: 'A', url: 'https://a.example' }, { label: '', url: '' }, { label: 'B', url: 'ftp://x' }],
  });
  assert.equal(data.text, 'hello');
  assert.equal('hacker' in data, false);
  assert.equal(data.gcashQr, '');
  assert.ok(issues.some((i) => i.path === 'gcashQr'));
  const registry = data.registry as { label: string; url: string }[];
  assert.equal(registry.length, 2, 'the blank row is dropped');
  assert.equal(registry[1].url, '', 'ftp link rejected');
});

test('the eighteen lists are capped at 18', () => {
  const fields = fieldsFor('eighteen', 'DEBUT');
  const { data } = cleanSection(fields, { roses: Array.from({ length: 25 }, (_, i) => ({ name: `Rose ${i}`, relation: '' })) });
  assert.equal((data.roses as unknown[]).length, 18);
});

test('a person keeps title, name and the late marker', () => {
  const fields = fieldsFor('parents', 'WEDDING');
  const { data } = cleanSection(fields, { groomFather: { title: 'Mr.', name: ' Antonio ', deceased: 'on' } });
  assert.deepEqual(data.groomFather, { title: 'Mr.', name: 'Antonio', deceased: true });
  assert.deepEqual(data.brideFather, { title: '', name: '', deceased: false });
});

test('colours must be hex and at most the field allows: eight for the motif, four for the suits', () => {
  const fields = fieldsFor('dressCode', 'WEDDING');
  const { data } = cleanSection(fields, {
    colors: ['#5b6b4e', 'red', '#C9B48A', '#1', '#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'],
    gentsColors: ['#000000', '#111111', '#222222', '#333333', '#444444'],
  });
  assert.deepEqual(data.colors, ['#5b6b4e', '#C9B48A', '#000000', '#111111', '#222222', '#333333', '#444444', '#555555']);
  assert.deepEqual(data.gentsColors, ['#000000', '#111111', '#222222', '#333333']);
});

test('a checklist keeps only its own options, in their order, and each occasion offers its own', () => {
  const wedding = fieldsFor('dressCode', 'WEDDING');
  const { data } = cleanSection(wedding, { gentsItems: ['coat', 'tuxedo', 'suit', 'suit', 'nonsense'], avoid: ['prints', 'white'] });
  assert.deepEqual(data.gentsItems, ['suit', 'coat'], 'the tuxedo is not on the wedding list; the order is the list\'s');
  assert.deepEqual(data.avoid, ['white', 'prints']);
  const avoid = wedding.find((f) => f.key === 'avoid')!;
  assert.ok(avoid.options!.some((o) => o.value === 'white' && /bride/.test(o.label)), 'white is asked for the bride at a wedding');
  const kids = fieldsFor('dressCode', 'KIDS_BIRTHDAY').find((f) => f.key === 'gentsItems')!;
  assert.ok(kids.options!.some((o) => o.value === 'themed') && !kids.options!.some((o) => o.value === 'suit'));
  const fresh = defaultContent('WEDDING').dressCode!;
  assert.deepEqual(fresh.attire, ['formal']);
  assert.ok((fresh.gentsItems as string[]).includes('suit') && (fresh.avoid as string[]).includes('white'));
  assert.ok((fresh.gentsItems as string[]).length <= 3 && (fresh.ladiesItems as string[]).length <= 3, 'a fresh invitation starts with two or three pieces');
});

test('the dress code is one or two attires and the clothes follow it: two or three each, only what suits', async () => {
  const { itemsFor, gentsItems, ladiesItems, attireKeys } = await import('../src/lib/attire');
  const wedding = fieldsFor('dressCode', 'WEDDING');
  const attire = wedding.find((f) => f.key === 'attire')!;
  assert.equal(attire.type, 'checks');
  assert.equal(attire.min, 1);
  assert.equal(attire.max, 2);
  const gents = wedding.find((f) => f.key === 'gentsItems')!;
  assert.equal(gents.dependsOn, 'attire');
  assert.equal(gents.min, 2);
  assert.equal(gents.max, 3);
  assert.ok(gents.options!.find((o) => o.value === 'suit')!.when!.includes('formal'));
  // the old single word still reads as one attire; three attires are cut to two; four pieces to three
  const { data } = cleanSection(wedding, { attire: 'formal', gentsItems: ['suit', 'coat', 'longSleeves', 'barong'] });
  assert.deepEqual(data.attire, ['formal']);
  assert.deepEqual(data.gentsItems, ['suit', 'coat', 'barong'], 'four pieces cut to three, in the list\'s order');
  assert.deepEqual(cleanSection(wedding, { attire: ['casual', 'formal', 'cocktail'] }).data.attire, ['formal', 'cocktail']);
  assert.deepEqual(attireKeys('formal'), ['formal']);
  assert.deepEqual(attireKeys(['formal', 'cocktail']), ['formal', 'cocktail']);
  assert.deepEqual(attireKeys(undefined), []);
  // casual at a wedding offers no suit; formal offers no polo; a code nothing suits falls back to the whole list
  const casual = itemsFor(gentsItems('WEDDING'), ['casual']).map((i) => i.value);
  assert.ok(!casual.includes('suit') || casual.length === gentsItems('WEDDING').length);
  const formal = itemsFor(ladiesItems('WEDDING'), ['formal']).map((i) => i.value);
  assert.ok(formal.includes('longGown') && formal.includes('cocktail'));
  assert.equal(itemsFor(gentsItems('WEDDING'), ['themed']).length, gentsItems('WEDDING').length, 'nothing on the wedding list is themed, so the whole list is offered');
  // one piece ticked is a started list, and a publish problem
  const cover = { brideFirst: 'Maria', groomFirst: 'Juan', date: '2026-11-21' };
  const one = publishProblems('WEDDING', { cover, dressCode: { attire: ['formal'], gentsItems: ['suit'], ladiesItems: ['longGown', 'cocktail'] } });
  assert.ok(one.some((p) => /at least 2 choices for for gentlemen/.test(p)), one.join(' | '));
});

test('publishing needs the cover essentials', () => {
  const c = defaultContent('WEDDING');
  const problems = publishProblems('WEDDING', c);
  assert.ok(problems.some((p) => /Bride's first name/.test(p)));
  assert.ok(problems.some((p) => /Event date/.test(p)));
  Object.assign(c.cover!, { brideFirst: 'Maria', groomFirst: 'Juan', date: '2026-12-12', time: '14:00' });
  assert.deepEqual(publishProblems('WEDDING', c), []);
  assert.equal(displayTitle('WEDDING', c), 'Maria & Juan');
  assert.equal(eventInstant(c)?.toISOString(), '2026-12-12T06:00:00.000Z', 'Manila afternoon is UTC morning');
});

test('titles read naturally for other occasions', () => {
  const d = defaultContent('DEBUT');
  Object.assign(d.cover!, { celebrantFirst: 'Sofia' });
  assert.equal(displayTitle('DEBUT', d), "Sofia's 18th");
  const k = defaultContent('KIDS_BIRTHDAY');
  Object.assign(k.cover!, { celebrantFirst: 'Liam', age: 7 });
  assert.equal(displayTitle('KIDS_BIRTHDAY', k), "Liam's 7th Birthday");
  const m = defaultContent('MEMORIAL');
  Object.assign(m.cover!, { name: 'Lolo Ben' });
  assert.equal(displayTitle('MEMORIAL', m), 'In loving memory of Lolo Ben');
});

test('tier gating follows the package table', () => {
  assert.equal(sectionUnlocked('entourage', 'WEDDING', 'BASIC'), false);
  assert.equal(sectionUnlocked('entourage', 'WEDDING', 'STANDARD'), true);
  assert.equal(sectionUnlocked('program', 'WEDDING', 'STANDARD'), false);
  assert.equal(sectionUnlocked('program', 'WEDDING', 'COMPLETE'), true);
  assert.equal(sectionMinTier('program', 'CORPORATE'), 'BASIC', 'an agenda is the point of a corporate invite');
  assert.equal(sectionUnlocked('guestbook', 'WEDDING', 'STANDARD'), false);
  assert.equal(sectionUnlocked('cover', 'WEDDING', 'BASIC'), true);
});

test('a section counts as filled once something meaningful is typed', () => {
  const key: SectionKey = 'faq';
  assert.equal(sectionFilled(key, 'WEDDING', emptySection(fieldsFor(key, 'WEDDING'))), false);
  assert.equal(sectionFilled(key, 'WEDDING', { items: [{ q: 'Parking?', a: 'Yes' }] }), true);
  assert.equal(sectionFilled('countdown', 'WEDDING', { enabled: true, label: '' }), false);
});

test('a lady\'s garment is never white: pale colours are deepened, colours are kept', async () => {
  const { wearable, figureHeight } = await import('../src/lib/attire-art');
  const light = (hex: string) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255); return (Math.max(...c) + Math.min(...c)) / 2; };
  for (const pale of ['#ffffff', '#e9dcc3', '#efe6dc', '#d9c3a5']) assert.ok(light(wearable(pale)) <= 0.67, `${pale} -> ${wearable(pale)}`);
  assert.equal(wearable('#8a5a3c'), '#8a5a3c');
  assert.equal(wearable('#9daa8f'), '#9daa8f');
  const blush = wearable('#d9a9a9');
  assert.ok(light(blush) <= 0.67 && blush.slice(1, 3) > blush.slice(3, 5) && blush.slice(3, 5) === blush.slice(5, 7), `blush deepens but stays pink: ${blush}`);
  assert.equal(wearable('not a colour'), 'not a colour');
  // a near-white deepens as a neutral at a wedding, never into a mustard or a grey nobody picked
  const ivory = wearable('#fff3dc');
  const chroma = (hex: string) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return (Math.max(...c) - Math.min(...c)) / 255; };
  assert.ok(light(ivory) <= 0.67 && chroma(ivory) < 0.2, `ivory deepens to champagne, not mustard: ${ivory}`);
  // at a christening or a birthday the motif's colours go on the gowns as picked — white and ivory are worn
  assert.equal(wearable('#ffffff', 'CHRISTENING'), '#ffffff');
  assert.equal(wearable('#fff3dc', 'KIDS_BIRTHDAY'), '#fff3dc');
  assert.notEqual(wearable('#ffffff', 'WEDDING'), '#ffffff');
  // the rows share one height: the smaller of what either affords, capped
  const gown = { id: 'g', group: 'ladies' as const, kind: 'long', w: 40, h: 100 };
  const wide = { id: 'w', group: 'girls' as const, kind: 'girl', w: 100, h: 100 };
  assert.equal(figureHeight([gown, gown, gown, gown], [gown, gown]), 38);
  assert.ok(Math.abs(figureHeight([wide, wide, wide, wide, wide], [gown]) - (100 - 8) / 5) < 1e-9);
});

test('the clothes are clothes: no shoes, ties or heels; kindly-avoid is the full list everywhere, six at most, folded', async () => {
  const { gentsItems, ladiesItems, avoidItems, AVOID_MAX } = await import('../src/lib/attire');
  const { OCCASION_KEYS: keys } = await import('../src/lib/occasions');
  for (const o of keys) {
    const g = gentsItems(o).map((i) => i.value);
    const l = ladiesItems(o).map((i) => i.value);
    for (const acc of ['tie', 'bowTie', 'dressShoes', 'loafers', 'sneakers']) assert.ok(!g.includes(acc), `${o}: ${acc}`);
    assert.ok(!l.includes('heels'), `${o}: heels`);
    assert.ok(g.length >= 3 && l.length >= 3, `${o} still offers a choice`);
    assert.equal(avoidItems(o).length, 15, `${o} offers the whole avoid list`);
  }
  assert.ok(avoidItems('WEDDING').some((i) => /bride/.test(i.en)) && avoidItems('DEBUT').some((i) => /debutante/.test(i.en)));
  const avoid = fieldsFor('dressCode', 'WEDDING').find((f) => f.key === 'avoid')!;
  assert.equal(avoid.max, AVOID_MAX);
  assert.equal(avoid.fold, true);
  assert.equal(avoid.min, undefined, 'no minimum');
  const { data } = cleanSection(fieldsFor('dressCode', 'WEDDING'), { avoid: ['white', 'black', 'red', 'bright', 'prints', 'sequins', 'casual', 'shorts'] });
  assert.equal((data.avoid as string[]).length, 6, 'eight ticked keep the first six');
});

test('Background music keeps the song named, its start as seconds, and its uploaded file — and nothing that would put a player on the page', () => {
  const fields = fieldsFor('music', 'WEDDING');
  assert.deepEqual(fields.map((f) => f.key), ['song', 'start', 'url']);
  assert.ok(fields.some((f) => f.key === 'url' && f.type === 'audio'));
  assert.ok(fields.some((f) => f.key === 'start' && f.type === 'offset'));
  const { data, issues } = cleanSection(fields, {
    song: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    url: '/uploads/inv/abc/song.mp3',
    start: '1:05',
    spotify: 'left over from before',
    autoplay: 'on',
  });
  assert.equal(issues.length, 0);
  assert.equal(data.start, 65);
  assert.equal(data.url, '/uploads/inv/abc/song.mp3');
  assert.equal(data.song, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.ok(!('spotify' in data) && !('autoplay' in data), 'the old keys are dropped');
  assert.equal(cleanSection(fields, { start: 'soon' }).data.start, null);
  assert.equal(cleanSection(fields, { start: 0 }).data.start, null);
  assert.equal(cleanSection(fields, { start: 90 }).data.start, 90);
  assert.equal(cleanSection(fields, { url: 'song.mp3' }).issues.length, 1);
});

test('the fixed writings are ours: off the client’s form, and kept through a client’s save', () => {
  const fields = fieldsFor('gallery', 'WEDDING');
  const mine = customerFields(fields).map((f) => f.key);
  assert.ok(mine.includes('photos') && mine.includes('videoUrl'));
  for (const k of ['line', 'note', 'videoTitle', 'close']) assert.ok(!mine.includes(k), k);
  const before = { line: 'Ours', note: 'Also ours', photos: [] };
  const { data } = cleanSection(fields, { photos: [{ url: 'https://x/y.jpg', caption: '' }] });
  const kept = keepStaffFields(fields, before, data);
  assert.equal(kept.line, 'Ours');
  assert.equal(kept.note, 'Also ours');
  assert.equal((kept.photos as unknown[]).length, 1);
  // the cover keeps its intro choice and photo for the client; the wording, the verse and the script line are ours
  const cover = customerFields(fieldsFor('cover', 'WEDDING')).map((f) => f.key);
  assert.ok(cover.includes('introPreset') && cover.includes('coverPhoto') && cover.includes('date'));
  for (const k of ['intro', 'verse', 'verseRef', 'interlude2']) assert.ok(!cover.includes(k), k);
  // the closing keeps the photo and the signature for the client; the thank-you and the line above the names are ours
  const closing = customerFields(fieldsFor('closing', 'WEDDING')).map((f) => f.key);
  assert.deepEqual(closing, ['photo', 'signature']);
  // and staff editing for the customer see everything
  assert.ok(fieldsFor('closing', 'WEDDING').some((f) => f.key === 'message' && f.staff));
});

test('guests are offered their occasion\'s groups until the couple writes their own', () => {
  // Nothing filled in: the standard list for the occasion, so a couple who
  // never opens the field still gets a headcount sheet worth printing.
  assert.deepEqual(guestGroups('WEDDING', undefined), GUEST_GROUP_PRESETS.WEDDING);
  assert.ok(guestGroups('WEDDING', {}).includes('Principal sponsor (Ninong / Ninang)'));
  assert.ok(guestGroups('CHRISTENING', {}).includes('Ninong / Ninang'));
  assert.ok(guestGroups('KIDS_BIRTHDAY', {}).includes('Classmate / schoolmate'));

  // Their own list replaces it whole — no merging, no leftovers.
  const own = { groups: [{ label: "Lola's side" }, { label: 'Basketball team' }] };
  assert.deepEqual(guestGroups('WEDDING', own), ["Lola's side", 'Basketball team']);

  // Blank rows are not groups, and the toggle silences the question outright.
  assert.deepEqual(guestGroups('WEDDING', { groups: [{ label: '  ' }] }), GUEST_GROUP_PRESETS.WEDDING);
  assert.deepEqual(guestGroups('WEDDING', { ...own, hideGroups: true }), []);

  // A memorial does not sort its mourners; a corporate event asks for the
  // department instead.
  assert.deepEqual(guestGroups('MEMORIAL', {}), []);
  assert.deepEqual(guestGroups('CORPORATE', {}), []);
});

// A child, a debutante and a graduate all have friends who are not their
// classmates — the kid from the next street, the friend from the old school.
test('a celebration for a young guest of honour offers their own friends, not only their class', () => {
  for (const occasion of ['KIDS_BIRTHDAY', 'COMMUNION', 'DEBUT', 'GRADUATION'] as const) {
    const groups = guestGroups(occasion, {});
    assert.ok(groups.some((g) => /classmate/i.test(g)), `${occasion} lists classmates`);
    assert.ok(
      groups.some((g) => /friend/i.test(g) && !/classmate/i.test(g) && !/family friend/i.test(g) && !/mommy|daddy/i.test(g)),
      `${occasion} also lets the guest of honour's own friends say so`,
    );
  }
});

// "Family" reads as the immediate one, so a cousin skips it. Wherever a family
// label is offered, the wider word is offered next to it.
test('a relative can say so without having to call themselves family', () => {
  for (const [occasion, groups] of Object.entries(GUEST_GROUP_PRESETS)) {
    for (const g of groups) {
      // "Family friend" is a friend of the family, not a family label.
      if (!/family/i.test(g) || /family friend/i.test(g)) continue;
      const sibling = g.replace(/family/i, (m) => (m[0] === 'F' ? 'Relative' : 'relative'));
      assert.ok(groups.includes(sibling), `${occasion}: "${g}" has no "${sibling}" beside it`);
    }
  }
});

test('every preset group is a distinct, non-empty label', () => {
  for (const [occasion, groups] of Object.entries(GUEST_GROUP_PRESETS)) {
    assert.ok(groups.length >= 3, occasion);
    assert.equal(new Set(groups).size, groups.length, occasion);
    for (const g of groups) assert.equal(g, g.trim(), occasion);
    for (const g of groups) assert.ok(g.length > 0 && g.length <= 60, `${occasion}: ${g}`);
  }
});

test('a Save the Date carries the couple and the date, and nothing that waits for the invitation', () => {
  for (const o of OCCASION_KEYS) {
    const keys = sectionsFor(o, true).map((d) => d.key);
    // A memorial has no countdown to the day and is not announced in advance;
    // saveTheDateOffered keeps the card off it. Every other occasion gets both.
    assert.deepEqual(keys, o === 'MEMORIAL' ? ['cover'] : ['cover', 'countdown'], o);

    // What it must not carry: anything a couple months out cannot answer, and
    // anything that would collect replies against the wrong card.
    for (const key of ['rsvp', 'gift', 'entourage', 'gallery', 'program', 'guestbook'] as SectionKey[]) {
      assert.equal(sectionOnCard(key, o, true), false, `${o}: ${key} is not on a Save the Date`);
    }
    // And the ordinary invitation is untouched by any of it.
    assert.deepEqual(sectionsFor(o).map((d) => d.key), OCCASION_SECTIONS[o].filter((k) => sectionOffered(k)), o);
    assert.equal(sectionOnCard('rsvp', o, false), true, o);
  }
});

test('sectionOnCard still refuses a section the occasion never had', () => {
  // KIDS_BIRTHDAY has no entourage, on either kind of card.
  assert.equal(OCCASION_SECTIONS.KIDS_BIRTHDAY.includes('entourage'), false);
  assert.equal(sectionOnCard('entourage', 'KIDS_BIRTHDAY', false), false);
  assert.equal(sectionOnCard('entourage', 'KIDS_BIRTHDAY', true), false);
  // And every key a Save the Date carries is one the occasion has — on every
  // occasion the card is actually offered on.
  for (const o of OCCASION_KEYS.filter(saveTheDateOffered)) {
    for (const k of SAVE_THE_DATE_SECTIONS) assert.ok(OCCASION_SECTIONS[o].includes(k), `${o}: ${k}`);
  }
});

test('the one gathering nobody announces in advance is not sold a Save the Date', () => {
  assert.equal(saveTheDateOffered('MEMORIAL'), false);
  assert.equal(addOnAvailable('SAVE_THE_DATE', 'BASIC', 'MEMORIAL'), false);
  for (const o of OCCASION_KEYS.filter((k) => k !== 'MEMORIAL')) {
    assert.equal(saveTheDateOffered(o), true, o);
    assert.equal(addOnAvailable('SAVE_THE_DATE', 'BASIC', o), true, o);
  }
  // Asked without an occasion — the landing page's catalogue — it still lists.
  assert.equal(addOnAvailable('SAVE_THE_DATE', 'BASIC'), true);
});

test('a Save the Date cover drops the opening controls, and an ordinary one keeps them', () => {
  const keys = (std: boolean) => fieldsFor('cover', 'WEDDING', 'COMPLETE', std).map((f) => f.key);
  for (const k of ['opening', 'openingLine', 'openingLine2']) {
    assert.ok(keys(false).includes(k), `an invitation still offers ${k}`);
    assert.equal(keys(true).includes(k), false, `a Save the Date does not offer ${k}`);
  }
  // Everything else about the cover is untouched: same fields, same order.
  assert.deepEqual(keys(true), keys(false).filter((k) => !['opening', 'openingLine', 'openingLine2'].includes(k)));
  // And only the cover is filtered — the countdown has no opening to lose.
  assert.deepEqual(fieldsFor('countdown', 'WEDDING', 'COMPLETE', true), fieldsFor('countdown', 'WEDDING', 'COMPLETE'));
});

test('the cover offers five ways the photo sits, the veil first', async () => {
  const { fieldsFor, PHOTO_STYLES } = await import('../src/lib/sections');
  const f = fieldsFor('cover', 'WEDDING', 'COMPLETE').find((x) => x.key === 'photoStyle');
  assert.ok(f && f.type === 'select');
  assert.deepEqual(f!.options!.map((o) => o.value), ['veil', 'arch', 'oval', 'round', 'card']);
  assert.equal(PHOTO_STYLES[0].value, 'veil');
});
