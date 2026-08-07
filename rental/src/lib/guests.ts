import 'server-only';
import type { GuestTier } from '@prisma/client';
import { prisma, type Tx } from './db';
import { guestCode, secretToken } from './codes';
import { getSettings } from './settings';

/**
 * Guest CRM. Two things matter here and both are easy to get wrong:
 *
 *   1. The same person must not become three profiles because they typed their
 *      mobile differently. Dedupe happens at booking, before a row is created.
 *   2. Tier and totals must be derived from stays, never incremented by hand.
 *      A counter that drifts is worse than no counter.
 */

/** "+63 917 000 0000", "0917 000 0000" and "639170000000" are one person. */
export function normalizeMobile(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('63') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `+63${digits}`;
  return `+${digits}`;
}

export function normalizeEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

export type GuestInput = {
  firstName: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  country?: string;
  address?: string;
  marketingConsent?: boolean;
};

/**
 * Finds the guest this booking belongs to, or creates them.
 *
 * Email first, then mobile: an email address is the more reliable identity, and
 * matching on a mobile alone would merge two guests sharing one household
 * number. Merged-away profiles are skipped so a booking never attaches to a
 * row that no longer represents anyone.
 */
export async function upsertGuest(tx: Tx, input: GuestInput): Promise<{ id: string; tier: GuestTier }> {
  const email = normalizeEmail(input.email ?? '');
  const mobile = normalizeMobile(input.mobile ?? '');

  const existing = email
    ? await tx.guest.findFirst({ where: { email, mergedIntoId: null } })
    : mobile
      ? await tx.guest.findFirst({ where: { mobile, mergedIntoId: null } })
      : null;

  if (existing) {
    const updated = await tx.guest.update({
      where: { id: existing.id },
      data: {
        // Fill blanks, never overwrite what is already known: a guest who omits
        // a surname on a second booking should not lose the one we have.
        firstName: existing.firstName || input.firstName,
        lastName: existing.lastName || (input.lastName ?? ''),
        email: existing.email || email,
        mobile: existing.mobile || mobile,
        country: input.country || existing.country,
        address: input.address || existing.address,
        ...(input.marketingConsent && !existing.marketingConsent
          ? { marketingConsent: true, consentAt: new Date() }
          : {}),
      },
      select: { id: true, tier: true },
    });
    return updated;
  }

  const created = await tx.guest.create({
    data: {
      code: guestCode(),
      firstName: input.firstName.trim(),
      lastName: (input.lastName ?? '').trim(),
      email,
      mobile,
      country: input.country || 'PH',
      address: input.address ?? '',
      marketingConsent: Boolean(input.marketingConsent),
      consentAt: input.marketingConsent ? new Date() : null,
      unsubscribeToken: secretToken(),
    },
    select: { id: true, tier: true },
  });
  return created;
}

/**
 * Recomputes a guest's totals and tier from their stays.
 *
 * Counted stays are the ones that happened: CHECKED_IN onwards. A confirmed
 * future booking is not a stay, and counting it would make a guest VIP for a
 * holiday they have not taken yet.
 */
export async function refreshGuestStats(guestId: string): Promise<void> {
  const settings = await getSettings();

  const stays = await prisma.reservation.findMany({
    where: { guestId, status: { in: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] } },
    select: { nights: true, totalCents: true, checkIn: true, checkOut: true },
    orderBy: { checkIn: 'asc' },
  });

  const totalBookings = stays.length;
  const totalNights = stays.reduce((a, s) => a + s.nights, 0);
  const totalSpentCents = stays.reduce((a, s) => a + s.totalCents, 0);
  const lastStayAt = stays.length ? stays[stays.length - 1].checkOut : null;

  // Average gap between arrivals, so "lapsed" means late for *this* guest
  // rather than late by a single portfolio-wide number.
  let avgGapDays = 0;
  if (stays.length > 1) {
    const gaps: number[] = [];
    for (let i = 1; i < stays.length; i++) {
      gaps.push(
        Math.round((stays[i].checkIn.getTime() - stays[i - 1].checkIn.getTime()) / 86_400_000),
      );
    }
    avgGapDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const tier: GuestTier =
    totalBookings >= settings['guest.vipAfterStays'] ||
    totalSpentCents >= settings['guest.vipAfterSpendCents']
      ? 'VIP'
      : totalBookings >= settings['guest.repeatAfterStays']
        ? 'REPEAT'
        : 'NEW';

  await prisma.guest.update({
    where: { id: guestId },
    data: { totalBookings, totalNights, totalSpentCents, lastStayAt, avgGapDays, tier },
  });
}

