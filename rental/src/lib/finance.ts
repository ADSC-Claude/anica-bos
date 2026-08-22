import 'server-only';
import { prisma } from './db';
import { revenueSplit } from './money';
import { toStayDate, type DateKey } from './datetime';

/**
 * Money out, and the statement that puts it beside money in.
 *
 *   Revenue − Expenses = Net Operating Profit
 *
 * Revenue here is what was **earned** in the window (stays that happened),
 * not what was **received** in it. A deposit taken in June for an August stay
 * is August's revenue. Mixing the two is how a P&L shows a wonderful month
 * followed by an empty one, for a business that was steady throughout.
 */

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Platform fees',
  'Cleaning',
  'Laundry',
  'Utilities',
  'Internet',
  'Association dues',
  'Supplies',
  'Repairs',
  'Maintenance',
  'Staff and vendors',
  'Marketing',
  'Taxes and permits',
  'Other',
];

export type PLRow = {
  propertyId: string | null;
  propertyName: string;
  revenueCents: number;
  accommodationCents: number;
  cleaningFeeCents: number;
  addOnsCents: number;
  expenseCents: number;
  netCents: number;
  marginPercent: number;
};

export type ProfitAndLoss = {
  fromKey: DateKey;
  toKey: DateKey;
  rows: PLRow[];
  /** Expenses with no property — marketing, the accountant, the owner's phone. */
  unallocatedExpenseCents: number;
  totals: {
    revenueCents: number;
    expenseCents: number;
    netCents: number;
    marginPercent: number;
  };
  expensesByCategory: { category: string; amountCents: number }[];
};

const EARNING = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] as const;

export async function profitAndLoss(args: {
  fromKey: DateKey;
  toKey: DateKey;
  propertyIds?: string[] | null;
  branchId?: string | null;
}): Promise<ProfitAndLoss> {
  const from = toStayDate(args.fromKey);
  const to = toStayDate(args.toKey);

  const properties = await prisma.property.findMany({
    where: {
      ...(args.propertyIds ? { id: { in: args.propertyIds } } : {}),
      ...(args.branchId ? { branchId: args.branchId } : {}),
    },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });
  const ids = properties.map((p) => p.id);

  // Revenue is attributed to the check-in date. For a 1-3 unit operation with
  // stays of a few nights this is exact enough to reconcile against the bank,
  // and it keeps a stay's money in one month rather than split across two.
  const reservations = await prisma.reservation.findMany({
    where: {
      propertyId: { in: ids },
      status: { in: [...EARNING] },
      checkIn: { gte: from, lte: to },
    },
    select: {
      propertyId: true,
      accommodationCents: true,
      cleaningFeeCents: true,
      addOnsCents: true,
      extraGuestCents: true,
      discountCents: true,
      totalCents: true,
    },
  });

  const expenses = await prisma.expense.findMany({
    where: { date: { gte: from, lte: to } },
    include: { category: { select: { name: true } } },
  });

  const byProperty = new Map<string, PLRow>();
  for (const p of properties) {
    byProperty.set(p.id, {
      propertyId: p.id,
      propertyName: p.name,
      revenueCents: 0,
      accommodationCents: 0,
      cleaningFeeCents: 0,
      addOnsCents: 0,
      expenseCents: 0,
      netCents: 0,
      marginPercent: 0,
    });
  }

  for (const r of reservations) {
    const row = byProperty.get(r.propertyId);
    if (!row) continue;
    // Same rule as the dashboard: a booking with a total and no breakdown has
    // its total read as accommodation, so the split columns account for the
    // revenue column rather than sitting empty beside it.
    const split = revenueSplit(r);
    row.accommodationCents += split.accommodationCents;
    row.cleaningFeeCents += split.cleaningFeeCents;
    row.addOnsCents += split.addOnsCents;
    row.revenueCents += r.totalCents;
  }

  let unallocatedExpenseCents = 0;
  const categoryTotals = new Map<string, number>();

  for (const e of expenses) {
    categoryTotals.set(e.category.name, (categoryTotals.get(e.category.name) ?? 0) + e.amountCents);
    if (!e.propertyId) {
      unallocatedExpenseCents += e.amountCents;
      continue;
    }
    const row = byProperty.get(e.propertyId);
    if (!row) {
      // Belongs to a property outside this filter — not this statement's money.
      continue;
    }
    row.expenseCents += e.amountCents;
  }

  const rows = [...byProperty.values()].map((r) => {
    const netCents = r.revenueCents - r.expenseCents;
    return {
      ...r,
      netCents,
      marginPercent: r.revenueCents ? Math.round((netCents / r.revenueCents) * 100) : 0,
    };
  });

  const revenueCents = rows.reduce((a, r) => a + r.revenueCents, 0);
  // Consolidated carries the unallocated expenses; no single property does.
  const expenseCents = rows.reduce((a, r) => a + r.expenseCents, 0) + unallocatedExpenseCents;
  const netCents = revenueCents - expenseCents;

  return {
    fromKey: args.fromKey,
    toKey: args.toKey,
    rows,
    unallocatedExpenseCents,
    totals: {
      revenueCents,
      expenseCents,
      netCents,
      marginPercent: revenueCents ? Math.round((netCents / revenueCents) * 100) : 0,
    },
    expensesByCategory: [...categoryTotals.entries()]
      .map(([category, amountCents]) => ({ category, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents),
  };
}

/** Cash actually received in the window — reconciles against the bank. */
export async function cashReceived(fromKey: DateKey, toKey: DateKey, propertyIds?: string[] | null) {
  const payments = await prisma.payment.findMany({
    where: {
      status: 'PAID',
      paidAt: { gte: toStayDate(fromKey), lt: new Date(toStayDate(toKey).getTime() + 86_400_000) },
      ...(propertyIds ? { reservation: { propertyId: { in: propertyIds } } } : {}),
    },
    include: { reservation: { select: { reference: true, propertyId: true } } },
    orderBy: { paidAt: 'asc' },
  });

  return {
    payments,
    totalCents: payments.reduce((a, p) => a + p.amountCents, 0),
  };
}

/** Unpaid balances, soonest arrival first. Drives the dashboard chase list. */
export async function outstandingBalances(propertyIds?: string[] | null) {
  const rows = await prisma.reservation.findMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
      ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
    },
    include: {
      property: { select: { name: true } },
      guest: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { checkIn: 'asc' },
  });
  return rows
    .filter((r) => r.totalCents - r.paidCents > 0)
    .map((r) => ({ ...r, balanceCents: r.totalCents - r.paidCents }));
}
