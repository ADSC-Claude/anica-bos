/**
 * Incentives — Owner only.
 *
 * This is a read-only rundown that suggests amounts from actual data. It is
 * deliberately isolated from payroll: nothing here is ever released through a
 * payslip. The Owner uses it as a guide and rewards staff manually.
 */
import { prisma } from './db';
import { monthRange, salesSummary } from './metrics';
import { dateKeyToBusinessDate } from './datetime';

export type IncentiveRow = {
  schemeId: string;
  schemeName: string;
  formula: string;
  metric: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  metricValue: number;
  metricLabel: string;
  suggestedCents: number;
  note: string;
};

export async function computeIncentives(
  branchIds: string[],
  monthKey: string,
): Promise<IncentiveRow[]> {
  const schemes = await prisma.incentiveScheme.findMany({ where: { active: true } });
  if (!schemes.length) return [];

  const range = monthRange(monthKey);
  const from = dateKeyToBusinessDate(range.fromKey);
  const to = dateKeyToBusinessDate(range.toKey);

  const employees = await prisma.employee.findMany({
    where: { branchId: { in: branchIds }, active: true },
    select: { id: true, name: true, employeeRole: true },
  });

  // Revenue attributed to each staff member through the lines they served.
  const revenueRows = await prisma.saleLine.groupBy({
    by: ['employeeId'],
    where: {
      employeeId: { not: null },
      sale: { branchId: { in: branchIds }, status: 'PAID', businessDate: { gte: from, lte: to } },
    },
    _sum: { basePriceCents: true },
  });
  const revenueById = new Map(revenueRows.map((r) => [r.employeeId!, r._sum.basePriceCents ?? 0]));

  const ratingRows = await prisma.clientFeedback.groupBy({
    by: ['employeeId'],
    where: {
      employeeId: { not: null },
      createdAt: {
        gte: new Date(`${range.fromKey}T00:00:00+08:00`),
        lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
      },
    },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const ratingById = new Map(
    ratingRows.map((r) => [r.employeeId!, { avg: r._avg.rating ?? 0, count: r._count._all }]),
  );

  const attendanceRows = await prisma.attendance.groupBy({
    by: ['employeeId'],
    where: { branchId: { in: branchIds }, workDate: { gte: from, lte: to }, timeIn: { not: null } },
    _count: { _all: true },
  });
  const attendanceById = new Map(attendanceRows.map((r) => [r.employeeId, r._count._all]));
  const lateRows = await prisma.attendance.groupBy({
    by: ['employeeId'],
    where: { branchId: { in: branchIds }, workDate: { gte: from, lte: to }, isLate: true },
    _count: { _all: true },
  });
  const lateById = new Map(lateRows.map((r) => [r.employeeId, r._count._all]));

  const branchSales = await salesSummary(branchIds, range);
  const bookings = await prisma.appointment.count({
    where: {
      branchId: { in: branchIds },
      source: 'ONLINE',
      status: { in: ['CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED'] },
      startAt: {
        gte: new Date(`${range.fromKey}T00:00:00+08:00`),
        lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
      },
    },
  });

  const rows: IncentiveRow[] = [];

  for (const scheme of schemes) {
    const eligible = employees.filter((e) => e.employeeRole === scheme.targetRole);

    for (const employee of eligible) {
      let metricValue = 0;
      let metricLabel = '';

      switch (scheme.metric) {
        case 'revenue': {
          metricValue =
            scheme.targetRole === 'THERAPIST'
              ? (revenueById.get(employee.id) ?? 0)
              : branchSales.netSalesCents;
          metricLabel =
            scheme.targetRole === 'THERAPIST'
              ? 'Revenue generated'
              : 'Branch revenue for the month';
          break;
        }
        case 'rating': {
          const r = ratingById.get(employee.id);
          metricValue = Math.round((r?.avg ?? 0) * 10);
          metricLabel = `Average rating (${r?.count ?? 0} reviews)`;
          break;
        }
        case 'attendance': {
          const days = attendanceById.get(employee.id) ?? 0;
          const lates = lateById.get(employee.id) ?? 0;
          metricValue = days;
          metricLabel = `${days} day(s) present, ${lates} late`;
          break;
        }
        case 'bookings': {
          metricValue = bookings;
          metricLabel = 'Confirmed online bookings';
          break;
        }
      }

      let suggested = 0;
      switch (scheme.formula) {
        case 'FIXED_AMOUNT':
          // Only pay a flat bonus when the person actually has activity.
          suggested = metricValue > 0 ? scheme.value : 0;
          break;
        case 'PERCENT_OF_REVENUE':
          suggested = Math.round((metricValue * scheme.value) / 100);
          break;
        case 'PERCENT_OF_TARGET': {
          const achievement = scheme.targetValue
            ? Math.min(1.5, metricValue / scheme.targetValue)
            : 0;
          suggested = Math.round(((scheme.targetValue * scheme.value) / 100) * achievement);
          break;
        }
      }

      rows.push({
        schemeId: scheme.id,
        schemeName: scheme.name,
        formula: scheme.formula,
        metric: scheme.metric,
        employeeId: employee.id,
        employeeName: employee.name,
        employeeRole: employee.employeeRole,
        metricValue,
        metricLabel,
        suggestedCents: suggested,
        note: scheme.note,
      });
    }

    // "Therapist of the month" style flat bonuses go to the top performer only.
    if (scheme.formula === 'FIXED_AMOUNT' && scheme.metric === 'revenue') {
      const mine = rows.filter((r) => r.schemeId === scheme.id);
      const best = mine.reduce<IncentiveRow | null>(
        (a, b) => (!a || b.metricValue > a.metricValue ? b : a),
        null,
      );
      for (const r of mine) {
        if (r.employeeId !== best?.employeeId) r.suggestedCents = 0;
      }
    }
  }

  return rows.sort(
    (a, b) => a.schemeName.localeCompare(b.schemeName) || b.suggestedCents - a.suggestedCents,
  );
}
