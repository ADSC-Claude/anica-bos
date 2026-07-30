/**
 * Shared aggregations used by the dashboards, reports and KPI scorecard.
 * Everything is branch-scoped and works on a Manila business-date range.
 */
import { prisma } from './db';
import { dateKeyToBusinessDate, manilaDateKey, addDaysToKey, monthBounds } from './datetime';

export type Range = { fromKey: string; toKey: string };

export function todayRange(): Range {
  const k = manilaDateKey();
  return { fromKey: k, toKey: k };
}

export function lastNDays(n: number): Range {
  const toKey = manilaDateKey();
  return { fromKey: addDaysToKey(toKey, -(n - 1)), toKey };
}

export function monthRange(monthKey: string): Range {
  return monthBounds(monthKey);
}

function where(branchIds: string[], range: Range) {
  return {
    branchId: { in: branchIds },
    businessDate: {
      gte: dateKeyToBusinessDate(range.fromKey),
      lte: dateKeyToBusinessDate(range.toKey),
    },
  };
}

export type SalesSummary = {
  grossSalesCents: number;
  discountCents: number;
  netSalesCents: number;
  tipsCents: number;
  cogsCents: number;
  saleCount: number;
  averageSaleCents: number;
  byMethod: { method: string; amountCents: number }[];
};

export async function salesSummary(branchIds: string[], range: Range): Promise<SalesSummary> {
  const agg = await prisma.sale.aggregate({
    where: { ...where(branchIds, range), status: 'PAID' },
    _sum: {
      subtotalCents: true,
      discountCents: true,
      tipCents: true,
      totalCents: true,
      cogsCents: true,
    },
    _count: { _all: true },
  });

  const byMethod = await prisma.payment.groupBy({
    by: ['method'],
    where: { sale: { ...where(branchIds, range), status: 'PAID' } },
    _sum: { amountCents: true },
  });

  const gross = agg._sum.subtotalCents ?? 0;
  const discount = agg._sum.discountCents ?? 0;
  const tips = agg._sum.tipCents ?? 0;
  const count = agg._count._all;
  const net = gross - discount;

  return {
    grossSalesCents: gross,
    discountCents: discount,
    netSalesCents: net,
    tipsCents: tips,
    cogsCents: agg._sum.cogsCents ?? 0,
    saleCount: count,
    averageSaleCents: count ? Math.round((net + tips) / count) : 0,
    byMethod: byMethod
      .map((m) => ({ method: m.method, amountCents: m._sum.amountCents ?? 0 }))
      .sort((a, b) => b.amountCents - a.amountCents),
  };
}

/** Operating expenses only — capitalised inventory purchases are excluded. */
export async function expenseTotal(branchIds: string[], range: Range): Promise<number> {
  const rows = await prisma.expense.aggregate({
    where: {
      branchId: { in: branchIds },
      status: 'APPROVED',
      voided: false,
      category: { capitalized: false },
      expenseDate: {
        gte: dateKeyToBusinessDate(range.fromKey),
        lte: dateKeyToBusinessDate(range.toKey),
      },
    },
    _sum: { amountCents: true },
  });
  return rows._sum.amountCents ?? 0;
}

export type ProfitAndLoss = {
  revenueCents: number;
  discountCents: number;
  netRevenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  expenseCents: number;
  netProfitCents: number;
  expenseByCategory: { name: string; amountCents: number }[];
};

