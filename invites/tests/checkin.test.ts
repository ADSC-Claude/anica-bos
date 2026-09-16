import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The door's rules that need a database or a browser to exercise, guarded by
 * reading the source instead — the same approach as tests/confirmation.test.ts.
 * The arithmetic itself is covered properly in tests/seats.test.ts; what is
 * checked here is that the desk and the write path actually use it.
 */
const guests = readFileSync(new URL('../src/lib/guests.ts', import.meta.url), 'utf8');
const desk = readFileSync(new URL('../src/app/account/invitations/[id]/checkin/desk.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/app/account/invitations/[id]/checkin/page.tsx', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

function body(src: string, decl: string): string {
  const i = src.indexOf(decl);
  assert.notEqual(i, -1, `${decl} is gone`);
  const rest = src.slice(i);
  return rest.slice(0, rest.indexOf('\n}\n'));
}

test('a scan counts the whole party in, and keeps a number the desk already corrected', () => {
  // Most parties arrive whole, so the common case has to stay one tap — a desk
  // that asked "how many?" on every scan would be abandoned by the fiftieth
  // guest and the count would be worth nothing.
  const fn = body(guests, 'export async function checkIn(');
  assert.match(fn, /const held = seatsHeld\(guest\.seatsAllotted, guest\.rsvps\[0\]\)/, 'the default is no longer the confirmed party');
  assert.match(fn, /arrivedCount: guest\.arrivedCount \?\? held/, 'scanning twice would overwrite a corrected count');
});

test('undo clears the headcount as well as the arrival', () => {
  // A number left behind by an Undo is a party the system believes is in the
  // room after somebody said they are not. headsArrived() refuses it anyway,
  // but two rules disagreeing is how the original bug happened.
  const fn = body(guests, 'export async function checkIn(');
  assert.match(fn, /checkedInAt: null, checkedInBy: '', arrivedCount: null/, 'undo leaves a stale headcount');
});

test('the headcount is only accepted for somebody already let in', () => {
  const fn = body(guests, 'export async function setArrived(');
  assert.match(fn, /entitled\(invitation, 'checkin'\)/, 'the add-on gate is gone');
  assert.match(fn, /invitationId: invitation\.id/, 'a guest id from another invitation would be writable');
  assert.match(fn, /if \(!guest\.checkedInAt\)/, 'a party nobody let in can be given a headcount');
  assert.match(fn, /Math\.min\(99, Math\.max\(0,/, 'the typo guard is gone');
});

test('the desk counts heads and parties, not parties alone', () => {
  // The whole point. "218 of 300 guests" is what a caterer settles against;
  // "96 of 124 parties" is what tells the couple which families are missing.
  // The desk used to show only the second and label it as the first.
  assert.match(desk, /headsArrived\(/, 'the desk no longer reads the shared rule');
  assert.match(desk, /guests in/, 'the head count is gone from the counter');
  assert.match(desk, /parties/, 'the party count is gone from the counter');
  // And the head figure is a sum of arrivals rather than a count of rows.
  assert.match(desk, /rows\.reduce\(\(n, g\) => n \+ arrivedOf\(g\), 0\)/);
});

test('a companion can be found by name, though they have no code of their own', () => {
  // A pamangkin who arrives before the tita holding the QR has no row and no
  // token — they are a name on somebody else's reply. Searching the guest list
  // alone left them unfindable, so they were waved in and never recorded.
  assert.match(desk, /g\.companions\.some\(\(c\) => c\.toLowerCase\(\)\.includes\(term\)\)/, 'the desk search reads the guest list only again');
  assert.match(page, /companionsOf\(g\.rsvps\[0\]\.attendees\)/, 'the desk is no longer given the companions');
});

test('the column is nullable, because a list may already be half checked in', () => {
  // Not `Int @default(...)`: null has to keep meaning "nobody counted", which
  // is what lets every arrival recorded before this shipped go on reading as
  // the whole confirmed party.
  assert.match(schema, /arrivedCount\s+Int\?/, 'arrivedCount is not nullable');
});
