import 'server-only';
import { prisma } from './db';
import { getSettings } from './settings';
import { notify, notifyStaff } from './notifications';
import { addDays } from './datetime';
import { hasFeature } from './tiers';
import { audit } from './audit';

/**
 * Scheduled work, once a day. Idempotent — running it twice changes nothing,
 * which is what makes a retry safe and a manual `curl` harmless.
 */
export type DailyReport = {
  invitationsExpired: number;
  ordersCancelled: number;
  rsvpsClosed: number;
  dfyOverdueAlerts: number;
  expiryWarnings: number;
};

export async function runDailyJobs(): Promise<DailyReport> {
  const s = await getSettings();
  const now = new Date();
  const report: DailyReport = { invitationsExpired: 0, ordersCancelled: 0, rsvpsClosed: 0, dfyOverdueAlerts: 0, expiryWarnings: 0 };

  // 1 — links past their validity stop resolving.
  const expired = await prisma.invitation.updateMany({
    where: { status: 'PUBLISHED', expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  report.invitationsExpired = expired.count;

  // 2 — warn a week before expiry, once.
  const soon = await prisma.invitation.findMany({
    where: { status: 'PUBLISHED', expiresAt: { gte: now, lt: addDays(now, 7) } },
    select: { id: true, userId: true, title: true, expiresAt: true },
  });
  for (const inv of soon) {
    const already = await prisma.notification.findFirst({ where: { userId: inv.userId, href: `/account/invitations/${inv.id}`, title: { startsWith: 'Link expiring' } } });
    if (already) continue;
    await notify(inv.userId, `Link expiring soon — ${inv.title}`, 'Your invitation link stops working in a week. Message us if you need it extended.', `/account/invitations/${inv.id}`);
    report.expiryWarnings++;
  }

  // 3 — unpaid orders older than the grace period are cancelled.
  const stale = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT', createdAt: { lt: addDays(now, -s['orders.unpaidExpiryDays']) } },
    select: { id: true, reference: true },
  });
  for (const o of stale) {
    await prisma.order.update({ where: { id: o.id }, data: { status: 'CANCELLED', cancelledAt: now } });
    await audit(null, { module: 'orders', action: 'cancel.stale', entityType: 'Order', entityId: o.id, summary: `unpaid for ${s['orders.unpaidExpiryDays']} days` });
    report.ordersCancelled++;
  }

  // 4 — Complete-tier RSVPs auto-close after the deadline.
  const due = await prisma.invitation.findMany({
    where: { status: 'PUBLISHED', rsvpClosed: false, rsvpDeadline: { lt: now } },
    select: { id: true, tier: true, userId: true, title: true },
  });
  for (const inv of due) {
    if (!hasFeature(inv.tier, 'rsvp.autoClose')) continue;
    await prisma.invitation.update({ where: { id: inv.id }, data: { rsvpClosed: true } });
    await notify(inv.userId, `RSVP closed — ${inv.title}`, 'The deadline has passed. You can reopen it from your dashboard.', `/account/invitations/${inv.id}/rsvps`);
    report.rsvpsClosed++;
  }

  // 5 — DFY jobs past their SLA get a nudge to the queue.
  const overdue = await prisma.dfyJob.findMany({
    where: { status: { in: ['NEW', 'INTAKE_RECEIVED', 'ENCODING', 'REVISION'] }, dueAt: { lt: now } },
    include: { order: { select: { reference: true } } },
  });
  for (const job of overdue) {
    const already = await prisma.notification.findFirst({ where: { href: `/admin/dfy/${job.id}`, title: { startsWith: 'Overdue' }, createdAt: { gte: addDays(now, -1) } } });
    if (already) continue;
    await notifyStaff('dfy.view', `Overdue — ${job.order.reference}`, `Preview was due ${job.dueAt?.toDateString()}`, `/admin/dfy/${job.id}`);
    report.dfyOverdueAlerts++;
  }

  return report;
}
