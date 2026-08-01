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
import { shownName } from './people';
import { effectiveWindow, overlaps as windowsOverlap } from './itinerary';
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
      // "Ms. Jenny", not "Jennifer Delos Santos Ramos" — this list is read by
      // clients on the booking page and by the desk on the schedule.
      name: shownName(e),
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

/**
 * One treatment holding one place for a stretch of time.
 *
 * Occupancy is counted from these rather than from appointments, because a
 * visit is no longer one block in one place: a guest booked for a sauna then a
 * massage holds the sauna from 1:30 and a bed from 2:20, and the bed is free to
 * sell to somebody else until then. Reading the appointment's own window would
 * hold both places for the whole visit and sell neither.
 */
type PlaceHold = {
  resourceId: string;
  appointmentId: string;
  /** Blank for a booking of one; shared by everyone in a group. */
  partyRef: string;
  start: Date;
  end: Date;
};

/**
 * Every treatment occupying a place during the window asked about.
 *
 * The database cannot compute "actual time if logged, plan otherwise" in a
 * WHERE clause, so the query casts a slightly wider net — anything whose plan
 * *or* logged times could reach into the window — and `effectiveWindow` decides
 * precisely. The third clause is the one that matters at the desk: a treatment
 * that has started and not finished is still holding its place, however far
 * past its planned end it has run.
 */
async function placeHolds(opts: {
  branchId: string;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: string;
  excludeSegmentIds?: string[];
}): Promise<PlaceHold[]> {
  const rows = await prisma.appointmentService.findMany({
    where: {
      resourceId: { not: null },
      ...(opts.excludeSegmentIds?.length ? { id: { notIn: opts.excludeSegmentIds } } : {}),
      appointment: {
        branchId: opts.branchId,
        status: { in: [...BUSY_STATUSES] },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
      OR: [
        { startAt: { lt: opts.endAt }, endAt: { gt: opts.startAt } },
        { actualStartAt: { lt: opts.endAt }, actualEndAt: { gt: opts.startAt } },
        { actualStartAt: { lt: opts.endAt, not: null }, actualEndAt: null },
      ],
    },
    select: {
      resourceId: true,
      appointmentId: true,
      startAt: true,
      endAt: true,
      actualStartAt: true,
      actualEndAt: true,
      durationMinutes: true,
      appointment: { select: { partyRef: true } },
    },
  });

  const want = { start: opts.startAt, end: opts.endAt };
  const out: PlaceHold[] = [];
  for (const r of rows) {
    const w = effectiveWindow(r);
    if (!w || !windowsOverlap(w, want)) continue;
    out.push({
      resourceId: r.resourceId!,
      appointmentId: r.appointmentId,
      partyRef: r.appointment.partyRef,
      start: w.start,
      end: w.end,
    });
  }

  // A booking that holds a place but lists no treatments — a room blocked out
  // for cleaning, a reservation taken before the guest decided what she wants —
  // still holds it for its whole window. Counting only treatments would quietly
  // release those places and sell them twice, so the appointment's own window
  // stands in when it has nothing else to say.
  const bare = await prisma.appointment.findMany({
    where: {
      branchId: opts.branchId,
      resourceId: { not: null },
      status: { in: [...BUSY_STATUSES] },
      startAt: { lt: opts.endAt },
      endAt: { gt: opts.startAt },
      services: { none: {} },
      ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
    },
    select: { id: true, resourceId: true, partyRef: true, startAt: true, endAt: true },
  });
  for (const a of bare) {
    out.push({
      resourceId: a.resourceId!,
      appointmentId: a.id,
      partyRef: a.partyRef,
      start: a.startAt,
      end: a.endAt,
    });
  }
  return out;
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
  /**
   * Must be taken whole or not at all.
   *
   * A couples room: one guest in it leaves a bed nobody can book, so it is
   * offered only to a party that fills it. The sauna is exclusive but *not*
   * this — one person booking it alone is a normal sale.
   */
  fillWhole: boolean;
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
  /** Ignore these treatments' own holds — used when re-timing one of them. */
  excludeSegmentIds?: string[];
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
  const taken = await placeHolds(opts);
  return filterFreePlaces(resources, taken, opts);
}

/** The shape `filterFreePlaces` needs — a Prisma `Resource` satisfies it. */
type PlaceRow = {
  id: string;
  name: string;
  type: string;
  capacity: number;
  exclusiveUse: boolean;
  fillWhole: boolean;
};

/**
 * Which of these places still have room, given what is already holding them.
 *
 * Split out from the query so the same rules can be applied to a day's worth of
 * holds loaded once. The day list checks forty-odd start times against several
 * treatments each; going back to the database for every one of those was two
 * queries a slot, and it is the same answer every time.
 */
export function filterFreePlaces<R extends PlaceRow>(
  resources: R[],
  taken: PlaceHold[],
  opts: { partyRef?: string; partySize?: number },
): AvailableResource[] {
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
    used.set(t.resourceId, (used.get(t.resourceId) ?? 0) + 1);
    const set = holders.get(t.resourceId) ?? new Set<string>();
    // A booking with no partyRef is its own party of one. Keyed by appointment
    // so the same solo booking is never counted as two different strangers.
    set.add(t.partyRef || `solo:${t.appointmentId}`);
    holders.set(t.resourceId, set);
  }

  const mine = opts.partyRef ?? '';
  const stillToPlace = Math.max(1, opts.partySize ?? 1);

  return (resources as PlaceRow[])
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
      // Empty and must be filled: only offer it to a party that can fill it.
      // The sauna is exclusive without this, so one guest may have it alone.
      if (r.fillWhole && inUse === 0 && stillToPlace < capacity) return false;
      return true;
    })
    .map(({ r, capacity, remaining }) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      remaining,
      exclusiveUse: r.exclusiveUse,
      fillWhole: r.fillWhole,
      capacity,
    }));
}

