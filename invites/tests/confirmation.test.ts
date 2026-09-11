import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMPARISON_ALL } from '../src/lib/tiers';

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
