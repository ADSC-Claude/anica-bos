import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trimNote, asChatText, chatLinks } from '../src/lib/seat-message';

const rsvp = readFileSync(new URL('../src/lib/rsvp.ts', import.meta.url), 'utf8');
const guests = readFileSync(new URL('../src/lib/guests.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/app/account/invitations/[id]/rsvps/page.tsx', import.meta.url), 'utf8');
const decide = readFileSync(new URL('../src/app/account/invitations/[id]/rsvps/decide.tsx', import.meta.url), 'utf8');

function body(src: string, decl: string): string {
  const i = src.indexOf(decl);
  assert.notEqual(i, -1, `${decl} is gone`);
  const rest = src.slice(i);
  return rest.slice(0, rest.indexOf('\n}\n'));
}

/**
 * The same text with the prose taken out.
 *
 * Every negative assertion below has to run on this. These files explain
 * themselves at length and name the functions they deliberately do not call —
 * decideSeats has a paragraph about why it leaves messageGuest alone — so a
 * bare doesNotMatch on the raw source fails on the very comment that proves
 * the rule it is checking.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const sample = { guestName: 'Tita Baby', hosts: 'Juan & Maria', claimed: 6, approved: 2, link: 'https://example.test/j-and-m' };

test('the draft never says the words a form would say', () => {
  // "Your request has been rejected" is the register of a government office.
  // This is a message to somebody's ninang.
  const { subject, body: text } = trimNote(sample);
  for (const word of [/reject/i, /denied/i, /your request/i, /approved/i, /unfortunately your/i]) {
    assert.doesNotMatch(text, word, `the draft says ${word}`);
    assert.doesNotMatch(subject, word, `the subject says ${word}`);
  }
});

test('the draft thanks them first and ends with the invitation', () => {
  const { body: text } = trimNote(sample);
  const lines = text.split('\n').filter(Boolean);
  assert.match(lines[0], /^Hi Tita Baby,$/, 'it does not open by name');
  assert.ok(lines[1].startsWith('Thank you'), `the second line is "${lines[1]}" rather than thanks`);
  assert.match(text, /https:\/\/example\.test\/j-and-m/, 'the link is gone');
  assert.ok(text.trimEnd().endsWith('Juan & Maria'), 'it is not signed by the couple');
});

test('the draft states both numbers, so nobody has to guess which changed', () => {
  const { body: text } = trimNote(sample);
  assert.match(text, /2 seats/, 'the settled number is missing');
  assert.match(text, /the 6 on your reply/, 'what they put down is missing');
  // One seat is not "1 seats".
  assert.match(trimNote({ ...sample, approved: 1 }).body, /1 seat\b/);
  assert.doesNotMatch(trimNote({ ...sample, approved: 1 }).body, /1 seats/);
});

test('settling at nobody is worded as no room, not as a headcount', () => {
  // "We can only hold 0 seats for you" is what the arithmetic wants to say and
  // it is not a sentence anybody should receive.
  const { body: text } = trimNote({ ...sample, approved: 0 });
  assert.doesNotMatch(text, /0 seat/, 'the draft offers somebody nought seats');
  assert.match(text, /not able to keep a place/i);
});

test('the chat version loses the subject and keeps the words', () => {
  const note = trimNote(sample);
  const chat = asChatText(note);
  assert.doesNotMatch(chat, /^About your seats/, 'a chat has no subject line');
  assert.match(chat, /Tita Baby/);
  assert.equal(chat, chat.trim(), 'it opens or closes on blank lines');
  assert.doesNotMatch(chat, /\n{3,}/, 'three newlines is three empty bubbles');
});

test('every chat link carries the whole message, and Messenger is not one of them', () => {
  const text = asChatText(trimNote(sample));
  const links = chatLinks(text);
  assert.deepEqual(links.map((l) => l.label), ['Viber', 'WhatsApp', 'Messages']);
  for (const l of links) {
    assert.ok(l.href.includes(encodeURIComponent('Tita Baby')), `${l.label} drops the message`);
  }
  // Messenger's dialog forwards a link and has no body, so a link for it would
  // look like the others and silently lose the words. The drawer gives it a
  // button that copies instead, and only then offers the way in.
  assert.doesNotMatch(JSON.stringify(links), /messenger|facebook/i);
  assert.match(decide, /Copy/, 'the copy button is gone');
  assert.match(decide, />\s*Messenger\s*</, 'Messenger is not offered at all');
  assert.match(decide, /toMessenger && \(/, 'the Messenger link shows before the words are on the clipboard');
});

test('the couple sends it from their own phone, and ours is the paid one', () => {
  // Her correction, in one rule: a message we send is a service somebody has
  // bought. The chat buttons cost us nothing because their phone does the
  // sending, so those stay free on every package and go first.
  const chat = code(decide).indexOf('Send it from');
  const mail = code(decide).indexOf('Send by e-mail');
  assert.notEqual(chat, -1, 'the chat buttons lost their heading');
  assert.ok(chat < mail, 'our e-mail is offered before their own apps again');
  assert.doesNotMatch(code(decide), /btn-primary[^>]*onClick=\{send\}/, 'our e-mail is the loudest button on the drawer again');
  assert.match(decide, /canEmail \?/, 'the e-mail button is not behind the entitlement');
  assert.match(decide, /Guest communication add-on/, 'nothing says why the button is off');
  assert.match(decide, /Nothing is sent from here\./, 'the drawer still implies we might send it');
});

test('our own sending is refused to an invitation that has not bought it', () => {
  // The hole this closes: messageGuest checked the address and the invitation
  // and never checked what they bought, so a Basic invitation could post as
  // much e-mail through our mail key as it liked.
  const fn = body(rsvp, 'export async function messageGuest(');
  assert.match(fn, /entitled\(invitation, 'rsvp\.emailConfirmation'\)/, 'the add-on gate is gone');
  assert.ok(
    fn.indexOf('entitled(') < fn.indexOf('sendEmail'),
    'the check happens after the mail has already gone',
  );
  // And it names the free way out rather than just refusing.
  assert.match(fn, /Viber|Messenger|Messages/, 'the refusal offers no way to send it');
});

test('no confirmation goes out while the couple has not agreed the number', () => {
  // A receipt for six seats, sent the moment a stranger picked six off a
  // dropdown, is the hardest thing here to walk back: the guest has it in
  // writing before anybody has looked.
  const fn = body(rsvp, 'async function confirmToGuest(');
  assert.match(fn, /awaitingDecision\(/, 'the confirmation no longer waits on the decision');
  assert.ok(
    fn.indexOf('awaitingDecision(') < fn.indexOf('sendEmail'),
    'the check happens after the e-mail has already gone',
  );
  // And it reports the settled figure, never the raw claim.
  assert.match(fn, /const seats = seatsHeld\(/, 'the seats line reads the raw claim again');
  assert.doesNotMatch(code(fn), /saved\.seats\} seat/, 'the seats line reads the raw claim again');
});

test('approving sends the receipt; cutting somebody down never does', () => {
  // The rule the whole feature turns on. An approval surprises nobody, so it
  // sends itself. A cut is a sentence the couple has to mean.
  const fn = body(rsvp, 'export async function decideSeats(');
  assert.match(fn, /const trimmed = seatsApproved < reply\.seats/);
  assert.match(fn, /if \(!trimmed\) await confirmToGuest\(/, 'a cut now sends automatically');
  assert.doesNotMatch(code(fn), /messageGuest\(/, 'decideSeats sends the couple’s own message for them');
});

test('a guest can only be written to through their own invitation', () => {
  const fn = body(rsvp, 'export async function messageGuest(');
  assert.match(fn, /invitationId: invitation\.id/, 'a reply id from another invitation would be writable');
  assert.match(fn, /rsvpId: reply\.id/, 'the send is not filed against the reply');
  assert.match(fn, /mailable\(plainAddress\(reply\.email\)\)/, 'the address is no longer checked');
});

test('the decision is bounded, and only an acceptance has seats to settle', () => {
  const fn = body(rsvp, 'export async function decideSeats(');
  assert.match(fn, /Math\.min\(99, Math\.max\(0,/, 'the typo guard is gone');
  assert.match(fn, /reply\.response !== 'ACCEPT'/, 'a decline can be given seats');
  assert.match(fn, /invitationId: invitation\.id/, 'a reply from another invitation is settleable');
});

test('the queue keeps a reply that was cut, so the message can still be written', () => {
  // Dropping it the moment the number saves would unmount the drawer the
  // couple is typing into, on the revalidate that follows their own click.
  assert.match(page, /r\.seatsApproved !== null && r\.seatsApproved < r\.seats/, 'a cut reply falls out of the queue');
  assert.match(page, /awaitingDecision\(r, vettedOf\(r\)\)/);
  // vetted needs both halves: the cap in submitRsvp sits behind the same
  // entitlement that hands out personal links.
  assert.match(page, /Boolean\(r\.guestId\) && personalLinks/, 'a Basic reply with a token would count as vetted');
});

test('every total counts the settled number rather than the claim', () => {
  // One rule, read everywhere: the headcount sheet the caterer holds, both
  // exports, and the figure on the dashboard.
  assert.match(guests, /seats: replySeats\(r\)/, 'the headcount sheet reads the raw claim');
  assert.equal((guests.match(/replySeats\(r\)/g) ?? []).length, 3, 'a seat total was missed, or one was added without a test');
  assert.match(guests, /seatsApproved: null \}, _sum: \{ seats: true \}/, 'the summary no longer splits the two sums');
  assert.match(guests, /seatsApproved: \{ not: null \} \}, _sum: \{ seatsApproved: true \}/);
});
