import 'server-only';
import type { Occasion, ServiceMode, Tier } from '@prisma/client';
import { prisma } from './db';
import { PREMIUM_OPENING_CODE } from './openings';
import { HttpError } from './errors';
import { orderReference } from './codes';
import { quote, serviceModeAvailable, revisionRounds, DEFAULT_SERVICE_MODE, SERVICE_MODES, RUSH_CODE, PRIORITY_CODE, type Quote } from './pricing';
import { TIER_LABELS } from './tiers';
import { createDraft } from './invitations';
import { audit } from './audit';
import { notify, notifyStaff } from './notifications';
import { sendEmail, render, baseVars } from './email';
import { getSettings } from './settings';
import { formatPeso } from './money';
import { absoluteUrl } from './app-url';
import { addDays } from './datetime';
import type { SessionUser } from './auth';
import type { Lang } from './copy';

/**
 * An order is a snapshot of a quote at the moment of purchase, tied to the
 * draft invitation it pays for. Prices are copied onto the order — a later
 * price change in Settings must not move money already agreed.
 */

/** The package row for an occasion and tier, falling back to the generic row. */
export async function packageFor(occasion: Occasion, tier: Tier) {
  const specific = await prisma.package.findFirst({ where: { occasion, tier, active: true } });
  if (specific) return specific;
  const generic = await prisma.package.findFirst({ where: { occasion: null, tier, active: true } });
  if (!generic) throw new HttpError(500, `No package is configured for ${tier}.`);
  return generic;
}

export async function catalogue() {
  const [packages, addOns] = await Promise.all([
    prisma.package.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }] }),
    prisma.addOn.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return { packages, addOns };
}

export async function buildQuote(input: {
  occasion: Occasion;
  tier: Tier;
  serviceMode: ServiceMode;
  addOnCodes: string[];
  couponCode?: string;
}): Promise<Quote & { pkg: Awaited<ReturnType<typeof packageFor>>; addOns: { id: string; code: string; name: string; priceCents: number }[]; couponId?: string }> {
  const pkg = await packageFor(input.occasion, input.tier);
  // quote() already declines to price a mode this tier cannot buy, but silence
  // is the wrong answer on the way in: a client asking for Priority on Basic is
  // out of step with the catalogue, and would otherwise be handed a Basic order
  // it did not ask for.
  if (!serviceModeAvailable(input.serviceMode, pkg.tier)) {
    const label = SERVICE_MODES.find((m) => m.key === input.serviceMode)?.label ?? input.serviceMode;
    throw new HttpError(400, `${label} is not offered on ${TIER_LABELS[pkg.tier]}.`);
  }
  const codes = Array.from(new Set(input.addOnCodes)).slice(0, 12);
  const addOns = codes.length ? await prisma.addOn.findMany({ where: { code: { in: codes }, active: true, quoted: true } }) : [];
  const coupon = input.couponCode?.trim() ? await prisma.coupon.findUnique({ where: { code: input.couponCode.trim().toUpperCase() } }) : undefined;
  const q = quote({ pkg, serviceMode: input.serviceMode, addOns, coupon: input.couponCode?.trim() ? coupon : undefined });
  return { ...q, pkg, addOns, couponId: coupon && !q.couponError ? coupon.id : undefined };
}

/**
 * A new order is always the one product we sell: we build it. The mode is not
 * taken from the browser at all — there is nothing for a customer to choose,
 * and a withdrawn mode arriving in a payload should never be able to open an
 * order that skips the queue.
 */
export async function createOrder(
  user: SessionUser,
  input: {
    occasion: Occasion;
    tier: Tier;
    templateId: string;
    addOnCodes: string[];
    couponCode?: string;
    language?: Lang;
    notes?: string;
  },
) {
  const q = await buildQuote({ ...input, serviceMode: DEFAULT_SERVICE_MODE });
  if (q.couponError) throw new HttpError(400, q.couponError);

  const invitation = await createDraft({
    userId: user.id,
    occasion: input.occasion,
    tier: input.tier,
    templateId: input.templateId,
    language: input.language,
  });

  const order = await prisma.order.create({
    data: {
      reference: orderReference(),
      userId: user.id,
      packageId: q.pkg.id,
      couponId: q.couponId,
      invitationId: invitation.id,
      occasion: input.occasion,
      tier: input.tier,
      serviceMode: DEFAULT_SERVICE_MODE,
      subtotalCents: q.subtotalCents,
      addOnsCents: q.addOnsCents,
      serviceFeeCents: q.serviceFeeCents,
      discountCents: q.discountCents,
      totalCents: q.totalCents,
      notes: (input.notes ?? '').trim().slice(0, 2000),
      items: { create: q.items.map((it, i) => ({ kind: it.kind, code: it.code, name: it.name, amountCents: it.amountCents, sortOrder: i })) },
    },
    include: { items: true, package: true },
  });

  if (q.couponId) {
    await prisma.coupon.update({ where: { id: q.couponId }, data: { usedCount: { increment: 1 } } });
  }

  await audit(user, { module: 'orders', action: 'create', entityType: 'Order', entityId: order.id, summary: `${order.reference} ${formatPeso(order.totalCents)}` });

  const s = await getSettings();
  await sendEmail({
    to: user.email,
    subject: `Order ${order.reference} received`,
    text: render(s['email.orderReceived'], {
      ...(await baseVars()),
      customerName: user.name,
      reference: order.reference,
      packageName: order.package.name,
      total: formatPeso(order.totalCents),
      status: 'Pending payment',
      nextStep: order.totalCents > 0 ? `Pay here: ${absoluteUrl(`/checkout/pay/${order.reference}`)}` : 'Your invitation is ready to build.',
    }),
  });

  // A free order (100% coupon) activates at once — there is nothing to pay.
  if (order.totalCents === 0) await activateOrder(order.id, 'free');

  return order;
}

