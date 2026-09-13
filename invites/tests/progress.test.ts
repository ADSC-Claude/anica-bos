import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeWindow, doneSections, withDone, formComplete, liveEditable, whyLocked } from '../src/lib/progress';

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

test('the switches that run the day stay the customer’s on a live page and inside the window', () => {
  // The guestbook, the album and the RSVP questions are operated, not
  // designed: the album is switched on at the reception, which is inside
  // both locks. Everything else on a live page is ours to change.
  for (const key of ['guestbook', 'photos', 'rsvp'] as const) {
    assert.equal(liveEditable(key), true, `${key} stays theirs`);
    assert.equal(whyLocked({ status: 'PUBLISHED', eventAt: new Date('2026-12-12T06:00:00Z') }, key, new Date('2026-12-12T00:00:00Z')), undefined, `${key} is open on the day itself`);
  }
  for (const key of ['cover', 'story', 'dressCode'] as const) assert.equal(liveEditable(key), false, `${key} is design`);
  const event = new Date('2026-12-12T06:00:00Z');
  assert.match(whyLocked({ status: 'PUBLISHED', eventAt: event }, 'cover', new Date('2026-06-01T00:00:00Z'))!, /already live/, 'a live page locks the cover with the live sentence');
  assert.match(whyLocked({ status: 'DRAFT', eventAt: event }, 'cover', new Date('2026-12-01T00:00:00Z'))!, /Changes closed on/, 'inside the window the cover locks with the window sentence');
  assert.equal(whyLocked({ status: 'DRAFT', eventAt: event }, 'cover', new Date('2026-06-01T00:00:00Z')), undefined, 'a draft months out is open');
  assert.equal(whyLocked({ status: 'DRAFT', eventAt: null }, 'cover'), undefined, 'no date, no window');
});
