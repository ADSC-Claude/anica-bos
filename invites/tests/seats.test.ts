import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatsHeld, replyState } from '../src/lib/seats';

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
