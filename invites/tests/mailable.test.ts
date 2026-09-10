import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailable, render } from '../src/lib/email';
import { DEFAULT_SETTINGS } from '../src/lib/settings-defaults';

// The mirror of phMobile in sms.ts: a guest list is typed by hand, and a
// couple writes an address every which way. Deciding once, here, beats
// deciding it at the several places a blast could start.

test('an ordinary address is sendable', () => {
  assert.equal(mailable('maria@example.com'), 'maria@example.com');
});

test('what a person typed is tidied, not refused', () => {
  assert.equal(mailable('  Maria@Example.COM  '), 'maria@example.com', 'spaces and capitals');
  assert.equal(mailable('Maria Santos <maria@example.com>'), 'maria@example.com', 'pasted out of a mail client');
});

test('what is not an address comes back as nothing to send to', () => {
  for (const bad of ['', '   ', 'maria', 'maria@', '@example.com', 'maria example.com', 'maria@localhost', 'maria@@example.com']) {
    assert.equal(mailable(bad), null, JSON.stringify(bad));
  }
});

test('a blank column is nothing to send to rather than a crash', () => {
  assert.equal(mailable(undefined as unknown as string), null);
  assert.equal(mailable(null as unknown as string), null);
});

// The column is 120 characters, so an address that would not survive the round
// trip is refused before it is written down.
test('an address longer than the column is refused', () => {
  assert.equal(mailable(`${'a'.repeat(115)}@example.com`), null);
});

// Whether anybody reads it is the mail server's answer, not ours — a stricter
// rule would refuse real addresses to prevent nothing.
test('the awkward but real ones are accepted', () => {
  for (const ok of ['juan.dela.cruz+rsvp@example.com', "o'brien@example.co.uk", 'ninong_fred@mail.example.ph']) {
    assert.equal(mailable(ok), ok.toLowerCase(), ok);
  }
});

// A template with a hole in it reaches a guest as a sentence with a gap, so
// the defaults are checked for using only the words the planner supplies.
test('the reminder templates ask only for what the planner fills in', () => {
  const given = { guestName: 'Ninong Fred', hosts: 'Juan & Maria', eventDate: 'November 24, 2026', link: 'https://x/y' };
  for (const key of ['email.rsvpReminderSubject', 'email.rsvpReminder', 'sms.rsvpReminder'] as const) {
    const out = render(DEFAULT_SETTINGS[key], given);
    assert.doesNotMatch(out, /\{\{/, `${key} has an unfilled placeholder`);
    assert.ok(out.trim().length > 0, `${key} renders to something`);
  }
});

test('the e-mail reminder names the guest, the hosts, the day and the link', () => {
  const out = render(DEFAULT_SETTINGS['email.rsvpReminder'], {
    guestName: 'Ninong Fred',
    hosts: 'Juan & Maria',
    eventDate: 'November 24, 2026',
    link: 'https://youreinvitedto.com/juan-and-maria/abc123',
  });
  for (const wanted of ['Ninong Fred', 'Juan & Maria', 'November 24, 2026', 'https://youreinvitedto.com/juan-and-maria/abc123']) {
    assert.ok(out.includes(wanted), wanted);
  }
});
