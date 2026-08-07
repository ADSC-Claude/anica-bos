import 'server-only';
import type { PaymentKind, PaymentMethod } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';
import { audit } from './audit';
import { paymentReference } from './codes';
import { absoluteUrl } from './app-url';
import { formatPeso } from './money';
import {
  createCheckoutSession,
  createRefund,
  resolvePaymentId,
  isSimulated,
  MIN_CHARGE_CENTS,
  MIN_REFUND_CENTS,
} from './paymongo';
import { confirmReservation, recomputePayment } from './reservations';
import { notify, resolveNotification } from './notifications';
import type { SessionUser } from './auth';

/**
 * Money in.
 *
 * One rule governs this whole module: **the webhook is the only thing that
 * marks a payment paid.** The browser returning from the gateway renders a
 * "confirming your payment" state; it never writes status. A client that can
 * set `PAID` is a client that can book for free.
 */

export type CheckoutStart = {
  paymentId: string;
  reference: string;
  amountCents: number;
  checkoutUrl: string;
  simulated: boolean;
};

/**
 * Opens a gateway session for whatever is currently owed.
 *
 * `kind` is derived rather than passed: the first payment on a stay with a
 * deposit policy is a DOWNPAYMENT, a later one is a BALANCE, and paying the
 * whole thing at once is FULL. Letting a caller assert this is how a balance
 * payment ends up labelled as a deposit in the books.
 */
export async function startCheckout(reservationId: string): Promise<CheckoutStart> {
  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: {
      property: { select: { name: true } },
      guest: { select: { firstName: true, lastName: true, email: true, mobile: true } },
    },
  });

  if (r.status === 'CANCELLED' || r.status === 'NO_SHOW') {
    throw new HttpError(400, 'That booking has been cancelled.');
  }

  const outstanding = r.totalCents - r.paidCents;
  if (outstanding <= 0) throw new HttpError(400, 'This booking is already paid in full.');

  // First payment takes the deposit; after that, whatever is left.
  const due = r.paidCents === 0 ? Math.min(r.depositRequiredCents || outstanding, outstanding) : outstanding;

  if (due < MIN_CHARGE_CENTS) {
    throw new HttpError(
      400,
      `The smallest online payment is ${formatPeso(MIN_CHARGE_CENTS)}. Please settle ${formatPeso(due)} on arrival.`,
    );
  }

  const kind: PaymentKind = r.paidCents === 0 ? (due >= outstanding ? 'FULL' : 'DOWNPAYMENT') : 'BALANCE';
  const reference = paymentReference();

  const session = await createCheckoutSession({
    amountCents: due,
    description: `${r.property.name} · ${r.reference}`,
    reference,
    lineName: kind === 'BALANCE' ? `Balance — ${r.reference}` : `Booking ${r.reference}`,
    successUrl: absoluteUrl(`/book/confirmation/${r.reference}`),
    cancelUrl: absoluteUrl(`/book/pay/${r.reference}?cancelled=1`),
    customer: {
      name: `${r.guest.firstName} ${r.guest.lastName}`.trim(),
      email: r.guest.email || undefined,
      phone: r.guest.mobile || undefined,
    },
  });

  const payment = await prisma.payment.create({
    data: {
      reference,
      reservationId,
      kind,
      method: 'PAYMONGO',
      amountCents: due,
      status: 'PENDING',
      gatewaySessionId: session.id,
      gatewayId: session.id,
      checkoutUrl: session.checkoutUrl,
    },
  });

  return {
    paymentId: payment.id,
    reference,
    amountCents: due,
    checkoutUrl: session.checkoutUrl,
    simulated: session.simulated,
  };
}

/**
 * Applies a confirmed gateway payment. Called only from the webhook handler
 * (and from the simulated checkout, which posts through the same path).
 *
 * Idempotent on two keys: the gateway's event id, and the payment already being
 * PAID. Webhooks retry, and a retry must not create a second payment row or
 * confirm a reservation twice.
 */
