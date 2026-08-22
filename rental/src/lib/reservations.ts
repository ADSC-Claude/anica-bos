import 'server-only';
import type { BookingSource, ReservationStatus } from '@prisma/client';
import { prisma, type Tx } from './db';
import { HttpError } from './errors';
import { audit, diff, type AuditInput } from './audit';
import { accessCode, bookingReference, secretToken } from './codes';
import { getSettings } from './settings';
import { quote, type Quote } from './pricing';
import { upsertGuest, refreshGuestStats, type GuestInput } from './guests';
import { holdForReservation, moveReservation, releaseReservation, nextArrival } from './calendar';
import { scheduleSequence, cancelScheduled } from './messaging';
import { openTurnover, cancelTasksFor, syncReadyState } from './operations';
import { notify, resolveNotificationsLike } from './notifications';
import { toStayDate, toDateKey, nightsBetween, stayInstant, addDays, type DateKey } from './datetime';
import type { SessionUser } from './auth';

/**
 * The reservation lifecycle:
 *
 *   INQUIRY → PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT → COMPLETED
 *                    ↘ CANCELLED           ↘ NO_SHOW
 *
 * PENDING, CONFIRMED, CHECKED_IN and CHECKED_OUT hold a CalendarSpan. INQUIRY
 * does not — an enquiry is not a hold, and treating it as one is how a calendar
 * fills with dates nobody paid for.
 */

export type CreateReservationInput = {
  propertyId: string;
  checkIn: DateKey;
  checkOut: DateKey;
  adults: number;
  children?: number;
  infants?: number;
  guest: GuestInput;
  addOns?: { addOnId: string; quantity: number }[];
  promoCode?: string;
  specialRequests?: string;
  internalNotes?: string;
  source?: BookingSource;
  /** Manual bookings by staff skip the payment hold and land CONFIRMED. */
  status?: Extract<ReservationStatus, 'INQUIRY' | 'PENDING' | 'CONFIRMED'>;
  createdById?: string | null;
};

export type CreatedReservation = {
  id: string;
  reference: string;
  quote: Quote;
  depositCents: number;
  totalCents: number;
};

/**
 * Creates a reservation and holds its dates in ONE transaction.
 *
 * The order matters: the span goes in last, so if the dates were taken while
 * the guest was typing, the whole thing rolls back and no orphan reservation
 * is left behind. The exclusion constraint does the deciding; we only report
 * it.
 *
 * The price is computed here, server-side, from the property and the dates.
 * Whatever number the browser was showing is not consulted.
 */
