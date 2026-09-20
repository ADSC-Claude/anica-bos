/**
 * How a typed name is matched against the couple's guest list, and how little
 * of that list an answer may be.
 *
 * Deliberately free of `server-only` and of Prisma, for the same reason
 * src/lib/seats.ts is: the rule has to hold in three places at once. The
 * endpoint filters with it, the RSVP form decides with it whether a keystroke
 * is even worth a request, and the tests read it without standing a database
 * up. A floor of three characters kept in two of those places is a floor that
 * will be four in one of them by Christmas.
 */

/**
 * Three characters, not one.
 *
 * A guest list is private, and a search box on a page anybody with the link
 * can open is a way to read it. One letter hands back a quarter of the list
 * per keystroke; two is 676 sweeps to have the lot. Three is roughly
 * seventeen thousand, which is the difference between reading a guest list
 * and setting out to.
 *
 * It is also about where a person has typed enough for the answer to be
 * useful: "An" offers everyone at the party, "Ana" offers Ana.
 */
export const MIN_QUERY = 3;

/**
 * Eight fills a phone screen, and a screenful is a handful rather than a
 * list. The cap is the other half of the floor above: no query, however
 * cleverly chosen, returns the guest list in one go.
 */
export const MAX_MATCHES = 8;

/**
 * Names that begin with what was typed — at the start of the name or of any
 * word inside it.
 *
 * So "dela" finds Ana Dela Cruz and "cruz" finds her too, because a Filipino
 * guest types whichever part of their name they think of as theirs. But "ela"
 * finds nobody: matching anywhere inside a word makes a three-letter sweep
 * cheap again, which is the whole thing being guarded against.
 *
 * Split on the punctuation these lists actually carry — "Ma. Cristina
 * Reyes-Santos", "Mr. & Mrs. Dela Cruz", "Jose (Jojo) Rizal" — so a surname
 * behind a hyphen and a nickname in brackets are both findable.
 */
export function matchesName(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return false;
  return name
    .toLowerCase()
    .split(/[\s,.()/-]+/)
    .filter(Boolean)
    .some((word) => word.startsWith(q));
}

/**
 * Who on a guest list has been answered for, and by whom.
 *
 * Two ways to have been. A reply of your own — accept or regret, both are
 * answers — or somebody picking you off the same list as one of their party.
 *
 * "if the other family member listed their parents or grandparents it would
 * show checked mark at the side of the name that shows that the name has RSVP
 * already"
 *
 * The second kind is read back out of the reply that carried it rather than
 * written as a reply of its own, and that is the whole reason the seats still
 * add up. A shadow row for Lola Rosa would be counted by `rsvpSummary` as a
 * second acceptance and by the seating chart as a second body, when she is
 * already one of the two seats her daughter claimed. One reply holds the
 * seats; who those seats are is inside it.
 *
 * The value is the name of whoever answered, or a blank string when they
 * answered for themselves — because "Replied" on a row nobody remembers
 * filling in is a puzzle, and "with Ana Dela Cruz" is an answer.
 *
 * Own replies are taken first and never overwritten: a guest who answered and
 * was *also* named in a cousin's party has spoken for themselves, and that is
 * the better record of the two.
 */
export type ReplyRow = {
  name: string;
  response: 'ACCEPT' | 'DECLINE';
  guestId?: string | null;
  attendees: { name: string; guestId?: string }[];
};

export function answeredFor(replies: ReplyRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of replies) if (r.guestId) out.set(r.guestId, '');
  for (const r of replies) {
    // A regret brings nobody. An old reply edited down from four to one can
    // still be carrying the party it used to have, so only an acceptance is
    // allowed to speak for anyone else.
    if (r.response !== 'ACCEPT') continue;
    for (const a of r.attendees) {
      // The head of a party appears in their own attendee list; that is them,
      // not somebody answering for them.
      if (a.guestId && a.name !== r.name && !out.has(a.guestId)) out.set(a.guestId, r.name);
    }
  }
  return out;
}
