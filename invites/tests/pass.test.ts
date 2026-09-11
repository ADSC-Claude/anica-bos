import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PASS_COPY, passIntro, passSubject, passDetails, arrivalLine } from '../src/lib/pass';
import type { Occasion } from '@prisma/client';

const OCCASIONS: Occasion[] = ['WEDDING', 'DEBUT', 'CHRISTENING', 'KIDS_BIRTHDAY', 'MILESTONE_BIRTHDAY', 'BABY_SHOWER', 'ANNIVERSARY', 'ENGAGEMENT', 'GRADUATION', 'COMMUNION', 'CORPORATE', 'HOUSEWARMING', 'REUNION', 'MEMORIAL'];
const page = readFileSync(new URL('../src/app/[slug]/[token]/pass/page.tsx', import.meta.url), 'utf8');
const nobody = { table: null, groupName: '' };

test('every occasion has its own words, and none of them is a placeholder', () => {
  // A pass that says "Welcome to the Event of" is worse than no pass.
  for (const o of OCCASIONS) {
    const c = PASS_COPY[o];
    assert.ok(c, `${o} has no pass copy`);
    for (const [k, v] of Object.entries(c)) {
      assert.ok(v.trim().length > 3, `${o}.${k} is empty`);
      assert.doesNotMatch(v, /\bTODO\b|\bEvent\b|\{/, `${o}.${k} reads as a placeholder: ${v}`);
    }
  }
});

test('a memorial is not welcomed, congratulated or exclaimed at', () => {
  // The same mechanism as a birthday and none of the same register.
  const m = PASS_COPY.MEMORIAL;
  assert.doesNotMatch(`${m.intro} ${m.note} ${m.cta}`, /welcome|excited|celebrat|!/i);
  assert.match(m.intro, /memory/i);
});

test('nobody is told to scan their own pass, because the desk does the scanning', () => {
  // The rule the arrival count rests on: a code a guest can scan is a code a
  // guest can scan from home, a week early.
  for (const o of OCCASIONS) {
    assert.doesNotMatch(PASS_COPY[o].note, /\bscan (this|it|your)\b/i, `${o} asks the guest to scan`);
  }
  assert.match(arrivalLine('Maria Santos', false, false).body, /show this/i);
});

test('the anniversary counts its years, and falls back when it does not know', () => {
  assert.equal(passIntro('ANNIVERSARY', { cover: { years: 25 } }), 'Celebrating 25 Years of Love');
  assert.equal(passIntro('ANNIVERSARY', {}), 'Celebrating');
  assert.equal(passIntro('WEDDING', { cover: { years: 25 } }), 'Welcome to the Wedding of');
});

test('the table comes first wherever there is one', () => {
  // It is the question the whole pass exists to answer.
  const d = passDetails('WEDDING', { social: { hashtag: '#LizaAndMark' } }, { table: { name: 'Table 7' }, groupName: '' });
  assert.equal(d[0].label, 'Table');
  assert.equal(d[0].value, 'Table 7');
});

test('each occasion asks for its own details, and never invents one', () => {
  // Everything drawn here already lives on the invitation. A couple who filled
  // theirs in has filled this in, and a blank is simply left out.
  const wedding = passDetails('WEDDING', { social: { hashtag: '#LizaAndMark' }, gift: { registry: [{ label: 'Rustan’s' }] } }, nobody);
  assert.deepEqual(wedding, [{ label: 'Hashtag', value: '#LizaAndMark' }, { label: 'Registry', value: 'Rustan’s' }]);

  const birthday = passDetails('KIDS_BIRTHDAY', { cover: { theme: 'Princess Garden Party' }, program: { items: [{ time: '15:00', title: 'Games' }] } }, nobody);
  assert.deepEqual(birthday, [{ label: 'Theme', value: 'Princess Garden Party' }, { label: 'Programme starts', value: '3:00 PM' }]);

  const christening = passDetails('CHRISTENING', { reception: { venue: 'Casa Marcos' }, sponsors: { ninongs: [{ name: 'Ninong Fred' }], ninangs: [{ name: 'Ninang Let' }] } }, nobody);
  assert.deepEqual(christening, [{ label: 'Reception', value: 'Casa Marcos' }, { label: 'Godparents', value: 'Ninong Fred and Ninang Let' }]);

  const debut = passDetails('DEBUT', { eighteen: { roses: [{ name: 'a' }, { name: 'b' }], candles: [{ name: 'c' }] } }, nobody);
  assert.deepEqual(debut, [{ label: '18 Roses', value: '2 named' }, { label: '18 Candles', value: '1 named' }]);

  const corporate = passDetails('CORPORATE', { program: { items: [{ time: '09:00', title: 'Keynote' }] } }, { table: null, groupName: 'Track B' });
  assert.deepEqual(corporate, [{ label: 'Session', value: 'Track B' }, { label: 'Programme starts', value: '9:00 AM' }, { label: 'Badge', value: 'Printed at registration' }]);
});

test('an empty invitation produces an empty list rather than empty rows', () => {
  for (const o of OCCASIONS) {
    for (const d of passDetails(o, {}, nobody)) {
      assert.ok(d.value.trim(), `${o} drew a ${d.label} row with nothing in it`);
    }
  }
  assert.deepEqual(passDetails('WEDDING', {}, nobody), []);
});

test('a long list of godparents is named, then counted', () => {
  const many = { sponsors: { ninongs: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], ninangs: [{ name: 'D' }] } };
  assert.equal(passDetails('CHRISTENING', many, nobody)[0].value, 'A, B and 2 others');
  const three = { sponsors: { ninongs: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] } };
  assert.equal(passDetails('CHRISTENING', three, nobody)[0].value, 'A, B and 1 other');
});

