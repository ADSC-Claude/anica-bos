import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, jsonBody, HttpError } from '@/lib/guard';
import { isSimulated } from '@/lib/paymongo';
import { applyGatewayPayment } from '@/lib/payments';
import { prisma } from '@/lib/db';

const body = z.object({ reference: z.string().min(3) });

/**
 * The local stand-in for PayMongo, used when no gateway key is set.
 *
 * It posts through `applyGatewayPayment` — the same function the real webhook
 * calls — so the code path under test is the production one and only the
 * gateway is stubbed. It refuses to exist in production.
 */
export const POST = handle(async (req) => {
  if (!isSimulated() || process.env.NODE_ENV === 'production') {
    throw new HttpError(404, 'Not found.');
  }

  const { reference } = await jsonBody(req, body);
  const payment = await prisma.payment.findFirst({
    where: { reservation: { reference } , status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment) throw new HttpError(404, 'No payment is waiting on that booking.');

  const result = await applyGatewayPayment({
    reference: payment.reference,
    gatewayEventId: `sim_evt_${payment.id}`,
    gatewayPaymentId: `sim_pay_${payment.id}`,
    amountCents: payment.amountCents,
  });

  return NextResponse.json({ ok: true, applied: result.applied });
});
