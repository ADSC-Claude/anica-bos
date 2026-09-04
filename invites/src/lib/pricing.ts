import type { DiscountType, ServiceMode } from '@prisma/client';
import { discountAmount } from './money';

/**
 * A quote is arithmetic on rows the admin can edit: a package, its add-ons, a
 * service-mode fee, a coupon. It is computed here and nowhere else, so the
 * landing page, the checkout and the order record cannot disagree.
 */

export type PackageLike = {
  code: string;
  name: string;
  priceCents: number;
  dfyFeeCents: number;
  conciergeFeeCents: number;
};

export type AddOnLike = { code: string; name: string; priceCents: number };

export type CouponLike = {
  code: string;
  type: DiscountType;
  value: number;
  minSpendCents: number;
  expiresAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
};

export type QuoteItem = {
  kind: 'PACKAGE' | 'ADDON' | 'SERVICE' | 'DISCOUNT';
  code: string;
  name: string;
  amountCents: number;
};

export type Quote = {
  items: QuoteItem[];
  subtotalCents: number;
  addOnsCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
  couponError?: string;
};

export const SERVICE_MODES: { key: ServiceMode; label: string; short: string; blurb: string; turnaround: string; revisions: string; intake: string }[] = [
  { key: 'DIY', label: 'Do it yourself', short: 'DIY', blurb: 'You fill in a guided builder. Instant, unlimited edits.', turnaround: 'Instant', revisions: 'Unlimited (self-serve)', intake: 'Builder' },
  { key: 'DFY', label: 'Done-For-You', short: 'DFY', blurb: 'Send us the details by form, Messenger, Viber or Excel. We encode it.', turnaround: '2–3 working days', revisions: '2 rounds', intake: 'Intake form, Messenger/Viber, or Excel' },
  { key: 'CONCIERGE', label: 'Full Concierge', short: 'Concierge', blurb: 'We encode it and manage your guest list and RSVP follow-ups until the day.', turnaround: '3–5 working days + ongoing', revisions: '3 rounds', intake: 'Intake form + a short call' },
];

export function serviceFee(pkg: PackageLike, mode: ServiceMode): number {
  if (mode === 'DFY') return pkg.dfyFeeCents;
  if (mode === 'CONCIERGE') return pkg.conciergeFeeCents;
  return 0;
}

/** Why a coupon cannot be used right now, or null when it can. */
export function couponProblem(coupon: CouponLike | null | undefined, spendCents: number, now = new Date()): string | null {
  if (!coupon) return 'That code does not exist.';
  if (!coupon.active) return 'That code is no longer active.';
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) return 'That code has expired.';
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return 'That code has been fully used.';
  if (spendCents < coupon.minSpendCents) return 'Your order is below the minimum for that code.';
  return null;
}

export function quote(input: {
  pkg: PackageLike;
  serviceMode: ServiceMode;
  addOns: AddOnLike[];
  coupon?: CouponLike | null;
  now?: Date;
}): Quote {
  const items: QuoteItem[] = [
    { kind: 'PACKAGE', code: input.pkg.code, name: input.pkg.name, amountCents: input.pkg.priceCents },
  ];

  const fee = serviceFee(input.pkg, input.serviceMode);
  if (fee > 0) {
    const label = SERVICE_MODES.find((m) => m.key === input.serviceMode)?.label ?? input.serviceMode;
    items.push({ kind: 'SERVICE', code: `SERVICE_${input.serviceMode}`, name: `${label} service`, amountCents: fee });
  }

  let addOnsCents = 0;
  for (const a of input.addOns) {
    items.push({ kind: 'ADDON', code: a.code, name: a.name, amountCents: a.priceCents });
    addOnsCents += a.priceCents;
  }

  const gross = input.pkg.priceCents + fee + addOnsCents;

  let discountCents = 0;
  let couponError: string | undefined;
  if (input.coupon !== undefined) {
    const problem = couponProblem(input.coupon, gross, input.now);
    if (problem) {
      couponError = problem;
    } else if (input.coupon) {
      discountCents = discountAmount(gross, input.coupon.type, input.coupon.value);
      if (discountCents > 0) {
        items.push({ kind: 'DISCOUNT', code: input.coupon.code, name: `Coupon ${input.coupon.code}`, amountCents: -discountCents });
      }
    }
  }

  return {
    items,
    subtotalCents: input.pkg.priceCents,
    addOnsCents,
    serviceFeeCents: fee,
    discountCents,
    totalCents: Math.max(0, gross - discountCents),
    couponError,
  };
}
