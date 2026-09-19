import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeWindow, doneSections, withDone, formComplete, handedOver, liveEditable, whyLocked, LIVE_LOCK } from '../src/lib/progress';

test('changes close three weeks before the event and the final touches are due two weeks before', () => {
  const event = new Date('2026-12-12T06:00:00Z');
  const over = true; // the customer has marked every part Done
  const w = changeWindow(event, new Date('2026-11-01T00:00:00Z'), over)!;
  assert.equal(w.closesAt.toISOString(), '2026-11-21T06:00:00.000Z');
  assert.equal(w.finalAt.toISOString(), '2026-11-28T06:00:00.000Z');
  assert.equal(w.closed, false, 'six weeks out is open');
  assert.equal(changeWindow(event, new Date('2026-11-21T06:00:00Z'), over)!.closed, true, 'the closing moment itself is closed');
  assert.equal(changeWindow(event, new Date('2026-11-25T00:00:00Z'), over)!.closed, true, 'seventeen days out is closed');
  assert.equal(changeWindow(null, new Date(), over), null, 'no date, no window');
});

/**
 * The trap this rule replaced: a christening booked a fortnight out is an
 * ordinary booking here, and the date alone used to shut the form on a
 * customer who had not filled in a word of it — including the date box, so
 * they could not put it back.
 */
test('a draft still being built never closes, however near the day is', () => {
  const event = new Date('2026-12-12T06:00:00Z');
  const theDayBefore = new Date('2026-12-11T00:00:00Z');
  const w = changeWindow(event, theDayBefore, false)!;
  assert.equal(w.closed, false, 'nobody has handed this over, so nothing is locked');
  assert.equal(w.closesAt.toISOString(), '2026-11-21T06:00:00.000Z', 'the dates are still worked out, for the notice and the schedule');
  assert.equal(changeWindow(event, theDayBefore)!.closed, false, 'and not handed over is the default');
  assert.equal(changeWindow(event, theDayBefore, true)!.closed, true, 'once it is with the team, it closes');
});

test('handedOver is the customer marking the form complete', () => {
  assert.equal(handedOver(undefined), false);
  assert.equal(handedOver({}), false);
  assert.equal(handedOver({ done: ['cover', 'rsvp'] }), false, 'part-way through is not handed over');
  assert.equal(handedOver({ completedAt: '2026-11-01T00:00:00.000Z' }), true);
});

test('whyLocked follows the same reading as the window', () => {
  const eventAt = new Date('2026-12-12T06:00:00Z');
  const inside = new Date('2026-12-01T00:00:00Z');
  const draft = { status: 'DRAFT', eventAt };
  assert.equal(whyLocked(draft, 'cover', inside), undefined, 'a draft inside the window is open');
  assert.match(
    whyLocked({ ...draft, progress: { completedAt: '2026-11-01T00:00:00.000Z' } }, 'cover', inside) ?? '',
    /Changes closed on/,
    'handed over and inside the window is closed',
  );
  assert.equal(whyLocked({ status: 'PUBLISHED', eventAt }, 'cover', inside), LIVE_LOCK, 'published has its own lock');
  assert.equal(
    whyLocked({ status: 'PUBLISHED', eventAt }, 'guestbook', inside),
    undefined,
    'and the switches that run the day are never locked',
  );
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
  const over = { completedAt: '2026-11-01T00:00:00.000Z' };
  assert.match(whyLocked({ status: 'DRAFT', eventAt: event, progress: over }, 'cover', new Date('2026-12-01T00:00:00Z'))!, /Changes closed on/, 'handed over and inside the window, the cover locks with the window sentence');
  assert.equal(whyLocked({ status: 'DRAFT', eventAt: event }, 'cover', new Date('2026-12-01T00:00:00Z')), undefined, 'but a draft still being built is open inside the window too');
  assert.equal(whyLocked({ status: 'DRAFT', eventAt: event, progress: over }, 'cover', new Date('2026-06-01T00:00:00Z')), undefined, 'a draft months out is open');
  assert.equal(whyLocked({ status: 'DRAFT', eventAt: null }, 'cover'), undefined, 'no date, no window');
});
