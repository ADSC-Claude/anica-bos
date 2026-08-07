import 'server-only';
import type { LineKind, Property } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';
import { getSettings } from './settings';
import { discountAmount, percentOf, sum } from './money';
import {
  isWeekendNight,
  nightKeys,
  nightsBetween,
  toDateKey,
  toStayDate,
  type DateKey,
} from './datetime';

/**
 * Server-side pricing. The browser's number is never trusted: the booking
 * endpoint re-prices from the property, the dates, the add-ons and the promo
 * code, and if the result differs from what the guest was shown, the server's
 * number wins and the guest sees it before paying.
 */

export type QuoteLine = {
  kind: LineKind;
  label: string;
  quantity: number;
  unitCents: number;
  /** Negative for a discount. */
  amountCents: number;
};

export type Quote = {
  propertyId: string;
  checkIn: DateKey;
  checkOut: DateKey;
  nights: number;
  guests: number;
  /** Average nightly rate actually charged, after per-date overrides. */
  nightlyRateCents: number;
  accommodationCents: number;
  cleaningFeeCents: number;
  extraGuestCents: number;
  addOnsCents: number;
  discountCents: number;
  otherFeesCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  lines: QuoteLine[];
  promotion: { id: string; code: string; name: string } | null;
  promoError?: string;
};

export type QuoteRequest = {
  propertyId: string;
  checkIn: DateKey;
  checkOut: DateKey;
  adults: number;
  children?: number;
  addOns?: { addOnId: string; quantity: number }[];
  promoCode?: string;
  /** Tier of the guest booking, when known — some promos are repeat-only. */
  guestTier?: 'NEW' | 'REPEAT' | 'VIP';
};

/** What one night costs, honouring a per-date override, then the weekend rate. */
function nightlyRate(
  property: Pick<Property, 'baseRateCents' | 'weekendRateCents'>,
  key: DateKey,
  overrides: Map<DateKey, number>,
): number {
  const override = overrides.get(key);
  if (override !== undefined) return override;
  if (property.weekendRateCents > 0 && isWeekendNight(key)) return property.weekendRateCents;
  return property.baseRateCents;
}