export async function profitAndLoss(
  branchIds: string[],
  range: Range,
): Promise<ProfitAndLoss> {
  const sales = await salesSummary(branchIds, range);
  const byCategory = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: {
      branchId: { in: branchIds },
      status: 'APPROVED',
      voided: false,
      category: { capitalized: false },
      expenseDate: {
        gte: dateKeyToBusinessDate(range.fromKey),
        lte: dateKeyToBusinessDate(range.toKey),
      },
    },
    _sum: { amountCents: true },
  });
  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: byCategory.map((c) => c.categoryId) } },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  const expenseByCategory = byCategory
    .map((c) => ({
      name: nameById.get(c.categoryId) ?? 'Uncategorised',
      amountCents: c._sum.amountCents ?? 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const expenseCents = expenseByCategory.reduce((a, b) => a + b.amountCents, 0);
  const grossProfitCents = sales.netSalesCents - sales.cogsCents;

  return {
    revenueCents: sales.grossSalesCents,
    discountCents: sales.discountCents,
    netRevenueCents: sales.netSalesCents,
    cogsCents: sales.cogsCents,
    grossProfitCents,
    expenseCents,
    netProfitCents: grossProfitCents - expenseCents,
    expenseByCategory,
  };
}

export async function appointmentStats(branchIds: string[], range: Range) {
  const rows = await prisma.appointment.groupBy({
    by: ['status', 'source'],
    where: {
      branchId: { in: branchIds },
      startAt: {
        gte: new Date(`${range.fromKey}T00:00:00+08:00`),
        lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
      },
    },
    _count: { _all: true },
  });

  const total = rows.reduce((a, r) => a + r._count._all, 0);
  const by = (predicate: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(predicate).reduce((a, r) => a + r._count._all, 0);

  return {
    total,
    completed: by((r) => r.status === 'COMPLETED'),
    cancelled: by((r) => r.status === 'CANCELLED'),
    noShow: by((r) => r.status === 'NO_SHOW'),
    expired: by((r) => r.status === 'EXPIRED'),
    online: by((r) => r.source === 'ONLINE'),
    walkIn: by((r) => r.source === 'WALK_IN'),
    pending: by((r) => r.status === 'PENDING'),
  };
}

export async function topServices(branchIds: string[], range: Range, limit = 5) {
  const rows = await prisma.saleLine.groupBy({
    by: ['serviceId'],
    where: {
      serviceId: { not: null },
      sale: { ...where(branchIds, range), status: 'PAID' },
    },
    _sum: { lineTotalCents: true, quantity: true },
    orderBy: { _sum: { lineTotalCents: 'desc' } },
    take: limit,
  });
  const services = await prisma.service.findMany({
    where: { id: { in: rows.map((r) => r.serviceId!) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(services.map((s) => [s.id, s.name]));
  return rows.map((r) => ({
    name: nameById.get(r.serviceId!) ?? 'Unknown',
    revenueCents: r._sum.lineTotalCents ?? 0,
    count: r._sum.quantity ?? 0,
  }));
}

/**
 * Therapist utilisation = booked service minutes ÷ minutes actually on duty
 * (from attendance). Utilisation is meaningless without attendance, so
 * therapists who never timed in are excluded from the denominator.
 */
export async function therapistUtilisation(branchIds: string[], range: Range) {
  const from = dateKeyToBusinessDate(range.fromKey);
  const to = dateKeyToBusinessDate(range.toKey);

  const attendance = await prisma.attendance.findMany({
    where: {
      branchId: { in: branchIds },
      workDate: { gte: from, lte: to },
      timeIn: { not: null },
      employee: { employeeRole: 'THERAPIST' },
    },
    include: { employee: { select: { id: true, name: true } } },
  });

  const booked = await prisma.appointmentService.groupBy({
    by: ['employeeId'],
    where: {
      employeeId: { not: null },
      appointment: {
        branchId: { in: branchIds },
        status: { in: ['COMPLETED', 'IN_SERVICE', 'CHECKED_IN', 'CONFIRMED'] },
        startAt: {
          gte: new Date(`${range.fromKey}T00:00:00+08:00`),
          lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
        },
      },
    },
    _sum: { durationMinutes: true },
  });
  const bookedById = new Map(booked.map((b) => [b.employeeId!, b._sum.durationMinutes ?? 0]));

  const availableById = new Map<string, { name: string; minutes: number }>();
  for (const a of attendance) {
    const end = a.timeOut ?? new Date();
    const minutes = Math.max(0, Math.round((end.getTime() - a.timeIn!.getTime()) / 60_000));
    const prev = availableById.get(a.employeeId);
    availableById.set(a.employeeId, {
      name: a.employee.name,
      minutes: (prev?.minutes ?? 0) + minutes,
    });
  }

  const rows = [...availableById.entries()].map(([id, v]) => ({
    employeeId: id,
    name: v.name,
    availableMinutes: v.minutes,
    bookedMinutes: bookedById.get(id) ?? 0,
    utilisation: v.minutes ? Math.round(((bookedById.get(id) ?? 0) / v.minutes) * 100) : 0,
  }));

  const totalAvailable = rows.reduce((a, r) => a + r.availableMinutes, 0);
  const totalBooked = rows.reduce((a, r) => a + r.bookedMinutes, 0);

  return {
    rows: rows.sort((a, b) => b.utilisation - a.utilisation),
    overall: totalAvailable ? Math.round((totalBooked / totalAvailable) * 100) : 0,
  };
}

/** Room/bed occupancy against the branch's operating window. */
export async function roomOccupancy(branchIds: string[], range: Range) {
  const branches = await prisma.branch.findMany({ where: { id: { in: branchIds } } });
  const resourceCount = await prisma.resource.count({
    where: { branchId: { in: branchIds }, active: true },
  });
  if (!resourceCount || !branches.length) return 0;

  const days =
    Math.round(
      (dateKeyToBusinessDate(range.toKey).getTime() -
        dateKeyToBusinessDate(range.fromKey).getTime()) /
        86_400_000,
    ) + 1;

  const openMinutesPerDay =
    branches.reduce((a, b) => a + (b.closeMinute - b.openMinute), 0) / branches.length;
  const capacity = resourceCount * openMinutesPerDay * days;

  const booked = await prisma.appointment.findMany({
    where: {
      branchId: { in: branchIds },
      resourceId: { not: null },
      status: { in: ['COMPLETED', 'IN_SERVICE', 'CHECKED_IN', 'CONFIRMED'] },
      startAt: {
        gte: new Date(`${range.fromKey}T00:00:00+08:00`),
        lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
      },
    },
    select: { startAt: true, endAt: true },
  });
  const used = booked.reduce(
    (a, b) => a + Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000),
    0,
  );
  return capacity ? Math.round((used / capacity) * 100) : 0;
}

export async function clientStats(branchIds: string[], range: Range) {
  const from = dateKeyToBusinessDate(range.fromKey);
  const to = dateKeyToBusinessDate(range.toKey);

  const sales = await prisma.sale.findMany({
    where: { branchId: { in: branchIds }, status: 'PAID', businessDate: { gte: from, lte: to } },
    select: { clientId: true },
  });
  const served = new Set(sales.map((s) => s.clientId).filter(Boolean) as string[]);

  const newClients = await prisma.client.count({
    where: {
      branchId: { in: branchIds },
      createdAt: {
        gte: new Date(`${range.fromKey}T00:00:00+08:00`),
        lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
      },
    },
  });

  // A client counts as "returning" if they also transacted before this range.
  let returning = 0;
  if (served.size) {
    const priorIds = await prisma.sale.groupBy({
      by: ['clientId'],
      where: {
        branchId: { in: branchIds },
        status: 'PAID',
        clientId: { in: [...served] },
        businessDate: { lt: from },
      },
    });
    returning = priorIds.length;
  }

  return {
    clientsServed: served.size,
    newClients,
    returningClients: returning,
    retentionRate: served.size ? Math.round((returning / served.size) * 100) : 0,
  };
}

export async function averageRating(branchIds: string[], range: Range): Promise<number> {
  const agg = await prisma.clientFeedback.aggregate({
    where: {
      client: { branchId: { in: branchIds } },
      createdAt: {
        gte: new Date(`${range.fromKey}T00:00:00+08:00`),
        lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
      },
    },
    _avg: { rating: true },
  });
  return Math.round((agg._avg.rating ?? 0) * 10) / 10;
}

export async function lowStockItems(branchIds: string[]) {
  const items = await prisma.item.findMany({
    where: { branchId: { in: branchIds }, archived: false },
    include: { unit: true },
    orderBy: { name: 'asc' },
  });
  return items.filter((i) => i.reorderLevel > 0 && i.stockQty <= i.reorderLevel);
}

/** Full KPI scorecard for a month, with previous-month comparison and targets. */
export async function kpiScorecard(branchIds: string[], monthKey: string) {
  const range = monthRange(monthKey);
  const prevMonthKey = (() => {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  })();
  const prevRange = monthRange(prevMonthKey);

  const [sales, prevSales, clients, prevClients, util, occupancy, rating, appts, targets] =
    await Promise.all([
      salesSummary(branchIds, range),
      salesSummary(branchIds, prevRange),
      clientStats(branchIds, range),
      clientStats(branchIds, prevRange),
      therapistUtilisation(branchIds, range),
      roomOccupancy(branchIds, range),
      averageRating(branchIds, range),
      appointmentStats(branchIds, range),
      prisma.kpiTarget.findMany({ where: { periodKey: monthKey } }),
    ]);

  const activeMemberships = await prisma.clientPackage.count({
    where: {
      status: 'ACTIVE',
      expiresAt: { gte: new Date() },
      package: { type: 'MEMBERSHIP' },
      client: { branchId: { in: branchIds } },
    },
  });

  const expiredMemberships = await prisma.clientPackage.count({
    where: {
      package: { type: 'MEMBERSHIP' },
      client: { branchId: { in: branchIds } },
      expiresAt: {
        gte: dateKeyToBusinessDate(range.fromKey),
        lte: dateKeyToBusinessDate(range.toKey),
      },
    },
  });
  const renewals = await prisma.clientPackage.count({
    where: {
      package: { type: 'MEMBERSHIP' },
      client: { branchId: { in: branchIds } },
      purchasedAt: {
        gte: new Date(`${range.fromKey}T00:00:00+08:00`),
        lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
      },
    },
  });

  const targetByKey = new Map(targets.map((t) => [t.key, t.target]));
  const noShowRate = appts.total ? Math.round((appts.noShow / appts.total) * 100) : 0;

  type Row = {
    key: string;
    label: string;
    value: number;
    previous: number;
    target: number | null;
    format: 'money' | 'percent' | 'count' | 'rating';
    /** Whether lower is better (e.g. no-show rate). */
    invert?: boolean;
  };

  const rows: Row[] = [
    { key: 'revenue', label: 'Total revenue', value: sales.netSalesCents, previous: prevSales.netSalesCents, target: targetByKey.get('revenue') ?? null, format: 'money' },
    { key: 'averageSale', label: 'Average sale value', value: sales.averageSaleCents, previous: prevSales.averageSaleCents, target: targetByKey.get('averageSale') ?? null, format: 'money' },
    { key: 'clientsServed', label: 'Clients served', value: clients.clientsServed, previous: prevClients.clientsServed, target: targetByKey.get('clientsServed') ?? null, format: 'count' },
    { key: 'newClients', label: 'New clients', value: clients.newClients, previous: prevClients.newClients, target: targetByKey.get('newClients') ?? null, format: 'count' },
    { key: 'retentionRate', label: 'Client retention rate', value: clients.retentionRate, previous: prevClients.retentionRate, target: targetByKey.get('retentionRate') ?? null, format: 'percent' },
    { key: 'noShowRate', label: 'No-show rate', value: noShowRate, previous: 0, target: targetByKey.get('noShowRate') ?? null, format: 'percent', invert: true },
    { key: 'therapistUtilization', label: 'Therapist utilisation', value: util.overall, previous: 0, target: targetByKey.get('therapistUtilization') ?? null, format: 'percent' },
    { key: 'revenuePerTherapist', label: 'Revenue per therapist', value: util.rows.length ? Math.round(sales.netSalesCents / util.rows.length) : 0, previous: 0, target: targetByKey.get('revenuePerTherapist') ?? null, format: 'money' },
    { key: 'roomOccupancy', label: 'Room / bed occupancy', value: occupancy, previous: 0, target: targetByKey.get('roomOccupancy') ?? null, format: 'percent' },
    { key: 'activeMemberships', label: 'Active memberships', value: activeMemberships, previous: 0, target: targetByKey.get('activeMemberships') ?? null, format: 'count' },
    { key: 'membershipRenewalRate', label: 'Membership renewal rate', value: expiredMemberships ? Math.round((renewals / expiredMemberships) * 100) : 0, previous: 0, target: targetByKey.get('membershipRenewalRate') ?? null, format: 'percent' },
    { key: 'averageRating', label: 'Average client rating', value: Math.round(rating * 10), previous: 0, target: targetByKey.get('averageRating') ?? null, format: 'rating' },
  ];

  return { monthKey, prevMonthKey, rows, sales, clients, util, occupancy, appts };
}