test('the door greets somebody who declined and came anyway', () => {
  // It happens, and arguing with them in a doorway is not the job.
  const declined = arrivalLine('Tita Baby', false, true);
  assert.match(declined.title, /Welcome, Tita Baby/);
  assert.match(declined.body, /could not make it/i);
  assert.doesNotMatch(declined.body, /error|invalid|not allowed/i);
});

test('somebody already through the door is told so, by their first name', () => {
  const inside = arrivalLine('Maria Santos', true, false);
  assert.match(inside.title, /^You are checked in, Maria\./);
  assert.doesNotMatch(inside.body, /show this at the door/i, 'it still asks them to check in');
});

test('the pass is behind the same door as the invitation, and behind check-in', () => {
  assert.match(page, /if \(locked\) return <PasswordGate/, 'a password on the invitation does not cover the pass');
  assert.match(page, /if \(!guest\) notFound\(\)/, 'the pass opens without a guest');
  assert.match(page, /entitled\(invitation, 'checkin'\)/, 'a pass is offered for an event with no door desk');
  assert.match(page, /robots: \{ index: false, follow: false \}/, 'one guest’s pass is indexable');
});

test('the intro and the name never say the occasion twice', () => {
  // "Welcome to the Christening of" over "Baby Noah's Christening" is the sort
  // of thing nobody notices in a spec and everybody notices on a card.
  const christening = { cover: { childNick: 'Baby Noah James' } };
  assert.equal(passSubject('CHRISTENING', christening, "Baby Noah James's Christening"), 'Baby Noah James');
  assert.equal(passSubject('COMMUNION', christening, "Baby Noah James's First Communion"), 'Baby Noah James');
  for (const o of OCCASIONS) {
    const intro = PASS_COPY[o].intro.toLowerCase();
    const name = passSubject(o, christening, 'A Name').toLowerCase();
    for (const word of ['christening', 'communion', 'wedding', 'engagement', 'graduation']) {
      assert.ok(!(intro.includes(word) && name.includes(word)), `${o} says "${word}" in both lines`);
    }
  }
});

test('an occasion whose intro names nothing keeps the invitation’s own title', () => {
  // "Welcome to" over "Sophia's 7th Birthday" is right, and must stay.
  assert.equal(passSubject('KIDS_BIRTHDAY', {}, "Sophia's 7th Birthday"), "Sophia's 7th Birthday");
  assert.equal(passSubject('DEBUT', {}, 'Bella at Eighteen'), 'Bella at Eighteen');
  assert.equal(passSubject('CORPORATE', {}, 'Annual Sales Summit 2026'), 'Annual Sales Summit 2026');
  assert.equal(passSubject('WEDDING', {}, 'Isabella & Miguel'), 'Isabella & Miguel');
});

test('a missing name falls back rather than leaving the card blank', () => {
  assert.equal(passSubject('CHRISTENING', {}, "Baby's Christening"), "Baby's Christening");
});

test('the code shrinks to the phone it is on', () => {
  // It is drawn at a fixed 232px. Without these two rules the grid column is
  // sized by that SVG, overflows a narrow phone, and .pass-code's
  // overflow:hidden clips the caption with it — "SCAN TO CHE".
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.pass {'), css.indexOf('.inv-btn {'));
  assert.match(block, /\.pass-code-art svg \{[^}]*width: 100%/, 'the code cannot shrink');
  assert.match(block, /\.pass-code-body \{[^}]*min-width: 0/, 'the code’s column cannot shrink below its widest child');
});