export async function quote(req: QuoteRequest): Promise<Quote> {
  const settings = await getSettings();

  const property = await prisma.property.findUnique({
    where: { id: req.propertyId },
    include: { addOns: { where: { active: true } } },
  });
  if (!property) throw new HttpError(404, 'That property no longer exists.');

  const nights = nightsBetween(req.checkIn, req.checkOut);
  if (nights < 1) throw new HttpError(400, 'Check-out must be after check-in.');
  if (nights < property.minNights) {
    throw new HttpError(400, `${property.name} has a ${property.minNights}-night minimum stay.`);
  }
  if (property.maxNights > 0 && nights > property.maxNights) {
    throw new HttpError(400, `${property.name} can be booked for at most ${property.maxNights} nights.`);
  }

  const guests = req.adults + (req.children ?? 0);
  if (guests < 1) throw new HttpError(400, 'A booking needs at least one guest.');
  if (guests > property.maxGuests) {
    throw new HttpError(400, `${property.name} sleeps ${property.maxGuests}.`);
  }

  const keys = nightKeys(req.checkIn, req.checkOut);

  const overrideRows = await prisma.rateOverride.findMany({
    where: {
      propertyId: property.id,
      date: { gte: toStayDate(req.checkIn), lt: toStayDate(req.checkOut) },
    },
  });
  const overrides = new Map(overrideRows.map((r) => [toDateKey(r.date), r.nightlyRateCents]));

  // A closed date may be stayed through but not arrived on.
  const arrival = overrideRows.find((r) => toDateKey(r.date) === req.checkIn);
  if (arrival?.closed) {
    throw new HttpError(400, 'That arrival date is not available. Please choose another.');
  }
  const longestMin = Math.max(property.minNights, ...overrideRows.map((r) => r.minNights ?? 0));
  if (nights < longestMin) {
    throw new HttpError(400, `Those dates need a minimum stay of ${longestMin} nights.`);
  }

  const perNight = keys.map((k) => nightlyRate(property, k, overrides));
  const accommodationCents = sum(perNight);
  const averageNightly = Math.round(accommodationCents / nights);

  const lines: QuoteLine[] = [];

  // One line per rate when the nights differ, otherwise a single "× nights"
  // line — a guest reading a five-night quote should not have to check five
  // identical rows.
  const uniqueRates = new Set(perNight);
  if (uniqueRates.size === 1) {
    lines.push({
      kind: 'ACCOMMODATION',
      label: `Nightly rate × ${nights} night${nights === 1 ? '' : 's'}`,
      quantity: nights,
      unitCents: perNight[0],
      amountCents: accommodationCents,
    });
  } else {
    for (const rate of [...uniqueRates].sort((a, b) => a - b)) {
      const count = perNight.filter((r) => r === rate).length;
      lines.push({
        kind: 'ACCOMMODATION',
        label: `Nightly rate × ${count} night${count === 1 ? '' : 's'}`,
        quantity: count,
        unitCents: rate,
        amountCents: rate * count,
      });
    }
  }

  const cleaningFeeCents = property.cleaningFeeCents;
  if (cleaningFeeCents > 0) {
    lines.push({
      kind: 'CLEANING_FEE',
      label: 'Cleaning fee',
      quantity: 1,
      unitCents: cleaningFeeCents,
      amountCents: cleaningFeeCents,
    });
  }

  let extraGuestCents = 0;
  const extraGuests = Math.max(0, guests - property.extraGuestAfter);
  if (extraGuests > 0 && property.extraGuestFeeCents > 0) {
    extraGuestCents = property.extraGuestFeeCents * extraGuests * nights;
    lines.push({
      kind: 'EXTRA_GUEST',
      label: `Extra guest × ${extraGuests} × ${nights} night${nights === 1 ? '' : 's'}`,
      quantity: extraGuests * nights,
      unitCents: property.extraGuestFeeCents,
      amountCents: extraGuestCents,
    });
  }

  let addOnsCents = 0;
  for (const requested of req.addOns ?? []) {
    if (requested.quantity <= 0) continue;
    const addOn =
      property.addOns.find((a) => a.id === requested.addOnId) ??
      (await prisma.addOn.findFirst({
        where: { id: requested.addOnId, active: true, propertyId: null },
      }));
    if (!addOn) continue;

    const qty = Math.min(requested.quantity, Math.max(1, addOn.maxQuantity));
    const units =
      addOn.per === 'NIGHT'
        ? qty * nights
        : addOn.per === 'GUEST'
          ? qty * guests
          : addOn.per === 'GUEST_NIGHT'
            ? qty * guests * nights
            : qty;
    const amount = addOn.priceCents * units;
    addOnsCents += amount;
    lines.push({
      kind: 'ADDON',
      label: units > 1 ? `${addOn.name} × ${units}` : addOn.name,
      quantity: units,
      unitCents: addOn.priceCents,
      amountCents: amount,
    });
  }

  // Discounts apply to the whole subtotal, so a promo on a stay with a cleaning
  // fee discounts the fee too. That is what a guest expects "10% off" to mean.
  const subtotal = accommodationCents + cleaningFeeCents + extraGuestCents + addOnsCents;

  const { promotion, discountCents, promoError } = await resolvePromotion({
    code: req.promoCode,
    propertyId: property.id,
    nights,
    checkIn: req.checkIn,
    subtotal,
    guestTier: req.guestTier ?? 'NEW',
  });

  if (promotion && discountCents > 0) {
    lines.push({
      kind: 'DISCOUNT',
      label: `${promotion.name} (${promotion.code})`,
      quantity: 1,
      unitCents: -discountCents,
      amountCents: -discountCents,
    });
  }

  const totalCents = Math.max(0, subtotal - discountCents);
  const depositPercent = Math.min(100, Math.max(0, settings['booking.depositPercent']));
  const depositCents = depositPercent >= 100 ? totalCents : percentOf(totalCents, depositPercent);

  return {
    propertyId: property.id,
    checkIn: req.checkIn,
    checkOut: req.checkOut,
    nights,
    guests,
    nightlyRateCents: averageNightly,
    accommodationCents,
    cleaningFeeCents,
    extraGuestCents,
    addOnsCents,
    discountCents,
    otherFeesCents: 0,
    totalCents,
    depositCents,
    balanceCents: totalCents - depositCents,
    lines,
    promotion: promotion ? { id: promotion.id, code: promotion.code, name: promotion.name } : null,
    promoError,
  };
}

