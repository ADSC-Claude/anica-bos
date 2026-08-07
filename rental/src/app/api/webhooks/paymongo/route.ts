import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/paymongo';
import { applyGatewayPayment, markGatewayFailure } from '@/lib/payments';

/**
 * The only thing in this system that marks a payment paid.
 *
 * The browser's return from PayMongo shows a "confirming" state and nothing
 * more — a client that can set PAID is a client that can book for free.
 *
 * Always answers 200 once the signature checks out. A 500 makes PayMongo retry
 * for hours over something a retry cannot fix, and every handler here is
 * idempotent anyway.
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
            payments?: { id?: string; attributes?: { amount?: number; status?: string } }[];
            payment_intent?: { attributes?: { last_payment_error?: string } };
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
        await applyGatewayPayment({
          reference,
          gatewayEventId: eventId,
          gatewayPaymentId: payment?.id,
          amountCents: payment?.attributes?.amount,
        });
        break;
      }
      case 'payment.paid': {
        await applyGatewayPayment({
          reference,
          gatewayEventId: eventId,
          gatewayPaymentId: payload?.id,
          amountCents: attrs.amount,
        });
        break;
      }
      case 'payment.failed': {
        await markGatewayFailure(
          reference,
          attrs.last_payment_error ?? attrs.payment_intent?.attributes?.last_payment_error ?? 'Payment declined.',
        );
        break;
      }
      case 'payment.refunded':
        // Refunds are recorded when we issue them; this confirms settlement,
        // which the ledger already reflects.
        break;
      default:
        break;
    }
  } catch (err) {
    // Logged, not retried: the ledger is append-only and a retry storm on a
    // logic error helps nobody.
    console.error('[paymongo webhook]', type, err);
  }

  return NextResponse.json({ received: true });
}
