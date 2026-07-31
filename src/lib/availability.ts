/**
 * Therapist and room availability.
 *
 * Availability is driven by the receptionist's attendance log: only therapists
 * who have timed in (and not yet timed out) are offered for today. For future
 * dates there is no attendance yet, so it falls back to the default weekly
 * schedule and day-off. Rotation order follows the time-in sequence.
 */
import type { ResourceType } from '@prisma/client';
import { prisma } from './db';
import {
  businessDate,
  dateKeyToBusinessDate,
  manilaDateKey,
  manilaInstant,
} from './datetime';

const BUSY_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED'] as const;

export type AvailableTherapist = {
  id: string;
  name: string;
  rotationRank: number;
  onDuty: boolean;
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Therapists who can perform `serviceIds` and are free for the whole window. */
export async function availableTherapists(opts: {
  branchId: string;
  startAt: Date;
  endAt: Date;
  serviceIds: string[];
  /** Ignore this appointment's own bookings (when editing). */
  excludeAppointmentId?: string;
}): Promise<AvailableTherapist[]> {
  const dateKey = manilaDateKey(opts.startAt);
  const isToday = dateKey === manilaDateKey();
  const isPastOrToday = dateKeyToBusinessDate(dateKey) <= businessDate();
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();

  const employees = await prisma.employee.findMany({
    where: {
      branchId: opts.branchId,
      active: true,
      employeeRole: 'THERAPIST',
      ...(opts.serviceIds.length
        ? { skills: { some: { serviceId: { in: opts.serviceIds } } } }
        : {}),
    },
    include: {
      skills: true,
      schedules: { where: { dayOfWeek: weekday } },
      attendances: { where: { workDate: dateKeyToBusinessDate(dateKey) } },
    },
    orderBy: { name: 'asc' },
  });

  // Must be skilled in EVERY requested service, not just one.
  const skilled = employees.filter((e) => {
    if (!opts.serviceIds.length) return true;
    const owned = new Set(e.skills.map((s) => s.serviceId));
    return opts.serviceIds.every((id) => owned.has(id));
  });

  const onDuty = skilled.filter((e) => {
    const attendance = e.attendances[0];
    if (isPastOrToday) {
      // Attendance is authoritative for today and past days.
      if (!attendance?.timeIn) return false;
      if (isToday && attendance.timeOut) return false;
      return true;
    }
    // Future date: fall back to the default schedule.
    const sched = e.schedules[0];
    return !sched || !sched.isDayOff;
  });

  if (!onDuty.length) return [];

  const conflicts = await prisma.appointmentService.findMany({
    where: {
      employeeId: { in: onDuty.map((e) => e.id) },
      appointment: {
        branchId: opts.branchId,
        status: { in: [...BUSY_STATUSES] },
        startAt: { lt: opts.endAt },
        endAt: { gt: opts.startAt },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
    },
    select: { employeeId: true },
  });
  const busy = new Set(conflicts.map((c) => c.employeeId));

  return onDuty
    .filter((e) => !busy.has(e.id))
    .map((e) => ({
      id: e.id,
      name: e.name,
      rotationRank: e.attendances[0]?.rotationRank ?? 999,
      onDuty: Boolean(e.attendances[0]?.timeIn),
    }))
    .sort((a, b) => a.rotationRank - b.rotationRank || a.name.localeCompare(b.name));
}

/**
 * Rotation pick for walk-ins and "no preference" bookings: first in, first in
 * queue, then round-robin by who has served fewest sessions today.
 */
export async function nextTherapistInRotation(opts: {
  branchId: string;
  startAt: Date;
  endAt: Date;
  serviceIds: string[];
}): Promise<AvailableTherapist | null> {
  const candidates = await availableTherapists(opts);
  if (!candidates.length) return null;

  const dateKey = manilaDateKey(opts.startAt);
  const counts = await prisma.appointmentService.groupBy({
    by: ['employeeId'],
    where: {
      employeeId: { in: candidates.map((c) => c.id) },
      appointment: {
        branchId: opts.branchId,
        status: { in: [...BUSY_STATUSES] },
        startAt: { gte: manilaInstant(dateKey, 0), lt: manilaInstant(dateKey, 1440) },
      },
    },
    _count: { _all: true },
  });
  const byEmployee = new Map(counts.map((c) => [c.employeeId, c._count._all]));

  return [...candidates].sort(
    (a, b) =>
      (byEmployee.get(a.id) ?? 0) - (byEmployee.get(b.id) ?? 0) ||
      a.rotationRank - b.rotationRank,
  )[0];
}

export type AvailableResource = {
  id: string;
  name: string;
  type: string;
  /** How many people still fit. 1 for an ordinary bed nobody is on. */
  remaining: number;
  /**
   * Taken whole, by one party, or shared between unrelated bookings.
   *
   * A row of open beds is shared. A couples room and the sauna are not: the
   * party that books one holds all of it, so `remaining` on an exclusive place
   * is how many of *your own* guests still fit, not how many strangers could
   * join you.
   */
  exclusiveUse: boolean;
  /** Total places, so the caller can tell "2 of 2 free" from "2 of 4 free". */
  capacity: number;
};

/**
 * The kind of place a booking needs.
 *
 * A booking can hold several services, and they may not agree — a massage plus
 * a foot spa needs a bed for the massage, not a chair for both. The longest
 * treatment is the one the room is really being held for, so its requirement
 * wins. Null means the service does not care, and any free place will do.
 */
export function requiredPlaceFor(
  services: { durationMinutes: number; requiredResourceType: ResourceType | null }[],
): ResourceType | null {
  const withRequirement = services
    .filter((s) => s.requiredResourceType)
    .sort((a, b) => b.durationMinutes - a.durationMinutes);
  return withRequirement[0]?.requiredResourceType ?? null;
}

/**
 * Which physical places satisfy a requirement.
 *
 * A treatment that needs a bed is equally happy in a private room or on an open
 * bed — Room 1 and Room 2 each hold two beds, and refusing them because they
 * are filed as ROOM would throw away half the beds in the spa. A foot spa needs
 * a chair and nothing else will do; a sauna session needs the sauna.
 */
export function placesSatisfying(required: ResourceType): ResourceType[] {
  return required === 'BED' || required === 'ROOM' ? ['ROOM', 'BED'] : [required];
}

/** Rooms, beds and chairs with room for at least one more person. */
export async function availableResources(opts: {
  branchId: string;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: string;
  /** Restrict to one kind of place. Omitted means any. */
  resourceType?: ResourceType | null;
  /**
   * The party asking. An exclusive place already held by *this* party still has
   * room for its other guests; held by anyone else it is simply gone.
   */
  partyRef?: string;
  /**
   * How many guests still need placing. A whole-unit place is only offered when
   * the party can fill it — which is what stops one person taking a couples
   * room and stranding the other bed.
   */
  partySize?: number;
}): Promise<AvailableResource[]> {
  const resources = await prisma.resource.findMany({
    where: {
      branchId: opts.branchId,
      active: true,
      ...(opts.resourceType ? { type: { in: placesSatisfying(opts.resourceType) } } : {}),
    },
    orderBy: { sortRank: 'asc' },
  });
  const taken = await prisma.appointment.findMany({
    where: {
      branchId: opts.branchId,
      resourceId: { not: null },
      status: { in: [...BUSY_STATUSES] },
      startAt: { lt: opts.endAt },
      endAt: { gt: opts.startAt },
      ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
    },
    select: { resourceId: true, partyRef: true },
  });

  // Capacity, not a yes/no. A couples room holds two and a foot-spa area holds
  // as many chairs as it has; treating one booking as filling the whole thing
  // loses the rest. Counting per resource is also what stops a place being
  // handed out more times than it has room for.
  //
  // Held separately by party, because an exclusive place cares *who* is in it,
  // not just how many.
  const used = new Map<string, number>();
  const holders = new Map<string, Set<string>>();
  for (const t of taken) {
    if (!t.resourceId) continue;
    used.set(t.resourceId, (used.get(t.resourceId) ?? 0) + 1);
    const set = holders.get(t.resourceId) ?? new Set<string>();
    // An appointment with no partyRef is its own party of one.
    set.add(t.partyRef || `solo:${t.resourceId}:${set.size}`);
    holders.set(t.resourceId, set);
  }

  const mine = opts.partyRef ?? '';
  const stillToPlace = Math.max(1, opts.partySize ?? 1);

  return resources
    .map((r) => {
      const capacity = Math.max(1, r.capacity);
      const inUse = used.get(r.id) ?? 0;
      return { r, capacity, remaining: capacity - inUse };
    })
    .filter(({ r, capacity, remaining }) => {
      if (remaining <= 0) return false;
      if (!r.exclusiveUse) return true;
      const inUse = capacity - remaining;

      // Whole-unit places from here down.
      const others = [...(holders.get(r.id) ?? [])].filter((ref) => !mine || ref !== mine);
      // Anyone else inside means the place is gone, however much room is left.
      if (others.length) return false;
      // Empty and exclusive: only offer it to a party that can fill it.
      if (inUse === 0 && stillToPlace < capacity) return false;
      return true;
    })
    .map(({ r, capacity, remaining }) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      remaining,
      exclusiveUse: r.exclusiveUse,
      capacity,
    }));
}

