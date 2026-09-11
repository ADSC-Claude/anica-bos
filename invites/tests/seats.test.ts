import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatsHeld, replyState, headsArrived, arrivalLabel } from '../src/lib/seats';

test('a guest holds what they confirmed, or what was set aside until they say', () => {
  // Nobody has answered: the couple's allotment is the number to plan against.
  assert.equal(seatsHeld(2, null), 2);
  assert.equal(seatsHeld(2, undefined), 2);
  assert.equal(seatsHeld(1, null), 1);

  // They answered: what they confirmed, which may be fewer than offered.
  assert.equal(seatsHeld(3, { response: 'ACCEPT', seats: 1 }), 1, 'two places released');
  assert.equal(seatsHeld(3, { response: 'ACCEPT', seats: 3 }), 3);
  // A plus-one is allowed past the allotment, and the cap is enforced when the
  // reply is written, not here — so a bigger confirmed number is honoured.
  assert.equal(seatsHeld(2, { response: 'ACCEPT', seats: 3 }), 3, 'a plus-one came');

  // The case that was wrong in two places: a decline is not "no reply yet".
  assert.equal(seatsHeld(4, { response: 'DECLINE', seats: 0 }), 0, 'a regret frees the whole table');
  assert.equal(seatsHeld(4, { response: 'DECLINE', seats: 4 }), 0, 'even if a stale count rode along');
});

test('seats never go negative, whatever the row says', () => {
  assert.equal(seatsHeld(-1, null), 0);
  assert.equal(seatsHeld(2, { response: 'ACCEPT', seats: -5 }), 0);
});

test('the door can tell a decline from a silence', () => {
  assert.equal(replyState(null), 'waiting');
  assert.equal(replyState(undefined), 'waiting');
  assert.equal(replyState({ response: 'ACCEPT', seats: 2 }), 'accepted');
  assert.equal(replyState({ response: 'DECLINE', seats: 0 }), 'declined');
});

// The two rules agree with each other: only an acceptance holds seats, and only
// an acceptance is silent on the desk. A future edit that lets a declined guest
// hold a seat, or that stops the desk marking them, fails here.
test('holding seats and being counted as coming are the same question', () => {
  const replies = [null, { response: 'ACCEPT' as const, seats: 2 }, { response: 'DECLINE' as const, seats: 0 }];
  for (const reply of replies) {
    const state = replyState(reply);
    const held = seatsHeld(2, reply);
    assert.equal(held > 0, state !== 'declined', `${state} holds ${held}`);
  }
});

test('an arrival with no headcount is the whole party', () => {
  // Every check-in recorded before the stepper existed has arrivedCount null,
  // and the system believed at the time that the whole confirmed party walked
  // in. Reading null as that belief is what makes the column safe to add to a
  // list already half checked in.
  assert.equal(headsArrived(4, { checkedIn: true, arrivedCount: null }), 4);
  assert.equal(headsArrived(1, { checkedIn: true, arrivedCount: null }), 1);
});

test('nobody who has not been let in counts as arrived', () => {
  assert.equal(headsArrived(4, { checkedIn: false, arrivedCount: null }), 0);
  assert.equal(headsArrived(4, null), 0);
  assert.equal(headsArrived(4, undefined), 0);
  // Not even a number left behind by an Undo, which should not happen — checkIn
  // clears it — but a stale count outranking "they are not here" is the exact
  // shape of the bug this column exists to fix.
  assert.equal(headsArrived(4, { checkedIn: false, arrivedCount: 3 }), 0);
});

test('the door’s number wins over what was confirmed, in both directions', () => {
  // The case that started this: a party of four with one who stayed home.
  assert.equal(headsArrived(4, { checkedIn: true, arrivedCount: 3 }), 3);
  assert.equal(headsArrived(4, { checkedIn: true, arrivedCount: 0 }), 0);
  // And the other one. A table of two that turns up with a cousin is an
  // ordinary Filipino reception; a desk that cannot write down three people
  // standing in front of it is the same bug pointing the other way.
  assert.equal(headsArrived(2, { checkedIn: true, arrivedCount: 3 }), 3);
  assert.equal(headsArrived(-1, { checkedIn: true, arrivedCount: -2 }), 0, 'never negative');
});

test('a party that declined and came anyway is counted, not the seats it released', () => {
  // seatsHeld is 0 for a decline, so the scan defaults them to nobody — and the
  // desk has to be able to say two of them turned up regardless.
  const held = seatsHeld(4, { response: 'DECLINE', seats: 0 });
  assert.equal(held, 0);
  assert.equal(headsArrived(held, { checkedIn: true, arrivedCount: null }), 0, 'the default claims nobody');
  assert.equal(headsArrived(held, { checkedIn: true, arrivedCount: 2 }), 2, 'and the door can still count them');
});

test('the stepper stops saying "of" once it stops being a fraction', () => {
  assert.equal(arrivalLabel(4, 3), '3 of 4');
  assert.equal(arrivalLabel(4, 4), '4 of 4');
  assert.equal(arrivalLabel(1, 0), '0 of 1');
  // Five against four confirmed is two facts, not a fraction.
  assert.equal(arrivalLabel(4, 5), '5 arrived · 4 confirmed');
  assert.equal(arrivalLabel(0, 2), '2 arrived · 0 confirmed');
});