export async function createReservation(input: CreateReservationInput): Promise<CreatedReservation> {
  const settings = await getSettings();
  const status = input.status ?? 'PENDING';

  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: { id: true, status: true, name: true, securityDepositCents: true, branchId: true },
  });
  if (!property) throw new HttpError(404, 'That property no longer exists.');
  if (property.status !== 'ACTIVE' && !input.createdById) {
    throw new HttpError(400, 'That property is not accepting bookings.');
  }

  guardBookingWindow(input.checkIn, settings, Boolean(input.createdById));

  const priced = await quote({
    propertyId: input.propertyId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    children: input.children,
    addOns: input.addOns,
    promoCode: input.promoCode,
  });

  const checkIn = toStayDate(input.checkIn);
  const checkOut = toStayDate(input.checkOut);
  const depositCents = status === 'CONFIRMED' ? priced.totalCents : priced.depositCents;

  const created = await prisma.$transaction(async (tx) => {
    const guest = await upsertGuest(tx, input.guest);

    const reservation = await tx.reservation.create({
      data: {
        reference: bookingReference(),
        propertyId: input.propertyId,
        guestId: guest.id,
        source: input.source ?? 'DIRECT',
        status,
        checkIn,
        checkOut,
        nights: priced.nights,
        adults: input.adults,
        children: input.children ?? 0,
        infants: input.infants ?? 0,
        nightlyRateCents: priced.nightlyRateCents,
        accommodationCents: priced.accommodationCents,
        cleaningFeeCents: priced.cleaningFeeCents,
        extraGuestCents: priced.extraGuestCents,
        addOnsCents: priced.addOnsCents,
        discountCents: priced.discountCents,
        otherFeesCents: priced.otherFeesCents,
        totalCents: priced.totalCents,
        paymentStatus: 'UNPAID',
        depositRequiredCents: depositCents,
        balanceDueAt:
          priced.balanceCents > 0
            ? toStayDate(addDays(input.checkIn, -settings['booking.balanceDueDays']))
            : null,
        promotionId: priced.promotion?.id ?? null,
        promoCode: priced.promotion?.code ?? '',
        specialRequests: input.specialRequests ?? '',
        internalNotes: input.internalNotes ?? '',
        holdExpiresAt:
          status === 'PENDING'
            ? new Date(Date.now() + settings['booking.holdMinutes'] * 60_000)
            : null,
        confirmedAt: status === 'CONFIRMED' ? new Date() : null,
        reviewToken: secretToken(),
        manageToken: secretToken(),
        createdById: input.createdById ?? null,
      },
    });

    await tx.reservationLine.createMany({
      data: priced.lines.map((l, i) => ({
        reservationId: reservation.id,
        kind: l.kind,
        label: l.label,
        quantity: l.quantity,
        unitCents: l.unitCents,
        amountCents: l.amountCents,
        sortOrder: i,
      })),
    });

    for (const a of input.addOns ?? []) {
      if (a.quantity <= 0) continue;
      const addOn = await tx.addOn.findUnique({ where: { id: a.addOnId } });
      if (!addOn) continue;
      const line = priced.lines.find((l) => l.kind === 'ADDON' && l.label.startsWith(addOn.name));
      await tx.reservationAddOn.create({
        data: {
          reservationId: reservation.id,
          addOnId: addOn.id,
          name: addOn.name,
          quantity: line?.quantity ?? a.quantity,
          unitCents: addOn.priceCents,
          amountCents: line?.amountCents ?? addOn.priceCents * a.quantity,
        },
      });
    }

    if (priced.promotion && priced.discountCents > 0) {
      await tx.promotionRedemption.create({
        data: {
          promotionId: priced.promotion.id,
          reservationId: reservation.id,
          amountCents: priced.discountCents,
        },
      });
      await tx.promotion.update({
        where: { id: priced.promotion.id },
        data: { redemptions: { increment: 1 } },
      });
    }

    if (property.securityDepositCents > 0) {
      await tx.securityDeposit.create({
        data: { reservationId: reservation.id, amountCents: property.securityDepositCents },
      });
    }

    // Last, so a collision rolls everything above back.
    if (status !== 'INQUIRY') {
      await holdForReservation(tx, {
        propertyId: input.propertyId,
        reservationId: reservation.id,
        checkIn,
        checkOut,
      });
    }

    if (status === 'CONFIRMED') {
      await scheduleSequence(tx, reservation.id);
    }

    return reservation;
  });

  await refreshGuestStats(created.guestId);

  await notify({
    kind: 'NEW_BOOKING',
    title: `New booking — ${property.name}`,
    body: `${created.reference} · ${priced.nights} night${priced.nights === 1 ? '' : 's'} from ${input.checkIn}`,
    link: `/portal/reservations/${created.id}`,
    dedupeKey: `new-booking:${created.id}`,
    roles: ['OWNER', 'MANAGER', 'RESERVATIONS'],
    propertyId: property.id,
    branchId: property.branchId,
  });

  return {
    id: created.id,
    reference: created.reference,
    quote: priced,
    depositCents,
    totalCents: priced.totalCents,
  };
}

function guardBookingWindow(
  checkIn: DateKey,
  settings: { 'booking.minLeadHours': number; 'booking.maxAdvanceDays': number },
  isStaff: boolean,
) {
  if (isStaff) return; // staff take walk-ins and same-day calls
  const arrival = toStayDate(checkIn).getTime();
  const now = Date.now();
  if (arrival + 86_400_000 < now) throw new HttpError(400, 'That date has already passed.');
  const maxAhead = now + settings['booking.maxAdvanceDays'] * 86_400_000;
  if (arrival > maxAhead) {
    throw new HttpError(
      400,
      `We take bookings up to ${settings['booking.maxAdvanceDays']} days ahead. Please get in touch for anything further out.`,
    );
  }
}

