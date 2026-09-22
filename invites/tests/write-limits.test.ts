/**
 * How many wishes an hour a reception is allowed.
 *
 * The bug this is really about: the old rule counted ten guestbook entries
 * per hour per IP address. Eighty guests at one venue are eighty guests on
 * one wifi, which is one address — so the eleventh person to write a wish at
 * the party was told they had sent too many, having sent one. It had been
 * that way the whole time and would first have been discovered at the
 * christening, by a ninang, in front of everybody.
 *
 * So the first test here is the reception, and the rest hold the shape that
 * makes it work: a personal link is counted as a person, an address is
 * counted as a room, and the invitation's own ceiling is what actually stops
 * a flood.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeLimit } from '../src/lib/rsvp';

const room = (n: number) => ({ guest: null, ip: n, invitationHour: n });

test('a whole reception can write in the same hour', () => {
  // Eighty guests, one venue wifi, nobody using a personal link.
  for (let i = 0; i < 80; i++) {
    assert.equal(writeLimit('guestbook', room(i)), null, `guest ${i + 1} of 80 was refused`);
  }
});

test('the eleventh wish from one venue is no longer refused', () => {
  // The exact case that was broken: ten already written from this address.
  assert.equal(writeLimit('guestbook', room(10)), null);
});

test('a guest on their own link is counted as themselves, not as the room', () => {
  // The room is at its address limit, but this guest has written twice.
  const atRoomLimit = { guest: 2, ip: 500, invitationHour: 120 };
  assert.equal(writeLimit('guestbook', atRoomLimit), null, 'their own allowance is what counts');
});

test('one person on a link cannot write forever', () => {
  const flood = writeLimit('guestbook', { guest: 10, ip: 10, invitationHour: 10 });
  assert.equal(flood?.status, 429);
  assert.match(flood!.message, /lot of messages at once/i, 'says it is them, not the room');
});

test('a room that really is flooding is still stopped, and told it is the room', () => {
  const flood = writeLimit('guestbook', room(120));
  assert.equal(flood?.status, 429);
  assert.match(flood!.message, /from this network/i);
  // Not an accusation: the guest is told where the traffic is coming from,
  // which is the whole reason the old wording was wrong.
  assert.doesNotMatch(flood!.message, /you have sent/i);
});

test("the invitation's own ceiling is the real backstop", () => {
  // Every address under its own limit, but the guestbook as a whole is
  // filling — which is the flood actually worth stopping.
  const flood = writeLimit('guestbook', { guest: null, ip: 5, invitationHour: 200 });
  assert.equal(flood?.status, 429);
  assert.match(flood!.message, /this invitation is receiving/i);
});

test('replies are limited too, and more tightly than wishes', () => {
  // An RSVP is the thing an invitation is for, so a refusal costs more — but
  // a reply is also rarer than a wish, so the room allowance is lower.
  assert.equal(writeLimit('rsvp', room(59)), null, 'a big family replying together is fine');
  assert.equal(writeLimit('rsvp', room(60))?.status, 429);
  assert.equal(writeLimit('guestbook', room(60)), null, 'wishes get more room than replies');
});

test('nothing is refused on an empty hour', () => {
  for (const kind of ['rsvp', 'guestbook'] as const) {
    assert.equal(writeLimit(kind, { guest: null, ip: 0, invitationHour: 0 }), null);
    assert.equal(writeLimit(kind, { guest: 0, ip: 0, invitationHour: 0 }), null);
  }
});
