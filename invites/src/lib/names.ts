/**
 * Who a reply is from, as the couple should read it.
 *
 * A guest opening their personal link finds their name already in the field —
 * the couple's spelling of it — and can type over it. Many will: "Atty.
 * Federico & Dr. Milagros Bautista" comes back as "Fred", a Ma. becomes a
 * Maria, a couple answers under one of their two names.
 *
 * None of that breaks anything underneath. A reply is bound to its guest by
 * Rsvp.guestId, taken from the token in the link, and never by matching names:
 * the seats, the table, the group and the check-in all follow the guest row
 * whatever was typed. What broke was reading it. Three places showed the typed
 * name — the headcount sheet, the responses table, the dashboard's latest
 * replies — while the guest list, the check-in desk and the guest CSV showed
 * the couple's. So the same person appeared twice under two names, and nothing
 * on the page said they were the same person.
 *
 * The couple's list is the identity: it is the name they wrote, the one on the
 * seating plan, and the one the coordinator is holding. What the guest typed is
 * kept and shown beside it when the two differ, because it is worth knowing
 * that Fred is what he answers to — and because for a reply that came in on the
 * public link it is the only name there is.
 */

/**
 * Who a staff reply is from, as a customer should read it.
 *
 * Not the person who typed it. A customer's thread is with the business rather
 * than with whoever picked the job up: a real name there invites them to ask
 * for that colleague by name next time, follows them off the platform, and
 * puts one person's name in front of every customer who ever buys an
 * invitation. Staff keep seeing each other's names on the admin side, where
 * the name is the accountability.
 *
 * Stored, not shown: DfyRevision.authorName still records who wrote it, so
 * this changes what is printed and not what is kept. Which means it reads
 * correctly for the rows written before it, too.
 */
export const STAFF_BYLINE = 'Admin';

/** The name to print against one message in a thread a customer can read. */
export function byline(authorName: string, byStaff: boolean): string {
  return byStaff ? STAFF_BYLINE : authorName;
}

export type ReplyIdentity = {
  /** What to print: the couple's name for the guest, or the typed one if there is no guest. */
  name: string;
  /** What they typed, when it is not the same name. Empty otherwise. */
  alias: string;
};

/**
 * Two spellings of one name. Case, accents, punctuation and runs of spaces are
 * all noise here: "Ma. Teresa", "ma teresa" and "Ma.  Teresa" are one person.
 * Anything past that — a nickname, a shortened name, one half of a couple — is
 * a real difference and is kept rather than guessed at.
 */
export function sameName(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}

function normalise(s: string): string {
  return (s ?? '')
    .normalize('NFKD')
    // Combining marks, so an é and an e are the same letter here.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function replyIdentity(rsvpName: string, guestName?: string | null): ReplyIdentity {
  const typed = (rsvpName ?? '').trim();
  const listed = (guestName ?? '').trim();
  // No guest row behind it: a public-link reply, where the typed name is all
  // anybody has and there is nothing to disagree with.
  if (!listed) return { name: typed, alias: '' };
  if (!typed) return { name: listed, alias: '' };
  return { name: listed, alias: sameName(typed, listed) ? '' : typed };
}