/**
 * Promotes a paid reservation. Called from the payment webhook and from a
 * staff member recording a cash payment.
 *
 * Idempotent: a retried webhook must not schedule the message sequence twice.
 */
export async function confirmReservation(tx: Tx, reservationId: string): Promise<boolean> {
  const r = await tx.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { property: { select: { securityDepositCents: true } } },
  });
  if (r.status !== 'PENDING' && r.status !== 'INQUIRY') return false;

  await tx.reservation.update({
    where: { id: reservationId },
    data: { status: 'CONFIRMED', confirmedAt: new Date(), holdExpiresAt: null },
  });

  if (r.property.securityDepositCents > 0) {
    await tx.securityDeposit.updateMany({
      where: { reservationId, status: 'PENDING' },
      data: { status: 'HELD', heldAt: new Date() },
    });
  }

  await scheduleSequence(tx, reservationId);

  await tx.task.create({
    data: {
      propertyId: r.propertyId,
      kind: 'ARRIVAL_PREP',
      title: `Prepare for arrival — ${r.reference}`,
      reservationId,
      dueAt: r.checkIn,
      priority: 'MEDIUM',
    },
  });

  return true;
}

/** Recomputes paidCents and paymentStatus from the payment rows. */
export async function recomputePayment(tx: Tx, reservationId: string): Promise<void> {
  const r = await tx.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: { totalCents: true },
  });
  const payments = await tx.payment.findMany({
    where: { reservationId, status: { in: ['PAID', 'REFUNDED'] }, kind: { not: 'SECURITY_DEPOSIT' } },
    select: { amountCents: true, kind: true },
  });

  const paidCents = payments.reduce((a, p) => a + p.amountCents, 0);
  const refunded = payments.filter((p) => p.kind === 'REFUND').reduce((a, p) => a + p.amountCents, 0);

  const status =
    refunded < 0 && paidCents <= 0
      ? 'REFUNDED'
      : refunded < 0
        ? 'PARTIALLY_REFUNDED'
        : paidCents <= 0
          ? 'UNPAID'
          : paidCents >= r.totalCents
            ? 'PAID'
            : 'PARTIALLY_PAID';

  await tx.reservation.update({
    where: { id: reservationId },
    data: { paidCents, paymentStatus: status },
  });
}

export type CancelInput = {
  reservationId: string;
  reason: string;
  user?: SessionUser | null;
  status?: Extract<ReservationStatus, 'CANCELLED' | 'NO_SHOW'>;
};

/**
 * Cancels a reservation and releases its dates in one transaction — the moment
 * the dates go back on sale is the moment the status changes, not a job later.
 */
export async function cancelReservation(input: CancelInput): Promise<void> {
  const before = await prisma.reservation.findUniqueOrThrow({
    where: { id: input.reservationId },
    include: { property: { select: { name: true, branchId: true } } },
  });
  if (before.status === 'CANCELLED' || before.status === 'NO_SHOW') return;

  const status = input.status ?? 'CANCELLED';

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: input.reservationId },
      data: {
        status,
        cancelledAt: status === 'CANCELLED' ? new Date() : undefined,
        noShowAt: status === 'NO_SHOW' ? new Date() : undefined,
        cancellationReason: input.reason,
        holdExpiresAt: null,
      },
    });
    await releaseReservation(tx, input.reservationId);
    await cancelScheduled(tx, input.reservationId);
    await cancelTasksFor(tx, input.reservationId);
  });

  await resolveNotificationsLike(`balance-due:${input.reservationId}`);
  await refreshGuestStats(before.guestId);

  await audit(input.user ?? null, {
    module: 'reservations',
    action: status === 'NO_SHOW' ? 'no_show' : 'cancel',
    entityType: 'Reservation',
    entityId: input.reservationId,
    summary: `${before.reference} — ${status.toLowerCase().replace('_', ' ')}: ${input.reason}`,
    sensitive: true,
    propertyId: before.propertyId,
    ...diff(
      { status: before.status, cancellationReason: before.cancellationReason },
      { status, cancellationReason: input.reason },
    ),
  });
}

