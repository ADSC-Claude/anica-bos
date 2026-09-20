/**
 * Somebody to tell when the answer changes.
 *
 * "lets add a text below the rsvp form, a contact number, its either the
 * couple/celebrants contact or the coordinator of the event is listed by the
 * creator of the invitation for future changes like they can no longer attend."
 *
 * The RSVP form is a one-way door: it takes an answer and closes over it. A
 * guest whose plans change a fortnight later has nowhere on the page to say
 * so, and the family finds out by laying a seat for them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { t, type Lang } from '../src/lib/copy';
import { fieldsFor, FIT } from '../src/lib/sections';

const rsvp = () => fieldsFor('rsvp', 'CHRISTENING');

test('the family says who guests may text, not just a bare number', () => {
  const who = rsvp().find((f) => f.key === 'contactName');
  const num = rsvp().find((f) => f.key === 'contactPhone');
  assert.ok(who, 'the RSVP step asks whose number it is');
  assert.ok(num, 'and for the number');
  assert.equal(who!.type, 'text');
  assert.ok(!who!.staff, 'the family fills this in, not us');
  // A name and a role on one centred line, not a sentence.
  assert.ok((FIT['rsvp.contactName'] ?? 0) <= 48, 'it shares a line with the number');
});

/**
 * The number is a tappable sms: link, so the renderer splits the sentence on
 * `{number}` and puts an anchor in the gap. A translation that drops the
 * placeholder would lose the number off the page entirely — silently, since
 * the rest of the sentence still reads.
 */
test('both languages keep a place for the number to be tapped', () => {
  for (const lang of ['en', 'tl'] as const) {
    for (const key of ['rsvp.textWho', 'rsvp.textOnly'] as const) {
      const line = t(lang, key, { who: 'Tita Ana' });
      assert.ok(line.includes('{number}'), `${lang} ${key} leaves the number a place`);
      assert.equal(line.split('{number}').length, 2, 'exactly one place');
    }
  }
});

test('the line says the thing the form cannot: tell them if this changes', () => {
  for (const lang of ['en', 'tl'] as const) {
    for (const key of ['rsvp.textWho', 'rsvp.textOnly'] as const) {
      const line = t(lang, key, { who: 'Tita Ana' });
      assert.match(line, lang === 'en' ? /plans change/i : /magbago/i,
        `${lang} ${key} invites a guest back when their plans change`);
    }
  }
});

test('a name, when there is one, is who the guest is texting', () => {
  const withWho = t('en', 'rsvp.textWho', { who: 'Tita Ana, our coordinator' });
  assert.match(withWho, /Tita Ana, our coordinator/);
  // And without one the sentence still stands on its own: a family that wants
  // only the digits shown gets a line, not a gap where a name should be.
  const bare = t('en', 'rsvp.textOnly');
  assert.ok(!bare.includes('{who}'), 'no empty placeholder left behind');
  assert.ok(!bare.includes('  '), 'and no double space where the name was');
});
