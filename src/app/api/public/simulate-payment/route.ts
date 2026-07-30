import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { confirmDeposit } from '@/lib/booking';
import { isSimulated } from '@/lib/paymongo';

export const dynamic = 'force-dynamic';

/**
 * Development-only stand-in for the PayMongo checkout page. Refuses to run
 * whenever real gateway credentials are configured, so it can never be used to
 * mark a live booking paid.
 */
export async function POST(req: Request) {
  if (!isSimulated()) {
    return NextResponse.json(
      { error: 'The simulated gateway is disabled because PayMongo keys are configured.' },
      { status: 403 },
    );
  }

  const { reference, outcome } = (await req.json().catch(() => ({}))) as {
    reference?: string;
    outcome?: 'paid' | 'failed';
  };
  if (!reference) return NextResponse.json({ error: 'Reference required.' }, { status: 400 });

  const appt = await prisma.appointment.findUnique({
    where: { reference },
    select: { depositAmountCents: true, depositStatus: true },
  });
  if (!appt) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

  if (outcome === 'failed') {
    await prisma.appointment.update({
      where: { reference },
      data: { depositStatus: 'FAILED' },
    });
    return NextResponse.json({ ok: true, status: 'FAILED' });
  }

  await confirmDeposit({
    reference,
    paidCents: appt.depositAmountCents,
    method: 'gcash (simulated)',
    gatewayPaymentId: `sim_pay_${Date.now()}`,
  });
  return NextResponse.json({ ok: true, status: 'PAID' });
}
