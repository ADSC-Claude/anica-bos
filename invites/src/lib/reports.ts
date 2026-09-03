import 'server-only';
import { prisma } from './db';
import { monthKey } from './datetime';
import { OCCASION_BY_KEY } from './occasions';
import { TIER_LABELS } from './tiers';

/**
 * The numbers, each with the arithmetic visible. Revenue counts orders that
 * were paid (ACTIVE, PAID or later REFUNDED — a refund shows as a negative
 * line, not as revenue that never happened).
 */

type Bucket = { key: string; label: string; orders: number; revenueCents: number };

function bucketise<T>(items: T[], keyOf: (t: T) => string, labelOf: (k: string) => string, amountOf: (t: T) => number): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const it of items) {
    const k = keyOf(it);
    const b = map.get(k) ?? { key: k, label: labelOf(k), orders: 0, revenueCents: 0 };
    b.orders += 1;
    b.revenueCents += amountOf(it);
    map.set(k, b);
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

export async function salesReport(months = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const paid = await prisma.order.findMany({
    where: { status: { in: ['PAID', 'ACTIVE', 'REFUNDED'] }, paidAt: { gte: since } },
    include: { package: { select: { name: true } }, payments: { where: { status: { in: ['PAID', 'REFUNDED'] } }, select: { refundedCents: true, channel: true, provider: true } } },
  });
  const net = (o: (typeof paid)[number]) => o.totalCents - o.payments.reduce((a, p) => a + p.refundedCents, 0);

  const byMonth = bucketise(paid, (o) => monthKey(o.paidAt ?? o.createdAt), (k) => k, net).sort((a, b) => a.key.localeCompare(b.key));
  const byPackage = bucketise(paid, (o) => o.package.name, (k) => k, net);
  const byOccasion = bucketise(paid, (o) => o.occasion, (k) => OCCASION_BY_KEY[k as keyof typeof OCCASION_BY_KEY]?.label ?? k, net);
  const byTier = bucketise(paid, (o) => o.tier, (k) => TIER_LABELS[k as keyof typeof TIER_LABELS] ?? k, net);
  const byMode = bucketise(paid, (o) => o.serviceMode, (k) => k, net);
  const byChannel = bucketise(
    paid.flatMap((o) => o.payments.map((p) => ({ o, p }))),
    ({ p }) => p.channel || (p.provider === 'MANUAL' ? 'Manual transfer' : 'PayMongo'),
    (k) => k,
    ({ o }) => net(o),
  );

  const [created, paidCount] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: since } } }),
    prisma.order.count({ where: { createdAt: { gte: since }, status: { in: ['PAID', 'ACTIVE', 'REFUNDED'] } } }),
  ]);

  return {
    totalCents: paid.reduce((a, o) => a + net(o), 0),
    orders: paid.length,
    conversion: { created, paid: paidCount },
    byMonth,
    byPackage,
    byOccasion,
    byTier,
    byMode,
    byChannel,
  };
}

export async function dfyReport() {
  const jobs = await prisma.dfyJob.findMany({
    where: { previewSentAt: { not: null } },
    select: { createdAt: true, intakeSubmittedAt: true, previewSentAt: true, publishedAt: true, dueAt: true, revisionsUsed: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const hours = (a: Date | null, b: Date | null) => (a && b ? (b.getTime() - a.getTime()) / 3_600_000 : null);
  const intakeToPreview = jobs.map((j) => hours(j.intakeSubmittedAt, j.previewSentAt)).filter((h): h is number => h !== null);
  const previewToPublish = jobs.map((j) => hours(j.previewSentAt, j.publishedAt)).filter((h): h is number => h !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const late = jobs.filter((j) => j.dueAt && j.previewSentAt && j.previewSentAt > j.dueAt).length;
  const open = await prisma.dfyJob.groupBy({ by: ['status'], _count: { _all: true } });
  return {
    sampled: jobs.length,
    avgIntakeToPreviewHours: Math.round(avg(intakeToPreview)),
    avgPreviewToPublishHours: Math.round(avg(previewToPublish)),
    avgRevisions: Math.round(avg(jobs.map((j) => j.revisionsUsed)) * 10) / 10,
    lateCount: late,
    open: Object.fromEntries(open.map((o) => [o.status, o._count._all])) as Record<string, number>,
  };
}

export async function templateReport() {
  const rows = await prisma.invitation.groupBy({ by: ['templateId'], _count: { _all: true } });
  const templates = await prisma.template.findMany({ select: { id: true, name: true, occasion: true } });
  const byId = new Map(templates.map((t) => [t.id, t]));
  return rows
    .map((r) => ({ id: r.templateId, name: byId.get(r.templateId)?.name ?? '?', occasion: byId.get(r.templateId)?.occasion ?? '', count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function overview() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [pendingProofs, openJobs, overdueJobs, ordersThisMonth, revenueThisMonth, publishedTotal, customers, unreadSupport] = await Promise.all([
    prisma.payment.count({ where: { provider: 'MANUAL', status: 'PENDING' } }),
    prisma.dfyJob.count({ where: { status: { notIn: ['PUBLISHED'] } } }),
    prisma.dfyJob.count({ where: { status: { in: ['NEW', 'INTAKE_RECEIVED', 'ENCODING', 'REVISION'] }, dueAt: { lt: now } } }),
    prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.order.aggregate({ where: { status: { in: ['PAID', 'ACTIVE'] }, paidAt: { gte: startOfMonth } }, _sum: { totalCents: true } }),
    prisma.invitation.count({ where: { status: 'PUBLISHED' } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.supportMessage.count({ where: { fromStaff: false, readAt: null } }),
  ]);
  return { pendingProofs, openJobs, overdueJobs, ordersThisMonth, revenueThisMonthCents: revenueThisMonth._sum.totalCents ?? 0, publishedTotal, customers, unreadSupport };
}
