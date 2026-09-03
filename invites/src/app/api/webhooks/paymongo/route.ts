import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/paymongo';
import { applyGatewayPayment, markGatewayFailure } from '@/lib/payments';

/**
 * The only thing in this system that marks a gateway payment paid. Always
 * answers 200 once the signature checks out — a 500 makes PayMongo retry for
 * hours over something a retry cannot fix, and every handler is idempotent.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('paymongo-signature'))) {
    return NextResponse.json({ error: 'Bad signature.' }, { status: 401 });
  }

  let event: {
    data?: {
      id?: string;
      attributes?: {
        type?: string;
        data?: {
          id?: string;
          attributes?: {
            reference_number?: string;
            amount?: number;
            status?: string;
            last_payment_error?: string;
            source?: { type?: string };
            payments?: { id?: string; attributes?: { amount?: number; status?: string; source?: { type?: string } } }[];
          };
        };
      };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Malformed body.' }, { status: 400 });
  }

  const eventId = event.data?.id ?? '';
  const type = event.data?.attributes?.type ?? '';
  const payload = event.data?.attributes?.data;
  const attrs = payload?.attributes ?? {};
  const reference = attrs.reference_number ?? '';

  try {
    switch (type) {
      case 'checkout_session.payment.paid': {
        const payment = attrs.payments?.find((p) => p.attributes?.status === 'paid') ?? attrs.payments?.[0];
        await applyGatewayPayment({ reference, gatewayEventId: eventId, gatewayPaymentId: payment?.id, amountCents: payment?.attributes?.amount, channel: payment?.attributes?.source?.type });
        break;
      }
      case 'payment.paid':
        await applyGatewayPayment({ reference, gatewayEventId: eventId, gatewayPaymentId: payload?.id, amountCents: attrs.amount, channel: attrs.source?.type });
        break;
      case 'payment.failed':
        await markGatewayFailure(reference, attrs.last_payment_error ?? 'Payment declined.');
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('[paymongo webhook]', type, err);
  }
  return NextResponse.json({ received: true });
}
