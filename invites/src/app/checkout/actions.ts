'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser, parseWith, action } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { createOrder } from '@/lib/orders';
import { startCheckout, submitManualProof } from '@/lib/payments';
import { couponProblem } from '@/lib/pricing';
import { OCCASION_KEYS } from '@/lib/occasions';
import { HttpError } from '@/lib/errors';

const placeSchema = z.object({
  occasion: z.enum(OCCASION_KEYS as [string, ...string[]]),
  tier: z.enum(['BASIC', 'STANDARD', 'COMPLETE']),
  serviceMode: z.enum(['DIY', 'DFY', 'CONCIERGE']),
  templateId: z.string().min(1, 'Pick a template.'),
  addOnCodes: z.array(z.string().max(40)).max(12).default([]),
  couponCode: z.string().max(40).optional(),
  language: z.enum(['en', 'tl']).default('en'),
  notes: z.string().max(2000).optional(),
});

export async function placeOrderAction(input: unknown) {
  const user = await requireUser('/checkout');
  const result = await action(async () => {
    const data = parseWith(placeSchema, input);
    const order = await createOrder(user, { ...data, occasion: data.occasion as never });
    return order.reference;
  });
  if (!result.ok) return result;
  redirect(`/checkout/pay/${result.data}`);
}

/** Looks a coupon up so the wizard can show the discount before checkout. */
export async function checkCouponAction(code: string, grossCents: number) {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const problem = couponProblem(coupon, grossCents);
  if (problem || !coupon) return { ok: false as const, error: problem ?? 'That code does not exist.' };
  return { ok: true as const, coupon: { code: coupon.code, type: coupon.type, value: coupon.value, minSpendCents: coupon.minSpendCents, expiresAt: coupon.expiresAt, usageLimit: coupon.usageLimit, usedCount: coupon.usedCount, active: coupon.active } };
}

export async function payOnlineAction(reference: string) {
  const user = await requireUser();
  const order = await prisma.order.findUnique({ where: { reference }, select: { userId: true } });
  if (!order || order.userId !== user.id) throw new HttpError(404, 'Order not found.');
  const start = await startCheckout(reference);
  redirect(start.checkoutUrl);
}

export async function uploadProofAction(reference: string, formData: FormData) {
  const user = await requireUser();
  const result = await action(async () => {
    const file = formData.get('proof');
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Attach a screenshot of your payment.');
    await submitManualProof(user, reference, {
      file,
      payerName: String(formData.get('payerName') ?? ''),
      payerReference: String(formData.get('payerReference') ?? ''),
      channel: String(formData.get('channel') ?? ''),
    });
  });
  if (!result.ok) return result;
  redirect(`/checkout/confirm/${reference}`);
}
