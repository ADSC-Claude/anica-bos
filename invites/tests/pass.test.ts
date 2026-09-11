import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PASS_COPY, PASS_LOOKS, passIntro, passSubject, passDetails, arrivalLine, arrivedLinks } from '../src/lib/pass';
import { fieldsFor, sectionAlwaysShows } from '../src/lib/sections';
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

test('somebody already through the door is welcomed, then told so', () => {
  // The welcome is the same line in every state — it is their name, and it is
  // what the brief asked for. What changes underneath it is whether they are
  // still being asked to do something.
  const inside = arrivalLine('Maria Santos', true, false);
  assert.equal(inside.title, 'Welcome, Maria Santos.');
  assert.match(inside.body, /checked in, Maria\b/, 'it does not say they are in');
  assert.doesNotMatch(inside.body, /show this|scan/i, 'it still asks them to check in');
});

test('the day opens up only as far as the package goes', () => {
  // Each of these is something the couple either bought or did not, and a pass
  // offering a shared album to an invitation without one is an advertisement
  // in somebody's pocket at a wedding.
  const all = { table: 'Table 7', seating: true, guestbook: true, programme: true, photos: true };
  assert.deepEqual(arrivedLinks('https://x.test/a', all).map((l) => l.note), ['Your table', 'The programme', 'Guestbook', 'Shared album']);
  assert.deepEqual(arrivedLinks('https://x.test/a', { ...all, guestbook: false, photos: false }).map((l) => l.note), ['Your table', 'The programme']);
  assert.deepEqual(arrivedLinks('https://x.test/a', { table: '', seating: false, guestbook: false, programme: false, photos: false }), []);
});

test('a seat needs both the feature and an actual table', () => {
  // An invitation may carry seating and have set no tables at all.
  assert.deepEqual(arrivedLinks('https://x.test/a', { table: '', seating: true, guestbook: false, programme: false, photos: false }), []);
  assert.deepEqual(arrivedLinks('https://x.test/a', { table: 'Table 7', seating: false, guestbook: false, programme: false, photos: false }), []);
});



