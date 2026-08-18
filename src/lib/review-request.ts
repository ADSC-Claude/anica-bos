/**
 * Whether this visit earns a request for a Google review.
 *
 * Four conditions, and every one of them is a way of not annoying somebody.
 *
 * The rule lives here rather than inline in the status action so it can be
 * driven by tests: this is the only message the system sends that a guest did
 * not ask for, and "it sent twice" or "it went out on a no-show" are the kind
 * of faults that are noticed by the customer before they are noticed by us.
 */
export type ReviewRequestInput = {
  /** The status the appointment is moving to. */
  status: string;
  /** The status it held before. */
  previousStatus: string;
  /** Whether the Owner has switched the request on at all. */
  enabled: boolean;
  /** The listing link. Without one there is nowhere to send them. */
  googleUrl: string;
  /** The guest's email, if the record has one. */
  email: string | null | undefined;
};

export function shouldRequestReview(input: ReviewRequestInput): boolean {
  // Only on the way into COMPLETED. Re-saving a completed appointment, or
  // correcting a note on it an hour later, must not send a second one.
  if (input.status !== 'COMPLETED') return false;
  if (input.previousStatus === 'COMPLETED') return false;

  if (!input.enabled) return false;
  if (!input.googleUrl.trim()) return false;
  if (!input.email?.trim()) return false;

  return true;
}
