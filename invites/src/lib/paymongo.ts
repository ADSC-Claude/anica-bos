import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * PayMongo Checkout Sessions — GCash, Maya, cards and online banking with no
 * monthly fee, which is why it is the gateway every small PH business uses.
 *
 * Sessions rather than Payment Intents, deliberately: the session is a hosted
 * page, so we never render a card field and no card number reaches our servers
 * or our logs.
 *
 * With PAYMONGO_SECRET_KEY unset the module runs SIMULATED: it returns a local
 * checkout URL that posts through the real webhook handler with a synthetic
 * payload. The code path under test is the real one; only the gateway is
 * stubbed.
 */

const API = 'https://api.paymongo.com/v1';

/** PayMongo declines below ₱20.00 and refuses refunds below ₱1.00. */
export const MIN_CHARGE_CENTS = 2000;
export const MIN_REFUND_CENTS = 100;

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

export type CheckoutSession = { id: string; checkoutUrl: string; simulated: boolean };

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
      checkoutUrl: `/checkout/simulate-payment?ref=${encodeURIComponent(opts.reference)}`,
      simulated: true,
    };
  }

  const amount = Math.max(MIN_CHARGE_CENTS, Math.round(opts.amountCents));

  const res = await fetch(`${API}/checkout_sessions`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ name: opts.lineName, amount, currency: 'PHP', quantity: 1 }],
          payment_method_types: ['gcash', 'paymaya', 'card', 'dob', 'qrph'],
          description: opts.description,
          reference_number: opts.reference,
          success_url: opts.successUrl,
          cancel_url: opts.cancelUrl,
          send_email_receipt: false,
          show_line_items: true,
          billing: opts.customer
            ? { name: opts.customer.name, email: opts.customer.email, phone: opts.customer.phone }
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
 * Refunds are issued against a *payment* (`pay_…`), never a checkout session —
 * but which of the two we hold depends on which webhook arrived first.
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

export async function createRefund(opts: {
  paymentId: string;
  amountCents: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'others';
  notes?: string;
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
 * Verifies `paymongo-signature: t=<unix>,te=<test sig>,li=<live sig>`.
 * Signature = HMAC-SHA256(`${t}.${rawBody}`, webhookSecret).
 *
 * Client-reported payment status is never trusted anywhere in this system —
 * only this.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header.split(',').map((chunk) => {
      const [k, v] = chunk.split('=');
      return [k?.trim(), v?.trim()];
    }),
  ) as Record<string, string | undefined>;

  const timestamp = parts.t;
  const provided = gatewayMode() === 'live' ? parts.li : parts.te;
  if (!timestamp || !provided) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