/** Throws when a therapist or room would be double-booked. */
export async function assertNoConflicts(opts: {
  branchId: string;
  startAt: Date;
  endAt: Date;
  employeeIds: string[];
  resourceId?: string | null;
  excludeAppointmentId?: string;
  /** The kind of place the booked services need, when they need a specific one. */
  resourceType?: ResourceType | null;
  /** The party asking, so its own guests do not read as strangers. */
  partyRef?: string;
  /** How many guests the party is placing here, for whole-unit places. */
  partySize?: number;
}): Promise<void> {
  if (opts.employeeIds.length) {
    const clash = await prisma.appointmentService.findFirst({
      where: {
        employeeId: { in: opts.employeeIds },
        appointment: {
          branchId: opts.branchId,
          status: { in: [...BUSY_STATUSES] },
          startAt: { lt: opts.endAt },
          endAt: { gt: opts.startAt },
          ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
        },
      },
      include: { employee: true, appointment: true },
    });
    if (clash) {
      throw new Error(
        `${clash.employee?.name ?? 'That therapist'} is already booked at that time.`,
      );
    }
  }

  if (opts.resourceId) {
    // The last line of defence against overbooking: the booking form filters by
    // availability, but two people can reach checkout at the same moment, so
    // the count is taken again here rather than trusted from the form.
    const resource = await prisma.resource.findUnique({ where: { id: opts.resourceId } });

    // Picking the place by hand bypasses the filtered list, so the requirement
    // is checked again here — otherwise a 90-minute massage can still be put on
    // a foot-spa chair, and the chair is then unavailable to the foot spa.
    if (opts.resourceType && resource && !placesSatisfying(opts.resourceType).includes(resource.type)) {
      throw new Error(
        `${resource.name} is not the right kind of place for that treatment — it needs a ${opts.resourceType.toLowerCase()}.`,
      );
    }

    const capacity = Math.max(1, resource?.capacity ?? 1);
    const overlappingRows = await prisma.appointment.findMany({
      where: {
        branchId: opts.branchId,
        resourceId: opts.resourceId,
        status: { in: [...BUSY_STATUSES] },
        startAt: { lt: opts.endAt },
        endAt: { gt: opts.startAt },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
      select: { partyRef: true },
    });
    const overlapping = overlappingRows.length;

    if (resource?.exclusiveUse) {
      // A whole-unit place goes to one party. Somebody else being inside means
      // it is gone even with places to spare, which is the difference between
      // a couples room and a row of open beds.
      const mine = opts.partyRef ?? '';
      const strangers = overlappingRows.filter((row) => !mine || row.partyRef !== mine).length;
      if (strangers > 0) {
        throw new Error(
          `${resource.name} is taken by another booking at that time — it is not shared.`,
        );
      }
      // Empty and exclusive: only a party that fills it may have it, or the
      // remaining places are stranded for the evening.
      if (overlapping === 0 && (opts.partySize ?? 1) < capacity) {
        throw new Error(
          `${resource.name} takes ${capacity} — a smaller booking would leave places nobody else can use.`,
        );
      }
    }
    if (overlapping >= capacity) {
      const name = resource?.name ?? 'That room/bed';
      throw new Error(
        capacity === 1
          ? `${name} is already taken at that time.`
          : `${name} is full at that time — all ${capacity} places are booked.`,
      );
    }
  }
}

/**
 * Would this booking still be running after closing time?
 *
 * Manila is UTC+8 with no daylight saving, so the offset is a constant rather
 * than a lookup. Closing is expressed as minutes from midnight and may be 1440
 * (midnight itself), which is why the start minute is not wrapped: a booking
 * that starts at 23:30 must compare as 1410, not as 1410 % 1440.
 */
export function runsPastClosing(
  startAt: Date,
  durationMinutes: number,
  closeMinute: number,
): boolean {
  const startMinute = startAt.getUTCHours() * 60 + startAt.getUTCMinutes() + 8 * 60;
  return (startMinute % 1440) + durationMinutes > closeMinute;
}

export type DaySlot = {
  minute: number;
  startAt: Date;
  /**
   * The treatment would still be running after closing time.
   *
   * These are offered rather than hidden, because turning away a 9pm caller who
   * wants a 90-minute massage is turning away the business the late hours exist
   * to catch. But they are a request, not a reservation: someone at the desk has
   * to agree to stay, so nothing is promised and no deposit is taken until they
   * do.
   */
  needsApproval: boolean;
};

/**
 * Bookable start times for a service on a given Manila date.
 *
 * Two cut-offs, not one. Treatments that finish before closing are sold
 * normally. After that, `lastCallMinutes` before closing stays open for
 * requests — the spa's own "last call" — and everything later is not offered at
 * all, because at some point the answer really is no.
 */
export function slotsForDay(opts: {
  dateKey: string;
  openMinute: number;
  closeMinute: number;
  durationMinutes: number;
  stepMinutes: number;
  leadTimeMinutes: number;
  /** How long before closing a request may still start. 0 disables requests. */
  lastCallMinutes?: number;
  now?: Date;
}): DaySlot[] {
  const now = opts.now ?? new Date();
  const earliest = new Date(now.getTime() + opts.leadTimeMinutes * 60_000);
  const lastCall = Math.max(0, opts.lastCallMinutes ?? 0);

  // The latest a booking may start at all: whichever is later of "finishes by
  // closing" and "starts by last call". Without the Math.max, a short treatment
  // would lose the slots between last call and closing that it can genuinely
  // finish inside.
  const latestStart = Math.max(
    opts.closeMinute - opts.durationMinutes,
    lastCall ? opts.closeMinute - lastCall : -1,
  );

  const out: DaySlot[] = [];
  for (let m = opts.openMinute; m <= latestStart; m += opts.stepMinutes) {
    const startAt = manilaInstant(opts.dateKey, m);
    if (startAt < earliest) continue;
    out.push({
      minute: m,
      startAt,
      needsApproval: m + opts.durationMinutes > opts.closeMinute,
    });
  }
  return out;
}

export type PlanPlace = {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number;
  exclusiveUse: boolean;
  /** Places already occupied in this window. */
  taken: number;
  remaining: number;
  /** Exclusive, and somebody who is not the asking party is inside. */
  heldByOther: boolean;
  /** When the earliest overlapping booking ends, for "until 8:30". */
  freeFromIso: string | null;
};

/**
 * Every place in the branch with its state for one window — not only the free
 * ones.
 *
 * A picker that hides taken beds leaves the guest asking "why can I not have
 * that one", and answering that question after the click is worse than
 * answering it before. So this returns the whole floor and lets the caller
 * draw it: free, taken until a time, or held whole by another party.
 */
export async function floorPlan(opts: {
  branchId: string;
  startAt: Date;
  endAt: Date;
  partyRef?: string;
  excludeAppointmentId?: string;
}): Promise<PlanPlace[]> {
  const [resources, taken] = await Promise.all([
    prisma.resource.findMany({
      where: { branchId: opts.branchId, active: true },
      orderBy: { sortRank: 'asc' },
    }),
    prisma.appointment.findMany({
      where: {
        branchId: opts.branchId,
        resourceId: { not: null },
        status: { in: [...BUSY_STATUSES] },
        startAt: { lt: opts.endAt },
        endAt: { gt: opts.startAt },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
      select: { resourceId: true, partyRef: true, endAt: true },
    }),
  ]);

  const mine = opts.partyRef ?? '';
  return resources.map((r) => {
    const here = taken.filter((t) => t.resourceId === r.id);
    const capacity = Math.max(1, r.capacity);
    const strangers = here.filter((t) => !mine || t.partyRef !== mine);
    // The soonest it frees up, which is the only useful thing to say about a
    // place somebody cannot have.
    const freeFrom = here.length
      ? here.reduce((a, b) => (a.endAt < b.endAt ? a : b)).endAt
      : null;
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      capacity,
      exclusiveUse: r.exclusiveUse,
      taken: here.length,
      remaining: Math.max(0, capacity - here.length),
      heldByOther: r.exclusiveUse && strangers.length > 0,
      freeFromIso: freeFrom ? freeFrom.toISOString() : null,
    };
  });
}