export async function applyGatewayPayment(args: {
  reference: string;
  gatewayEventId: string;
  gatewayPaymentId?: string;
  amountCents?: number;
}): Promise<{ applied: boolean; reservationId?: string }> {
  const existingEvent = await prisma.payment.findFirst({
    where: { gatewayEventId: args.gatewayEventId },
    select: { id: true, reservationId: true },
  });
  if (existingEvent) return { applied: false, reservationId: existingEvent.reservationId };

  const payment = await prisma.payment.findUnique({ where: { reference: args.reference } });
  if (!payment) return { applied: false };
  if (payment.status === 'PAID') return { applied: false, reservationId: payment.reservationId };

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        gatewayEventId: args.gatewayEventId,
        gatewayId: args.gatewayPaymentId || payment.gatewayId,
        // Trust the gateway's amount over ours when they differ — it is the
        // amount that actually moved.
        amountCents: args.amountCents ?? payment.amountCents,
      },
    });
    await recomputePayment(tx, payment.reservationId);
    await confirmReservation(tx, payment.reservationId);
  });

  await resolveNotification(`payment-failed:${payment.reservationId}`);
  await resolveNotification(`balance-due:${payment.reservationId}`);

  await audit(null, {
    module: 'payments',
    action: 'gateway_paid',
    entityType: 'Payment',
    entityId: payment.id,
    summary: `${formatPeso(args.amountCents ?? payment.amountCents)} received for ${payment.reference}`,
    sensitive: true,
  });

  return { applied: true, reservationId: payment.reservationId };
}

export async function markGatewayFailure(reference: string, detail: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { reservation: { select: { id: true, reference: true, propertyId: true } } },
  });
  if (!payment || payment.status === 'PAID') return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'FAILED', failedAt: new Date(), notes: detail.slice(0, 500) },
  });

  await notify({
    kind: 'PAYMENT_FAILED',
    severity: 'HIGH',
    title: `Payment failed — ${payment.reservation.reference}`,
    body: detail.slice(0, 200),
    link: `/portal/reservations/${payment.reservationId}`,
    dedupeKey: `payment-failed:${payment.reservationId}`,
    roles: ['OWNER', 'MANAGER', 'RESERVATIONS'],
    propertyId: payment.reservation.propertyId,
  });
}

/**
 * Cash, bank transfer, or an Airbnb payout landing in the account. Recorded by
 * staff, confirmed immediately — there is no gateway to wait for.
 */
export async function recordManualPayment(args: {
  reservationId: string;
  amountCents: number;
  method: PaymentMethod;
  kind?: PaymentKind;
  notes?: string;
  user: SessionUser;
}): Promise<void> {
  if (args.amountCents <= 0) throw new HttpError(400, 'A payment must be more than zero.');

  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: args.reservationId },
    select: { totalCents: true, paidCents: true, reference: true, propertyId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        reference: paymentReference(),
        reservationId: args.reservationId,
        kind: args.kind ?? (r.paidCents === 0 ? 'FULL' : 'BALANCE'),
        method: args.method,
        amountCents: args.amountCents,
        status: 'PAID',
        paidAt: new Date(),
        notes: args.notes ?? '',
        createdById: args.user.id,
      },
    });
    await recomputePayment(tx, args.reservationId);
    await confirmReservation(tx, args.reservationId);
  });

  await resolveNotification(`balance-due:${args.reservationId}`);

  await audit(args.user, {
    module: 'payments',
    action: 'manual_payment',
    entityType: 'Reservation',
    entityId: args.reservationId,
    summary: `${formatPeso(args.amountCents)} recorded (${args.method}) on ${r.reference}`,
    sensitive: true,
    propertyId: r.propertyId,
    after: { amountCents: args.amountCents, method: args.method },
  });
}

/**
 * Sends money back.
 *
 * Recorded as a negative Payment either way — one timeline per reservation,
 * and `paidCents` needs no special case. When a gateway payment exists the
 * refund is issued through PayMongo; when the payment id cannot be resolved the
 * refund is still recorded and flagged for manual settlement, because losing
 * the record is worse than doing the transfer by hand.
 */
