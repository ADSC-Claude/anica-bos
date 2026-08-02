import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * PayMongo Checkout Sessions — the standard PH gateway for small businesses
 * (GCash, Maya, cards, online banking) with no monthly fee.
 *
 * When PAYMONGO_SECRET_KEY is unset the module runs in SIMULATED mode: it
 * returns a local checkout URL so the whole booking → deposit → confirm flow
 * is exercisable in development without gateway credentials.
 */

const API = 'https://api.paymongo.com/v1';

export function gatewayMode(): 'live' | 'test' | 'simulated' {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) return 'simulated';
  return key.startsWith('sk_live_') ? 'live' : 'test';
}

export function isSimulated(): boolean {
  return gatewayMode() === 'simulated';
}

function authHeader(): string {
  const key = process.env.PAYMONGO_SECRET_KEY ?? '';
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

export type CheckoutSession = {
  id: string;
  checkoutUrl: string;
  simulated: boolean;
};

export async function createCheckoutSession(opts: {
  amountCents: number;
  description: string;
  reference: string;
  lineName: string;
  successUrl: string;
  cancelUrl: string;
  customer?: { name?: string; email?: string; phone?: string };
}): Promise<CheckoutSession> {
  if (isSimulated()) {
    return {
      id: `sim_${opts.reference}`,
      checkoutUrl: `/book/simulate-payment?ref=${encodeURIComponent(opts.reference)}`,
      simulated: true,
    };
  }

  // PayMongo requires a minimum of ₱20.00 per transaction.
  const amount = Math.max(2000, Math.round(opts.amountCents));

  const res = await fetch(`${API}/checkout_sessions`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            { name: opts.lineName, amount, currency: 'PHP', quantity: 1 },
          ],
          payment_method_types: ['gcash', 'paymaya', 'card', 'dob'],
          description: opts.description,
          reference_number: opts.reference,
          success_url: opts.successUrl,
          cancel_url: opts.cancelUrl,
          send_email_receipt: false,
          show_line_items: true,
          billing: opts.customer
            ? {
                name: opts.customer.name,
                email: opts.customer.email,
                phone: opts.customer.phone,
              }
            : undefined,
        },
      },
    }),
  });

  const json = (await res.json()) as {
    data?: { id: string; attributes: { checkout_url: string } };
    errors?: { detail: string }[];
  };

  if (!res.ok || !json.data) {
    throw new Error(
      `PayMongo checkout failed: ${json.errors?.map((e) => e.detail).join('; ') ?? res.statusText}`,
    );
  }

  return { id: json.data.id, checkoutUrl: json.data.attributes.checkout_url, simulated: false };
}

export async function retrieveCheckoutSession(id: string) {
  if (isSimulated()) return null;
  const res = await fetch(`${API}/checkout_sessions/${id}`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { attributes: Record<string, unknown> } };
  return json.data ?? null;
}

/**
 * PayMongo refunds are issued against a *payment*, never against a checkout
 * session — but which of the two we stored depends on which webhook told us the
 * fee had been paid. `checkout_session.payment.paid` carries the session
 * (`cs_…`), `payment.paid` carries the payment (`pay_…`). Resolve one to the
 * other here rather than making every caller care which arrived first.
 *
 * Returns null when the payment cannot be found, which the caller must treat as
 * "refund this by hand" rather than as a failure to record.
 */
export async function resolvePaymentId(storedId: string): Promise<string | null> {
  const id = storedId.trim();
  if (!id) return null;
  if (id.startsWith('pay_')) return id;
  if (!id.startsWith('cs_')) return null;

  const session = await retrieveCheckoutSession(id);
  const payments = (session?.attributes as { payments?: { id?: string }[] } | undefined)?.payments;
  return payments?.find((p) => p.id)?.id ?? null;
}

export type RefundResult = { id: string; status: string; simulated: boolean };

/**
 * Sends money back for a payment already taken.
 *
 * PayMongo will not refund less than ₱1.00, and a refund on an e-wallet can sit
 * `pending` for days before it settles — so `status` is reported rather than
 * assumed, and the `payment.refunded` webhook is what confirms it later.
 */
export async function createRefund(opts: {
  paymentId: string;
  amountCents: number;
  /** PayMongo's fixed vocabulary. A guest changing her mind is the usual one. */
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'others';
  notes?: string;
  /** Booking reference, carried in metadata so the webhook can find its way home. */
  reference?: string;
}): Promise<RefundResult> {
  if (isSimulated()) {
    return { id: `sim_refund_${opts.reference || opts.paymentId}`, status: 'succeeded', simulated: true };
  }

  const res = await fetch(`${API}/refunds`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        attributes: {
          payment_id: opts.paymentId,
          amount: Math.round(opts.amountCents),
          reason: opts.reason ?? 'requested_by_customer',
          // The field is capped at 255 characters and PayMongo rejects anything
          // longer outright, so trim rather than risk losing the whole refund.
          notes: (opts.notes ?? '').slice(0, 255),
          ...(opts.reference ? { metadata: { reference: opts.reference } } : {}),
        },
      },
    }),
  });

  const json = (await res.json()) as {
    data?: { id: string; attributes?: { status?: string } };
    errors?: { detail: string }[];
  };
  if (!res.ok || !json.data) {
    throw new Error(
      `PayMongo refund failed: ${json.errors?.map((e) => e.detail).join('; ') ?? res.statusText}`,
    );
  }
  return { id: json.data.id, status: json.data.attributes?.status ?? 'pending', simulated: false };
}

/**
 * Verifies the `paymongo-signature` header:
 *   t=<unix>,te=<test sig>,li=<live sig>
 * Signature = HMAC-SHA256(`${t}.${rawBody}`, webhookSecret).
 * Client-reported payment status is never trusted — only this.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(',').map((chunk) => {
      const [k, v] = chunk.split('=');
      return [k?.trim(), v?.trim()];
    }),
  ) as Record<string, string | undefined>;

  const timestamp = parts.t;
  const provided = gatewayMode() === 'live' ? parts.li : parts.te;
  if (!timestamp || !provided) return false;

  // Reject replays older than 5 minutes.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
