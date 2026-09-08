import type { DiscountType, ServiceMode, Tier } from '@prisma/client';
import { discountAmount } from './money';

/**
 * A quote is arithmetic on rows the admin can edit: a package, its add-ons, a
 * service-mode fee, a coupon. It is computed here and nowhere else, so the
 * landing page, the checkout and the order record cannot disagree.
 */

export type PackageLike = {
  code: string;
  name: string;
  tier: Tier;
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
  { key: 'CONCIERGE', label: 'Priority', short: 'Priority', blurb: 'We encode everything for you, with extra time, an extra revision round, and a call to walk through it together.', turnaround: '5 working days', revisions: '3 rounds', intake: 'Intake form + a short call' },
];

/**
 * What a customer is told a mode is called. The pages that show it used to
 * spell it out inline, so renaming a mode meant finding every ternary; read it
 * from SERVICE_MODES instead, the way occasionLabel and TIER_LABELS work.
 */
export function serviceModeLabel(mode: ServiceMode): string {
  return SERVICE_MODES.find((m) => m.key === mode)?.label ?? mode;
}

/** Rush jumps the Done-For-You queue. */
export const RUSH_CODE = 'RUSH';

/**
 * What each package may be sold with. Both rules are here, next to the
 * arithmetic that reads them, because a rule enforced only in the checkout UI
 * is not a rule: the wizard and the server both price through quote().
 */

/**
 * Priority is sold on Signature alone — it is the tier whose build is large
 * enough for the extra round and the call to be worth paying for.
 *
 * Gating it matters more than zeroing the fee would: a zero fee renders as
 * "Included" in the wizard, which would give away the mode rather than
 * withdraw it.
 */
export function serviceModeAvailable(mode: ServiceMode, tier: Tier): boolean {
  return mode !== 'CONCIERGE' || tier === 'COMPLETE';
}

/**
 * Rush is sold on Basic and Standard alone. It buys a place at the front of
 * the queue, and a Signature build is too big to promise that on.
 */
export function addOnAvailable(code: string, tier: Tier): boolean {
  return code !== RUSH_CODE || tier !== 'COMPLETE';
}

/**
 * What rush costs on each tier it is sold on: jumping the queue ahead of a
 * Standard build displaces more work than a Basic one.
 *
 * This is the one price not held on its row in the database, because AddOn
 * carries a single priceCents and rush needs two. The row's own price is the
 * fallback, so an add-on with no entry here still prices from the catalogue.
 */
const RUSH_BY_TIER: Partial<Record<Tier, number>> = { BASIC: 100_000, STANDARD: 150_000 };

export function addOnPrice(addOn: AddOnLike, tier: Tier): number {
  if (addOn.code !== RUSH_CODE) return addOn.priceCents;
  return RUSH_BY_TIER[tier] ?? addOn.priceCents;
}

export function serviceFee(pkg: Pick<PackageLike, 'tier' | 'dfyFeeCents' | 'conciergeFeeCents'>, mode: ServiceMode): number {
  if (!serviceModeAvailable(mode, pkg.tier)) return 0;
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
    const label = serviceModeLabel(input.serviceMode);
    items.push({ kind: 'SERVICE', code: `SERVICE_${input.serviceMode}`, name: `${label} service`, amountCents: fee });
  }

  let addOnsCents = 0;
  for (const a of input.addOns) {
    if (!addOnAvailable(a.code, input.pkg.tier)) continue;
    const cents = addOnPrice(a, input.pkg.tier);
    items.push({ kind: 'ADDON', code: a.code, name: a.name, amountCents: cents });
    addOnsCents += cents;
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
