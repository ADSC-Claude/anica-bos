import { z } from 'zod';
import { handle, jsonBody } from '@/lib/guard';
import { quote } from '@/lib/pricing';

const body = z.object({
  propertyId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(30),
  children: z.number().int().min(0).max(30).optional(),
  addOns: z.array(z.object({ addOnId: z.string(), quantity: z.number().int().min(0).max(20) })).optional(),
  promoCode: z.string().max(40).optional(),
});

/**
 * The only price that counts. Whatever the browser is showing, this is what the
 * booking endpoint will charge — the two go through the same function, so they
 * cannot drift.
 */
export const POST = handle(async (req) => {
  const input = await jsonBody(req, body);
  return quote(input);
});
