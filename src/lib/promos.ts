import type { Prisma } from '@prisma/client';

/**
 * Which promos the public page may show, and from when.
 *
 * Three dates, doing three different jobs:
 *
 *   - `startDate` is when the discount can actually be taken at the till.
 *   - `endDate` is when it stops, absolutely. Nothing stays up past its last
 *     day, which is why an expired promo needs no tidying by hand.
 *   - `showFromDate` is when the *website* may mention it, which is not always
 *     the day it starts. A promo running from 1 September wants to be up a
 *     week early so people can plan around it.
 *
 * Null `showFromDate` means "the day it starts", so every promo written before
 * that field existed behaves exactly as it did.
 *
 * A promo announced before it starts must be labelled — see `isUpcoming` —
 * because a guest who reads it as live turns up expecting a discount the desk
 * has to refuse.
 *
 * Kept out of the page and free of `server-only` so the window is checked by
 * tests rather than assumed.
 */
export function landingPromoWhere(now: Date): Prisma.PromoWhereInput {
  return {
    active: true,
    showOnLanding: true,
    OR: [{ showFromDate: { lte: now } }, { showFromDate: null, startDate: { lte: now } }],
    endDate: { gte: now },
  };
}

/** Announced, but not yet claimable. */
export function isUpcoming(promo: { startDate: Date }, now: Date): boolean {
  return promo.startDate > now;
}
