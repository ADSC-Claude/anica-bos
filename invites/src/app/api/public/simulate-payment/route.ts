import { z } from 'zod';
import { handle, jsonBody, HttpError } from '@/lib/guard';
import { isSimulated } from '@/lib/paymongo';
import { applyGatewayPayment } from '@/lib/payments';
import { prisma } from '@/lib/db';

const body = z.object({ reference: z.string().min(3), channel: z.string().max(20).optional() });

/** The local stand-in for PayMongo. Posts through the same function the real webhook calls. Refuses to exist in production. */
export const POST = handle(async (req) => {
  if (!isSimulated() || process.env.NODE_ENV === 'production') throw new HttpError(404, 'Not found.');
  const { reference, channel } = await jsonBody(req, body);
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment || payment.status !== 'PENDING') throw new HttpError(404, 'No payment is waiting on that reference.');
  const result = await applyGatewayPayment({
    reference: payment.reference,
    gatewayEventId: `sim_evt_${payment.id}`,
    gatewayPaymentId: `sim_pay_${payment.id}`,
    amountCents: payment.amountCents,
    channel: channel ?? 'GCash',
  });
  return { ok: true, applied: result.applied };
});
