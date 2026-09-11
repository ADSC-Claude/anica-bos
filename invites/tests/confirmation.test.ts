import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMPARISON_ALL } from '../src/lib/tiers';
import { DEFAULT_SETTINGS } from '../src/lib/settings-defaults';
import { confirmationLink } from '../src/lib/rsvp';

const rsvp = readFileSync(new URL('../src/lib/rsvp.ts', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../src/lib/copy.ts', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/components/invite/renderer.tsx', import.meta.url), 'utf8');
const packages = readFileSync(new URL('../src/components/landing/packages.tsx', import.meta.url), 'utf8');

test('only a guest who accepts is written back to', () => {
  // A decline is a kindness already done; a receipt saying we noted they will
  // not be there is one nobody asked for, and worse where the reason is sad.
  const fn = rsvp.slice(rsvp.indexOf('async function confirmToGuest'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /saved\.response !== 'ACCEPT'/, 'confirmToGuest no longer turns declines away');

  // And the guard comes before anything is sent.
  assert.ok(
    body.indexOf("saved.response !== 'ACCEPT'") < body.indexOf('sendEmail'),
    'the decline is turned away only after the e-mail has gone',
  );
});

test('nothing tells a customer the confirmation goes to everyone who replies', () => {
  // The promise and the code have to say the same thing; they did not before.
  for (const [name, text] of [['packages card', packages], ['rsvp.ts', rsvp]] as const) {
    assert.doesNotMatch(text, /guest who replies/i, `${name} still promises a reply gets one`);
  }
  const row = COMPARISON_ALL.find((r) => r.label.startsWith('E-mail confirmation'));
  assert.ok(row, 'the comparison row is gone');
  assert.match(row.label, /accepts/, `the comparison still says "${row.label}"`);
});

test('only a wedding is invited to watch a prenup video', () => {
  // The line is on the guest's own invitation. A christening that invited
  // people to watch its prenup video was saying something nobody said.
  assert.match(renderer, /inv\.occasion === 'WEDDING' \? 'gallery\.watchPrenup' : 'gallery\.video'/);
  assert.match(copy, /'gallery\.video':/, 'the neutral label it falls back to is gone');
});

test('the package tables do not call it a prenup video', () => {
  // One table, fourteen occasions.
  for (const row of COMPARISON_ALL) {
    for (const cell of Object.values(row.cells)) {
      if (typeof cell === 'string') assert.doesNotMatch(cell, /prenup/i, `"${row.label}" says prenup`);
    }
  }
  assert.doesNotMatch(packages, /prenup/i, 'a package card says prenup');
});

test('only a guest whose link remembers them is offered the edit', () => {
  const vars = { hosts: 'Juan & Maria' };

  // With a token, submitRsvp() finds their first answer and updates it, so
  // the promise is one the link keeps.
  const withToken = confirmationLink(DEFAULT_SETTINGS, vars, 'juan-and-maria', 'abc123');
  assert.match(withToken.updateLine, /update your reply/i);
  assert.match(withToken.link, /juan-and-maria\/abc123$/, 'the token is on the link it describes');

  // Without one there is nothing to match a second answer against, so it
  // would arrive as a second row. The sentence must not invite that.
  const plain = confirmationLink(DEFAULT_SETTINGS, vars, 'juan-and-maria', undefined);
  assert.doesNotMatch(plain.updateLine, /update your reply/i, 'a plain link still promises an edit it cannot do');
  assert.match(plain.updateLine, /Juan & Maria/, 'and it sends them to the hosts by name');
  assert.match(plain.link, /juan-and-maria$/);

  // Rendered on the way out, not left for the body: render() replaces in one
  // pass, so a placeholder substituted into the body is never looked at again.
  assert.doesNotMatch(plain.updateLine, /\{\{/, 'a placeholder reached the guest unrendered');
});

test('the confirmation body has somewhere to put that sentence', () => {
  // The two halves ship separately — a template that dropped the variable
  // would send a confirmation with no link line at all, and nothing else
  // would notice.
  assert.match(DEFAULT_SETTINGS['email.rsvpConfirmation'], /\{\{updateLine\}\}\n\{\{link\}\}/);
  assert.doesNotMatch(
    DEFAULT_SETTINGS['email.rsvpConfirmation'],
    /update your reply/i,
    'the body makes the promise itself again, whatever the link turns out to be',
  );
});