export async function refund(args: {
  reservationId: string;
  amountCents: number;
  reason: string;
  user: SessionUser;
}): Promise<{ gateway: boolean; manual: boolean }> {
  if (args.amountCents <= 0) throw new HttpError(400, 'A refund must be more than zero.');

  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: args.reservationId },
    include: { payments: { where: { status: 'PAID' }, orderBy: { paidAt: 'desc' } } },
  });

  const refundable = r.paidCents;
  if (args.amountCents > refundable) {
    throw new HttpError(400, `Only ${formatPeso(refundable)} has been paid on this booking.`);
  }
  if (args.amountCents < MIN_REFUND_CENTS && !isSimulated()) {
    throw new HttpError(400, `The smallest refund the gateway accepts is ${formatPeso(MIN_REFUND_CENTS)}.`);
  }

  const gatewayPayment = r.payments.find((p) => p.method === 'PAYMONGO' && p.amountCents > 0);
  let gatewayOk = false;
  let gatewayRefId = '';

  if (gatewayPayment) {
    const paymentId = await resolvePaymentId(gatewayPayment.gatewayId || gatewayPayment.gatewaySessionId);
    if (paymentId) {
      try {
        const result = await createRefund({
          paymentId,
          amountCents: args.amountCents,
          notes: args.reason,
          reference: r.reference,
        });
        gatewayOk = true;
        gatewayRefId = result.id;
      } catch (err) {
        // Recorded below regardless. A refund the gateway refused is a refund
        // someone has to make by hand, not a refund that did not happen.
        console.error('[refund]', err);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        reference: paymentReference(),
        reservationId: args.reservationId,
        kind: 'REFUND',
        method: gatewayOk ? 'PAYMONGO' : 'OTHER',
        amountCents: -args.amountCents,
        status: 'PAID',
        paidAt: new Date(),
        gatewayId: gatewayRefId,
        notes: gatewayOk ? args.reason : `${args.reason} — SETTLE BY HAND: not issued through the gateway`,
        createdById: args.user.id,
      },
    });
    await recomputePayment(tx, args.reservationId);
  });

  await audit(args.user, {
    module: 'payments',
    action: 'refund',
    entityType: 'Reservation',
    entityId: args.reservationId,
    summary: `${formatPeso(args.amountCents)} refunded on ${r.reference} — ${args.reason}${gatewayOk ? '' : ' (manual settlement required)'}`,
    sensitive: true,
    propertyId: r.propertyId,
    before: { paidCents: r.paidCents },
    after: { paidCents: r.paidCents - args.amountCents, gateway: gatewayOk },
  });

  return { gateway: gatewayOk, manual: !gatewayOk };
}

/**
 * Settles the security deposit at the end of a stay. Any amount deducted must
 * be explained by an incident — a deduction with no record is a dispute waiting
 * to happen.
 */
export async function settleDeposit(args: {
  reservationId: string;
  deductCents: number;
  notes: string;
  user: SessionUser;
}): Promise<void> {
  const deposit = await prisma.securityDeposit.findUniqueOrThrow({
    where: { reservationId: args.reservationId },
  });
  if (args.deductCents > deposit.amountCents) {
    throw new HttpError(400, 'The deduction is larger than the deposit held.');
  }

  const status =
    args.deductCents === 0
      ? 'RETURNED'
      : args.deductCents >= deposit.amountCents
        ? 'FORFEITED'
        : 'PARTIALLY_RETURNED';

  await prisma.securityDeposit.update({
    where: { id: deposit.id },
    data: { status, deductedCents: args.deductCents, returnedAt: new Date(), notes: args.notes },
  });

  await audit(args.user, {
    module: 'payments',
    action: 'settle_deposit',
    entityType: 'SecurityDeposit',
    entityId: deposit.id,
    summary: `Deposit ${status.toLowerCase().replace('_', ' ')} — ${formatPeso(args.deductCents)} deducted`,
    sensitive: true,
    before: { status: deposit.status, deductedCents: deposit.deductedCents },
    after: { status, deductedCents: args.deductCents },
  });
}
