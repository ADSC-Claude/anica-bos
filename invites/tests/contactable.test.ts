import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rsvpSchema } from '../src/lib/rsvp';
import { guestTemplateCsv } from '../src/lib/guests';
import { parseCsv } from '../src/lib/csv';

// A mobile number and an e-mail address are the couple's only reach, and the
// SMS and e-mail add-ons are sold on the assumption they exist. The number is
// required; the address is taken if it is offered — but it is never labelled
// optional, because "(optional)" beside a field is read as "skip me".
const reply = (over: Record<string, unknown> = {}) => ({
  slug: 'juan-and-maria',
  name: 'Maria Santos',
  response: 'ACCEPT' as const,
  seats: 1,
  phone: '0917 123 4567',
  email: 'maria@example.com',
  ...over,
});

test('a reply carries a number and an address', () => {
  assert.equal(rsvpSchema.safeParse(reply()).success, true);
});

test('a reply with no number is refused', () => {
  for (const missing of [{ phone: '' }, { phone: undefined }]) {
    assert.equal(rsvpSchema.safeParse(reply(missing)).success, false, JSON.stringify(missing));
  }
});

test('the refusal says what is missing, in words a guest can act on', () => {
  const r = rsvpSchema.safeParse(reply({ phone: '' }));
  assert.equal(r.success, false);
  assert.match(r.error!.issues[0].message, /mobile number/i);
});

// A guest with no address, or no wish to leave one, still gets to reply. The
// headcount is worth more than the address.
test('a reply with no address stands', () => {
  for (const none of [{ email: '' }, { email: undefined }, { email: '   ' }]) {
    assert.equal(rsvpSchema.safeParse(reply(none)).success, true, JSON.stringify(none));
  }
});

// Blank is a decision; four characters and no @ is a typo.
test('an address that is not one is still refused', () => {
  for (const bad of ['maria', 'maria@', '@example.com', 'maria example.com']) {
    assert.equal(rsvpSchema.safeParse(reply({ email: bad })).success, false, bad);
  }
});

// Half the ninongs at a Manila wedding are texting from Dubai or Daly City.
// Refusing their reply to protect a text we could not have sent them anyway is
// the wrong trade — whether a number is textable is Semaphore's question, and
// lib/sms.ts already answers it per-number at send time.
test('a number from abroad is accepted, not refused', () => {
  for (const ok of ['+971 50 123 4567', '+1 (650) 555-0142', '09171234567', '+63 917 123 4567']) {
    assert.equal(rsvpSchema.safeParse(reply({ phone: ok })).success, true, ok);
  }
});

test('something that is plainly not a number is refused', () => {
  for (const bad of ['no phone', 'wala', 'x']) {
    assert.equal(rsvpSchema.safeParse(reply({ phone: bad })).success, false, bad);
  }
});

// The couple's own list is the only place an address exists before anybody
// replies, which is exactly who a reminder is for.
test('the blank a couple fills in asks for an e-mail', () => {
  const [header] = parseCsv(guestTemplateCsv(["Bride's family"]));
  assert.deepEqual(header, ['Name', 'Group', 'Seats', 'Phone', 'Email', 'Greeting']);
});

test('the example rows show what an e-mail looks like rather than describing it', () => {
  const rows = parseCsv(guestTemplateCsv([]));
  assert.match(rows[1][4], /@/, 'the first example carries an address');
  assert.match(rows[2][4], /@/, 'and so does the second');
});
