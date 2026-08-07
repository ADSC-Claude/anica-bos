import 'server-only';
import { prisma, isOverlapError } from '../db';
import { holdForReservation, releaseReservation } from '../calendar';
import { bookingReference, secretToken } from '../codes';
import { notify, resolveNotification } from '../notifications';
import { appUrl } from '../app-url';
import { nightsBetween, toDateKey, toStayDate } from '../datetime';

/**
 * Airbnb calendar sync over iCal.
 *
 * iCal is what Airbnb offers without a partnership, and it is honest about its
 * limits: it carries dates, not money and not guest details, and it refreshes
 * on Airbnb's schedule. We treat it as a BLOCK FEED, not a booking feed.
 *
 * Written against RFC 5545 by hand rather than pulled from npm — this is a file
 * we hand to a third party, and the subset we need is eighty lines.
 */

// ---------------------------------------------------------------------------
// The seam a channel manager will slot into
// ---------------------------------------------------------------------------

export type ExternalStay = {
  uid: string;
  summary: string;
  startDate: Date;
  endDate: Date;
};

export interface ChannelSync {
  readonly id: string;
  pull(feed: { id: string; url: string; propertyId: string }): Promise<ExternalStay[]>;
  readonly capabilities: { guestDetails: boolean; realtime: boolean; pricing: boolean };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Unfolds RFC 5545 continuation lines: a leading space continues the previous. */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** "20260812" or "20260812T140000Z" → the stay date it falls on. */
function parseIcalDate(value: string): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function parseIcal(text: string): ExternalStay[] {
  const lines = unfold(text);
  const events: ExternalStay[] = [];
  let current: Partial<ExternalStay> | null = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current?.uid && current.startDate && current.endDate) {
        events.push({
          uid: current.uid,
          summary: current.summary ?? '',
          startDate: current.startDate,
          endDate: current.endDate,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1).trim();

    if (name === 'UID') current.uid = value;
    else if (name === 'SUMMARY') current.summary = value;
    else if (name === 'DTSTART') current.startDate = parseIcalDate(value) ?? undefined;
    else if (name === 'DTEND') current.endDate = parseIcalDate(value) ?? undefined;
  }

  // A zero- or negative-length event is not a stay; it is a malformed feed.
  return events.filter((e) => e.endDate.getTime() > e.startDate.getTime());
}

export const IcalSync: ChannelSync = {
  id: 'ical',
  capabilities: { guestDetails: false, realtime: false, pricing: false },
  async pull(feed) {
    const res = await fetch(feed.url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'anica-stays/1.0 (+calendar sync)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Feed responded ${res.status} ${res.statusText}`);
    return parseIcal(await res.text());
  },
};

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type SyncReport = {
  feedId: string;
  propertyName: string;
  created: number;
  updated: number;
  released: number;
  conflicts: number;
  error?: string;
};

/**
 * Polls one import feed and reconciles it.
 *
 * Reconciliation runs on `lastSeenAt`: every event this poll sees is stamped,
 * and anything left unstamped was cancelled on the other side, so its dates go
 * back on sale.
 *
 * A collision with a direct booking does NOT overwrite it. Silently dropping
 * either side is worse than telling a person, so it raises SYNC_CONFLICT naming
 * both stays and leaves the decision to a human.
 */
export async function pullFeed(feedId: string, sync: ChannelSync = IcalSync): Promise<SyncReport> {
  const feed = await prisma.icalFeed.findUniqueOrThrow({
    where: { id: feedId },
    include: { property: { select: { id: true, name: true, branchId: true } } },
  });

  const report: SyncReport = {
    feedId,
    propertyName: feed.property.name,
    created: 0,
    updated: 0,
    released: 0,
    conflicts: 0,
  };

  let stays: ExternalStay[];
  try {
    stays = await sync.pull({ id: feed.id, url: feed.url, propertyId: feed.propertyId });
  } catch (err) {
    const message = String((err as Error).message ?? err).slice(0, 300);
    const failures = feed.consecutiveFailures + 1;
    await prisma.icalFeed.update({
      where: { id: feedId },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'failed',
        lastSyncError: message,
        consecutiveFailures: failures,
      },
    });
    // One blip is weather; two is a feed that has stopped, and a sync that
    // quietly stopped a week ago is how a unit gets sold twice.
    if (failures >= 2) {
      await notify({
        kind: 'SYNC_FAILED',
        severity: 'HIGH',
        title: `Airbnb calendar not syncing — ${feed.property.name}`,
        body: `${failures} failures in a row: ${message}`,
        link: '/portal/settings/sync',
        dedupeKey: `sync-failed:${feedId}`,
        roles: ['OWNER', 'MANAGER'],
        propertyId: feed.propertyId,
      });
    }
    return { ...report, error: message };
  }

  const now = new Date();

  for (const stay of stays) {
    const existing = await prisma.icalEvent.findUnique({
      where: { feedId_uid: { feedId, uid: stay.uid } },
      include: { reservation: { select: { id: true, status: true } } },
    });

    if (existing?.reservation && existing.reservation.status !== 'CANCELLED') {
      const moved =
        existing.startDate.getTime() !== stay.startDate.getTime() ||
        existing.endDate.getTime() !== stay.endDate.getTime();

      await prisma.icalEvent.update({
        where: { id: existing.id },
        data: { startDate: stay.startDate, endDate: stay.endDate, summary: stay.summary, lastSeenAt: now, removed: false },
      });

      if (moved) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.calendarSpan.deleteMany({ where: { reservationId: existing.reservationId! } });
            await holdForReservation(tx, {
              propertyId: feed.propertyId,
              reservationId: existing.reservationId!,
              checkIn: stay.startDate,
              checkOut: stay.endDate,
            });
            await tx.reservation.update({
              where: { id: existing.reservationId! },
              data: {
                checkIn: stay.startDate,
                checkOut: stay.endDate,
                nights: nightsBetween(stay.startDate, stay.endDate),
              },
            });
          });
          report.updated++;
        } catch (err) {
          if (isOverlapError(err)) {
            report.conflicts++;
            await raiseConflict(feed.propertyId, feed.property.name, stay);
          } else throw err;
        }
      }
      continue;
    }

    // New to us. Airbnb tells us nothing about the guest, so the reservation is
    // a placeholder that holds dates and shows a source — its money arrives as
    // a payout, entered by hand.
    const guest = await placeholderGuest();

    try {
      await prisma.$transaction(async (tx) => {
        const reservation = await tx.reservation.create({
          data: {
            reference: bookingReference(),
            propertyId: feed.propertyId,
            guestId: guest.id,
            source: 'AIRBNB',
            status: 'CONFIRMED',
            checkIn: stay.startDate,
            checkOut: stay.endDate,
            nights: nightsBetween(stay.startDate, stay.endDate),
            adults: 1,
            totalCents: 0,
            paymentStatus: 'UNPAID',
            confirmedAt: now,
            externalUid: stay.uid,
            internalNotes: `Imported from ${feed.name}: ${stay.summary}`,
            reviewToken: secretToken(),
            manageToken: secretToken(),
          },
        });

        await holdForReservation(tx, {
          propertyId: feed.propertyId,
          reservationId: reservation.id,
          checkIn: stay.startDate,
          checkOut: stay.endDate,
        });

        await tx.icalEvent.upsert({
          where: { feedId_uid: { feedId, uid: stay.uid } },
          create: {
            feedId,
            uid: stay.uid,
            summary: stay.summary,
            startDate: stay.startDate,
            endDate: stay.endDate,
            reservationId: reservation.id,
            lastSeenAt: now,
          },
          update: { reservationId: reservation.id, lastSeenAt: now, removed: false },
        });
      });
      report.created++;
    } catch (err) {
      if (isOverlapError(err)) {
        report.conflicts++;
        await raiseConflict(feed.propertyId, feed.property.name, stay);
        await prisma.icalEvent.upsert({
          where: { feedId_uid: { feedId, uid: stay.uid } },
          create: {
            feedId,
            uid: stay.uid,
            summary: stay.summary,
            startDate: stay.startDate,
            endDate: stay.endDate,
            lastSeenAt: now,
          },
          update: { lastSeenAt: now },
        });
      } else throw err;
    }
  }

  // Anything the feed no longer lists was cancelled on the other side.
  const vanished = await prisma.icalEvent.findMany({
    where: { feedId, lastSeenAt: { lt: now }, removed: false },
  });
  for (const gone of vanished) {
    if (gone.reservationId) {
      await prisma.$transaction(async (tx) => {
        await releaseReservation(tx, gone.reservationId!);
        await tx.reservation.update({
          where: { id: gone.reservationId! },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancellationReason: 'Removed from the Airbnb calendar feed.',
          },
        });
      });
    }
    await prisma.icalEvent.update({ where: { id: gone.id }, data: { removed: true } });
    report.released++;
  }

  await prisma.icalFeed.update({
    where: { id: feedId },
    data: {
      lastSyncAt: now,
      lastSyncStatus: report.conflicts ? 'conflict' : 'ok',
      lastSyncError: '',
      consecutiveFailures: 0,
      eventCount: stays.length,
    },
  });
  await resolveNotification(`sync-failed:${feedId}`);

  return report;
}

