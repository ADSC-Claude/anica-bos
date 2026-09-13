/**
 * The RSVP tab's numbers, drawn from the replies.
 *
 * Pure and free of Prisma, so the page and the tests read one arithmetic and
 * a later reader of the same figures — a digest, the admin's view — does not
 * grow a second one. Seats go through replySeats, so a number the couple
 * settled overrides the one the guest put down and a regret holds nothing,
 * which is how every other count in the account reads a reply.
 *
 * The meal and dietary counts look only at the replies that said yes. The
 * form asks those questions only after a yes, so what a regret carries is at
 * best a stale answer from before they changed their mind, and a caterer
 * does not cook for it.
 */
import { replySeats } from './seats';

/** A reply, as much of it as the numbers need. */
export type StatReply = {
  response: 'ACCEPT' | 'DECLINE';
  seats: number;
  seatsApproved: number | null;
  mealChoice: string;
  dietary: string;
  message: string;
  name: string;
};

export type BreakdownKey = 'attending' | 'declined' | 'pending';

export type RsvpStats = {
  /** Replies of either kind. */
  responses: number;
  /** Replies that said yes. */
  accepted: number;
  /** Seats confirmed across the replies that said yes. */
  attending: number;
  /** Replies that said no. */
  notAttending: number;
  /** Seats per reply that said yes, to one decimal; 0 with nobody to average. */
  averageParty: number;
  /** Yes, no and silent, each as a share of everybody asked; the shares add to 100. */
  breakdown: { key: BreakdownKey; label: string; count: number; pct: number }[];
  /** Each meal somebody picked, counted by seat the way the headcount sheet counts it, most picked first. */
  meals: { label: string; count: number }[];
  /** How many of the replies that said yes wrote a dietary note. */
  toldDietary: number;
  /** Every need mentioned, grouped across the notes, most mentioned first. */
  dietary: { label: string; count: number }[];
  /** What guests wrote, in the order the replies were given. */
  messages: { name: string; message: string }[];
};

export function rsvpStats(rsvps: StatReply[], pending: number): RsvpStats {
  const accepted = rsvps.filter((r) => r.response === 'ACCEPT');
  const declined = rsvps.filter((r) => r.response === 'DECLINE');
  const attending = accepted.reduce((sum, r) => sum + replySeats(r), 0);
  const silent = Math.max(0, pending);
  const [yesPct, noPct, silentPct] = wholeShares([accepted.length, declined.length, silent]);

  // By seat and never below one, exactly as rsvpSheet counts them: a reply
  // picks one meal for its whole party, and the sheet the caterer holds says
  // four chickens for a party of four. A card here that said one would send
  // the couple to us asking which number is right.
  const meals = new Map<string, number>();
  for (const r of accepted) {
    const label = r.mealChoice.trim();
    if (label) meals.set(label, (meals.get(label) ?? 0) + Math.max(1, replySeats(r)));
  }

  return {
    responses: rsvps.length,
    accepted: accepted.length,
    attending,
    notAttending: declined.length,
    averageParty: accepted.length ? Math.round((attending / accepted.length) * 10) / 10 : 0,
    breakdown: [
      { key: 'attending', label: 'Attending', count: accepted.length, pct: yesPct },
      { key: 'declined', label: 'Not attending', count: declined.length, pct: noPct },
      { key: 'pending', label: 'No reply yet', count: silent, pct: silentPct },
    ],
    meals: [...meals.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    toldDietary: accepted.filter((r) => r.dietary.trim()).length,
    dietary: dietaryNeeds(accepted.map((r) => r.dietary)),
    messages: rsvps.filter((r) => r.message.trim()).map((r) => ({ name: r.name.trim() || 'A guest', message: r.message.trim() })),
  };
}

/**
 * Whole percentages that add up to 100.
 *
 * Rounding each share on its own does not: one, one and one of three round to
 * 33, 33 and 33, and a bar that stops at 99 looks like a reply went missing.
 * So each share keeps its whole part, and the points left over go one each
 * to the shares that lost the most in the cut, earliest first on a tie.
 * Nothing to share gives all noughts rather than a division by nothing.
 */
export function wholeShares(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c * 100) / total);
  const whole = exact.map(Math.floor);
  let left = 100 - whole.reduce((a, b) => a + b, 0);
  const byLoss = exact.map((x, i) => ({ i, lost: x - whole[i] })).sort((a, b) => b.lost - a.lost || a.i - b.i);
  for (const { i } of byLoss) {
    if (left <= 0) break;
    whole[i] += 1;
    left -= 1;
  }
  return whole;
}

/**
 * The dietary notes as needs, one chip each.
 *
 * One guest writes "no pork, shellfish allergy" and another "Shellfish
 * allergy / no pork": the same two needs, and a caterer wants them counted
 * as two, not four. So a note is split on the marks people put between
 * items, matched without regard to case or a full stop at the end, and shown
 * in the first spelling seen with a capital to start it. Each need counts
 * once per note however many times a guest repeats it, because the number is
 * how many guests need it. Most mentioned first, so the thing the kitchen must
 * not get wrong is at the front.
 */
export function dietaryNeeds(notes: string[]): { label: string; count: number }[] {
  const seen = new Map<string, { label: string; count: number }>();
  for (const note of notes) {
    const inThisNote = new Set<string>();
    for (const part of note.split(/[,;/\n]+/)) {
      const item = part.trim().replace(/\s+/g, ' ').replace(/\.+$/, '');
      const key = item.toLowerCase();
      if (!key || inThisNote.has(key)) continue;
      inThisNote.add(key);
      const got = seen.get(key);
      if (got) got.count += 1;
      else seen.set(key, { label: item.charAt(0).toUpperCase() + item.slice(1), count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count);
}
