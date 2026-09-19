/**
 * A page a family decided against, and the run-down before they publish.
 *
 * "there should be on and off the page for them if they didnt want to answer
 * it, so lets just say its a decision for them to hide it, then if they dont
 * turn it off and they just dont fill it, we will just assume it to be hidden
 * first while they havent fill it out. also everytime a customer publish
 * something, we will give them a run down of what they filled out and what
 * not, if they wish to continue publishing it without those or if its
 * complete for them, then let them publish it."
 *
 * Two different questions, and the switch only answers the second. A part
 * left blank is hidden already and needs nobody's permission; this is the
 * part they *have* filled in and would rather not show, which nothing else
 * could express. So it is a hide, off by default: a customer who never
 * touches it gets exactly the invitation they had before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldsFor, customerFields, hideable, sectionHidden, sectionFilled, answered, blankSections, filledSections, offSections, sectionOrder, OCCASION_SECTIONS, type Content } from '../src/lib/sections';

test('every part a family may leave out carries the switch, and the rest do not', () => {
  for (const key of OCCASION_SECTIONS.CHRISTENING) {
    const has = customerFields(fieldsFor(key, 'CHRISTENING')).some((f) => f.key === 'hide');
    assert.equal(has, hideable(key), `${key}: ${has ? 'has' : 'has no'} switch`);
  }
  // who, when, where, the countdown and the reply are the invitation
  for (const always of ['cover', 'countdown', 'ceremony', 'reception', 'rsvp'] as const) assert.equal(hideable(always), false, always);
  // the song, the pass and the spare files have no page of their own to hide
  for (const none of ['music', 'checkin', 'extras'] as const) assert.equal(hideable(none), false, none);
  // and the guest wall and the album already carry their own switch
  for (const own of ['guestbook', 'photos'] as const) assert.equal(hideable(own), false, own);
  // the ones she named as pages she wants to be able to turn off
  for (const yes of ['story', 'gallery', 'dressCode', 'gift', 'faq', 'social', 'program', 'sponsors', 'closing'] as const) assert.equal(hideable(yes), true, yes);
});

test('switching a part off is not an answer in it', () => {
  const fields = fieldsFor('story', 'CHRISTENING');
  assert.equal(sectionFilled('story', 'CHRISTENING', { hide: true }), false, 'it is still an empty part');
  assert.equal(answered(fields, { hide: true }), false, 'and the done tick is not fooled by it');
  assert.equal(answered(fields, { hide: true, timeline: [{ title: 'The day we knew' }] }), true);
  assert.equal(sectionHidden({ hide: true }), true);
  assert.equal(sectionHidden({ hide: false }), false);
  assert.equal(sectionHidden({}), false, 'untouched is shown, as it always was');
  assert.equal(sectionHidden(undefined), false);
});

test('the run-down is what is filled, what is off and what is still empty', () => {
  const content: Content = {
    cover: { childFull: 'Amara Sofia', date: '2026-10-03' },
    story: { timeline: [{ title: 'The day we knew', text: 'Two lines.' }] },
    dressCode: { motif: '#a8bb96', hide: true },
    gift: {},
  };
  const filled = filledSections('CHRISTENING', content, 'LUXURY');
  const off = offSections('CHRISTENING', content, 'LUXURY');
  const blank = blankSections('CHRISTENING', content, 'LUXURY');
  assert.ok(filled.includes('cover') && filled.includes('story'));
  assert.deepEqual(off, ['dressCode']);
  assert.ok(blank.includes('gift'), 'an empty part is a gap to name');
  // a part they switched off is in none of the other two: they decided, and a
  // run-down that nags about it is asking them to decide twice
  assert.ok(!blank.includes('dressCode'));
  assert.ok(!filled.includes('dressCode'));
  // a part switched off and filled in is still off, and still not a gap
  const both: Content = { ...content, dressCode: { motif: '#a8bb96', hide: true } };
  assert.ok(!blankSections('CHRISTENING', both, 'LUXURY').includes('dressCode'));
  assert.ok(!filledSections('CHRISTENING', both, 'LUXURY').includes('dressCode'));
});

/**
 * "guestbook and post event should be after the social which is the hashtag."
 *
 * They already were, in the reading order — but a part the design draws no
 * page for was appended after the document's last page, which put the guest
 * wall and the shared album after "See you there".
 */
test('the guest wall and the shared album read after the hashtag', () => {
  // (sectionOrder is imported at the top)
  const order = sectionOrder('CHRISTENING', 'christening');
  assert.ok(order.indexOf('guestbook') > order.indexOf('social'));
  assert.ok(order.indexOf('photos') > order.indexOf('guestbook'));
  assert.ok(order.indexOf('closing') > order.indexOf('photos'), 'and the ending is last');
});