async function raiseConflict(propertyId: string, propertyName: string, stay: ExternalStay) {
  await notify({
    kind: 'SYNC_CONFLICT',
    severity: 'URGENT',
    title: `Airbnb booking clashes with ours — ${propertyName}`,
    body: `${toDateKey(stay.startDate)} → ${toDateKey(stay.endDate)} is already held here. Someone has to move one of them.`,
    link: '/portal/calendar',
    dedupeKey: `sync-conflict:${propertyId}:${stay.uid}`,
    roles: ['OWNER', 'MANAGER', 'RESERVATIONS'],
    propertyId,
  });
}

/** One shared profile for OTA stays; the platform holds the real guest. */
async function placeholderGuest() {
  const existing = await prisma.guest.findFirst({ where: { code: 'G-AIRBNB' } });
  if (existing) return existing;
  return prisma.guest.create({
    data: {
      code: 'G-AIRBNB',
      firstName: 'Airbnb',
      lastName: 'guest',
      country: 'PH',
      unsubscribeToken: secretToken(),
      notes: 'Placeholder for stays imported from Airbnb, which does not share guest details over iCal.',
    },
  });
}

export async function pullAllFeeds(): Promise<SyncReport[]> {
  const feeds = await prisma.icalFeed.findMany({
    where: { direction: 'IMPORT', active: true, url: { not: '' } },
    select: { id: true },
  });
  const reports: SyncReport[] = [];
  for (const f of feeds) reports.push(await pullFeed(f.id));
  return reports;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** RFC 5545 wants CRLF and lines folded at 75 octets. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    const size = start === 0 ? 75 : 74;
    chunks.push(bytes.subarray(start, start + size).toString('utf8'));
    start += size;
  }
  return chunks.join('\r\n ');
}

