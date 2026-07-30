/**
 * Client return reminders.
 *
 * The system watches each client's visit rhythm and suggests a per-client
 * threshold from their own data ("usually every 3 weeks; it's been 8"), with a
 * business-wide fallback the Owner can configure.
 */
import { prisma } from './db';
import { daysUntil } from './datetime';

export type RetentionRow = {
  clientId: string;
  name: string;
  mobile: string;
  email: string;
  visits: number;
  lastVisit: Date | null;
  daysSinceLastVisit: number;
  /** Mean gap between visits, in days. Null when we have fewer than 2 visits. */
  averageIntervalDays: number | null;
  /** Threshold actually applied — per-client when we know their rhythm. */
  suggestedThresholdDays: number;
  overdue: boolean;
  lifetimeSpendCents: number;
};

/**
 * Per-client suggestion: 2× their own average gap (so a 3-week regular is
 * flagged at 6 weeks, a quarterly visitor at 6 months), clamped to sane bounds.
 */
export function suggestThreshold(
  averageIntervalDays: number | null,
  fallbackDays: number,
): number {
  if (!averageIntervalDays || averageIntervalDays <= 0) return fallbackDays;
  return Math.min(365, Math.max(14, Math.round(averageIntervalDays * 2)));
}

export async function retentionWatch(
  branchIds: string[],
  opts: { fallbackDays: number; onlyOverdue?: boolean } = { fallbackDays: 60 },
): Promise<RetentionRow[]> {
  const clients = await prisma.client.findMany({
    where: { branchId: { in: branchIds } },
    select: {
      id: true,
      name: true,
      mobile: true,
      email: true,
      followUpSnoozedUntil: true,
      sales: {
        where: { status: 'PAID' },
        select: { businessDate: true, totalCents: true },
        orderBy: { businessDate: 'asc' },
      },
    },
  });

  const rows: RetentionRow[] = clients
    .filter((c) => c.sales.length > 0)
    .map((c) => {
      const dates = c.sales.map((s) => s.businessDate.getTime());
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push(Math.round((dates[i] - dates[i - 1]) / 86_400_000));
      }
      const meaningful = gaps.filter((g) => g > 0);
      const averageIntervalDays = meaningful.length
        ? Math.round(meaningful.reduce((a, b) => a + b, 0) / meaningful.length)
        : null;

      const lastVisit = c.sales[c.sales.length - 1].businessDate;
      const daysSince = -daysUntil(lastVisit);
      const threshold = suggestThreshold(averageIntervalDays, opts.fallbackDays);
      const snoozed =
        c.followUpSnoozedUntil !== null && c.followUpSnoozedUntil > new Date();

      return {
        clientId: c.id,
        name: c.name,
        mobile: c.mobile,
        email: c.email,
        visits: c.sales.length,
        lastVisit,
        daysSinceLastVisit: daysSince,
        averageIntervalDays,
        suggestedThresholdDays: threshold,
        overdue: !snoozed && daysSince > threshold,
        lifetimeSpendCents: c.sales.reduce((a, s) => a + s.totalCents, 0),
      };
    });

  const filtered = opts.onlyOverdue ? rows.filter((r) => r.overdue) : rows;
  return filtered.sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);
}

/**
 * Business-wide suggestion for the "no return" threshold: the 75th percentile
 * of observed visit gaps, so most regulars are inside it and genuine lapses
 * stand out.
 */
export async function suggestBusinessThreshold(branchIds: string[]): Promise<number | null> {
  const rows = await retentionWatch(branchIds, { fallbackDays: 60 });
  const intervals = rows
    .map((r) => r.averageIntervalDays)
    .filter((n): n is number => n !== null && n > 0)
    .sort((a, b) => a - b);
  if (intervals.length < 5) return null;
  const p75 = intervals[Math.floor(intervals.length * 0.75)];
  return Math.min(180, Math.max(21, Math.round(p75 * 2)));
}

/** Monthly digest: how many clients lapsed vs came back. */
export async function retentionDigest(branchIds: string[], fallbackDays: number) {
  const rows = await retentionWatch(branchIds, { fallbackDays });
  const overdue = rows.filter((r) => r.overdue);
  const returnedRecently = rows.filter((r) => r.daysSinceLastVisit <= 30 && r.visits > 1);
  return {
    trackedClients: rows.length,
    lapsed: overdue.length,
    returned: returnedRecently.length,
    lapsedValueCents: overdue.reduce((a, r) => a + r.lifetimeSpendCents, 0),
  };
}