/**
 * Finds the promotion that applies. An explicit code beats an auto-applied one;
 * a code that does not apply reports why rather than silently costing nothing,
 * because a guest who typed a code and saw no change assumes the site is broken.
 */
async function resolvePromotion(args: {
  code?: string;
  propertyId: string;
  nights: number;
  checkIn: DateKey;
  subtotal: number;
  guestTier: 'NEW' | 'REPEAT' | 'VIP';
}) {
  const today = toStayDate(new Date().toISOString().slice(0, 10));
  const stayDate = toStayDate(args.checkIn);

  const applies = (p: {
    minNights: number;
    staysFrom: Date | null;
    staysTo: Date | null;
    bookableFrom: Date | null;
    bookableTo: Date | null;
    maxRedemptions: number;
    redemptions: number;
    audience: string;
    properties: { propertyId: string }[];
  }): string | null => {
    if (args.nights < p.minNights) return `Needs a stay of at least ${p.minNights} nights.`;
    if (p.staysFrom && stayDate < p.staysFrom) return 'Not valid for those dates.';
    if (p.staysTo && stayDate > p.staysTo) return 'Not valid for those dates.';
    if (p.bookableFrom && today < p.bookableFrom) return 'This offer has not started yet.';
    if (p.bookableTo && today > p.bookableTo) return 'This offer has expired.';
    if (p.maxRedemptions > 0 && p.redemptions >= p.maxRedemptions) return 'This offer is fully claimed.';
    if (p.properties.length && !p.properties.some((x) => x.propertyId === args.propertyId)) {
      return 'Not valid for this property.';
    }
    if (p.audience === 'REPEAT' && args.guestTier === 'NEW') return 'For returning guests only.';
    if (p.audience === 'VIP' && args.guestTier !== 'VIP') return 'For VIP guests only.';
    if (p.audience === 'NEW' && args.guestTier !== 'NEW') return 'For first-time guests only.';
    return null;
  };

  if (args.code) {
    const promo = await prisma.promotion.findUnique({
      where: { code: args.code.trim().toUpperCase() },
      include: { properties: { select: { propertyId: true } } },
    });
    if (!promo || !promo.active) {
      return { promotion: null, discountCents: 0, promoError: 'That code is not recognised.' };
    }
    const reason = applies(promo);
    if (reason) return { promotion: null, discountCents: 0, promoError: reason };
    return {
      promotion: promo,
      discountCents: discountAmount(args.subtotal, promo.type, promo.value),
      promoError: undefined,
    };
  }

  const auto = await prisma.promotion.findMany({
    where: { active: true, autoApply: true },
    include: { properties: { select: { propertyId: true } } },
  });
  const eligible = auto.filter((p) => applies(p) === null);
  if (!eligible.length) return { promotion: null, discountCents: 0, promoError: undefined };

  // Best offer for the guest, not the first one someone happened to create.
  const best = eligible
    .map((p) => ({ p, value: discountAmount(args.subtotal, p.type, p.value) }))
    .sort((a, b) => b.value - a.value)[0];

  return { promotion: best.p, discountCents: best.value, promoError: undefined };
}

/**
 * The "from ₱x" on a property card: the cheapest night actually on sale in the
 * next 90 days. A from-price that quotes a rate nobody can book is a lie a
 * guest discovers at the payment step.
 */
export async function fromPrice(propertyId: string, days = 90): Promise<number> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { baseRateCents: true, weekendRateCents: true },
  });
  if (!property) return 0;

  const from = new Date();
  const to = new Date(from.getTime() + days * 86_400_000);
  const overrides = await prisma.rateOverride.findMany({
    where: { propertyId, date: { gte: from, lte: to }, closed: false },
    select: { nightlyRateCents: true },
  });

  const candidates = [property.baseRateCents, ...overrides.map((o) => o.nightlyRateCents)].filter(
    (c) => c > 0,
  );
  return candidates.length ? Math.min(...candidates) : property.baseRateCents;
}
