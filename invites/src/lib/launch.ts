import { discountAmount } from './money';
import { couponProblem, type CouponLike } from './pricing';

/**
 * The opening offer: the first twenty customers pay twenty per cent less.
 *
 * It is a coupon row like any other, not a constant in the code, so that it
 * can be switched off, extended or re-priced from Admin → Coupons without a
 * deploy — and so the seats count themselves. `usedCount` rises when an order
 * takes one; `usageLimit` is where it stops. Twenty customers is twenty rows.
 *
 * What is different is that nobody types it. A coupon you have to know about
 * is a reward for reading the small print; this one is the price. So the
 * checkout applies it on its own (see buildQuote), and the packages show the
 * lower number with the old one struck through beside it. The two read the
 * same row, so the price on the card and the price charged cannot drift.
 *
 * When the twentieth seat goes, or the row is switched off, every one of
 * those places quietly returns to the full price. Nothing needs saying.
 */
export const LAUNCH_CODE = 'FIRST20';

/** What the row is created with. After that the row is the truth, not this. */
export const LAUNCH_PERCENT = 20;
export const LAUNCH_SEATS = 20;

export type LaunchOffer = {
  code: string;
  percent: number;
  /** how many were offered */
  seats: number;
  /** how many have been taken */
  taken: number;
  /** how many remain */
  left: number;
};

/**
 * The offer as the site may show it, or null when there is nothing to show.
 *
 * Null covers every way an offer can be over — switched off, expired, all
 * twenty taken — and one way it can be wrong: a row that is not a percentage
 * cannot be shown as "20% off", so it is not shown at all rather than shown
 * as something it is not.
 */
export function launchOffer(c: CouponLike | null | undefined, now = new Date()): LaunchOffer | null {
  if (!c || c.code !== LAUNCH_CODE || c.type !== 'PERCENT' || c.value <= 0) return null;
  // the same gate the checkout uses, asked at the offer's own floor so that a
  // minimum spend set later does not make the badge lie on a small order
  if (couponProblem(c, c.minSpendCents, now)) return null;
  const seats = c.usageLimit ?? LAUNCH_SEATS;
  return { code: c.code, percent: c.value, seats, taken: c.usedCount, left: Math.max(0, seats - c.usedCount) };
}

/** A price with the offer taken off, rounded the way the checkout rounds it. */
export function offerPrice(cents: number, percent: number): number {
  return Math.max(0, cents - discountAmount(cents, 'PERCENT', percent));
}

/** "First 20 customers — 20% off", and what is left of it. */
export function offerHeadline(o: LaunchOffer): string {
  return `First ${o.seats} customers — ${o.percent}% off`;
}

export function offerLeftLine(o: LaunchOffer): string {
  if (o.left === 1) return 'Last one left';
  return `${o.left} of ${o.seats} left`;
}
