import 'server-only';
import { prisma } from './db';
import { HttpError } from './errors';
import { audit } from './audit';
import { paymentReference } from './codes';
import { absoluteUrl } from './app-url';
import { formatPeso } from './money';
import { createCheckoutSession, createRefund, resolvePaymentId, MIN_CHARGE_CENTS, MIN_REFUND_CENTS } from './paymongo';
import { activateOrder, applyUpgrade } from './orders';
import { storeFile } from './storage';
import { notify, notifyStaff } from './notifications';
import { getSettings } from './settings';
import type { SessionUser } from './auth';

/**
 * Money in. One rule governs this module: **only the PayMongo webhook and an
 * admin's proof review mark a payment paid.** The browser returning from the
 * gateway renders a "confirming" state; it never writes status.
 */

export type CheckoutStart = { reference: string; amountCents: number; checkoutUrl: string; simulated: boolean };

async function settle(orderId: string, notes: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (/Upgrade of invitation/.test(order.notes)) await applyUpgrade(orderId);
  else await activateOrder(orderId, notes.startsWith('manual') ? 'manual' : 'paymongo');
}

export async function startCheckout(orderReference: string): Promise<CheckoutStart> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { reference: orderReference },
    include: { user: true, package: true },
  });
  if (order.status !== 'PENDING_PAYMENT') throw new HttpError(400, 'That order is not awaiting payment.');
  if (order.totalCents < MIN_CHARGE_CENTS) throw new HttpError(400, `The smallest online payment is ${formatPeso(MIN_CHARGE_CENTS)}.`);

  const reference = paymentReference();
  const session = await createCheckoutSession({
    amountCents: order.totalCents,
    description: `${order.package.name} · ${order.reference}`,
    reference,
    lineName: `${order.package.name} (${order.reference})`,
    successUrl: absoluteUrl(`/checkout/confirm/${order.reference}`),
    cancelUrl: absoluteUrl(`/checkout/pay/${order.reference}?cancelled=1`),
    customer: { name: order.user.name, email: order.user.email, phone: order.user.phone || undefined },
  });

  await prisma.payment.create({
    data: {
      reference,
      orderId: order.id,
      provider: 'PAYMONGO',
      amountCents: order.totalCents,
      status: 'PENDING',
      gatewaySessionId: session.id,
      checkoutUrl: session.checkoutUrl,
    },
  });

  return { reference, amountCents: order.totalCents, checkoutUrl: session.checkoutUrl, simulated: session.simulated };
}

/**
 * Applies a confirmed gateway payment. Called only from the webhook handler
 * (and the simulated checkout, which posts through the same path). Idempotent
 * on the gateway event id and on the payment already being PAID.
 */
export async function applyGatewayPayment(args: {
  reference: string;
  gatewayEventId: string;
  gatewayPaymentId?: string;
  amountCents?: number;
  channel?: string;
}): Promise<{ applied: boolean }> {
  if (args.gatewayEventId) {
    const seen = await prisma.payment.findUnique({ where: { gatewayEventId: args.gatewayEventId }, select: { id: true } });
    if (seen) return { applied: false };
  }
  const payment = await prisma.payment.findUnique({ where: { reference: args.reference } });
  if (!payment) {
    console.error('[payments] webhook for unknown reference', args.reference);
    return { applied: false };
  }
  if (payment.status === 'PAID') return { applied: false };

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      gatewayEventId: args.gatewayEventId || undefined,
      gatewayPaymentId: args.gatewayPaymentId ?? payment.gatewayPaymentId,
      amountCents: args.amountCents ?? payment.amountCents,
      channel: args.channel ?? payment.channel,
    },
  });
  await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'PAID', paidAt: new Date() } });
  await settle(payment.orderId, 'paymongo');
  return { applied: true };
}

export async function markGatewayFailure(reference: string, reason: string) {
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment || payment.status !== 'PENDING') return;
  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: reason.slice(0, 500) } });
}

// ---------------------------------------------------------------------------
// Manual transfers
// ---------------------------------------------------------------------------

