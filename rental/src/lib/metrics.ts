import 'server-only';
import { prisma } from './db';
import { ratio, revenueSplit } from './money';
import { dateKeyRange, monthBounds, toDateKey, toStayDate, type DateKey } from './datetime';

/**
 * The three numbers a rental owner actually manages by, plus the arithmetic
 * that produces them. Each formula is printed on the dashboard beside its
 * figure, because an owner who does not trust a number goes back to the
 * spreadsheet and the system stops being used.
 *
 *   ADR       = accommodation revenue ÷ nights sold
 *   Occupancy = nights sold ÷ nights available
 *   RevPAR    = accommodation revenue ÷ nights available  ( = ADR × occupancy )
 *
 * ADR is accommodation only. Cleaning fees and add-ons are revenue but they are
 * not a room rate, and folding them in inflates ADR until it cannot be compared
 * with anything — including last month.
 */

/** Statuses that count as a sold night. A cancellation never earned anything. */
const EARNING = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] as const;

export type Kpis = {
  fromKey: DateKey;
  toKey: DateKey;
  propertyCount: number;
  /** Property-nights on the market in the window. */
  availableNights: number;
  nightsSold: number;
  occupancyPercent: number;
  accommodationCents: number;
  otherRevenueCents: number;
  grossRevenueCents: number;
  adrCents: number;
  revParCents: number;
  bookings: number;
  averageStayNights: number;
};

type Windowed = {
  fromKey: DateKey;
  toKey: DateKey;
  propertyIds?: string[] | null;
  branchId?: string | null;
};

async function scopedPropertyIds(args: Windowed): Promise<string[]> {
  const properties = await prisma.property.findMany({
    where: {
      status: { in: ['ACTIVE', 'INACTIVE'] },
      ...(args.propertyIds ? { id: { in: args.propertyIds } } : {}),
      ...(args.branchId ? { branchId: args.branchId } : {}),
    },
    select: { id: true },
  });
  return properties.map((p) => p.id);
}

/**
 * Counts the nights of each stay that fall INSIDE the window, not the whole
 * stay. A booking spanning the end of the month belongs to both months, in the
 * proportion actually slept — otherwise every month-end straddle is counted
 * twice and occupancy climbs past 100%.
 */
export async function kpis(args: Windowed): Promise<Kpis> {
  const propertyIds = await scopedPropertyIds(args);
  const windowKeys = dateKeyRange(args.fromKey, args.toKey);
  // The last date in an inclusive range is still a night, hence no -1 here:
  // dateKeyRange is inclusive of `toKey`.
  const availableNights = propertyIds.length * windowKeys.length;

  const from = toStayDate(args.fromKey);
  const to = toStayDate(args.toKey);

  const reservations = await prisma.reservation.findMany({
    where: {
      propertyId: { in: propertyIds },
      status: { in: [...EARNING] },
      checkIn: { lte: to },
      checkOut: { gt: from },
    },
    select: {
      id: true,
      checkIn: true,
      checkOut: true,
      nights: true,
      accommodationCents: true,
      cleaningFeeCents: true,
      addOnsCents: true,
      extraGuestCents: true,
      discountCents: true,
      totalCents: true,
    },
  });

  let nightsSold = 0;
  let accommodationCents = 0;
  let otherRevenueCents = 0;

  for (const r of reservations) {
    const stayKeys = dateKeyRange(toDateKey(r.checkIn), toDateKey(r.checkOut));
    // checkOut is exclusive: the departure date is not a night.
    stayKeys.pop();
    const inside = stayKeys.filter((k) => k >= args.fromKey && k <= args.toKey).length;
    if (!inside) continue;

    nightsSold += inside;
    const share = inside / Math.max(1, r.nights);
    // revenueSplit, not the raw column: a channel booking with a payout and no
    // breakdown must not add nights to the denominator while adding nothing to
    // the numerator. See money.ts.
    const split = revenueSplit(r);
    accommodationCents += Math.round(split.accommodationCents * share);
    otherRevenueCents += Math.round(split.otherCents * share);
  }

  const bookings = reservations.length;

  return {
    fromKey: args.fromKey,
    toKey: args.toKey,
    propertyCount: propertyIds.length,
    availableNights,
    nightsSold,
    occupancyPercent: ratio(nightsSold, availableNights),
    accommodationCents,
    otherRevenueCents,
    grossRevenueCents: accommodationCents + otherRevenueCents,
    adrCents: nightsSold ? Math.round(accommodationCents / nightsSold) : 0,
    revParCents: availableNights ? Math.round(accommodationCents / availableNights) : 0,
    bookings,
    averageStayNights: bookings ? Math.round((nightsSold / bookings) * 10) / 10 : 0,
  };
}

/** The same numbers, per property — the dashboard comparison table. */
export async function kpisByProperty(args: Windowed) {
  const propertyIds = await scopedPropertyIds(args);
  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
    orderBy: { sortOrder: 'asc' },
  });

  const rows = [];
  for (const p of properties) {
    const k = await kpis({ ...args, propertyIds: [p.id], branchId: null });
    rows.push({ property: p, ...k });
  }
  return rows;
}

/** Where bookings came from, in the window. Drives the source-mix bar. */
export async function sourceMix(args: Windowed) {
  const propertyIds = await scopedPropertyIds(args);
  const grouped = await prisma.reservation.groupBy({
    by: ['source'],
    where: {
      propertyId: { in: propertyIds },
      status: { in: [...EARNING] },
      checkIn: { gte: toStayDate(args.fromKey), lte: toStayDate(args.toKey) },
    },
    _count: { _all: true },
    _sum: { totalCents: true },
  });

  const total = grouped.reduce((a, g) => a + g._count._all, 0);
  return grouped
    .map((g) => ({
      source: g.source,
      count: g._count._all,
      revenueCents: g._sum.totalCents ?? 0,
      percent: ratio(g._count._all, total),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Today at a glance: arrivals, departures, in-house, ready. */
export async function todayBoard(propertyIds: string[] | null, todayKey: DateKey) {
  const today = toStayDate(todayKey);
  const where = propertyIds ? { propertyId: { in: propertyIds } } : {};

  const [arrivals, departures, inHouse, properties] = await Promise.all([
    prisma.reservation.findMany({
      where: { ...where, checkIn: today, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
      include: {
        property: { select: { id: true, name: true, readyState: true, checkInMinute: true } },
        guest: { select: { firstName: true, lastName: true, mobile: true } },
      },
      orderBy: { property: { sortOrder: 'asc' } },
    }),
    prisma.reservation.findMany({
      where: { ...where, checkOut: today, status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } },
      include: {
        property: { select: { id: true, name: true, checkOutMinute: true } },
        guest: { select: { firstName: true, lastName: true } },
      },
      orderBy: { property: { sortOrder: 'asc' } },
    }),
    prisma.reservation.count({ where: { ...where, status: 'CHECKED_IN' } }),
    prisma.property.findMany({
      where: { status: 'ACTIVE', ...(propertyIds ? { id: { in: propertyIds } } : {}) },
      select: { id: true, name: true, readyState: true },
    }),
  ]);

  return {
    arrivals,
    departures,
    inHouse,
    properties,
    readyCount: properties.filter((p) => p.readyState === 'READY').length,
  };
}

export function monthWindow(monthKey: string): { fromKey: DateKey; toKey: DateKey } {
  return monthBounds(monthKey);
}
