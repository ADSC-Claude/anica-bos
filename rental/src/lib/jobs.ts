import 'server-only';
import { prisma } from './db';
import { getSettings } from './settings';
import { audit } from './audit';
import { notify, resolveNotification } from './notifications';
import { dispatchDue } from './messaging';
import { expireHolds, completeFinishedStays, sweepNoShows } from './reservations';
import { overdueCleanings, syncReadyState, unreadyArrivals } from './operations';
import { pullAllFeeds } from './sync/ical';
import { sendEmail } from './email';
import { formatPeso } from './money';
import { countdown, daysUntil, formatStayDate, manilaDateKey, toStayDate } from './datetime';
import { absoluteUrl } from './app-url';

/**
 * Scheduled work. Two endpoints, both idempotent — running either twice in a
 * day changes nothing, which is what makes a retry safe and a manual `curl`
 * harmless.
 */

export type MinuteReport = {
  messagesSent: number;
  messagesFailed: number;
  holdsExpired: number;
  feedsPolled: number;
  feedConflicts: number;
  readyStatesRefreshed: number;
};

/** Every 15 minutes. The clock the guest experience actually runs on. */
export async function runMinuteJobs(): Promise<MinuteReport> {
  const settings = await getSettings();
  const report: MinuteReport = {
    messagesSent: 0,
    messagesFailed: 0,
    holdsExpired: 0,
    feedsPolled: 0,
    feedConflicts: 0,
    readyStatesRefreshed: 0,
  };

  // 1 — release dates whose payment never arrived, before anything else looks
  // at availability.
  report.holdsExpired = await expireHolds();

  // 2 — send what is due
  const dispatch = await dispatchDue();
  report.messagesSent = dispatch.sent;
  report.messagesFailed = dispatch.failed;

  // 3 — poll Airbnb
  if (settings['sync.icalEnabled']) {
    const reports = await pullAllFeeds();
    report.feedsPolled = reports.length;
    report.feedConflicts = reports.reduce((a, r) => a + r.conflicts, 0);
  }

  // 4 — refresh ready state where turnover work is open
  const busy = await prisma.property.findMany({
    where: { readyState: { not: 'READY' } },
    select: { id: true },
  });
  for (const p of busy) {
    await syncReadyState(p.id);
    report.readyStatesRefreshed++;
  }

  return report;
}

export type DailyReport = {
  arrivals: number;
  departures: number;
  unreadyAlerts: number;
  overdueCleanings: number;
  emergencyTickets: number;
  balancesDue: number;
  lowStock: number;
  documentsExpiring: number;
  noShows: number;
  completed: number;
};

