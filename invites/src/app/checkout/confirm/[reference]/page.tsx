import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { OrderPill, PaymentPill } from '@/components/ui';

export const metadata = { title: 'Order status', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Where PayMongo sends the customer back, and where a manual payer waits.
 * It reads status and never writes it: the webhook and the admin do that.
 * While a gateway payment is still settling the page refreshes itself.
 */
export default async function ConfirmPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const user = await requireUser(`/checkout/confirm/${reference}`);
  const order = await prisma.order.findUnique({
    where: { reference },
    include: { payments: { orderBy: { createdAt: 'desc' } }, invitation: true, dfyJob: true, package: true },
  });
  if (!order || order.userId !== user.id) notFound();
  const s = await getSettings();
  const latest = order.payments[0];
  const active = order.status === 'ACTIVE' || order.status === 'PAID';
  const waitingGateway = order.status === 'PENDING_PAYMENT' && latest?.provider === 'PAYMONGO' && latest.status === 'PENDING';
  const waitingProof = order.status === 'PENDING_PAYMENT' && latest?.provider === 'MANUAL' && latest.status === 'PENDING';
  const dfy = order.serviceMode !== 'DIY';

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12 text-center">
      {waitingGateway && <meta httpEquiv="refresh" content="5" />}
      <p className="eyebrow mb-3">Order {order.reference}</p>
      {active ? (
        <>
          <h1 className="display text-3xl">Payment confirmed — salamat!</h1>
          <p className="mt-3 text-[color:var(--color-ink-700)]">
            {dfy
              ? 'Next, tell us the details. Fill in the intake form, or send everything over Messenger or Viber — whichever is easier.'
              : 'Your builder is unlocked. Fill in the sections at your own pace; everything saves as you go.'}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {order.invitation && (
              <Link href={dfy ? `/account/invitations/${order.invitation.id}/dfy` : `/account/invitations/${order.invitation.id}/builder`} className="btn btn-primary">
                {dfy ? 'Open the intake form' : 'Start building'}
              </Link>
            )}
            <Link href="/account" className="btn btn-secondary">Go to my dashboard</Link>
          </div>
        </>
      ) : waitingProof ? (
        <>
          <h1 className="display text-3xl">We&rsquo;re verifying your payment</h1>
          <p className="mt-3 text-[color:var(--color-ink-700)]">{s['payments.manualNote']}</p>
          <p className="mt-2 text-sm"><PaymentPill status="PENDING" /> {latest.channel} · {latest.payerName}</p>
          <Link href="/account" className="btn btn-secondary mt-6">Go to my dashboard</Link>
        </>
      ) : waitingGateway ? (
        <>
          <h1 className="display text-3xl">Confirming your payment…</h1>
          <p className="mt-3 text-[color:var(--color-ink-700)]">This usually takes a few seconds. The page refreshes on its own.</p>
          <p className="mt-6 text-xs text-[color:var(--color-ink-500)]">Took the wrong turn? <Link href={`/checkout/pay/${reference}`} className="underline">Back to payment options</Link></p>
        </>
      ) : (
        <>
          <h1 className="display text-3xl">Order {order.status.toLowerCase().replace('_', ' ')}</h1>
          <p className="mt-2"><OrderPill status={order.status} /></p>
          {order.status === 'PENDING_PAYMENT' && <Link href={`/checkout/pay/${reference}`} className="btn btn-primary mt-6">Choose how to pay</Link>}
          <Link href="/account" className="btn btn-secondary mt-3">Go to my dashboard</Link>
        </>
      )}
    </main>
  );
}