/** Changing dates, property or guest count. Re-prices and re-schedules. */
export async function updateReservationDates(args: {
  reservationId: string;
  propertyId?: string;
  checkIn: DateKey;
  checkOut: DateKey;
  user?: SessionUser | null;
}): Promise<void> {
  const before = await prisma.reservation.findUniqueOrThrow({ where: { id: args.reservationId } });
  const propertyId = args.propertyId ?? before.propertyId;
  const checkIn = toStayDate(args.checkIn);
  const checkOut = toStayDate(args.checkOut);
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new HttpError(400, 'Check-out must be after check-in.');

  const priced = await quote({
    propertyId,
    checkIn: args.checkIn,
    checkOut: args.checkOut,
    adults: before.adults,
    children: before.children,
    promoCode: before.promoCode || undefined,
  });

  await prisma.$transaction(async (tx) => {
    // Delete-then-insert inside the transaction: a collision rolls back and the
    // reservation keeps the dates it had. There is no window where it holds
    // neither.
    await moveReservation(tx, { reservationId: args.reservationId, propertyId, checkIn, checkOut });

    await tx.reservation.update({
      where: { id: args.reservationId },
      data: {
        propertyId,
        checkIn,
        checkOut,
        nights,
        nightlyRateCents: priced.nightlyRateCents,
        accommodationCents: priced.accommodationCents,
        cleaningFeeCents: priced.cleaningFeeCents,
        extraGuestCents: priced.extraGuestCents,
        discountCents: priced.discountCents,
        totalCents: priced.totalCents,
      },
    });

    await tx.reservationLine.deleteMany({ where: { reservationId: args.reservationId } });
    await tx.reservationLine.createMany({
      data: priced.lines.map((l, i) => ({
        reservationId: args.reservationId,
        kind: l.kind,
        label: l.label,
        quantity: l.quantity,
        unitCents: l.unitCents,
        amountCents: l.amountCents,
        sortOrder: i,
      })),
    });

    await recomputePayment(tx, args.reservationId);
    if (before.status === 'CONFIRMED') await scheduleSequence(tx, args.reservationId);
  });

  await audit(args.user ?? null, {
    module: 'reservations',
    action: 'reschedule',
    entityType: 'Reservation',
    entityId: args.reservationId,
    summary: `${before.reference} moved to ${args.checkIn} → ${args.checkOut}`,
    sensitive: true,
    propertyId,
    ...diff(
      { checkIn: toDateKey(before.checkIn), checkOut: toDateKey(before.checkOut), totalCents: before.totalCents },
      { checkIn: args.checkIn, checkOut: args.checkOut, totalCents: priced.totalCents },
    ),
  });
}

/** Arrival. Releases access details and stops the pre-arrival messages. */
export async function checkIn(reservationId: string, user?: SessionUser | null): Promise<void> {
  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { property: { select: { accessNotes: true } } },
  });
  if (r.status !== 'CONFIRMED') {
    throw new HttpError(400, `A ${r.status.toLowerCase()} booking cannot be checked in.`);
  }

  const existingAccess = await prisma.accessRecord.count({ where: { reservationId } });

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    });
    await cancelScheduled(tx, reservationId, [
      'post_checkin',
      'checkout_reminder',
      'post_checkout',
      'review_request',
    ]);
    await tx.task.updateMany({
      where: { reservationId, kind: 'ARRIVAL_PREP', status: { in: ['OPEN', 'IN_PROGRESS'] } },
      data: { status: 'DONE', completedAt: new Date() },
    });

    // Access is issued here rather than by whichever screen called us. A code
    // minted only when a particular button is pressed is a code that does not
    // exist when check-in happens any other way — and the guest's own page
    // reads this table, so the door would simply stay shut for them.
    //
    // It is issued AT check-in and not before: a code sitting in an inbox for
    // three days is a door standing open for three days.
    if (existingAccess === 0) {
      const code = accessCode();
      await tx.accessRecord.create({
        data: {
          reservationId,
          propertyId: r.propertyId,
          method: 'KEYPAD_CODE',
          code,
          instructions: r.property.accessNotes || `Keypad code ${code}, then turn the handle.`,
          activatesAt: new Date(),
          expiresAt: r.checkOut,
          issuedById: user?.id ?? null,
        },
      });
    }
  });

  await audit(user ?? null, {
    module: 'reservations',
    action: 'check_in',
    entityType: 'Reservation',
    entityId: reservationId,
    summary: `${r.reference} checked in`,
    propertyId: r.propertyId,
  });
}