test('the table is not said twice once they are through the door', () => {
  // The links already carry it, and carry it as somewhere to go.
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.match(pass, /spoken\.has\(d\.value\)/, 'a detail row repeats what the links already say');
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


test('a detail row has no fixed column to clip its value in', () => {
  // The same shape of bug as the pass code: a fixed width inside a sheet that
  // has to fit a phone. It left "Table 7" wrapping to "Tabl / 7" on the
  // narrower looks.
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.pass-detail {'), css.indexOf('.pass-foot'));
  assert.doesNotMatch(block, /grid-template-columns:[^;]*rem/, 'the label column is a fixed width again');
});



test('the check-in section asks how it looks once, not twice', () => {
  // A "look" and a separate "behind the code itself" asked the same question
  // and could contradict each other.
  const keys = fieldsFor('checkin', 'WEDDING', 'LUXURY', false).map((f) => f.key);
  assert.deepEqual(keys, ['look', 'photo', 'note']);
});

test('an empty check-in section is never said to remove anything', () => {
  // The warning the builder shows on an empty section — "will not appear on
  // your invitation at all" — is false twice over here: the pass is not on the
  // invitation, and it exists because the package does. Blank means defaults.
  assert.equal(sectionAlwaysShows('checkin'), true);
});

test('the phone beside the check-in form shows the pass, not the invitation', () => {
  const builderPage = readFileSync(new URL('../src/app/account/invitations/[id]/builder/page.tsx', import.meta.url), 'utf8');
  assert.match(builderPage, /current === 'checkin'/, 'the builder never asks for a sample guest');
  assert.match(builderPage, /invitationPath\(inv\.slug, sample\.token\)\}\/pass/, 'the preview does not point at a pass');
  assert.match(builderPage, /previewPath=\{previewPath\}/, 'the preview path is never handed to the builder');
  const builder = readFileSync(new URL('../src/components/builder/builder.tsx', import.meta.url), 'utf8');
  // One source for the src, or the two devices and the new-tab link drift.
  assert.equal((builder.match(/previewSrc/g) ?? []).length, 4);
});




test('none of the day is offered before the scan, in any of the fronts', () => {
  // The front of the pass has one job: be the thing that gets held up. A
  // guestbook and an album offered to somebody in a queue is a screen that
  // gets read instead of held up — checked on the one block all three fronts
  // share rather than on any of their layouts.
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.equal((pass.match(/pass-links/g) ?? []).length, 1, 'the arrived panel is drawn in more than one place');
  assert.equal((pass.match(/pass-arrived/g) ?? []).length, 1);
  assert.equal((pass.match(/pass-details/g) ?? []).length, 1, 'the details are drawn in more than one place');
  // The three fronts share one body, and that body is the only way in.
  assert.match(pass, /const body = guest\.checkedIn \? arrived : <>\{codeBlock\}\{foot\}<\/>;/, 'a front reaches the arrived panel its own way');
  // `arrived` is declared once and referenced once — by `body`, behind the
  // check. A front rendering it directly would show up as a third use.
  const uses = [...pass.matchAll(/(?<![-\w])arrived\b(?!Links)/g)];
  assert.equal(uses.length, 2, `${uses.length} uses of the arrived panel; there is one declaration and one use`);
  assert.equal((pass.match(/\{body\}/g) ?? []).length, 3, 'the three fronts do not all render the shared body');
  // And the code block carries the code and its two lines, nothing more.
  const block = pass.slice(pass.indexOf('const codeBlock = ('), pass.indexOf('const arrived = ('));
  assert.doesNotMatch(block, /pass-details|pass-detail\b|pass-links/, 'the day is back on the front of the pass');
});

test('the table is not said twice once they are through the door', () => {
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.match(pass, /spoken\.has\(d\.value\)/, 'a detail row repeats what the links already say');
});

test('all three fronts are rendered, and one code block serves them', () => {
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.equal((pass.match(/const codeBlock = \(/g) ?? []).length, 1, 'a front draws its own code');
  for (const look of ['photo', 'arch', 'ground']) {
    assert.match(pass, new RegExp(`data-look="${look}"`), `${look} is not rendered`);
  }
});

test('a front that wants a photograph and has none falls back rather than breaking', () => {
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.match(pass, /wanted !== 'ground' && !photo \? 'ground' : wanted/, 'a front would draw an empty rectangle');
});

test('the photograph is never washed out, darkened or written over', () => {
  /*
   * This is the whole rule. A veil, a scrim or a blur over the picture is the
   * couple's photograph spent on a problem a piece of paper solves: the code
   * and the words sit on the invitation's own surface, and the picture is the
   * ground behind that. An earlier pass washed the photograph almost away
   * under the code and put a near-black bar across the top for the names.
   */
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.pass {'), css.indexOf('.inv-pass {'));
  for (const gone of ['backdrop-filter', 'pass-bloom', 'pass-shade', '--inv-veil', 'radial-gradient']) {
    assert.ok(!block.includes(gone), `${gone} is back over the photograph`);
  }
  // The picture itself is untouched: no filter, no dimming, no overlay. (A
  // shadow *under* the sheet is not a scrim over the picture, which is why
  // this looks at .pass-picture rather than banning rgba across the block.)
  const pic = block.slice(block.indexOf('.pass-picture {'), block.indexOf('.pass-sheet {'));
  for (const gone of ['filter', 'opacity', 'linear-gradient']) {
    assert.ok(!pic.includes(gone), `the photograph is ${gone}-ed`);
  }
  assert.doesNotMatch(block, /\.pass-picture::(before|after)/, 'something is laid over the photograph');
  // And the code takes the palette on paper, never the on-photo treatment.
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.match(pass, /\.pass-picture|pass-picture/, 'nothing carries the photograph');
});

test('the code shrinks to the phone it is on', () => {
  // It is drawn at a fixed 232px. Without this rule the column is sized by
  // that SVG and overflows a narrow phone.
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.pass {'), css.indexOf('.inv-pass {'));
  assert.match(block, /\.pass-code-art svg \{[^}]*width: 100%/, 'the code cannot shrink');
  assert.match(block, /\.pass-code \{[^}]*min-width: 0/, 'the code’s column cannot shrink below its widest child');
});

test('the picture is contained by the pass rather than fixed to the window', () => {
  // A fixed child leaves the sheet behind wherever the pass is embedded — the
  // builder's preview phone, for one.
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.pass-picture {'), css.indexOf('.pass-sheet {'));
  assert.match(block, /position: absolute/);
  assert.doesNotMatch(block, /position: fixed/);
});

test('the picker offers the three fronts, each drawn and explained', () => {
  const look = fieldsFor('checkin', 'WEDDING', 'LUXURY', false).find((f) => f.key === 'look');
  assert.ok(look, 'the check-in section has no look picker');
  const options = look.options ?? [];
  assert.equal(options.length, 3);
  assert.equal(options.length, PASS_LOOKS.length);
  assert.ok(options.some((o) => o.value === ''), 'no option holds the blank value, so a phantom tile appears');
  assert.equal(options.find((o) => o.value === '')?.label, 'Card on your photo');
  for (const o of options) {
    assert.ok(o.hint && o.hint.length > 12, `${o.label} has no note under it`);
    assert.match(o.art ?? '', /^pass-(photo|arch|ground)$/, `${o.label} would borrow another field's drawing`);
  }
  assert.deepEqual(options.map((o) => o.art), PASS_LOOKS.map((l) => `pass-${l.value}`));
});

test('the check-in section asks how it looks once, not twice', () => {
  const keys = fieldsFor('checkin', 'WEDDING', 'LUXURY', false).map((f) => f.key);
  assert.deepEqual(keys, ['look', 'photo', 'note']);
});

test('the pass is a printed card, not a white box with type in the middle', () => {
  /*
   * It was exactly that, three times over, with the photograph moved around —
   * one undesigned rectangle presented as three fronts. These are the marks
   * that make it stationery, and every front gets all of them: an engraved
   * rule held in from the paper's edge, a ruled monogram, the short rule under
   * the names, a caption set between hairlines, and the code on a plate rather
   * than dropped in as a black square.
   */
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.pass {'), css.indexOf('.inv-pass {'));
  for (const mark of ['.pass-sheet::before', '.pass-monogram', '.pass-rule', '.pass-cta::before', '.pass-plate', '.pass-plate::before']) {
    assert.ok(block.includes(mark), `${mark} is gone — the card is a plain box again`);
  }
  // They are on the shared head and code block, so no front can miss them.
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.equal((pass.match(/const head: ReactNode = \(/g) ?? []).length, 1);
  assert.equal((pass.match(/\{head\}/g) ?? []).length, 3, 'a front draws its own head');
});

test('the front says whose pass it is', () => {
  // It is one named person's screen and the line a coordinator reads before
  // they scan, and the front did not carry it at all.
  const pass = readFileSync(new URL('../src/components/invite/pass.tsx', import.meta.url), 'utf8');
  assert.match(pass, /className="pass-for">for <em>\{greeting\}<\/em>/, 'the guest’s own name is not on the front');
});
