import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 1_500_000; // ~1.5 MB — plenty for a phone screenshot

/**
 * Manual-transfer fallback: the visitor uploads a screenshot of their GCash /
 * bank payment. Stored inline as a data URL so the app needs no object store;
 * it appears immediately on the receptionist's dashboard for one-tap verify.
 */
export async function POST(req: Request) {
  const settings = await getSettings();
  if (!settings['booking.manualFallbackEnabled']) {
    return NextResponse.json(
      { error: 'Manual transfer is turned off. Please pay online instead.' },
      { status: 400 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });

  const reference = String(form.get('reference') ?? '');
  const refNumber = String(form.get('refNumber') ?? '').trim();
  const file = form.get('proof');

  if (!reference) return NextResponse.json({ error: 'Reference required.' }, { status: 400 });
  if (!refNumber) {
    return NextResponse.json(
      { error: 'Enter the reference number shown on your GCash or bank receipt.' },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Attach a photo of your payment.' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'The proof must be an image.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'That image is too large. Please upload one under 1.5 MB.' },
      { status: 413 },
    );
  }

  const appointment = await prisma.appointment.findUnique({
    where: { reference },
    include: { client: true },
  });
  if (!appointment) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  if (appointment.depositStatus === 'PAID') {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      depositProofUrl: dataUrl,
      depositReference: refNumber,
      depositStatus: 'AWAITING_VERIFICATION',
      depositMethod: 'manual transfer',
    },
  });

  await notify({
    kind: 'DEPOSIT_TO_VERIFY',
    title: `Deposit to verify — ${appointment.client.name}`,
    body: `Ref ${refNumber} · booking ${reference}`,
    link: `/portal/appointments/${appointment.id}`,
    dedupeKey: `deposit-verify:${appointment.id}`,
    branchId: appointment.branchId,
    roles: ['RECEPTIONIST', 'ADMIN', 'OWNER'],
  });

  return NextResponse.json({ ok: true });
}