/** Daily, early morning Manila. The things a person should wake up knowing. */
export async function runDailyJobs(): Promise<DailyReport> {
  const settings = await getSettings();
  const todayKey = manilaDateKey();
  const today = toStayDate(todayKey);

  const report: DailyReport = {
    arrivals: 0,
    departures: 0,
    unreadyAlerts: 0,
    overdueCleanings: 0,
    emergencyTickets: 0,
    balancesDue: 0,
    lowStock: 0,
    documentsExpiring: 0,
    noShows: 0,
    completed: 0,
  };

  // 1 — arrivals and departures
  const [arrivals, departures] = await Promise.all([
    prisma.reservation.findMany({
      where: { checkIn: today, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
      include: { property: { select: { name: true } }, guest: { select: { firstName: true, lastName: true } } },
    }),
    prisma.reservation.count({ where: { checkOut: today, status: 'CHECKED_IN' } }),
  ]);
  report.arrivals = arrivals.length;
  report.departures = departures;

  if (arrivals.length || departures) {
    await notify({
      kind: 'ARRIVALS_TODAY',
      title: `Today: ${arrivals.length} arriving, ${departures} leaving`,
      body: arrivals.map((a) => `${a.property.name} — ${a.guest.firstName}`).join(' · ') || 'No arrivals.',
      link: '/portal/calendar',
      dedupeKey: `arrivals:${todayKey}`,
      roles: ['OWNER', 'MANAGER', 'RESERVATIONS'],
    });
  }

  // 2 — units not ready with someone arriving soon. The alert that has to
  // arrive before the guest does, not after.
  for (const u of await unreadyArrivals()) {
    await notify({
      kind: 'UNIT_NOT_READY',
      severity: 'URGENT',
      title: `${u.propertyName} is not ready — guest arriving`,
      body: `${u.reference} · ${countdown(u.when)}`,
      link: `/portal/reservations/${u.reservationId}`,
      dedupeKey: `unit-not-ready:${u.reservationId}`,
      roles: ['OWNER', 'MANAGER'],
      propertyId: u.propertyId,
    });
    report.unreadyAlerts++;
  }

  // 3 — cleanings past their deadline
  for (const c of await overdueCleanings()) {
    await notify({
      kind: 'CLEANING_OVERDUE',
      severity: 'HIGH',
      title: `Cleaning overdue — ${c.property.name}`,
      body: `${c.assignee?.name ?? 'Unassigned'} · due ${c.nextCheckInAt ? countdown(c.nextCheckInAt) : 'today'}`,
      link: `/portal/tasks/${c.taskId}`,
      dedupeKey: `cleaning-overdue:${c.id}`,
      roles: ['OWNER', 'MANAGER'],
      propertyId: c.propertyId,
    });
    report.overdueCleanings++;
  }

  // 4 — emergency maintenance still open
  const emergencies = await prisma.maintenanceTicket.findMany({
    where: { priority: 'URGENT', status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    include: { property: { select: { id: true, name: true } } },
  });
  for (const t of emergencies) {
    await notify({
      kind: 'EMERGENCY_MAINTENANCE',
      severity: 'URGENT',
      title: `Emergency still open — ${t.property.name}`,
      body: `${t.number}: ${t.description.slice(0, 120)}`,
      link: `/portal/maintenance/${t.id}`,
      dedupeKey: `emergency:${t.id}`,
      roles: ['OWNER', 'MANAGER', 'MAINTENANCE'],
      propertyId: t.propertyId,
    });
    report.emergencyTickets++;
  }

  // 5 — balances falling due
  const dueSoon = await prisma.reservation.findMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMED'] },
      balanceDueAt: { lte: new Date(Date.now() + 3 * 86_400_000) },
    },
    include: { property: { select: { id: true, name: true } }, guest: { select: { firstName: true } } },
  });
  for (const r of dueSoon) {
    const balance = r.totalCents - r.paidCents;
    if (balance <= 0) {
      await resolveNotification(`balance-due:${r.id}`);
      continue;
    }
    await notify({
      kind: 'BALANCE_DUE',
      severity: 'MEDIUM',
      title: `${formatPeso(balance)} outstanding — ${r.reference}`,
      body: `${r.guest.firstName} · ${r.property.name} · arrives ${formatStayDate(r.checkIn)}`,
      link: `/portal/reservations/${r.id}`,
      dedupeKey: `balance-due:${r.id}`,
      roles: ['OWNER', 'MANAGER', 'RESERVATIONS'],
      propertyId: r.propertyId,
    });
    report.balancesDue++;
  }

  // 6 — stock at or below minimum
  const items = await prisma.inventoryItem.findMany({
    where: { archived: false, minLevel: { gt: 0 } },
    include: { property: { select: { id: true, name: true } } },
  });
  for (const item of items) {
    if (item.stockQty <= item.minLevel) {
      await notify({
        kind: 'LOW_STOCK',
        severity: 'MEDIUM',
        title: `Low stock — ${item.name}`,
        body: `${item.property.name}: ${item.stockQty} ${item.unit} left (restock at ${item.minLevel})`,
        link: '/portal/inventory',
        dedupeKey: `low-stock:${item.id}`,
        roles: ['OWNER', 'MANAGER'],
        propertyId: item.propertyId,
      });
      report.lowStock++;
    } else {
      await resolveNotification(`low-stock:${item.id}`);
    }
  }

  // 7 — documents approaching expiry: at each lead time, then weekly, then
  // every day once expired.
  const leadDays = settings['documents.reminderLeadDays'] as unknown as number[];
  const maxLead = Math.max(...leadDays);
  const minLead = Math.min(...leadDays);
  const documents = await prisma.document.findMany({
    where: { expiresAt: { not: null } },
    include: { property: { select: { id: true, name: true } } },
  });

  for (const doc of documents) {
    const left = daysUntil(doc.expiresAt!);
    if (left > maxLead) {
      await resolveNotification(`document-expiry:${doc.id}`);
      continue;
    }

    await notify({
      kind: 'DOCUMENT_EXPIRY',
      severity: left < 0 ? 'HIGH' : 'MEDIUM',
      title: left < 0 ? `EXPIRED — ${doc.name}` : `${doc.name} expires in ${left} day${left === 1 ? '' : 's'}`,
      body: [doc.agency, doc.refNumber, doc.property?.name].filter(Boolean).join(' · '),
      link: '/portal/documents',
      dedupeKey: `document-expiry:${doc.id}`,
      roles: ['OWNER', 'MANAGER'],
      propertyId: doc.propertyId,
    });
    report.documentsExpiring++;

    const hitsLead = leadDays.includes(left);
    const weekly = left < minLead && left >= 0 && left % 7 === 0;
    const remindedToday = doc.lastRemindedAt && daysUntil(doc.lastRemindedAt) === 0;
    if ((hitsLead || weekly || left < 0) && !remindedToday) {
      const owners = await prisma.user.findMany({
        where: { role: 'OWNER', active: true },
        select: { email: true },
      });
      for (const o of owners) {
        await sendEmail({
          to: o.email,
          subject:
            left < 0
              ? `[Expired] ${doc.name}`
              : `[Action needed] ${doc.name} expires in ${left} day${left === 1 ? '' : 's'}`,
          text: `${doc.name}${doc.agency ? ` (${doc.agency})` : ''}${doc.refNumber ? ` — ref ${doc.refNumber}` : ''} expires on ${formatStayDate(doc.expiresAt!)}, ${left} day(s) from now.\n\nOpen the document register: ${absoluteUrl('/portal/documents')}`,
        });
      }
      await prisma.document.update({ where: { id: doc.id }, data: { lastRemindedAt: new Date() } });
    }
  }

  // 8 — housekeeping on reservation states
  report.noShows = await sweepNoShows();
  report.completed = await completeFinishedStays();

  await audit(null, {
    module: 'jobs',
    action: 'daily',
    entityType: 'Job',
    summary: `Daily: ${report.arrivals} arrivals, ${report.unreadyAlerts} not ready, ${report.overdueCleanings} overdue cleans, ${report.balancesDue} balances, ${report.documentsExpiring} documents expiring`,
    after: report as unknown as Record<string, number>,
  });

  return report;
}
