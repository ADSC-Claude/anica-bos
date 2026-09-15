import { test } from 'node:test';
import assert from 'node:assert/strict';
import { welcomeDue, welcomeFor, welcomeLines, firstName } from '../src/lib/welcome';

const inv = { userId: 'u1', status: 'DRAFT', welcomedAt: null as Date | null };
const maria = { id: 'u1', role: 'CUSTOMER' };

test('the welcome is due on the owner\'s own draft, until it is answered', () => {
  assert.equal(welcomeDue(inv, maria), true);
  assert.equal(welcomeDue({ ...inv, welcomedAt: new Date() }, maria), false);
});

test('nobody else is welcomed: staff, another customer, a live page', () => {
  assert.equal(welcomeDue(inv, { id: 'staff', role: 'ADMIN' }), false);
  assert.equal(welcomeDue(inv, { id: 'u1', role: 'ENCODER' }), false);
  assert.equal(welcomeDue(inv, { id: 'u2', role: 'CUSTOMER' }), false);
  assert.equal(welcomeDue({ ...inv, status: 'PUBLISHED' }, maria), false);
  assert.equal(welcomeDue({ ...inv, status: 'EXPIRED' }, maria), false);
});

test('the greeting uses the first name and the package label', () => {
  assert.equal(firstName('Maria Clara Santos'), 'Maria');
  assert.equal(firstName('  '), '');
  const w = welcomeFor({ name: 'Maria Clara Santos' }, { tier: 'COMPLETE', order: { reference: 'YIT-1234', serviceMode: 'DIY' } });
  assert.deepEqual(w, { name: 'Maria', packageName: 'Signature', reference: 'YIT-1234', dfy: false });
  const lines = welcomeLines(w);
  assert.equal(lines.eyebrow, 'Order YIT-1234 · payment confirmed');
  assert.equal(lines.title, 'Salamat, Maria! Your Signature package is unlocked.');
  assert.match(lines.body, /beside the form/);
  assert.doesNotMatch(lines.body, /Messenger/);
});

test('done-for-you offers the other ways of handing the details over', () => {
  const w = welcomeFor({ name: 'Juan' }, { tier: 'LUXURY', order: { reference: 'YIT-9', serviceMode: 'DFY' } });
  assert.equal(w.dfy, true);
  assert.match(welcomeLines(w).body, /over Messenger/);
  assert.doesNotMatch(welcomeLines(w).body, /Viber/);
});

test('an invitation made by staff, with no order, is welcomed without a receipt', () => {
  const w = welcomeFor({ name: '' }, { tier: 'BASIC', order: null });
  const lines = welcomeLines(w);
  assert.equal(lines.eyebrow, 'Your invitation');
  assert.equal(lines.title, 'Welcome. Your Basic invitation is ready to fill in.');
});
