import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/paymongo';
import { confirmDeposit } from '@/lib/booking';

export const dynamic = 'force-dynamic';

/**
 * PayMongo webhook. The signature is verified against the raw body before the
 * payload is trusted — a client-reported "paid" status is never accepted.
 *
 * Register with:
 *   curl -u sk_test_xxx: https://api.paymongo.com/v1/webhooks \
 *     -d '{"data":{"attributes":{"url":"https://YOUR_APP/api/webhooks/paymongo",
 *          "events":["checkout_session.payment.paid","payment.paid","payment.failed"]}}}'
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('paymongo-signature');

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let payload: {
    data?: {
      attributes?: {
        type?: string;
        data?: {
          id?: string;
          attributes?: Record<string, unknown>;
        };
      };
    };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const eventType = payload.data?.attributes?.type ?? '';
  const resource = payload.data?.attributes?.data;
  const attributes = (resource?.attributes ?? {}) as Record<string, unknown>;

  // The booking reference travels on the checkout session's reference_number,
  // and on payments via their description / metadata.
  const reference =
    (attributes.reference_number as string | undefined) ??
    ((attributes.metadata as Record<string, string> | undefined)?.reference ?? undefined) ??
    extractReferenceFromPayments(attributes);

  if (!reference) {
    return NextResponse.json({ received: true, note: 'No booking reference on event.' });
  }

  if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid') {
    const paidCents =
      Number(
        (attributes.amount as number | undefined) ??
          extractPaidAmount(attributes) ??
          0,
      ) || 0;

    const appointment = await prisma.appointment.findUnique({
      where: { reference },
      select: { depositAmountCents: true },
    });

    await confirmDeposit({
      reference,
      paidCents: paidCents || appointment?.depositAmountCents || 0,
      method: String(
        (attributes.source as Record<string, string> | undefined)?.type ?? 'paymongo',
      ),
      gatewayPaymentId: String(resource?.id ?? ''),
    });
    return NextResponse.json({ received: true });
  }

  if (eventType === 'payment.failed') {
    await prisma.appointment.updateMany({
      where: { reference, depositStatus: { not: 'PAID' } },
      data: { depositStatus: 'FAILED' },
    });
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true, ignored: eventType });
}

function extractReferenceFromPayments(attributes: Record<string, unknown>): string | undefined {
  const payments = attributes.payments as { attributes?: Record<string, unknown> }[] | undefined;
  for (const p of payments ?? []) {
    const desc = p.attributes?.description;
    if (typeof desc === 'string') {
      const match = desc.match(/ANC-[A-Z0-9]{6}/);
      if (match) return match[0];
    }
  }
  const desc = attributes.description;
  if (typeof desc === 'string') {
    const match = desc.match(/ANC-[A-Z0-9]{6}/);
    if (match) return match[0];
  }
  return undefined;
}

function extractPaidAmount(attributes: Record<string, unknown>): number | undefined {
  const payments = attributes.payments as { attributes?: { amount?: number } }[] | undefined;
  const total = (payments ?? []).reduce((a, p) => a + (p.attributes?.amount ?? 0), 0);
  return total || undefined;
}