function icalDate(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function icalStamp(d: Date): string {
  return `${icalDate(d)}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * The outbound feed for one property: every span that holds dates, whatever
 * holds it.
 *
 * Summaries carry NO guest names. The feed is a URL, and a URL leaks.
 */
export async function buildExportFeed(token: string): Promise<string | null> {
  const property = await prisma.property.findUnique({
    where: { icalExportToken: token },
    select: { id: true, name: true },
  });
  if (!property) return null;

  const spans = await prisma.calendarSpan.findMany({
    where: { propertyId: property.id },
    include: {
      reservation: { select: { source: true, status: true } },
      block: { select: { reason: true } },
    },
    orderBy: { checkIn: 'asc' },
  });

  const host = new URL(appUrl()).host;
  const stamp = icalStamp(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ANICA Stays//Rental PMS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escapeText(property.name)}`),
  ];

  for (const span of spans) {
    const summary =
      span.kind === 'BLOCK'
        ? `Unavailable (${span.block?.reason.toLowerCase() ?? 'blocked'})`
        : span.reservation?.source === 'AIRBNB'
          ? 'Airbnb (imported)'
          : 'Booked';

    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:${span.id}@${host}`),
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icalDate(span.checkIn)}`,
      `DTEND;VALUE=DATE:${icalDate(span.checkOut)}`,
      fold(`SUMMARY:${escapeText(summary)}`),
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