/**
 * Every place in the branch and everything holding one, for a whole day.
 *
 * The day list asks the same question of the same rows forty-odd times over.
 * Loading it once and answering in memory is the difference between two
 * database round trips per candidate time and two for the day.
 */
export type DayFloor = {
  resources: PlaceRow[];
  holds: PlaceHold[];
};

export async function loadDayFloor(opts: {
  branchId: string;
  from: Date;
  to: Date;
  excludeAppointmentId?: string;
  excludeSegmentIds?: string[];
}): Promise<DayFloor> {
  const [resources, holds] = await Promise.all([
    prisma.resource.findMany({
      where: { branchId: opts.branchId, active: true },
      orderBy: { sortRank: 'asc' },
      select: {
        id: true, name: true, type: true, capacity: true,
        exclusiveUse: true, fillWhole: true,
      },
    }),
    placeHolds({
      branchId: opts.branchId,
      startAt: opts.from,
      endAt: opts.to,
      excludeAppointmentId: opts.excludeAppointmentId,
      excludeSegmentIds: opts.excludeSegmentIds,
    }),
  ]);
  return { resources, holds };
}

/** The places of a given kind with room to spare during one window. */
export function placesFreeDuring(
  floor: DayFloor,
  opts: {
    startAt: Date;
    endAt: Date;
    resourceType?: string | null;
    partyRef?: string;
    partySize?: number;
  },
): AvailableResource[] {
  const want = { start: opts.startAt, end: opts.endAt };
  const kinds = opts.resourceType
    ? placesSatisfying(opts.resourceType as ResourceType)
    : null;
  const resources = kinds
    ? floor.resources.filter((r) => kinds.includes(r.type as ResourceType))
    : floor.resources;
  const holds = floor.holds.filter((h) => windowsOverlap(h, want));
  return filterFreePlaces(resources, holds, opts);
}

/**
 * A treatment that cannot happen, and why.
 *
 * "No slots" is true and useless. The guest wants a sauna and a massage; if
 * the sauna is spoken for until half past two, that is the sentence to say —
 * she can then move her own booking rather than trying every time on the list.
 */
export type VisitBlocker = {
  /** The treatment that cannot be placed. */
  treatment: string;
  /** The kind of place it needed. */
  placeType: string | null;
  /** When one of those places next comes free, if any is coming free at all. */
  freeAt: Date | null;
};

/**
 * Check a planned visit against the floor, run by run.
 *
 * A *run* is a stretch spent in one place — two bed treatments back to back are
 * one bed held throughout, not two beds with a stranger allowed into the five
 * minutes between them. Checking runs rather than treatments is what makes
 * "massage then ear candling" a single, simple hold.
 *
 * Returns what stops the visit. Empty means it fits.
 */
