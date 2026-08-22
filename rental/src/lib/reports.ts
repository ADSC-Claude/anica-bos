import 'server-only';
import { prisma } from './db';
import { formatStayDate, toStayDate, type DateKey } from './datetime';
import { centsToDecimalString } from './money';
import { guestName } from './guests';
import { kpis, kpisByProperty, sourceMix } from './metrics';
import { profitAndLoss } from './finance';

/**
 * Every report is a `{ headers, rows }` pair, so the screen and the CSV are
 * the same data — a downloaded file that disagrees with the page it came from
 * is worse than no download at all.
 *
 * Money leaves here as a plain decimal string, not "₱1,234.50": a spreadsheet
 * has to be able to add up the column.
 */

export type Report = {
  key: string;
  title: string;
  description: string;
  headers: string[];
  rows: (string | number)[][];
  /** Right-aligned in the table and summed nowhere else. */
  numericFrom?: number;
};

export type ReportArgs = {
  fromKey: DateKey;
  toKey: DateKey;
  propertyIds?: string[] | null;
};

const money = (cents: number) => centsToDecimalString(cents);

export const REPORTS = [
  { key: 'daily-ops', title: 'Daily operations', description: 'Arrivals, departures and turnovers, day by day.' },
  { key: 'revenue', title: 'Revenue', description: 'Every earning stay in the window, split by what it was for.' },
  { key: 'expenses', title: 'Expenses', description: 'Every expense, with its category and property.' },
  { key: 'pl', title: 'Profit and loss', description: 'Revenue − expenses per property, and consolidated.' },
  { key: 'occupancy', title: 'Occupancy and rate', description: 'ADR, occupancy and RevPAR per property.' },
  { key: 'sources', title: 'Booking sources', description: 'Where the bookings came from, and what they were worth.' },
  { key: 'cleaning', title: 'Cleaning', description: 'Turnovers, who did them, and whether they met the deadline.' },
  { key: 'maintenance', title: 'Maintenance', description: 'Tickets raised in the window, with costs.' },
  { key: 'inventory', title: 'Inventory', description: 'Stock on hand against restock levels.' },
  { key: 'guests', title: 'Guests', description: 'Guests with a stay in the window, and their lifetime totals.' },
  { key: 'reviews', title: 'Reviews', description: 'Ratings and responses by platform.' },
] as const;

export type ReportKey = (typeof REPORTS)[number]['key'];

export function isReportKey(value: string): value is ReportKey {
  return REPORTS.some((r) => r.key === value);
}

