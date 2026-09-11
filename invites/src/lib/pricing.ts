import type { DiscountType, Occasion, ServiceMode, Tier } from '@prisma/client';
import { discountAmount } from './money';
import { hasFeature } from './tiers';

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
  // Withdrawn. Kept so an order sold under it still names itself; nothing shows its blurb.
  { key: 'DIY', label: 'Do it yourself', short: 'DIY', blurb: 'The customer filled in the builder themselves.', turnaround: 'Instant', revisions: 'None', intake: 'Builder' },
  { key: 'DFY', label: 'Done-For-You', short: 'DFY', blurb: 'Send us the details by form, Messenger, Viber or Excel. We encode it.', turnaround: '5 working days to a week', revisions: '2 rounds', intake: 'Intake form, Messenger/Viber, or Excel' },
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

/**
 * The two queue jumps. They are one product bought on top of Done-For-You:
 * rush promises 24 hours, and priority two working days plus a revision round,
 * because a Signature build carries too much to encode overnight.
 */
export const RUSH_CODE = 'RUSH';
export const PRIORITY_CODE = 'PRIORITY';

/**
 * A second card, months ahead of the invitation: same couple, same design, its
 * own link. Bought with the order, it is created when the order activates.
 */
export const SAVE_THE_DATE_CODE = 'SAVE_THE_DATE';

/**
 * What each package may be sold with. Both rules are here, next to the
 * arithmetic that reads them, because a rule enforced only in the checkout UI
 * is not a rule: the wizard and the server both price through quote().
 */

/**
 * Who fills in the details is no longer a question: we do, on every order.
 *
 * Both other modes are withdrawn. CONCIERGE went when speed became the rush or
 * priority add-on, because buying it as a mode meant giving up Done-For-You to
 * get it, which is backwards. DIY went because there was nothing behind it:
 * src/lib/sections.ts generates the builder's forms and the intake form from
 * one definition, so the two products differed only in who typed — and a
 * customer who bought the service and then filled the same form in has paid a
 * fee to do the work themselves. One product, one price, and the customer
 * fills in a form while we build the invitation.
 *
 * Withdrawn is not deleted: SERVICE_MODES still carries all three so an order
 * sold under any of them still names itself on the customer's page, and DIY
 * stays the stored value for an order with no build behind it at all — an
 * upgrade order, or an invitation staff made with no order at all.
 */
export function serviceModeAvailable(mode: ServiceMode, _tier: Tier): boolean {
  return mode === 'DFY';
}

/** What every new order is sold as, now that the mode is not a choice. */
export const DEFAULT_SERVICE_MODE: ServiceMode = 'DFY';

/**
 * Whether a package may be sold this add-on.
 *
 * Every add-on is offered to every package. The queue jumps used to be split —
 * rush for Basic and Standard, priority for Signature — on the reasoning that a
 * Signature build cannot be encoded overnight. That reasoning belongs in what
 * each promise says, not in hiding one of them: a customer who wants their
 * invitation tomorrow should be able to ask for it and be told what we can do,
 * rather than not see the option at all.
 *
 * The one rule left is not about the package: a memorial is the gathering
 * nobody announces in advance, so it is not sold a Save the Date.
 */
export function addOnAvailable(code: string, _tier: Tier, occasion?: Occasion): boolean {
  if (code === SAVE_THE_DATE_CODE) return occasion === undefined || saveTheDateOffered(occasion);
  return true;
}

/**
 * A memorial is the one gathering nobody announces in advance, and it is the
 * one occasion with no countdown to the day — the two facts are the same fact.
 * Everything else can be announced early.
 */
export function saveTheDateOffered(occasion: Occasion): boolean {
  return occasion !== 'MEMORIAL';
}

/**
 * What rush costs on each tier it is sold on: jumping the queue ahead of a
 * Standard build displaces more work than a Basic one.
 *
 * This is the one price not held on its row in the database, because AddOn
 * carries a single priceCents and rush needs two. The row's own price is the
 * fallback, so an add-on with no entry here still prices from the catalogue.
 */
const RUSH_BY_TIER: Partial<Record<Tier, number>> = {
  BASIC: 100_000,
  STANDARD: 150_000,
  // Signature and Luxury are here only because rush is now offered to them.
  // Without a row each they would fall back to the catalogue price of 1,000 —
  // charging less to rush the biggest build than the middle one. Standard's
  // price is a floor, not a decision: set these when the add-on packages are
  // priced.
  COMPLETE: 150_000,
  LUXURY: 150_000,
};

/**
 * Preview rounds on a build that was paid to be quick. A round is a preview
 * sent, read, replied to and worked through; there is no room for the ordinary
 * two inside 24 hours on Basic, and promising them would mean missing the date
 * the rush was bought for.
 *
 * It is a cap, never a bonus: a tier whose ordinary allowance is already lower
 * keeps the lower number. Buying speed does not buy rounds.
 */
const RUSHED_ROUNDS: Record<Tier, number> = { BASIC: 1, STANDARD: 2, COMPLETE: 2, LUXURY: 2 };

export function revisionRounds(tier: Tier, rushed: boolean, ordinary: number): number {
  return rushed ? Math.min(ordinary, RUSHED_ROUNDS[tier]) : ordinary;
}

export function addOnPrice(addOn: AddOnLike, tier: Tier): number {
  // The second card comes with Luxury. It is still an add-on row rather than a
  // silent inclusion, so the order names what it carried and activation has the
  // same thing to look for whoever bought it — it simply costs nothing.
  if (addOn.code === SAVE_THE_DATE_CODE && hasFeature(tier, 'saveTheDate.included')) return 0;
  if (addOn.code !== RUSH_CODE) return addOn.priceCents;
  return RUSH_BY_TIER[tier] ?? addOn.priceCents;
}

/**
 * Whether the catalogue price is a starting price rather than the price.
 *
 * True only where a bigger package pays *more*, which is rush alone: jumping
 * ahead of a bigger build displaces more work. Save the Date also moves with
 * the package, but downwards — it is included with Luxury — and "from 299"
 * would be the wrong way round for that.
 */
export function addOnPriceRises(code: string): boolean {
  return code === RUSH_CODE;
}

/** Whether a tier is given this add-on rather than sold it. */
export function addOnIncluded(code: string, tier: Tier): boolean {
  return code === SAVE_THE_DATE_CODE && hasFeature(tier, 'saveTheDate.included');
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
  /** What is being celebrated. Some add-ons do not suit every occasion. */
  occasion?: Occasion;
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
    if (!addOnAvailable(a.code, input.pkg.tier, input.occasion)) continue;
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
