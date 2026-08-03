/**
 * Small shared vocabulary for the intake answers.
 *
 * No imports on purpose: the public booking form is a client component and the
 * therapist-alert code runs on the server, and both have to agree on what "not
 * applicable" looks like. Anything pulled in here would end up in the browser
 * bundle.
 */

/** What a written question holds when the guest says it does not apply. */
export const NOT_APPLICABLE = 'N/A';

/**
 * "Nothing to report", however it was written down.
 *
 * The tick box writes the sentinel, but a guest typing "n/a" into the box by
 * hand means exactly the same thing, and so does the desk copying "N.A." off a
 * paper form. All of them are an answer — they are just not an answer the
 * therapist needs warning about.
 */
export function isNotApplicable(raw: unknown): boolean {
  return typeof raw === 'string' && /^n\.?\/?a\.?$/i.test(raw.trim());
}

/**
 * Has this question been answered at all?
 *
 * A blank box cannot be told from a question nobody asked, which is the whole
 * reason the checklist is required — so "N/A" counts as answered and an empty
 * string does not.
 */
export function isAnswered(raw: unknown): boolean {
  if (typeof raw === 'string') return raw.trim().length > 0;
  if (Array.isArray(raw)) return raw.length > 0;
  return raw !== undefined && raw !== null && raw !== false;
}
