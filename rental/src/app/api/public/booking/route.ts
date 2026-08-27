import { z } from 'zod';
import { handle, jsonBody, HttpError } from '@/lib/guard';
import { createReservation } from '@/lib/reservations';
import { startCheckout } from '@/lib/payments';
import { getSettings } from '@/lib/settings';
import { assertPublicSiteOpen } from '@/lib/public-site';
import { prisma } from '@/lib/db';

const body = z.object({
  propertyId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(30),
  children: z.number().int().min(0).max(30).optional(),
  addOns: z.array(z.object({ addOnId: z.string(), quantity: z.number().int().min(0).max(20) })).optional(),
  promoCode: z.string().max(40).optional(),
  specialRequests: z.string().max(1000).optional(),
  guest: z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().max(80).optional(),
    email: z.string().email(),
    mobile: z.string().min(7).max(30),
    country: z.string().max(2).optional(),
    marketingConsent: z.boolean().optional(),
  }),
  acceptedRules: z.literal(true),
});

/**
 * Creates the booking and opens a payment session.
 *
 * The reservation and its calendar span go in together, in one transaction, so
 * a collision leaves nothing behind. Only after that commits do we talk to
 * PayMongo — a gateway session for dates we do not hold would be a charge we
 * could not honour.
 */
export const POST = handle(async (req) => {
  await assertPublicSiteOpen();
  const input = await jsonBody(req, body);
  const settings = await getSettings();

  const created = await createReservation({
    propertyId: input.propertyId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    children: input.children,
    addOns: input.addOns,
    promoCode: input.promoCode,
    specialRequests: input.specialRequests,
    guest: input.guest,
    source: 'DIRECT',
    status: 'PENDING',
  });

  let checkout;
  try {
    checkout = await startCheckout(created.id);
  } catch (err) {
    // The dates are held but we cannot take money. Leave the reservation
    // PENDING — the hold expires on its own within the window — and tell the
    // guest plainly rather than showing a broken gateway page.
    if (err instanceof HttpError && err.status === 400) {
      const r = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
      return {
        reference: r.reference,
        totalCents: created.totalCents,
        payLater: true,
        message: err.message,
      };
    }
    throw err;
  }

  return {
    reference: created.reference,
    totalCents: created.totalCents,
    dueNowCents: checkout.amountCents,
    balanceCents: created.totalCents - checkout.amountCents,
    checkoutUrl: checkout.checkoutUrl,
    simulated: checkout.simulated,
    holdMinutes: settings['booking.holdMinutes'],
  };
});