export function guestName(g: { firstName: string; lastName: string }): string {
  return `${g.firstName} ${g.lastName}`.trim();
}

/**
 * Candidate duplicates: same email, or same mobile, on separate live profiles.
 * Deliberately conservative — a merge tool that guesses is a merge tool that
 * fuses two different people.
 */
export async function findDuplicates(): Promise<
  { key: string; reason: 'email' | 'mobile'; guests: { id: string; name: string; email: string; mobile: string; totalBookings: number }[] }[]
> {
  const guests = await prisma.guest.findMany({
    where: { mergedIntoId: null },
    select: { id: true, firstName: true, lastName: true, email: true, mobile: true, totalBookings: true },
  });

  const byEmail = new Map<string, typeof guests>();
  const byMobile = new Map<string, typeof guests>();
  for (const g of guests) {
    if (g.email) byEmail.set(g.email, [...(byEmail.get(g.email) ?? []), g]);
    if (g.mobile) byMobile.set(g.mobile, [...(byMobile.get(g.mobile) ?? []), g]);
  }

  const out: Awaited<ReturnType<typeof findDuplicates>> = [];
  const seen = new Set<string>();
  for (const [key, group] of [...byEmail, ...byMobile]) {
    if (group.length < 2) continue;
    const id = group.map((g) => g.id).sort().join('|');
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      key,
      reason: byEmail.get(key)?.length === group.length ? 'email' : 'mobile',
      guests: group.map((g) => ({
        id: g.id,
        name: guestName(g),
        email: g.email,
        mobile: g.mobile,
        totalBookings: g.totalBookings,
      })),
    });
  }
  return out;
}

/**
 * Merges `loserId` into `winnerId`: reservations, notes, reviews and incidents
 * move across, and the loser is kept with `mergedIntoId` set rather than
 * deleted, so an audit entry pointing at it still resolves.
 */
export async function mergeGuests(winnerId: string, loserId: string): Promise<void> {
  if (winnerId === loserId) return;

  await prisma.$transaction(async (tx) => {
    const [winner, loser] = await Promise.all([
      tx.guest.findUniqueOrThrow({ where: { id: winnerId } }),
      tx.guest.findUniqueOrThrow({ where: { id: loserId } }),
    ]);

    await tx.reservation.updateMany({ where: { guestId: loserId }, data: { guestId: winnerId } });
    await tx.guestNote.updateMany({ where: { guestId: loserId }, data: { guestId: winnerId } });
    await tx.review.updateMany({ where: { guestId: loserId }, data: { guestId: winnerId } });
    await tx.incident.updateMany({ where: { guestId: loserId }, data: { guestId: winnerId } });

    await tx.guest.update({
      where: { id: winnerId },
      data: {
        email: winner.email || loser.email,
        mobile: winner.mobile || loser.mobile,
        lastName: winner.lastName || loser.lastName,
        address: winner.address || loser.address,
        birthday: winner.birthday ?? loser.birthday,
        // Consent is a yes from a person, so it survives the merge; the
        // earlier timestamp is the honest one.
        marketingConsent: winner.marketingConsent || loser.marketingConsent,
        consentAt: winner.consentAt ?? loser.consentAt,
        notes: [winner.notes, loser.notes].filter(Boolean).join('\n'),
      },
    });

    await tx.guest.update({
      where: { id: loserId },
      data: { mergedIntoId: winnerId, marketingConsent: false },
    });
  });

  await refreshGuestStats(winnerId);
}
