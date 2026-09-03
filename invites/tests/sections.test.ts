import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OCCASION_SECTIONS, sectionsFor, fieldsFor, defaultContent, cleanSection, publishProblems, displayTitle, eventInstant, sectionUnlocked, sectionMinTier, sectionFilled, emptySection, type SectionKey } from '../src/lib/sections';
import { OCCASION_KEYS } from '../src/lib/occasions';

test('every occasion has a cover, an RSVP and a closing, and every section it lists is defined', () => {
  for (const o of OCCASION_KEYS) {
    const keys = OCCASION_SECTIONS[o];
    assert.ok(keys.includes('cover'), o);
    assert.ok(keys.includes('rsvp'), o);
    assert.ok(keys.includes('closing'), o);
    assert.equal(sectionsFor(o).length, keys.length);
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

test('colours must be hex and at most five', () => {
  const fields = fieldsFor('dressCode', 'WEDDING');
  const { data } = cleanSection(fields, { colors: ['#5b6b4e', 'red', '#C9B48A', '#1', '#000000', '#111111', '#222222', '#333333'] });
  assert.deepEqual(data.colors, ['#5b6b4e', '#C9B48A', '#000000', '#111111', '#222222']);
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
