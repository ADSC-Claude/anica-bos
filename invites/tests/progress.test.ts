import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeWindow, doneSections, withDone, formComplete } from '../src/lib/progress';
import { selfServe } from '../src/lib/pricing';

test('a team-serviced invitation closes three weeks before the event and the final touches are due two weeks before', () => {
  const event = new Date('2026-12-12T06:00:00Z');
  const w = changeWindow(event, 'DFY', new Date('2026-11-01T00:00:00Z'))!;
  assert.equal(w.closesAt.toISOString(), '2026-11-21T06:00:00.000Z');
  assert.equal(w.finalAt.toISOString(), '2026-11-28T06:00:00.000Z');
  assert.equal(w.closed, false, 'six weeks out is open');
  assert.equal(changeWindow(event, 'DFY', new Date('2026-11-21T06:00:00Z'))!.closed, true, 'the closing moment itself is closed');
  assert.equal(changeWindow(event, 'DFY', new Date('2026-11-25T00:00:00Z'))!.closed, true, 'seventeen days out is closed');
  assert.equal(changeWindow(event, 'CONCIERGE', new Date('2026-11-25T00:00:00Z'))!.closed, true, 'concierge closes like Done-For-You');
  assert.equal(changeWindow(null, 'DFY'), null, 'no date, no window');
});

test('a self-serve invitation never closes: it is the customer\'s to change until the day', () => {
  const event = new Date('2026-12-12T06:00:00Z');
  // the day before the wedding, long past where a Done-For-You order would have closed
  const eve = new Date('2026-12-11T06:00:00Z');
  assert.equal(changeWindow(event, 'DIY', eve), null, 'DIY has no window at all');
  assert.equal(changeWindow(event, null, eve), null, 'an invitation with no order is self-serve');
  assert.equal(changeWindow(event, undefined, eve), null, 'an unknown mode is self-serve');
  assert.equal(changeWindow(event, 'DFY', eve)!.closed, true, 'and the same date does close a Done-For-You one');
});

test('selfServe names the one mode the customer drives', () => {
  assert.equal(selfServe('DIY'), true);
  assert.equal(selfServe('DFY'), false);
  assert.equal(selfServe('CONCIERGE'), false);
  assert.equal(selfServe(null), true, 'no order at all — a seed or a staff draft — is self-serve');
  assert.equal(selfServe(undefined), true);
});

test('sections are marked done one by one and the form is complete when all of them are', () => {
  let p = withDone(undefined, 'cover', true);
  p = withDone(p, 'rsvp', true);
  assert.deepEqual(doneSections(p), ['cover', 'rsvp']);
  assert.equal(formComplete(p, ['cover', 'rsvp', 'closing']), false);
  p = withDone(p, 'closing', true);
  assert.equal(formComplete(p, ['cover', 'rsvp', 'closing']), true);
  p = withDone(p, 'rsvp', false);
  assert.deepEqual(doneSections(p), ['cover', 'closing']);
  assert.equal(formComplete(p, ['cover', 'rsvp', 'closing']), false);
  assert.equal(formComplete(p, []), false, 'no sections is not complete');
  assert.deepEqual(doneSections({ done: ['cover', 42 as unknown as string] }), ['cover'], 'junk in the list is ignored');
});
