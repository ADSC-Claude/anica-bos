/**
 * The cancellation rule.
 *
 * What is being tested is not "the arithmetic works" — it is that the promise
 * made to the guest before she pays and the decision made at the desk when she
 * cancels come from the same function, so they cannot drift apart.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelledInTime,
  cancellationPolicyText,
  depositOutcome,
} from '../src/lib/booking-policy';

const at = (iso: string) => new Date(iso);
/** A 7pm appointment, which is the busy end of a spa evening. */
const START = at('2026-08-02T19:00:00+08:00');

test('five hours of notice is in time; four hours and fifty-nine minutes is not', () => {
  const w = { startAt: START, windowHours: 5 };
  assert.equal(cancelledInTime({ ...w, cancelledAt: at('2026-08-02T13:00:00+08:00') }), true);
  // Exactly on the line counts — a guest told "five hours" who gives five has
  // done what was asked.
  assert.equal(cancelledInTime({ ...w, cancelledAt: at('2026-08-02T14:00:00+08:00') }), true);
  assert.equal(cancelledInTime({ ...w, cancelledAt: at('2026-08-02T14:01:00+08:00') }), false);
  assert.equal(cancelledInTime({ ...w, cancelledAt: at('2026-08-02T18:30:00+08:00') }), false);
  // After the appointment has already started, plainly not in time.
  assert.equal(cancelledInTime({ ...w, cancelledAt: at('2026-08-02T20:00:00+08:00') }), false);
});

test('a window of zero switches the deadline off', () => {
  assert.equal(
    cancelledInTime({ startAt: START, cancelledAt: at('2026-08-02T18:59:00+08:00'), windowHours: 0 }),
    true,
  );
});

test('a no-show forfeits however much notice the rule would have allowed', () => {
  // Same instant that would be a refund on a cancellation.
  assert.equal(
    depositOutcome({
      status: 'NO_SHOW',
      startAt: START,
      cancelledAt: at('2026-08-02T09:00:00+08:00'),
      windowHours: 5,
      inTimePolicy: 'REFUND',
    }),
    'FORFEIT',
    'nobody came and nobody said so — the hour could not be resold',
  );
});

test('cancelling in time refunds, cancelling late forfeits', () => {
  const base = { status: 'CANCELLED' as const, startAt: START, windowHours: 5, inTimePolicy: 'REFUND' as const };
  assert.equal(depositOutcome({ ...base, cancelledAt: at('2026-08-02T10:00:00+08:00') }), 'REFUND');
  assert.equal(depositOutcome({ ...base, cancelledAt: at('2026-08-02T17:00:00+08:00') }), 'FORFEIT');
});

test('a house that never refunds keeps the fee even when cancelled early', () => {
  assert.equal(
    depositOutcome({
      status: 'CANCELLED',
      startAt: START,
      cancelledAt: at('2026-08-01T09:00:00+08:00'),
      windowHours: 5,
      inTimePolicy: 'FORFEIT',
    }),
    'FORFEIT',
  );
});

test('the wording quoted to the guest carries the same number that enforces it', () => {
  const text = cancellationPolicyText({ windowHours: 5, inTimePolicy: 'REFUND' });
  assert.match(text, /5 hours/);
  assert.match(text, /no-shows/);
  assert.match(text, /non-refundable/);

  // One hour reads as "1 hour", not "1 hours".
  assert.match(cancellationPolicyText({ windowHours: 1, inTimePolicy: 'REFUND' }), /1 hour /);

  // With no refund on offer, the text must not promise a deadline that buys
  // the guest nothing.
  const never = cancellationPolicyText({ windowHours: 5, inTimePolicy: 'FORFEIT' });
  assert.match(never, /non-refundable/);
  assert.ok(!/5 hours/.test(never), 'no deadline is quoted when nothing is refundable');
});
