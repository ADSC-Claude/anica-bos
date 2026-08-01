/**
 * Which places a party may click, and why the rest are greyed out.
 *
 * This lived inside the floor-plan component, where it could only be checked by
 * booking something on the live site and looking at it. It is the most
 * rule-dense part of the booking form and the rules keep arriving one screenshot
 * at a time, so it belongs somewhere a test can reach it.
 *
 * The rules, in the owner's words:
 *
 *  - Rooms 1 and 2 hold two and are sold whole. One person may not have one,
 *    and once a bed in one is taken the other bed is the only place left to the
 *    party until it is filled.
 *  - The sauna holds four and is also one-booking-at-a-time, but it is *not*
 *    sold whole: one guest alone may have it, and the next booking takes it
 *    after her.
 *  - Open beds and the foot-spa chairs are shared: two unrelated bookings sit
 *    side by side all evening.
 *  - A treatment can only go where it belongs — a foot spa needs a chair, a
 *    massage needs a bed.
 */

export type PickerPlace = {
  id: string;
  type: string;
  capacity: number;
  /** One booking at a time: a couples room, the sauna. */
  exclusiveUse: boolean;
  /** And it must be taken whole: a couples room, but not the sauna. */
  fillWhole: boolean;
  /** Places already sold to somebody else in this window. */
  taken: number;
  /** Exclusive, and the booking inside is not ours. */
  heldByOther: boolean;
};

export type PickerGuest = {
  /** Place types this guest's treatments can use. Null means anything will do. */
  accepts: string[] | null;
};

export type SlotState =
  /** Sold to somebody else. */
  | 'full'
  /** Exclusive and held whole by somebody else, with places to spare. */
  | 'held'
  /** One of our party is here. */
  | 'mine'
  /** The guest being placed right now is here. */
  | 'mine-active'
  /** Not the kind of place this guest's treatment needs. */
  | 'wrong-type'
  /** A must-fill place is half done and this guest could finish it. */
  | 'finish-room'
  /** Must be taken whole and not enough of us can use it. */
  | 'needs-more'
  | 'free';

/** Whether a guest's treatment can use this kind of place at all. */
export function guestFits(guest: PickerGuest | undefined, type: string): boolean {
  return !guest?.accepts || guest.accepts.includes(type);
}

/** Which of our party are in a place, in guest order. */
export function occupantsOf(seats: Record<number, string>, count: number, placeId: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) if (seats[i] === placeId) out.push(i);
  return out;
}

/**
 * Guests who could still fill a place of this kind: whoever has no place yet,
 * plus the one being placed right now, who may be moved — and, crucially, only
 * those whose treatment can go there.
 *
 * Counting the whole party was the bug behind the first report. Four people
 * where two want massages, one wants reflexology and one wants the sauna is
 * *not* four candidates for a couples room; it is two. Without the filter the
 * room was offered, one guest took a bed in it, and the only other person who
 * could have filled it had already been seated in the open beds — leaving a bed
 * nobody could book and no way forward but to start over.
 */
export function movableInto(
  guests: PickerGuest[],
  seats: Record<number, string>,
  activeGuest: number,
  type: string,
): number {
  return guests.filter(
    (g, i) => (i === activeGuest || seats[i] === undefined) && guestFits(g, type),
  ).length;
}

/**
 * A must-fill place this party has started and not finished.
 *
 * A couples room is sold whole, so the moment one of the party is in it the
 * rest of it is theirs to fill — and until they do, nothing else may be chosen.
 * Letting the next guest wander into Room 2 is how both rooms end up
 * half-occupied, which is the state that leaves two beds nobody can book.
 */
export function pendingFill<P extends PickerPlace>(
  plan: P[],
  seats: Record<number, string>,
  guestCount: number,
): P | null {
  return (
    plan.find((p) => {
      if (!p.fillWhole) return false;
      const inside = occupantsOf(seats, guestCount, p.id).length;
      return inside > 0 && inside + p.taken < p.capacity;
    }) ?? null
  );
}

/**
 * ...but it only holds back the guests who could actually finish it.
 *
 * "Finish Room 1 first" is sound advice for the other half of a couple and
 * nonsense for the friend booked in for reflexology: she cannot lie on that bed
 * whatever she does, so holding her chair hostage to it leaves her with nothing
 * clickable at all — which is exactly how it was reported. She takes her chair;
 * the room still has to be finished by someone who can, and Continue keeps
 * saying so until it is.
 */
export function blockingFill<P extends PickerPlace>(
  plan: P[],
  guests: PickerGuest[],
  seats: Record<number, string>,
  activeGuest: number,
): P | null {
  const pending = pendingFill(plan, seats, guests.length);
  if (!pending) return null;
  return guestFits(guests[activeGuest], pending.type) ? pending : null;
}

/**
 * The state of one place *inside* a resource, not of the resource.
 *
 * A couples room holds two, and drawing it as a single box was an earlier bug:
 * one of you could be put in it and the other could not, so a room the pair had
 * come for looked taken by their own booking. `index` is which of the
 * resource's places this is, counting the ones already sold from the left.
 */
export function slotState(opts: {
  plan: PickerPlace[];
  place: PickerPlace;
  index: number;
  guests: PickerGuest[];
  seats: Record<number, string>;
  activeGuest: number;
}): SlotState {
  const { plan, place: p, index: k, guests, seats, activeGuest } = opts;
  const guest = guests[activeGuest];

  // Places already sold to somebody else fill up from the left.
  if (k < p.taken) return p.heldByOther ? 'held' : 'full';

  const occupants = occupantsOf(seats, guests.length, p.id);
  const occupant = occupants[k - p.taken];
  if (occupant === activeGuest) return 'mine-active';
  if (occupant !== undefined) return 'mine';

  if (p.heldByOther) return 'held';
  // The most specific reason first: a chair is not "finish Room 1 first" to
  // somebody having a massage, it is simply not their kind of place.
  if (!guestFits(guest, p.type)) return 'wrong-type';

  const pending = blockingFill(plan, guests, seats, activeGuest);
  if (pending && p.id !== pending.id) return 'finish-room';

  // A must-fill place only opens to a party that can fill it *with people who
  // can use it* — but once one of us is inside, the rest may join rather than
  // being told it is too big.
  if (
    p.fillWhole &&
    p.taken === 0 &&
    occupants.length === 0 &&
    movableInto(guests, seats, activeGuest, p.type) < p.capacity
  ) {
    return 'needs-more';
  }
  return 'free';
}
