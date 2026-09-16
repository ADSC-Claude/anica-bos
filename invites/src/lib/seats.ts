/**
 * How many seats a guest is holding, and the one place that decides it.
 *
 * Three numbers get confused with each other:
 *
 *   • what the couple set aside for them  — Guest.seatsAllotted
 *   • what they confirmed when they replied — Rsvp.seats
 *   • what they are holding now             — this
 *
 * Before a guest answers, the allotment is the number to plan against: it is
 * the couple's own intention and nothing better exists yet. Once they accept,
 * it is what they confirmed — a guest offered three places who brings one has
 * released two. Once they decline it is nothing at all.
 *
 * That last case was wrong in two places at once, both of which read "not
 * ACCEPT" as "no reply yet" and fell back to the allotment. A table of ten
 * with two regrets showed as full, so the couple could not give the places
 * away; and the check-in desk offered a coordinator seats for somebody who had
 * already said they were not coming.
 *
 * It lives here rather than beside either of them because the two disagreed,
 * and a rule kept in two places is a rule that will disagree again. This file
 * is deliberately free of `server-only` and of Prisma: the guest list manager
 * is a client component, the check-in desk is rendered on the server, and both
 * have to reach the same answer.
 */

/** A reply, as much of it as this rule needs. */
export type SeatReply = {
  response: 'ACCEPT' | 'DECLINE';
  seats: number;
  /**
   * What the couple settled on, once they looked at it. Null means they have
   * not, and the guest's own number stands — which is right for the replies
   * that arrived through a personal link, because the couple's allotment was
   * already applied when the reply was written.
   */
  seatsApproved?: number | null;
};

export function seatsHeld(seatsAllotted: number, reply: SeatReply | null | undefined): number {
  if (!reply) return Math.max(0, seatsAllotted);
  if (reply.response !== 'ACCEPT') return 0;
  return Math.max(0, reply.seatsApproved ?? reply.seats);
}

/**
 * What one reply is holding, with no allotment in the picture.
 *
 * Everywhere that counts a reply rather than a guest — the headcount sheet, the
 * exports, the totals — wants this. Written out because `seatsHeld(0, reply)`
 * is the same call with a magic nought in it, and a magic nought is how the
 * next person ends up reading the raw claim instead.
 */
export function replySeats(reply: SeatReply | null | undefined): number {
  return reply ? seatsHeld(0, reply) : 0;
}

/**
 * Whether a reply is waiting on the couple before anybody should act on it.
 *
 * Only the replies nobody vetted. A guest who answered through their personal
 * link was already held to what the couple set aside for them — submitRsvp
 * refuses a bigger number outright — so those never queue, and a couple with a
 * hundred families is not asked to tick a hundred boxes.
 *
 * What is left is the reply that came through the plain link: no guest row, no
 * allotment, and a seats dropdown that goes to ten. That is the one number in
 * this system nobody agreed to, and until now it went straight onto the
 * headcount sheet.
 *
 * One seat is not a claim. Somebody answering for themselves is the ordinary
 * case and does not need a decision; queueing it would bury the ones that do.
 */
export function awaitingDecision(reply: SeatReply | null | undefined, vetted: boolean): boolean {
  if (!reply || reply.response !== 'ACCEPT') return false;
  if (decided(reply)) return false;
  return !vetted && reply.seats > 1;
}

/** Whether the couple has settled this reply, at any number. */
export function decided(reply: SeatReply | null | undefined): boolean {
  return reply?.seatsApproved !== null && reply?.seatsApproved !== undefined;
}

/**
 * What the desk should say about a guest at the door.
 *
 * A guest who declined and turned up anyway is a real thing at a Filipino
 * celebration, so the desk still lists them and still lets them in — it just
 * has to say so, and must not claim places they released. "Waiting" is not the
 * same as "declined" and the two used to look identical.
 */
export function replyState(reply: SeatReply | null | undefined): 'waiting' | 'accepted' | 'declined' {
  if (!reply) return 'waiting';
  return reply.response === 'ACCEPT' ? 'accepted' : 'declined';
}

/**
 * How many people from a party actually walked in.
 *
 * Check-in used to be one bit — `checkedInAt` is set or it is not — and the
 * number the desk announced was `seatsHeld`, which is what the guest confirmed
 * weeks earlier. So a table of four where one stayed home still counted four:
 * a plated meal, a laid place, and nothing in the system disagreeing. The
 * couple found out when they saw the empty chair.
 *
 * `arrivedCount` is the door's own number, and null means the door has not
 * given one. That is deliberate and is what makes this safe to add to a list
 * already half checked in: every arrival recorded before this existed reads as
 * the whole party, which is exactly what the system believed at the time.
 *
 * It is not capped at what they confirmed. A party of two that turns up with a
 * cousin is an ordinary Tuesday at a Filipino reception, and a desk that cannot
 * write down five people standing in front of it is the same bug as the one
 * above, pointing the other way.
 */
export type Arrival = { checkedIn: boolean; arrivedCount: number | null };

export function headsArrived(held: number, arrival: Arrival | null | undefined): number {
  if (!arrival?.checkedIn) return 0;
  return Math.max(0, arrival.arrivedCount ?? held);
}

/**
 * What the stepper says beside a party.
 *
 * "3 of 4" while the number is at or under what they confirmed, because that
 * is the question being answered — how many of the four came. Above it the
 * "of" is a lie, so it stops being used: five people arrived against four
 * confirmed is two facts, not a fraction.
 */
export function arrivalLabel(held: number, arrived: number): string {
  if (arrived > held) return `${arrived} arrived · ${held} confirmed`;
  return `${arrived} of ${held}`;
}
