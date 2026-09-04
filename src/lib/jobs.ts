/**
 * Scheduled work. Runs from `POST /api/jobs/daily` (Vercel Cron, a GitHub
 * Action, or cURL) and from `npm run jobs:daily`. Every step is idempotent, so
 * running it twice in a day is harmless.
 */
import { prisma } from './db';
import { getSettings } from './settings';
import { sendTemplateEmail } from './email';
import { notify, resolveNotifications } from './notifications';
import { expireStaleBookings } from './booking';
import { audit } from './audit';
import { daysUntil, formatManila, manilaDateKey, isBirthdayToday } from './datetime';
import { formatPeso } from './money';

export type JobReport = {
  expiredBookings: number;
  birthdayGreetings: number;
  membershipReminders: number;
  lowStockAlerts: number;
  permitReminders: number;
  overdueCorporate: number;
  followUpFlags: number;
  prunedLoginEvents: number;
  prunedEmailLogs: number;
};

export async function runDailyJobs(): Promise<JobReport> {
  const report: JobReport = {
    expiredBookings: 0,
    birthdayGreetings: 0,
    membershipReminders: 0,
    lowStockAlerts: 0,
    permitReminders: 0,
    overdueCorporate: 0,
    followUpFlags: 0,
    prunedLoginEvents: 0,
    prunedEmailLogs: 0,
  };

  const settings = await getSettings();
  const branches = await prisma.branch.findMany({ where: { active: true } });

  // 1 — release bookings whose deposit never arrived
  report.expiredBookings = await expireStaleBookings();

  // 2 — birthday greetings
  if (settings['email.birthdayGreetingEnabled']) {
    const clients = await prisma.client.findMany({
      where: { birthday: { not: null }, email: { not: '' } },
      select: { id: true, name: true, email: true, birthday: true },
    });
    const todayKey = manilaDateKey();
    for (const c of clients.filter((c) => isBirthdayToday(c.birthday))) {
      // Don't greet the same client twice in one day.
      const already = await prisma.emailLog.findFirst({
        where: {
          clientId: c.id,
          template: 'birthday_greeting',
          createdAt: { gte: new Date(`${todayKey}T00:00:00+08:00`) },
        },
      });
      if (already) continue;

      const membership = await prisma.clientPackage.findFirst({
        where: {
          clientId: c.id,
          status: 'ACTIVE',
          expiresAt: { gte: new Date() },
          package: { type: 'MEMBERSHIP' },
        },
        include: { package: true },
      });

      await sendTemplateEmail({
        to: c.email,
        template: 'birthday_greeting',
        clientId: c.id,
        vars: {
          clientName: c.name,
          promoText: membership?.package.birthdayPerkServiceId
            ? 'As a member, your free birthday massage is waiting for you this month — just mention it at reception.'
            : 'Come celebrate with us this month and enjoy a treat on your visit.',
        },
      });
      report.birthdayGreetings += 1;
    }
  }

  // 3 — memberships expiring within the alert window
  const alertDays = settings['membership.expiryAlertDays'];
  const expiring = await prisma.clientPackage.findMany({
    where: {
      status: 'ACTIVE',
      package: { type: 'MEMBERSHIP' },
      expiresAt: { gte: new Date(), lte: new Date(Date.now() + alertDays * 86_400_000) },
    },
    include: { client: true, package: true },
  });
  for (const m of expiring) {
    await notify({
      kind: 'EXPIRING_MEMBERSHIP',
      title: `Membership expiring — ${m.client.name}`,
      body: `${m.package.name} ends ${formatManila(m.expiresAt)} (${daysUntil(m.expiresAt)} days)`,
      link: `/portal/clients/${m.clientId}`,
      dedupeKey: `membership-expiring:${m.id}`,
      branchId: m.client.branchId,
      roles: ['RECEPTIONIST', 'ADMIN', 'OWNER'],
    });

    if (!m.expiryNotifiedAt && m.client.email) {
      await sendTemplateEmail({
        to: m.client.email,
        template: 'membership_expiring',
        clientId: m.clientId,
        vars: {
          clientName: m.client.name,
          packageName: m.package.name,
          expiryDate: formatManila(m.expiresAt),
        },
      });
      await prisma.clientPackage.update({
        where: { id: m.id },
        data: { expiryNotifiedAt: new Date() },
      });
      report.membershipReminders += 1;
    }
  }

  // Mark anything already past its date.
  await prisma.clientPackage.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  await prisma.giftCertificate.updateMany({
    where: { status: { in: ['ACTIVE', 'PARTIALLY_USED'] }, expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  await prisma.voucher.updateMany({
    where: { status: { in: ['ACTIVE', 'PARTIALLY_USED'] }, expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });

  // 4 — low stock
  for (const branch of branches) {
    const items = await prisma.item.findMany({
      where: { branchId: branch.id, archived: false, reorderLevel: { gt: 0 } },
      include: { unit: true },
    });
    for (const item of items) {
      if (item.stockQty <= item.reorderLevel) {
        await notify({
          kind: 'LOW_STOCK',
          title: `Low stock — ${item.name}`,
          body: `${item.stockQty} ${item.unit.name} left (reorder at ${item.reorderLevel})`,
          link: '/portal/inventory',
          dedupeKey: `low-stock:${item.id}`,
          branchId: branch.id,
          roles: ['RECEPTIONIST', 'ADMIN', 'OWNER'],
        });
        report.lowStockAlerts += 1;
      } else {
        await resolveNotifications(`low-stock:${item.id}`);
      }
    }
  }

  // 5 — permits and certifications
  const leadDays = settings['permits.reminderLeadDays'] as unknown as number[];
  const permits = await prisma.permit.findMany({
    where: { expiryDate: { not: null } },
    include: { employee: { select: { name: true } } },
  });
  for (const p of permits) {
    const left = daysUntil(p.expiryDate!);
    const maxLead = Math.max(...leadDays);
    if (left > maxLead) {
      await resolveNotifications(`permit-expiry:${p.id}`);
      continue;
    }

    await notify({
      kind: 'PERMIT_EXPIRY',
      title: left < 0 ? `EXPIRED — ${p.name}` : `${p.name} expires in ${left} day(s)`,
      body: `${p.agency}${p.employee ? ` · ${p.employee.name}` : ''} · ref ${p.refNumber}`,
      link: '/portal/settings/permits',
      dedupeKey: `permit-expiry:${p.id}`,
      roles: ['OWNER', 'ADMIN'],
    });
    report.permitReminders += 1;

    // Email at each lead time, then weekly once inside the window.
    const hitsLead = leadDays.includes(left);
    const weekly = left < Math.min(...leadDays) && left % 7 === 0;
    const alreadyToday =
      p.lastRemindedAt && daysUntil(p.lastRemindedAt) === 0;
    if ((hitsLead || weekly || left < 0) && !alreadyToday) {
      const owners = await prisma.user.findMany({
        where: { role: 'OWNER', active: true },
        select: { email: true },
      });
      for (const o of owners) {
        await sendTemplateEmail({
          to: o.email,
          template: 'permit_expiry',
          vars: {
            permitName: p.name,
            agency: p.agency,
            refNumber: p.refNumber,
            expiryDate: formatManila(p.expiryDate!),
            daysLeft: left,
          },
        });
      }
      await prisma.permit.update({ where: { id: p.id }, data: { lastRemindedAt: new Date() } });
    }
  }

  // 6 — overdue corporate accounts
  const accounts = await prisma.corporateAccount.findMany({
    where: { active: true },
    include: {
      payments: true,
      sales: {
        where: { status: 'PAID' },
        include: { payments: { where: { method: 'CORPORATE_CHARGE' } } },
      },
    },
  });
  for (const a of accounts) {
    const charged = a.sales.reduce(
      (sum, s) => sum + s.payments.reduce((x, p) => x + p.amountCents, 0),
      0,
    );
    const settled = a.payments.reduce((x, p) => x + p.amountCents, 0);
    const outstanding = charged - settled;
    const oldest = a.sales
      .filter((s) => s.payments.length > 0)
      .sort((x, y) => x.businessDate.getTime() - y.businessDate.getTime())[0];
    const ageDays = oldest ? -daysUntil(oldest.businessDate) : 0;

    if (outstanding > 0 && ageDays > a.paymentTermsDays) {
      await notify({
        kind: 'OVERDUE_CORPORATE',
        title: `Overdue — ${a.name}`,
        body: `${formatPeso(outstanding)} outstanding, oldest charge ${ageDays} days old`,
        link: '/portal/finance/receivables',
        dedupeKey: `overdue-corporate:${a.id}`,
        roles: ['OWNER', 'ADMIN'],
      });
      report.overdueCorporate += 1;
    } else {
      await resolveNotifications(`overdue-corporate:${a.id}`);
    }
  }

  // 7 — client follow-up flags
  const { retentionWatch } = await import('./retention');
  for (const branch of branches) {
    const overdue = await retentionWatch([branch.id], {
      fallbackDays: settings['retention.defaultThresholdDays'],
      onlyOverdue: true,
    });
    if (overdue.length > 0) {
      await notify({
        kind: 'CLIENT_FOLLOW_UP',
        title: `${overdue.length} client(s) are overdue to return`,
        body: `Top: ${overdue.slice(0, 3).map((r) => r.name).join(', ')}`,
        link: '/portal/clients/follow-ups',
        dedupeKey: `follow-up:${branch.id}:${manilaDateKey()}`,
        branchId: branch.id,
        roles: ['RECEPTIONIST', 'ADMIN', 'OWNER'],
      });
      report.followUpFlags = overdue.length;
    }
  }

  // 8 — let the two personal-data logs age out
  //
  // Neither is a business record. A sign-in attempt is kept to investigate a
  // break-in and an email log to explain a message that never arrived, and both
  // questions are asked about last month, not the year before last. Holding an
  // IP address for the life of the spa serves nobody and is exactly what the
  // Data Privacy Act means by keeping data longer than the purpose requires.
  //
  // The audit log is not pruned here and must not be: it is append-only by
  // design, an examiner reads it, and BIR expects ten years. `medical_record`
  // entries live there too, so the record of who read whose health file
  // outlives the retention windows below on purpose.
  const loginDays = settings['privacy.loginLogRetentionDays'];
  if (loginDays > 0) {
    const { count } = await prisma.loginEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - loginDays * 86_400_000) } },
    });
    report.prunedLoginEvents = count;
  }

  const emailDays = settings['privacy.emailLogRetentionDays'];
  if (emailDays > 0) {
    const { count } = await prisma.emailLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - emailDays * 86_400_000) } },
    });
    report.prunedEmailLogs = count;
  }

  await audit(null, {
    module: 'jobs',
    action: 'daily',
    entityType: 'Job',
    summary: `Daily job: ${report.expiredBookings} expired bookings, ${report.birthdayGreetings} birthday emails, ${report.membershipReminders} renewal reminders, ${report.lowStockAlerts} low-stock alerts, ${report.permitReminders} permit reminders, ${report.prunedLoginEvents + report.prunedEmailLogs} expired log rows removed`,
    after: report as unknown as Record<string, number>,
  });

  return report;
}