export async function buildReport(key: ReportKey, args: ReportArgs): Promise<Report> {
  const meta = REPORTS.find((r) => r.key === key)!;
  const from = toStayDate(args.fromKey);
  const to = toStayDate(args.toKey);
  const scope = args.propertyIds ? { propertyId: { in: args.propertyIds } } : {};
  const base = { key, title: meta.title, description: meta.description };

  switch (key) {
    case 'daily-ops': {
      const [arrivals, departures] = await Promise.all([
        prisma.reservation.findMany({
          where: { ...scope, checkIn: { gte: from, lte: to }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
          include: { property: { select: { name: true } }, guest: true },
          orderBy: { checkIn: 'asc' },
        }),
        prisma.reservation.findMany({
          where: { ...scope, checkOut: { gte: from, lte: to }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
          include: { property: { select: { name: true } }, guest: true },
          orderBy: { checkOut: 'asc' },
        }),
      ]);

      const rows = [
        ...arrivals.map((r) => [
          formatStayDate(r.checkIn),
          'Arrival',
          r.property.name,
          r.reference,
          guestName(r.guest),
          r.adults + r.children,
          r.status.toLowerCase(),
        ]),
        ...departures.map((r) => [
          formatStayDate(r.checkOut),
          'Departure',
          r.property.name,
          r.reference,
          guestName(r.guest),
          r.adults + r.children,
          r.status.toLowerCase(),
        ]),
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));

      return {
        ...base,
        headers: ['Date', 'Event', 'Property', 'Reference', 'Guest', 'Guests', 'Status'],
        rows,
        numericFrom: 5,
      };
    }

    case 'revenue': {
      const rows = await prisma.reservation.findMany({
        where: {
          ...scope,
          checkIn: { gte: from, lte: to },
          status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] },
        },
        include: { property: { select: { name: true } }, guest: true },
        orderBy: { checkIn: 'asc' },
      });

      return {
        ...base,
        headers: [
          'Check-in', 'Check-out', 'Property', 'Reference', 'Guest', 'Source', 'Nights',
          'Accommodation', 'Cleaning fee', 'Add-ons', 'Discount', 'Total', 'Paid', 'Balance',
        ],
        rows: rows.map((r) => [
          formatStayDate(r.checkIn),
          formatStayDate(r.checkOut),
          r.property.name,
          r.reference,
          guestName(r.guest),
          r.source.toLowerCase().replace('_', ' '),
          r.nights,
          money(r.accommodationCents),
          money(r.cleaningFeeCents),
          money(r.addOnsCents),
          money(r.discountCents),
          money(r.totalCents),
          money(r.paidCents),
          money(r.totalCents - r.paidCents),
        ]),
        numericFrom: 6,
      };
    }

    case 'expenses': {
      const rows = await prisma.expense.findMany({
        where: {
          date: { gte: from, lte: to },
          ...(args.propertyIds
            ? { OR: [{ propertyId: { in: args.propertyIds } }, { propertyId: null }] }
            : {}),
        },
        include: {
          category: { select: { name: true } },
          property: { select: { name: true } },
          vendor: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { date: 'asc' },
      });

      return {
        ...base,
        headers: ['Date', 'Category', 'Property', 'Description', 'Vendor', 'Method', 'Amount', 'Recorded by'],
        rows: rows.map((e) => [
          formatStayDate(e.date),
          e.category.name,
          e.property?.name ?? 'Business-wide',
          e.description,
          e.vendor?.name ?? '',
          e.method,
          money(e.amountCents),
          e.createdBy?.name ?? '',
        ]),
        numericFrom: 6,
      };
    }

    case 'pl': {
      const pl = await profitAndLoss({ fromKey: args.fromKey, toKey: args.toKey, propertyIds: args.propertyIds });
      const rows: (string | number)[][] = pl.rows.map((r) => [
        r.propertyName,
        money(r.accommodationCents),
        money(r.cleaningFeeCents),
        money(r.addOnsCents),
        money(r.revenueCents),
        money(r.expenseCents),
        money(r.netCents),
        r.marginPercent.toFixed(1),
      ]);
      if (pl.unallocatedExpenseCents > 0) {
        rows.push([
          'Business-wide (no property)', '0.00', '0.00', '0.00', '0.00',
          money(pl.unallocatedExpenseCents),
          money(-pl.unallocatedExpenseCents),
          '',
        ]);
      }
      rows.push([
        'Consolidated', '', '', '',
        money(pl.totals.revenueCents),
        money(pl.totals.expenseCents),
        money(pl.totals.netCents),
        pl.totals.marginPercent.toFixed(1),
      ]);

      return {
        ...base,
        headers: ['Property', 'Accommodation', 'Cleaning fees', 'Add-ons', 'Revenue', 'Expenses', 'Net profit', 'Margin %'],
        rows,
        numericFrom: 1,
      };
    }

    case 'occupancy': {
      const [perProperty, overall] = await Promise.all([
        kpisByProperty({ fromKey: args.fromKey, toKey: args.toKey, propertyIds: args.propertyIds }),
        kpis({ fromKey: args.fromKey, toKey: args.toKey, propertyIds: args.propertyIds }),
      ]);

      const rows: (string | number)[][] = perProperty.map((p) => [
        p.property.name,
        p.availableNights,
        p.nightsSold,
        p.occupancyPercent.toFixed(1),
        money(p.adrCents),
        money(p.revParCents),
        p.bookings,
        p.averageStayNights.toFixed(1),
      ]);
      rows.push([
        'All properties',
        overall.availableNights,
        overall.nightsSold,
        overall.occupancyPercent.toFixed(1),
        money(overall.adrCents),
        money(overall.revParCents),
        overall.bookings,
        overall.averageStayNights.toFixed(1),
      ]);

      return {
        ...base,
        headers: ['Property', 'Available nights', 'Nights sold', 'Occupancy %', 'ADR', 'RevPAR', 'Bookings', 'Average stay'],
        rows,
        numericFrom: 1,
      };
    }

    case 'sources': {
      const mix = await sourceMix({ fromKey: args.fromKey, toKey: args.toKey, propertyIds: args.propertyIds });
      return {
        ...base,
        headers: ['Source', 'Bookings', 'Revenue', 'Share of bookings %'],
        rows: mix.map((m) => [
          m.source.toLowerCase().replace('_', ' '),
          m.count,
          money(m.revenueCents),
          m.percent.toFixed(1),
        ]),
        numericFrom: 1,
      };
    }

    case 'cleaning': {
      const rows = await prisma.cleaningTask.findMany({
        where: { ...scope, checkoutAt: { gte: from, lte: new Date(to.getTime() + 86_400_000) } },
        include: {
          property: { select: { name: true } },
          assignee: { select: { name: true } },
          inspection: { select: { status: true } },
        },
        orderBy: { checkoutAt: 'asc' },
      });

      return {
        ...base,
        headers: ['Checkout', 'Property', 'Cleaner', 'Deadline', 'Completed', 'On time', 'Status', 'Inspection'],
        rows: rows.map((c) => [
          formatStayDate(c.checkoutAt),
          c.property.name,
          c.assignee?.name ?? 'Unassigned',
          c.nextCheckInAt ? formatStayDate(c.nextCheckInAt) : '',
          c.completedAt ? formatStayDate(c.completedAt) : '',
          c.completedAt && c.nextCheckInAt ? (c.completedAt <= c.nextCheckInAt ? 'yes' : 'no') : '',
          c.status.toLowerCase().replace('_', ' '),
          c.inspection?.status.toLowerCase().replace('_', ' ') ?? '',
        ]),
      };
    }

    case 'maintenance': {
      const rows = await prisma.maintenanceTicket.findMany({
        where: { ...scope, reportedAt: { gte: from, lte: new Date(to.getTime() + 86_400_000) } },
        include: {
          property: { select: { name: true } },
          assignee: { select: { name: true } },
          vendor: { select: { name: true } },
        },
        orderBy: { reportedAt: 'asc' },
      });

      return {
        ...base,
        headers: ['Ticket', 'Reported', 'Property', 'Category', 'Fault', 'Priority', 'Status', 'Assigned', 'Completed', 'Cost'],
        rows: rows.map((t) => [
          t.number,
          formatStayDate(t.reportedAt),
          t.property.name,
          t.category,
          t.description,
          t.priority.toLowerCase(),
          t.status.toLowerCase().replace('_', ' '),
          t.assignee?.name ?? t.vendor?.name ?? '',
          t.completedAt ? formatStayDate(t.completedAt) : '',
          money(t.costCents),
        ]),
        numericFrom: 9,
      };
    }

    case 'inventory': {
      const rows = await prisma.inventoryItem.findMany({
        where: { ...scope, archived: false },
        include: { property: { select: { name: true } }, vendor: { select: { name: true } } },
        orderBy: [{ propertyId: 'asc' }, { name: 'asc' }],
      });

      return {
        ...base,
        headers: ['Property', 'Item', 'Category', 'On hand', 'Unit', 'Restock at', 'Low', 'Unit cost', 'Value', 'Supplier'],
        rows: rows.map((i) => [
          i.property.name,
          i.name,
          i.category,
          i.stockQty,
          i.unit,
          i.minLevel,
          i.stockQty <= i.minLevel ? 'yes' : '',
          money(i.costCents),
          money(i.stockQty * i.costCents),
          i.vendor?.name ?? '',
        ]),
        numericFrom: 3,
      };
    }

    case 'guests': {
      const reservations = await prisma.reservation.findMany({
        where: { ...scope, checkIn: { gte: from, lte: to }, status: { notIn: ['CANCELLED'] } },
        select: { guestId: true },
        distinct: ['guestId'],
      });
      const guests = await prisma.guest.findMany({
        where: { id: { in: reservations.map((r) => r.guestId) }, mergedIntoId: null },
        orderBy: { totalSpentCents: 'desc' },
      });

      return {
        ...base,
        headers: ['Guest', 'Code', 'Email', 'Mobile', 'Tier', 'Stays', 'Nights', 'Lifetime spend', 'Last stay', 'Marketing consent'],
        rows: guests.map((g) => [
          guestName(g),
          g.code,
          g.email,
          g.mobile,
          g.tier.toLowerCase(),
          g.totalBookings,
          g.totalNights,
          money(g.totalSpentCents),
          g.lastStayAt ? formatStayDate(g.lastStayAt) : '',
          g.marketingConsent ? 'yes' : 'no',
        ]),
        numericFrom: 5,
      };
    }

    case 'reviews': {
      const rows = await prisma.review.findMany({
        where: { ...scope, createdAt: { gte: from, lte: new Date(to.getTime() + 86_400_000) } },
        include: { property: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      return {
        ...base,
        headers: ['Date', 'Property', 'Platform', 'Guest', 'Rating', 'Title', 'Review', 'Responded', 'Published'],
        rows: rows.map((r) => [
          formatStayDate(r.createdAt),
          r.property.name,
          r.platform.toLowerCase(),
          r.guestName,
          r.rating,
          r.title,
          r.body,
          r.respondedAt ? 'yes' : 'no',
          r.published ? 'yes' : 'no',
        ]),
        numericFrom: 4,
      };
    }
  }
}