/**
 * Departure — the trigger for the whole turnover chain.
 *
 * Everything downstream of this (cleaning task, deadline, inspection, ready
 * state) happens here, in one transaction, rather than being noticed by a job
 * later. A unit that has just been vacated must appear on someone's phone
 * immediately.
 */
export async function checkOut(reservationId: string, user?: SessionUser | null): Promise<void> {
  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { property: { select: { id: true, name: true, checkOutMinute: true, branchId: true } } },
  });
  if (r.status !== 'CHECKED_IN') {
    throw new HttpError(400, `A ${r.status.toLowerCase()} booking cannot be checked out.`);
  }

  const checkoutAt = stayInstant(r.checkOut, r.property.checkOutMinute);
  const arrival = await nextArrival(r.propertyId, r.checkOut);

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'CHECKED_OUT', checkedOutAt: new Date() },
    });
    await tx.accessRecord.updateMany({
      where: { reservationId, returned: false },
      data: { expiresAt: new Date() },
    });
    await openTurnover(tx, {
      propertyId: r.propertyId,
      reservationId,
      checkoutAt,
      nextCheckInAt: arrival?.checkIn ?? null,
    });
  });

  await syncReadyState(r.propertyId);

  await audit(user ?? null, {
    module: 'reservations',
    action: 'check_out',
    entityType: 'Reservation',
    entityId: reservationId,
    summary: `${r.reference} checked out — turnover opened`,
    propertyId: r.propertyId,
  });
}

/**
 * Cancels PENDING reservations whose payment never arrived. Run by the
 * 15-minute cron; the dates go back on sale the moment it fires.
 */
export async function expireHolds(now: Date = new Date()): Promise<number> {
  const stale = await prisma.reservation.findMany({
    where: { status: 'PENDING', holdExpiresAt: { lt: now } },
    select: { id: true, reference: true },
  });

  for (const r of stale) {
    await cancelReservation({
      reservationId: r.id,
      reason: 'Payment not received before the hold expired.',
      user: null,
    });
  }
  return stale.length;
}

/** Marks settled, reviewed stays COMPLETED. Nightly, idempotent. */
export async function completeFinishedStays(): Promise<number> {
  const candidates = await prisma.reservation.findMany({
    where: { status: 'CHECKED_OUT' },
    select: { id: true, totalCents: true, paidCents: true },
  });

  let count = 0;
  for (const r of candidates) {
    if (r.paidCents < r.totalCents) continue; // still owes money
    await prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    count++;
  }
  return count;
}

/** CONFIRMED, arrival date passed, never checked in. */
export async function sweepNoShows(now: Date = new Date()): Promise<number> {
  const yesterday = toStayDate(toDateKey(new Date(now.getTime() - 86_400_000)));
  const missed = await prisma.reservation.findMany({
    where: { status: 'CONFIRMED', checkIn: { lte: yesterday } },
    select: { id: true },
  });
  for (const r of missed) {
    await cancelReservation({
      reservationId: r.id,
      reason: 'Guest did not arrive.',
      status: 'NO_SHOW',
      user: null,
    });
  }
  return missed.length;
}

export const RESERVATION_AUDIT: Pick<AuditInput, 'module' | 'entityType'> = {
  module: 'reservations',
  entityType: 'Reservation',
};