export async function submitManualProof(
  user: SessionUser,
  orderReference: string,
  input: { file: File; payerName: string; payerReference: string; channel: string },
) {
  const s = await getSettings();
  if (!s['payments.manualEnabled']) throw new HttpError(400, 'Manual payments are not accepted right now.');
  const order = await prisma.order.findUniqueOrThrow({ where: { reference: orderReference } });
  if (order.userId !== user.id) throw new HttpError(404, 'That order does not exist.');
  if (order.status !== 'PENDING_PAYMENT') throw new HttpError(400, 'That order is not awaiting payment.');

  const stored = await storeFile({ file: input.file, entityType: 'proof', entityId: order.id, visibility: 'private', accept: 'images-and-pdf' });

  const payment = await prisma.payment.create({
    data: {
      reference: paymentReference(),
      orderId: order.id,
      provider: 'MANUAL',
      status: 'PENDING',
      amountCents: order.totalCents,
      channel: input.channel.slice(0, 40),
      proofUrl: stored.url,
      proofStoragePath: stored.storagePath,
      payerName: input.payerName.trim().slice(0, 120),
      payerReference: input.payerReference.trim().slice(0, 120),
    },
  });

  await notifyStaff('payments.review', `Proof of payment — ${order.reference}`, `${input.channel} · ${formatPeso(order.totalCents)} · ${input.payerName}`, `/admin/payments`);
  await audit(user, { module: 'payments', action: 'proof.submit', entityType: 'Payment', entityId: payment.id, summary: `${order.reference} ${input.channel}` });
  return payment;
}

export async function reviewManualPayment(
  reviewer: SessionUser,
  paymentId: string,
  decision: 'approve' | 'reject',
  reason = '',
) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
  if (payment.provider !== 'MANUAL') throw new HttpError(400, 'Only manual transfers are reviewed by hand.');
  if (payment.status !== 'PENDING') throw new HttpError(400, 'That payment has already been reviewed.');

  if (decision === 'approve') {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PAID', paidAt: new Date(), reviewedById: reviewer.id, reviewedAt: new Date() },
    });
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'PAID', paidAt: new Date() } });
    await settle(payment.orderId, 'manual');
  } else {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REJECTED', rejectReason: reason.slice(0, 500), reviewedById: reviewer.id, reviewedAt: new Date() },
    });
    await notify(payment.order.userId, 'We could not verify your payment', reason || 'Please upload a clearer screenshot, or message us on Messenger.', `/checkout/pay/${payment.order.reference}`);
  }
  await audit(reviewer, { module: 'payments', action: `proof.${decision}`, entityType: 'Payment', entityId: paymentId, summary: reason, sensitive: true });
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function refundPayment(user: SessionUser, paymentId: string, amountCents: number, reason: string) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
  if (payment.status !== 'PAID') throw new HttpError(400, 'Only a paid payment can be refunded.');
  const available = payment.amountCents - payment.refundedCents;
  if (amountCents < MIN_REFUND_CENTS || amountCents > available) throw new HttpError(400, `Refund between ${formatPeso(MIN_REFUND_CENTS)} and ${formatPeso(available)}.`);

  let refundId = 'manual';
  if (payment.provider === 'PAYMONGO') {
    const gatewayId = await resolvePaymentId(payment.gatewayPaymentId ?? payment.gatewaySessionId ?? '');
    if (!gatewayId) throw new HttpError(400, 'The gateway payment id could not be resolved. Refund it from the PayMongo dashboard and record it here as manual.');
    const result = await createRefund({ paymentId: gatewayId, amountCents, notes: reason, reference: payment.reference });
    refundId = result.id;
  }

  const full = payment.refundedCents + amountCents >= payment.amountCents;
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: { refundedCents: { increment: amountCents }, refundId, status: full ? 'REFUNDED' : 'PAID' },
    }),
    ...(full ? [prisma.order.update({ where: { id: payment.orderId }, data: { status: 'REFUNDED' } })] : []),
  ]);
  await notify(payment.order.userId, 'Refund issued', `${formatPeso(amountCents)} — ${reason}`, `/account/orders/${payment.orderId}`);
  await audit(user, { module: 'payments', action: 'refund', entityType: 'Payment', entityId: paymentId, summary: `${formatPeso(amountCents)} ${reason}`, sensitive: true });
}
