import 'server-only';
import { prisma } from './db';
import { getSettings } from './settings';
import { notify, notifyStaff } from './notifications';
import { addDays } from './datetime';
import { hasFeature } from './tiers';
import { audit } from './audit';
import { campaignFor, pickedKinds, dueToday, campaignKindLabel } from './campaigns';
import { prefsOf } from './messages';
import { sendCampaign } from './reminders';

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
  /** Scheduled campaigns sent this morning, and what they came to. */
  campaignsSent: number;
  campaignTexts: number;
  campaignEmails: number;
};

export async function runDailyJobs(): Promise<DailyReport> {
  const s = await getSettings();
  const now = new Date();
  const report: DailyReport = {
    invitationsExpired: 0, ordersCancelled: 0, rsvpsClosed: 0, dfyOverdueAlerts: 0, expiryWarnings: 0,
    campaignsSent: 0, campaignTexts: 0, campaignEmails: 0,
  };

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

  // 6 — the scheduled guest messages.
  //
  // Last, and behind a setting that starts off, because it is the only step
  // here that spends money and the only one a guest can see. Everything above
  // it has already run by the time this decides to do nothing.
  if (s['campaigns.enabled']) await runCampaigns(now, report);

  return report;
}

/**
 * The seven-day, one-day, same-day and thank-you messages, for every
 * invitation one of them is due on this morning.
 *
 * Only published invitations with a date and a campaign add-on are considered,
 * and each guest is skipped if they already have that message — so a retry, a
 * second cron, or a manual curl sends nothing twice. That matters more here
 * than anywhere else in this file: the other steps are idempotent because
 * repeating them is merely untidy, and repeating this one is a second text at
 * the couple's expense to a guest who already had it.
 *
 * One invitation failing does not stop the rest. A campaign is a dated thing:
 * a one-day reminder that throws today cannot be sent tomorrow, so the others
 * due this morning must still go.
 */
async function runCampaigns(now: Date, report: DailyReport): Promise<void> {
  const invitations = await prisma.invitation.findMany({
    where: { status: 'PUBLISHED', eventAt: { not: null }, saveTheDateOfId: null },
    select: {
      id: true, slug: true, title: true, occasion: true, tier: true,
      eventAt: true, content: true, guestMessages: true, addOns: true, userId: true,
    },
  });

  for (const inv of invitations) {
    const campaign = campaignFor(inv.addOns);
    if (!campaign || !inv.eventAt) continue;

    const kinds = pickedKinds(campaign, prefsOf(inv.guestMessages).picked);
    const kind = dueToday(kinds, inv.eventAt, now);
    if (!kind) continue;

    try {
      const outcome = await sendCampaign(inv, kind, { email: campaign.email, guests: campaign.guests });
      const texts = outcome.texts.sent + outcome.texts.logged;
      const emails = outcome.emails.sent + outcome.emails.logged;
      if (!texts && !emails && !outcome.overBand) continue;

      report.campaignsSent++;
      report.campaignTexts += texts;
      report.campaignEmails += emails;

      await audit(null, {
        module: 'invitations', action: 'campaign.sent', entityType: 'Invitation', entityId: inv.id,
        summary: `${kind} — ${texts} text(s), ${emails} e-mail(s)`,
        after: { kind, texts, emails, failed: outcome.texts.failed + outcome.emails.failed, overBand: outcome.overBand },
      });

      // A guest list longer than the band is the couple's to know about while
      // there is still a message left to send, not afterwards.
      if (outcome.overBand > 0) {
        await notify(
          inv.userId,
          `${outcome.overBand} guest(s) beyond your plan — ${inv.title}`,
          `Your ${campaignKindLabel(kind).toLowerCase()} went to the first ${campaign.guests} on your list. Message us to cover the rest before the next one.`,
          `/account/invitations/${inv.id}/messages`,
        );
      }
    } catch (err) {
      console.error('[campaign]', inv.id, kind, err);
      await notifyStaff(
        'invitations.edit',
        `Campaign failed — ${inv.title}`,
        `The ${campaignKindLabel(kind).toLowerCase()} did not go out. It is dated, so it cannot simply run again tomorrow.`,
        `/admin/invitations/${inv.id}`,
      );
    }
  }
}