export function blockersForRuns(
  floor: DayFloor,
  runs: { placeType: string | null; startAt: Date; endAt: Date; label: string }[],
  opts?: { partyRef?: string; partySize?: number },
): VisitBlocker[] {
  const out: VisitBlocker[] = [];
  // Runs are placed one after another against a floor that fills up as we go,
  // because they are all going to be booked at once. Checking each against the
  // *original* floor would tell three friends who all want a massage that one
  // free bed is enough for them.
  const holds = [...floor.holds];
  for (const run of runs) {
    const free = placesFreeDuring(
      { resources: floor.resources, holds },
      {
        startAt: run.startAt,
        endAt: run.endAt,
        resourceType: run.placeType,
        partyRef: opts?.partyRef,
        partySize: opts?.partySize,
      },
    );
    if (free.length) {
      // Take one and let the next run see it as taken. The party's own ref goes
      // on it so a couples room stays open to the rest of the party and closed
      // to everyone else — the same rule a stored booking gets.
      holds.push({
        resourceId: free[0].id,
        appointmentId: '__planned__',
        partyRef: opts?.partyRef ?? '',
        start: run.startAt,
        end: run.endAt,
      });
      continue;
    }

    // When it frees: the earliest any place of the right kind is given back.
    // Only holds that actually overlap this run count — a bed booked for the
    // evening says nothing about a two o'clock massage.
    const kinds = run.placeType ? placesSatisfying(run.placeType as ResourceType) : null;
    const ofKind = new Set(
      floor.resources.filter((r) => !kinds || kinds.includes(r.type as ResourceType)).map((r) => r.id),
    );
    let freeAt: Date | null = null;
    // `holds`, not `floor.holds`: when the thing in the way is an earlier run
    // of this same booking, the honest answer is still the time that place
    // comes back — not silence.
    for (const h of holds) {
      if (!ofKind.has(h.resourceId)) continue;
      if (!windowsOverlap(h, { start: run.startAt, end: run.endAt })) continue;
      if (!freeAt || h.end < freeAt) freeAt = h.end;
    }
    out.push({ treatment: run.label, placeType: run.placeType, freeAt });
  }
  return out;
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
  /** Treatments whose own holds to ignore — used when re-timing one of them. */
  excludeSegmentIds?: string[];
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
    // Counted per treatment, so a guest who leaves this bed at 2:00 stops
    // holding it at 2:00 even though her visit runs to 3:20.
    const overlappingRows = (
      await placeHolds({
        branchId: opts.branchId,
        startAt: opts.startAt,
        endAt: opts.endAt,
        excludeAppointmentId: opts.excludeAppointmentId,
        excludeSegmentIds: opts.excludeSegmentIds,
      })
    ).filter((h) => h.resourceId === opts.resourceId);
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
      // Empty and must be filled: only a party that fills it may have it, or
      // the remaining places are stranded for the evening. Not the sauna —
      // there, one guest alone simply has it to herself.
      if (resource.fillWhole && overlapping === 0 && (opts.partySize ?? 1) < capacity) {
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

/**
 * Why a day came back with nothing.
 *
 * "No free slots left that day. Try another date." is true and useless. When
 * *every* day is empty the cause is never the date — it is a therapist with no
 * treatments ticked, a shift nobody is on, or a place that was switched off —
 * and the person staring at the empty list is usually the one who could fix it
 * in a minute if anybody told them what was wrong.
 */
export type NoSlotReason =
  | 'CLOSED_FOR_DAY'
  | 'NO_THERAPIST_AT_ALL'
  | 'NO_SKILLED_THERAPIST'
  | 'NO_THERAPIST_ON_DUTY'
  | 'NO_PLACE_CONFIGURED'
  | 'PARTY_TOO_LARGE'
  | 'FULLY_BOOKED';

export async function diagnoseNoSlots(opts: {
  branchId: string;
  serviceIds: string[];
  serviceNames: string[];
  place: ResourceType | null;
  candidates: DaySlot[];
  partySize: number;
}): Promise<{ code: NoSlotReason; message: string }> {
  const what = opts.serviceNames.join(' + ') || 'that treatment';

  // Nothing was even offered: the day is over, or starts later than we close.
  if (!opts.candidates.length) {
    return {
      code: 'CLOSED_FOR_DAY',
      message: 'That day is past our last booking time. Please try another date.',
    };
  }

  // Is there anybody at all? Switching the last therapist off, or setting them
  // all to a status that is not active, empties every date in the calendar.
  const anyTherapist = await prisma.employee.count({
    where: { branchId: opts.branchId, active: true, employeeRole: 'THERAPIST' },
  });
  if (!anyTherapist) {
    return {
      code: 'NO_THERAPIST_AT_ALL',
      message:
        'We have no therapists available for online booking at the moment. ' +
        'Please call us and we will take your booking by phone.',
    };
  }

  // Can anybody here do it? This is the one that empties every date, and it is
  // a tick box rather than a busy evening.
  const skilled = await prisma.employee.findMany({
    where: {
      branchId: opts.branchId,
      active: true,
      employeeRole: 'THERAPIST',
      ...(opts.serviceIds.length ? { skills: { some: { serviceId: { in: opts.serviceIds } } } } : {}),
    },
    include: { skills: { select: { serviceId: true } } },
  });
  const fullySkilled = skilled.filter((e) => {
    const owned = new Set(e.skills.map((s) => s.serviceId));
    return opts.serviceIds.every((id) => owned.has(id));
  });
  if (!fullySkilled.length) {
    return {
      code: 'NO_SKILLED_THERAPIST',
      message:
        `None of our therapists is set up for ${what} yet, so it cannot be booked online. ` +
        'Please call us and we will arrange it.',
    };
  }

  // Somewhere to put them.
  const places = await prisma.resource.count({
    where: {
      branchId: opts.branchId,
      active: true,
      ...(opts.place ? { type: { in: placesSatisfying(opts.place) } } : {}),
    },
  });
  if (!places) {
    return {
      code: 'NO_PLACE_CONFIGURED',
      message:
        `We have no ${(opts.place ?? 'room').toLowerCase()} set up for ${what} at the moment. ` +
        'Please call us and we will arrange it.',
    };
  }

  // Skilled and housed, so it is the shift — nobody is working that day.
  const first = opts.candidates[0];
  const onDuty = await availableTherapists({
    branchId: opts.branchId,
    startAt: first.startAt,
    endAt: new Date(first.startAt.getTime() + 60_000),
    serviceIds: opts.serviceIds,
  });
  if (!onDuty.length) {
    return {
      code: 'NO_THERAPIST_ON_DUTY',
      message:
        'No therapist is on shift for that treatment that day. Please try another date, ' +
        'or call us and we will see who we can bring in.',
    };
  }

  if (opts.partySize > 1 && (fullySkilled.length < opts.partySize || places < opts.partySize)) {
    return {
      code: 'PARTY_TOO_LARGE',
      message:
        `We cannot take a group of ${opts.partySize} for ${what} on any time that day. ` +
        'Please call us — a smaller group or a split time is usually possible.',
    };
  }

  return {
    code: 'FULLY_BOOKED',
    message: 'Every time that day is already booked. Please try another date.',
  };
}

export type PlanPlace = {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number;
  exclusiveUse: boolean;
  /** Must be taken whole: a couples room, but not the sauna. */
  fillWhole: boolean;
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
    // Treatments, not visits: the bed a guest moves to at 2:20 is free until
    // then, and the picker has to draw it that way or it sells nothing.
    placeHolds(opts),
  ]);

  const mine = opts.partyRef ?? '';
  return resources.map((r) => {
    const here = taken.filter((t) => t.resourceId === r.id);
    const capacity = Math.max(1, r.capacity);
    const strangers = here.filter((t) => !mine || t.partyRef !== mine);
    // The soonest it frees up, which is the only useful thing to say about a
    // place somebody cannot have. Read from the real end when the desk has
    // logged one, so "until 8:30" is not a promise the floor will not keep.
    const freeFrom = here.length
      ? here.reduce((a, b) => (a.end < b.end ? a : b)).end
      : null;
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      capacity,
      exclusiveUse: r.exclusiveUse,
      fillWhole: r.fillWhole,
      taken: here.length,
      remaining: Math.max(0, capacity - here.length),
      heldByOther: r.exclusiveUse && strangers.length > 0,
      freeFromIso: freeFrom ? freeFrom.toISOString() : null,
    };
  });
}
