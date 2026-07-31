/**
 * Therapist and room availability.
 *
 * Availability is driven by the receptionist's attendance log: only therapists
 * who have timed in (and not yet timed out) are offered for today. For future
 * dates there is no attendance yet, so it falls back to the default weekly
 * schedule and day-off. Rotation order follows the time-in sequence.
 */
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

export type AvailableResource = { id: string; name: string; type: string };

/** Rooms/beds free for the whole window. */
export async function availableResources(opts: {
  branchId: string;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: string;
}): Promise<AvailableResource[]> {
  const resources = await prisma.resource.findMany({
    where: { branchId: opts.branchId, active: true },
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
    select: { resourceId: true },
  });
  // Capacity, not a yes/no. A couples room holds two, a foot-spa area holds as
  // many chairs as it has, and treating one booking as filling the whole room
  // loses the rest of its slots. Counting per resource is also what stops a
  // room being handed out more times than it has places.
  const used = new Map<string, number>();
  for (const t of taken) {
    if (!t.resourceId) continue;
    used.set(t.resourceId, (used.get(t.resourceId) ?? 0) + 1);
  }
  return resources
    .filter((r) => (used.get(r.id) ?? 0) < Math.max(1, r.capacity))
    .map((r) => ({ id: r.id, name: r.name, type: r.type }));
}

/** Throws when a therapist or room would be double-booked. */
export async function assertNoConflicts(opts: {
  branchId: string;
  startAt: Date;
  endAt: Date;
  employeeIds: string[];
  resourceId?: string | null;
  excludeAppointmentId?: string;
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
    const capacity = Math.max(1, resource?.capacity ?? 1);
    const overlapping = await prisma.appointment.count({
      where: {
        branchId: opts.branchId,
        resourceId: opts.resourceId,
        status: { in: [...BUSY_STATUSES] },
        startAt: { lt: opts.endAt },
        endAt: { gt: opts.startAt },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
    });
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

/** Bookable start times for a service on a given Manila date. */
export function slotsForDay(opts: {
  dateKey: string;
  openMinute: number;
  closeMinute: number;
  durationMinutes: number;
  stepMinutes: number;
  leadTimeMinutes: number;
  now?: Date;
}): { minute: number; startAt: Date }[] {
  const now = opts.now ?? new Date();
  const earliest = new Date(now.getTime() + opts.leadTimeMinutes * 60_000);
  const out: { minute: number; startAt: Date }[] = [];
  for (
    let m = opts.openMinute;
    m + opts.durationMinutes <= opts.closeMinute;
    m += opts.stepMinutes
  ) {
    const startAt = manilaInstant(opts.dateKey, m);
    if (startAt < earliest) continue;
    out.push({ minute: m, startAt });
  }
  return out;
}
