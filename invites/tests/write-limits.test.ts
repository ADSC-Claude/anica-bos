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
import { readFileSync } from 'node:fs';
import { writeLimit } from '../src/lib/rsvp';

const rsvpSrc = readFileSync(new URL('../src/lib/rsvp.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

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

test('a guest on their own link gets far more than ten wishes', () => {
  // "Raise the guestbook limit per person too." Ten is a number a real guest
  // reaches on an ordinary evening — a wish for the child, one for the
  // parents, one more she thought of at the reception — so the wish
  // allowance is the album's forty rather than the reply's ten.
  for (const written of [10, 20, 39]) {
    assert.equal(
      writeLimit('guestbook', { guest: written, ip: 0, invitationHour: 0 }),
      null,
      `wish ${written + 1} from one guest was refused`,
    );
  }
});

test('one person on a link still cannot write forever', () => {
  const flood = writeLimit('guestbook', { guest: 40, ip: 10, invitationHour: 10 });
  assert.equal(flood?.status, 429);
  assert.match(flood!.message, /lot of messages at once/i, 'says it is them, not the room');
});

test('a reply keeps the tighter allowance a wish has just left behind', () => {
  // The two are not the same act. A reply is one decision, amended now and
  // then; wishes are a conversation. Raising one must not raise the other.
  assert.equal(writeLimit('rsvp', { guest: 9, ip: 0, invitationHour: 0 }), null);
  assert.equal(writeLimit('rsvp', { guest: 10, ip: 0, invitationHour: 0 })?.status, 429);
  assert.equal(writeLimit('guestbook', { guest: 10, ip: 0, invitationHour: 0 }), null);
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

/**
 * The allowance above is spent in a guest's name, so a wish has to carry the
 * name it was spent in. Before this, nothing on a GuestbookEntry said who
 * wrote it, the guestbook passed no link to the counter, and the per-guest
 * number was unreachable code: every wish was counted as the room.
 */

test('a wish records which guest wrote it, when they came on their own link', () => {
  const entry = schema.slice(schema.indexOf('model GuestbookEntry'));
  const block = entry.slice(0, entry.indexOf('\n}'));
  assert.match(block, /guestId\s+String\?/, 'the column exists and is optional');
  assert.match(block, /guest\s+Guest\?.*onDelete: SetNull/, 'removing a guest keeps their wish');
  assert.match(block, /@@index\(\[guestId, createdAt\]\)/, 'the hourly count has an index');
});

test('the guestbook form carries the personal link to the endpoint', () => {
  const renderer = readFileSync(new URL('../src/components/invite/renderer.tsx', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../src/components/invite/client.tsx', import.meta.url), 'utf8');
  assert.match(renderer, /<GuestbookForm slug=\{slug\} token=\{token\}/, 'the renderer hands it over');
  assert.match(client, /JSON\.stringify\(\{ slug, token, name:/, 'and the form posts it');
  assert.match(rsvpSrc, /export const guestbookSchema[\s\S]{0,200}token: z\.string\(\)/, 'the endpoint accepts it');
});

test('a borrowed link cannot buy a fresh allowance', () => {
  // The count is scoped to this invitation, so a token from somebody else's
  // event would match nothing — which would read as "written nothing yet"
  // and excuse its holder the address ceiling as well. The token is
  // therefore checked against this invitation before anything is counted.
  const fn = rsvpSrc.slice(rsvpSrc.indexOf('export async function submitGuestbook'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  const checked = body.indexOf('guest.invitationId !== invitation.id');
  const counted = body.indexOf("rateLimit('guestbook'");
  assert.ok(checked > -1, 'the link is checked against this invitation');
  assert.ok(counted > -1, 'the limits are counted');
  assert.ok(checked < counted, 'and the check comes first');
});
