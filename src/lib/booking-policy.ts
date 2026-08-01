/**
 * The cancellation rule, in one place, in plain arithmetic.
 *
 * A reservation fee exists to hold a bed. Give the spa enough notice and the
 * hour can be sold to somebody else the same day, so the fee goes back; leave
 * it too late, or simply not turn up, and the hour is gone and the fee stays.
 *
 * Deliberately free of `server-only` and of any database access: the same rule
 * is quoted to the guest before she pays and applied by the desk when she
 * cancels, and those two must never be able to disagree.
 */

/** Milliseconds in an hour, named so the arithmetic below reads as English. */
const HOUR = 3_600_000;

/**
 * Did this cancellation arrive in time to keep the fee?
 *
 * Exactly on the line counts as in time — a guest told "five hours" who
 * cancels at five hours has done what was asked of her.
 */
export function cancelledInTime(opts: {
  startAt: Date;
  cancelledAt: Date;
  windowHours: number;
}): boolean {
  // A window of zero turns the rule off: every cancellation is in time.
  if (opts.windowHours <= 0) return true;
  return opts.startAt.getTime() - opts.cancelledAt.getTime() >= opts.windowHours * HOUR;
}

/**
 * What happens to a paid reservation fee, given how the booking ended.
 *
 * `refund` here means the money is owed back, not that it has moved — the spa
 * returns it by hand until gateway refunds are built.
 */
export function depositOutcome(opts: {
  status: 'CANCELLED' | 'NO_SHOW';
  startAt: Date;
  cancelledAt: Date;
  windowHours: number;
  /** What an in-time cancellation does — the configured house policy. */
  inTimePolicy: 'FORFEIT' | 'REFUND';
}): 'FORFEIT' | 'REFUND' {
  // Nobody came and nobody said so: the bed was held for an hour that could
  // not be resold, which is the whole thing the fee is for.
  if (opts.status === 'NO_SHOW') return 'FORFEIT';
  if (!cancelledInTime(opts)) return 'FORFEIT';
  return opts.inTimePolicy;
}

/**
 * The rule as the guest reads it, built from the same numbers that enforce it
 * so the wording can never drift from the behaviour.
 */
export function cancellationPolicyText(opts: {
  windowHours: number;
  inTimePolicy: 'FORFEIT' | 'REFUND';
}): string {
  const hours = opts.windowHours;
  if (hours <= 0 || opts.inTimePolicy === 'FORFEIT') {
    return 'The reservation fee is non-refundable once your booking is confirmed.';
  }
  const unit = hours === 1 ? 'hour' : 'hours';
  return (
    `Please cancel at least ${hours} ${unit} before your appointment to have your ` +
    `reservation fee refunded. Cancellations inside ${hours} ${unit}, and no-shows, ` +
    'are non-refundable — the room is held for you and can no longer be offered to ' +
    'someone else that day.'
  );
}
