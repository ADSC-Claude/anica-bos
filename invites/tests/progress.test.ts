import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeWindow, doneSections, withDone, formComplete } from '../src/lib/progress';

test('changes close three weeks before the event and the final touches are due two weeks before', () => {
  const event = new Date('2026-12-12T06:00:00Z');
  const w = changeWindow(event, new Date('2026-11-01T00:00:00Z'))!;
  assert.equal(w.closesAt.toISOString(), '2026-11-21T06:00:00.000Z');
  assert.equal(w.finalAt.toISOString(), '2026-11-28T06:00:00.000Z');
  assert.equal(w.closed, false, 'six weeks out is open');
  assert.equal(changeWindow(event, new Date('2026-11-21T06:00:00Z'))!.closed, true, 'the closing moment itself is closed');
  assert.equal(changeWindow(event, new Date('2026-11-25T00:00:00Z'))!.closed, true, 'seventeen days out is closed');
  assert.equal(changeWindow(null), null, 'no date, no window');
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
