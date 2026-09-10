import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rsvpSchema } from '../src/lib/rsvp';
import { guestTemplateCsv } from '../src/lib/guests';
import { parseCsv } from '../src/lib/csv';

// A mobile number and an e-mail address are the couple's only reach: a
// reminder text and a confirmation have nowhere to go without them, and the
// SMS and e-mail add-ons are sold on the assumption they exist.
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

test('a reply with neither is refused', () => {
  for (const missing of [{ phone: '' }, { email: '' }, { phone: '', email: '' }]) {
    assert.equal(rsvpSchema.safeParse(reply(missing)).success, false, JSON.stringify(missing));
  }
});

test('the refusal says which one is missing, in words a guest can act on', () => {
  const r = rsvpSchema.safeParse(reply({ email: '' }));
  assert.equal(r.success, false);
  assert.match(r.error!.issues[0].message, /e-mail/i);
});

test('an address that is not one is refused', () => {
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
