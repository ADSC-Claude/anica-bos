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
export type SeatReply = { response: 'ACCEPT' | 'DECLINE'; seats: number };

export function seatsHeld(seatsAllotted: number, reply: SeatReply | null | undefined): number {
  if (!reply) return Math.max(0, seatsAllotted);
  return reply.response === 'ACCEPT' ? Math.max(0, reply.seats) : 0;
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
