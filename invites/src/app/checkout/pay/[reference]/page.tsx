import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { isSimulated, MIN_CHARGE_CENTS } from '@/lib/paymongo';
import { OrderPill, PaymentPill, Notice } from '@/components/ui';
import { PayOnlineButton, ProofForm } from './forms';

export const metadata = { title: 'Pay for your order', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PayPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const { reference } = await params;
  const { cancelled } = await searchParams;
  const user = await requireUser(`/checkout/pay/${reference}`);
  const order = await prisma.order.findUnique({
    where: { reference },
    include: { items: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { createdAt: 'desc' } }, package: true },
  });
  if (!order || order.userId !== user.id) notFound();
  if (order.status !== 'PENDING_PAYMENT') redirect(`/checkout/confirm/${reference}`);

  const s = await getSettings();
  const pendingProof = order.payments.find((p) => p.provider === 'MANUAL' && p.status === 'PENDING');
  const rejected = order.payments.find((p) => p.provider === 'MANUAL' && p.status === 'REJECTED');
  const onlineOk = order.totalCents >= MIN_CHARGE_CENTS;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link href="/account" className="text-sm text-[color:var(--color-plum-600)] hover:underline">← My invitations</Link>
      <h1 className="display mt-2 text-3xl">Pay for order {order.reference}</h1>
      <p className="mt-1 text-sm text-[color:var(--color-ink-500)]"><OrderPill status={order.status} /> · {order.package.name}</p>

      {cancelled && <div className="mt-4"><Notice tone="warn">Payment was cancelled. Nothing was charged — you can try again below.</Notice></div>}
      {rejected && !pendingProof && <div className="mt-4"><Notice tone="bad">We could not verify your last screenshot{rejected.rejectReason ? `: ${rejected.rejectReason}` : ''}. Please upload a clearer one, or pay online.</Notice></div>}

      <div className="card mt-6 p-5">
        <ul className="space-y-1 text-sm">
          {order.items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3"><span>{it.name}</span><span className="tabular-nums">{it.amountCents < 0 ? '−' : ''}{formatPeso(Math.abs(it.amountCents))}</span></li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-[color:var(--color-sand-200)] pt-3 text-lg font-bold"><span>Total due</span><span className="tabular-nums">{formatPeso(order.totalCents)}</span></div>
      </div>

      {pendingProof ? (
        <div className="card mt-6 p-5">
          <h2 className="font-semibold">We received your proof of payment</h2>
          <p className="mt-1 text-sm text-[color:var(--color-ink-700)]">
            <PaymentPill status={pendingProof.status} /> {pendingProof.channel} · {pendingProof.payerName}. {s['payments.manualNote']}
          </p>
          <p className="mt-3 text-sm">You will get an email and a notification the moment it is verified. <Link href={`/checkout/confirm/${reference}`} className="underline">Check status</Link></p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <section className="card p-5">
            <p className="eyebrow mb-1">Option 1</p>
            <h2 className="font-semibold">Pay online — GCash, Maya, card, online banking</h2>
            <p className="mt-1 text-sm text-[color:var(--color-ink-700)]">Instant. Your invitation unlocks the moment the payment goes through.</p>
            {onlineOk ? <PayOnlineButton reference={reference} simulated={isSimulated()} /> : <p className="mt-3 text-sm text-[color:var(--color-ink-500)]">Online payments start at {formatPeso(MIN_CHARGE_CENTS)}. Use a transfer for this amount.</p>}
          </section>
          {s['payments.manualEnabled'] && (
            <section className="card p-5">
              <p className="eyebrow mb-1">Option 2</p>
              <h2 className="font-semibold">Transfer, then upload your screenshot</h2>
              <p className="mt-1 text-sm text-[color:var(--color-ink-700)]">Send the exact amount to any of these, then upload the receipt. Verified by a person during business hours.</p>
              <dl className="mt-3 space-y-2 text-sm">
                {s['payments.gcashNumber'] && (
                  <div className="rounded-xl bg-[color:var(--color-sand-100)] p-3">
                    <dt className="font-semibold">GCash</dt>
                    <dd>{s['payments.gcashName']} · <span className="tabular-nums">{s['payments.gcashNumber']}</span></dd>
                    {s['payments.gcashQrUrl'] && <dd><img src={s['payments.gcashQrUrl']} alt="GCash QR" className="mt-2 w-40 rounded-lg" /></dd>}
                  </div>
                )}
                {s['payments.mayaNumber'] && (
                  <div className="rounded-xl bg-[color:var(--color-sand-100)] p-3">
                    <dt className="font-semibold">Maya</dt>
                    <dd>{s['payments.mayaName']} · <span className="tabular-nums">{s['payments.mayaNumber']}</span></dd>
                  </div>
                )}
                {s['payments.bankAccounts'].map((b) => (
                  <div key={b.bank + b.number} className="rounded-xl bg-[color:var(--color-sand-100)] p-3">
                    <dt className="font-semibold">{b.bank}</dt>
                    <dd>{b.name} · <span className="tabular-nums">{b.number}</span></dd>
                  </div>
                ))}
              </dl>
              <ProofForm reference={reference} channels={['GCash', 'Maya', ...s['payments.bankAccounts'].map((b) => b.bank)]} />
            </section>
          )}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-[color:var(--color-ink-500)]">Stuck? Message us on <a href={s['contact.messenger']} className="underline">Messenger</a> with your order number.</p>
    </main>
  );
}
