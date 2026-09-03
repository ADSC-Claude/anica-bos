import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownOrder } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, OrderPill, PaymentPill, Money, BackLink } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const order = await ownOrder(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  return (
    <>
      <BackLink href="/account/orders">Orders</BackLink>
      <PageHeader title={`Order ${order.reference}`} subtitle={<><OrderPill status={order.status} /> · placed {formatDateTime(order.createdAt)}</>} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-2 font-semibold">Receipt</h2>
          <ul className="space-y-1 text-sm">
            {order.items.map((it) => <li key={it.id} className="flex justify-between gap-3"><span>{it.name}</span><Money cents={it.amountCents} /></li>)}
          </ul>
          <div className="mt-3 flex justify-between border-t border-[color:var(--color-sand-200)] pt-3 font-bold"><span>Total</span><Money cents={order.totalCents} /></div>
          {order.status === 'PENDING_PAYMENT' && <Link href={`/checkout/pay/${order.reference}`} className="btn btn-primary mt-4 w-full">Pay now</Link>}
        </div>
        <div className="card p-5">
          <h2 className="mb-2 font-semibold">Payments</h2>
          {order.payments.length === 0 ? <p className="text-sm text-[color:var(--color-ink-500)]">No payment yet.</p> : (
            <ul className="space-y-2 text-sm">
              {order.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2">
                  <span>{p.provider === 'MANUAL' ? 'Transfer' : 'Online'} {p.channel && `· ${p.channel}`}<span className="block text-xs text-[color:var(--color-ink-500)]">{formatDateTime(p.createdAt)}{p.rejectReason ? ` · ${p.rejectReason}` : ''}</span></span>
                  <span className="text-right"><Money cents={p.amountCents} /> <PaymentPill status={p.status} /></span>
                </li>
              ))}
            </ul>
          )}
          {order.invitation && <p className="mt-4 text-sm"><Link href={`/account/invitations/${order.invitation.id}`} className="underline">Open the invitation</Link></p>}
        </div>
      </div>
    </>
  );
}
