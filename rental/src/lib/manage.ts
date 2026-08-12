import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from './db';
import { HttpError } from './errors';
import { normalizeEmail } from './guests';

/**
 * Guest self-service access.
 *
 * A booking reference is `STAY-` plus six characters — short enough to read
 * aloud, which is exactly what makes it unfit to be the only thing standing
 * between a stranger and someone's door code. So opening a stay needs one of:
 *
 *   • the `manageToken` from the emailed link — 24 random bytes, hopeless to
 *     guess, and the reason the link works in one tap;
 *   • the email address on the booking, typed in.
 *
 * Nothing here trusts the reference alone.
 */

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type ManageAccess =
  | { ok: true; reservationId: string }
  | { ok: false; reason: 'unknown' | 'challenge' };

export async function openStay(args: {
  reference: string;
  token?: string | null;
  email?: string | null;
}): Promise<ManageAccess> {
  const reservation = await prisma.reservation.findUnique({
    where: { reference: args.reference.toUpperCase() },
    select: { id: true, manageToken: true, guest: { select: { email: true } } },
  });
  if (!reservation) return { ok: false, reason: 'unknown' };

  if (args.token && reservation.manageToken && constantTimeEqual(args.token, reservation.manageToken)) {
    return { ok: true, reservationId: reservation.id };
  }

  if (args.email) {
    const typed = normalizeEmail(args.email);
    const onFile = normalizeEmail(reservation.guest.email);
    if (typed && onFile && constantTimeEqual(typed, onFile)) {
      return { ok: true, reservationId: reservation.id };
    }
  }

  return { ok: false, reason: 'challenge' };
}

/** The whole stay, as the guest is allowed to see it. */
export async function stayForGuest(reservationId: string) {
  return prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: {
      guest: true,
      property: true,
      lines: { orderBy: { sortOrder: 'asc' } },
      addOns: { include: { addOn: { select: { name: true } } } },
      // Access details are only ever issued at check-in, so reading them here
      // cannot leak a code before the day.
      accessRecords: { orderBy: { issuedAt: 'desc' }, take: 1 },
      checkInForm: { include: { companions: true } },
      securityDeposit: true,
    },
  });
}

export async function submitPreArrival(args: {
  reservationId: string;
  fullName: string;
  mobile: string;
  arrivalMinute: number | null;
  companions: { name: string; isMinor: boolean }[];
  rulesAccepted: boolean;
  signatureName: string;
  notes: string;
}): Promise<void> {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id: args.reservationId },
    select: { status: true, adults: true, children: true },
  });
  if (reservation.status === 'CANCELLED' || reservation.status === 'NO_SHOW') {
    throw new HttpError(409, 'This booking is no longer active.');
  }
  if (!args.rulesAccepted) {
    throw new HttpError(400, 'Please tick the box to accept the house rules.');
  }
  if (!args.fullName.trim()) {
    throw new HttpError(400, 'Please give the name of the guest checking in.');
  }

  const companions = args.companions.filter((c) => c.name.trim());
  const booked = reservation.adults + reservation.children;
  // The party on the form is the lead guest plus companions. More than was
  // booked is not refused here — it is recorded, and the extra-guest fee is
  // settled by a person who can see the property's limit.
  const declared = companions.length + 1;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.checkInSubmission.findUnique({
      where: { reservationId: args.reservationId },
      select: { id: true },
    });
    if (existing) await tx.companion.deleteMany({ where: { checkInId: existing.id } });

    const submission = await tx.checkInSubmission.upsert({
      where: { reservationId: args.reservationId },
      create: {
        reservationId: args.reservationId,
        fullName: args.fullName.trim(),
        mobile: args.mobile.trim(),
        arrivalMinute: args.arrivalMinute,
        companionCount: companions.length,
        rulesAcceptedAt: new Date(),
        signatureName: args.signatureName.trim(),
        notes: args.notes.trim(),
      },
      update: {
        fullName: args.fullName.trim(),
        mobile: args.mobile.trim(),
        arrivalMinute: args.arrivalMinute,
        companionCount: companions.length,
        rulesAcceptedAt: new Date(),
        signatureName: args.signatureName.trim(),
        notes: args.notes.trim(),
        submittedAt: new Date(),
      },
    });

    if (companions.length) {
      await tx.companion.createMany({
        data: companions.map((c) => ({
          checkInId: submission.id,
          name: c.name.trim(),
          isMinor: c.isMinor,
        })),
      });
    }

    if (declared !== booked) {
      await tx.reservation.update({
        where: { id: args.reservationId },
        data: {
          internalNotes: `Pre-arrival form declares ${declared} guest${declared === 1 ? '' : 's'}; ${booked} booked.`,
        },
      });
    }
  });
}