/**
 * Money is in: unlock the invitation, open the DFY job if one was bought, tell
 * the customer and the queue. Idempotent — a webhook retry or a second admin
 * click changes nothing.
 */
export async function activateOrder(orderId: string, via: 'paymongo' | 'manual' | 'free' | 'admin') {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { user: true, package: true, invitation: true, dfyJob: true, items: true },
  });
  if (order.status === 'ACTIVE') return order;
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') throw new HttpError(400, 'That order is closed.');

  const now = new Date();
  const s = await getSettings();

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'ACTIVE', paidAt: order.paidAt ?? now, activatedAt: now } });
    if (order.invitationId) {
      // the premium opening add-on, bought with this order, unlocks the design's clip
      const premiumOpening = order.items.some((it) => it.kind === 'ADDON' && it.code === PREMIUM_OPENING_CODE);
      await tx.invitation.update({
        where: { id: order.invitationId },
        data: premiumOpening ? { premiumOpening: true } : {},
      });
    }
    if (order.serviceMode !== 'DIY' && order.invitationId && !order.dfyJob) {
      // Speed is bought as an add-on now, so the promise comes from the order's
      // line items rather than from how the order was encoded. Priority is two
      // working days and an extra revision round; rush is hours, so it rounds
      // to a day rather than pretending the board can hold fractions.
      const bought = (code: string) => order.items.some((it) => it.kind === 'ADDON' && it.code === code);
      const priority = bought(PRIORITY_CODE);
      const rush = bought(RUSH_CODE);
      const days = priority
        ? s['concierge.turnaroundDays']
        : rush
          ? Math.max(1, Math.ceil(s['rush.turnaroundHours'] / 24))
          : s['dfy.turnaroundDays'];
      await tx.dfyJob.create({
        data: {
          orderId,
          invitationId: order.invitationId,
          status: 'NEW',
          dueAt: addDays(now, days),
          revisionsAllowed: revisionRounds(order.tier, priority || rush, order.package.revisionRounds),
        },
      });
    }
  });

  const dfy = order.serviceMode !== 'DIY';
  const nextStep = dfy
    ? 'Next: tell us the details. Fill in the intake form from your dashboard, or send everything over Messenger or Viber and we will encode it for you.'
    : 'Your builder is unlocked — open your dashboard to start filling in your invitation.';

  await notify(order.userId, 'Payment confirmed', nextStep, order.invitationId ? `/account/invitations/${order.invitationId}` : '/account');
  await sendEmail({
    to: order.user.email,
    subject: `Payment confirmed — ${order.reference}`,
    text: render(s['email.orderActive'], { ...(await baseVars()), customerName: order.user.name, reference: order.reference, nextStep }),
  });
  if (dfy) {
    await notifyStaff('dfy.view', `New DFY job — ${order.reference}`, `${order.user.name} · ${order.occasion} · ${order.tier} (${via})`, '/admin/dfy');
  }
  await audit(null, { module: 'orders', action: 'activate', entityType: 'Order', entityId: orderId, summary: `via ${via}`, sensitive: true });

  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { user: true, package: true, invitation: true, dfyJob: true } });
}

export async function cancelOrder(user: SessionUser | null, orderId: string, reason: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status === 'ACTIVE') throw new HttpError(400, 'An active order cannot be cancelled. Refund it instead.');
  await prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelledAt: new Date(), notes: `${order.notes}\n[cancelled] ${reason}`.trim() } });
  await audit(user, { module: 'orders', action: 'cancel', entityType: 'Order', entityId: orderId, summary: reason, sensitive: true });
}

/**
 * Buying a higher tier for an existing invitation: a new order whose
 * activation raises the tier. The price is the difference between packages,
 * never less than zero.
 */
export async function createUpgradeOrder(user: SessionUser, invitationId: string, tier: Tier) {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId }, include: { order: { include: { package: true } } } });
  if (invitation.userId !== user.id) throw new HttpError(404, 'That invitation does not exist.');
  const target = await packageFor(invitation.occasion, tier);
  const current = invitation.order?.package;
  const diff = Math.max(0, target.priceCents - (current?.priceCents ?? 0));

  const order = await prisma.order.create({
    data: {
      reference: orderReference(),
      userId: user.id,
      packageId: target.id,
      occasion: invitation.occasion,
      tier,
      // Not a sold mode any more — here it is the stored value for "no build
      // attached", which is what an upgrade is: it raises the tier on an
      // invitation we have already made, so activateOrder opens no new job.
      serviceMode: 'DIY',
      subtotalCents: diff,
      totalCents: diff,
      notes: `Upgrade of invitation ${invitation.id} (${invitation.tier} → ${tier})`,
      items: { create: [{ kind: 'PACKAGE', code: `UPGRADE_${tier}`, name: `Upgrade to ${target.name}`, amountCents: diff, sortOrder: 0 }] },
    },
  });
  await audit(user, { module: 'orders', action: 'upgrade.create', entityType: 'Order', entityId: order.id, summary: `${invitation.tier} → ${tier}` });
  if (diff === 0) await applyUpgrade(order.id);
  return order;
}

/** Called when an upgrade order is paid: raise the invitation's tier. */
export async function applyUpgrade(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { package: true } });
  const match = /Upgrade of invitation (\S+)/.exec(order.notes);
  if (!match) return;
  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status: 'ACTIVE', paidAt: order.paidAt ?? new Date(), activatedAt: new Date() } }),
    prisma.invitation.update({ where: { id: match[1] }, data: { tier: order.tier } }),
  ]);
  await notify(order.userId, `Upgraded to ${order.package.name}`, 'New sections are unlocked in your builder.', `/account/invitations/${match[1]}`);
}
