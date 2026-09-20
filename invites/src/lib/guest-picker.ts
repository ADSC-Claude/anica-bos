import 'server-only';
import { prisma } from './db';
import { attendeesOf } from './attendees';
import { matchesName, answeredFor, MIN_QUERY, MAX_MATCHES } from './guest-match';

// The rule itself lives in guest-match.ts, with no server and no Prisma, so
// the form and the tests reach the same floor this endpoint enforces.
export { matchesName, MIN_QUERY, MAX_MATCHES };

/**
 * Picking your name off the couple's own list instead of typing it.
 *
 * "when the guest type their names (also in the companion), they can simply
 * click their name that shows because this can allow the guest and the
 * celebrant to see the name listed instead of sometimes guest put their
 * nicknames that doesnt show up in the list that didnt match the guestlist"
 *
 * A guest list is a list of names the couple wrote. A reply is a name the
 * guest wrote. The two are supposed to be the same person and very often are
 * not: "Jhen" replies, "Jennifer Dela Cruz" is on the list, and the couple is
 * left matching them by hand the week of the wedding — or worse, doesn't, and
 * caters for both.
 *
 * So the form offers the list back. Type three letters, see the names that
 * match, tap yours. What is stored is the couple's spelling and the id of the
 * row, so the two can never drift apart again.
 *
 * ── What this costs, and why it is off until asked for ──────────────────────
 *
 * A guest list is private, and a search box on a page anybody with the link
 * can open is a way to read it. Three letters at a time, eight names at a
 * time, but read it all the same. That is a real trade and it is not ours to make
 * quietly on a couple's behalf, so `nameFromList` starts off and the hint
 * beside it says plainly what switching it on does. An invitation published
 * before this existed is unaffected: no switch, no endpoint, nothing changes.
 *
 * What is never returned, switch or no switch: the token (which *is* the
 * identity — a personal link), the phone, the address, the table, the notes,
 * the allotment. Only a name, the couple's own tag for it, and whether an
 * answer has already arrived for that person.
 *
 * Picking a name is not proof of being them. Anyone could tap anyone. So the
 * id is used to *attribute* a reply, never to grant anything: no seat
 * allotment is unlocked by it, and no contact detail is written back onto the
 * guest's row from it — both of those stay with the personal link, where the
 * token is the evidence. See submitRsvp().
 */

/** The least a guest needs to recognise themselves, and nothing more. */
export type GuestMatch = {
  id: string;
  name: string;
  /** The couple's own tag — "Ninongs", "Office" — so two Marias are telling apart. */
  group: string;
  /** An answer already exists for this person, from them or from their party. */
  replied: boolean;
};

/**
 * Everyone on this invitation who has been answered for, and by whom.
 *
 * The rule itself is answeredFor() in guest-match.ts, where it can be read
 * and tested without a database; this is the query that feeds it. One scan
 * serves both readers — the tick in the guest's drop-down and the "with Ana
 * Dela Cruz" on the couple's own list — so the two can never disagree about
 * who has replied.
 */
export async function answeredGuests(invitationId: string): Promise<Map<string, string>> {
  const replies = await prisma.rsvp.findMany({
    where: { invitationId },
    select: { name: true, guestId: true, attendees: true, response: true },
    orderBy: { createdAt: 'asc' },
  });
  return answeredFor(replies.map((r) => ({ ...r, attendees: attendeesOf(r.attendees) })));
}

/**
 * The names to offer for what has been typed.
 *
 * The whole list is read and filtered here rather than asked of Postgres with
 * a LIKE, because the match is per-word and the lists are small — a big
 * Filipino wedding is four hundred rows, and the couple is paying for a
 * package that has a guest list at all. A query that cannot use an index is
 * worse than four hundred rows in memory.
 */
export async function searchGuests(invitationId: string, query: string): Promise<GuestMatch[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];
  const [guests, covered] = await Promise.all([
    prisma.guest.findMany({
      where: { invitationId },
      select: { id: true, name: true, groupName: true },
      orderBy: { name: 'asc' },
    }),
    answeredGuests(invitationId),
  ]);
  return guests
    .filter((g) => matchesName(g.name, q))
    .slice(0, MAX_MATCHES)
    .map((g) => ({ id: g.id, name: g.name, group: g.groupName, replied: covered.has(g.id) }));
}

/**
 * Which of these ids are really rows on this invitation's list.
 *
 * Everything arriving from the form is a claim, including the ids: the page
 * that sent them is a page anybody can edit. So no id reaches the database
 * until it has been found on this invitation, and one that cannot be is
 * dropped rather than refused — the reply itself is still good, and losing a
 * christening RSVP over a stale id would be the wrong trade entirely.
 */
export async function realGuestIds(invitationId: string, ids: string[]): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter(Boolean))].slice(0, 32);
  if (!wanted.length) return new Set();
  const found = await prisma.guest.findMany({
    where: { invitationId, id: { in: wanted } },
    select: { id: true },
  });
  return new Set(found.map((g) => g.id));
}
