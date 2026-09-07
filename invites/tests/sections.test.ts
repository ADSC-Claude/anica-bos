import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OCCASION_SECTIONS, sectionsFor, sectionOffered, fieldsFor, defaultContent, cleanSection, publishProblems, displayTitle, eventInstant, sectionUnlocked, sectionMinTier, sectionFilled, emptySection, type SectionKey } from '../src/lib/sections';
import { OCCASION_KEYS } from '../src/lib/occasions';

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
  const { data } = cleanSection(wedding, { gentsItems: ['dressShoes', 'tuxedo', 'suit', 'suit', 'nonsense'], avoid: ['prints', 'white'] });
  assert.deepEqual(data.gentsItems, ['suit', 'dressShoes'], 'the tuxedo is not on the wedding list; the order is the list\'s');
  assert.deepEqual(data.avoid, ['white', 'prints']);
  const avoid = wedding.find((f) => f.key === 'avoid')!;
  assert.ok(avoid.options!.some((o) => o.value === 'white' && /bride/.test(o.label)), 'white is asked for the bride at a wedding');
  const kids = fieldsFor('dressCode', 'KIDS_BIRTHDAY').find((f) => f.key === 'gentsItems')!;
  assert.ok(kids.options!.some((o) => o.value === 'themed') && !kids.options!.some((o) => o.value === 'suit'));
  const fresh = defaultContent('WEDDING').dressCode!;
  assert.equal(fresh.attire, 'formal');
  assert.ok((fresh.gentsItems as string[]).includes('suit') && (fresh.avoid as string[]).includes('white'));
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
  // the rows share one height: the smaller of what either affords, capped
  const gown = { id: 'g', group: 'ladies' as const, kind: 'long', w: 40, h: 100 };
  const wide = { id: 'w', group: 'girls' as const, kind: 'girl', w: 100, h: 100 };
  assert.equal(figureHeight([gown, gown, gown, gown], [gown, gown]), 38);
  assert.ok(Math.abs(figureHeight([wide, wide, wide, wide, wide], [gown]) - (100 - 8) / 5) < 1e-9);
});
