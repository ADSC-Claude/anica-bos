import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { signedUrl } from '@/lib/storage';
import { occasionLabel } from '@/lib/occasions';
import { formatDateTime } from '@/lib/datetime';
import { formatPeso } from '@/lib/money';
import { PageHeader, OrderPill, PaymentPill, Money, BackLink } from '@/components/ui';
import { Flash, type FlashParams } from '../../flash';
import { reviewPaymentAction, refundAction, activateOrderAction, cancelOrderAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const user = await requireStaffPage('orders.view');
  const { id } = await params;
  const sp = await searchParams;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { user: true, package: true, items: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { createdAt: 'desc' }, include: { reviewedBy: { select: { name: true } } } }, invitation: true, dfyJob: true, coupon: true },
  });
  if (!order) notFound();
  const back = `/admin/orders/${order.id}`;
  const proofs = await Promise.all(order.payments.map(async (p) => ({ id: p.id, url: p.proofStoragePath ? await signedUrl(p.proofStoragePath) : p.proofUrl })));
  const proofUrl = (pid: string) => proofs.find((x) => x.id === pid)?.url ?? '';

  return (
    <>
      <BackLink href="/admin/orders">Orders</BackLink>
      <PageHeader title={`Order ${order.reference}`} subtitle={<><OrderPill status={order.status} /> · {order.package.name} · {occasionLabel(order.occasion)} · {order.tier} · {order.serviceMode} · placed {formatDateTime(order.createdAt)}</>} />
      <Flash {...sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Items</h2>
            <ul className="space-y-1 text-sm">{order.items.map((it) => <li key={it.id} className="flex justify-between"><span>{it.name}</span><Money cents={it.amountCents} /></li>)}</ul>
            <div className="mt-2 flex justify-between border-t border-[color:var(--color-sand-200)] pt-2 font-bold"><span>Total</span><Money cents={order.totalCents} /></div>
            {order.coupon && <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">Coupon {order.coupon.code}</p>}
            {order.notes && <p className="mt-2 whitespace-pre-line rounded-lg bg-[color:var(--color-sand-100)] p-2 text-xs">{order.notes}</p>}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Payments</h2>
            {order.payments.length === 0 && <p className="text-sm text-[color:var(--color-ink-500)]">None yet.</p>}
            <ul className="divide-y divide-[color:var(--color-sand-100)]">
              {order.payments.map((p) => (
                <li key={p.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><PaymentPill status={p.status} /> {p.provider === 'MANUAL' ? 'Manual transfer' : 'PayMongo'} {p.channel && `· ${p.channel}`} · <Money cents={p.amountCents} />{p.refundedCents > 0 && <span className="text-[color:var(--bad)]"> · refunded {formatPeso(p.refundedCents)}</span>}</span>
                    <span className="text-xs text-[color:var(--color-ink-500)]">{formatDateTime(p.createdAt)} · {p.reference}</span>
                  </div>
                  {p.provider === 'MANUAL' && (
                    <div className="mt-2 grid gap-3 sm:grid-cols-[10rem_1fr]">
                      {proofUrl(p.id) ? <a href={proofUrl(p.id)} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border border-[color:var(--color-sand-200)]">{proofUrl(p.id).endsWith('.pdf') ? <span className="block p-4 text-center text-xs">Open PDF</span> : <img src={proofUrl(p.id)} alt="Proof of payment" className="h-40 w-full object-cover" />}</a> : <span className="text-xs">No file</span>}
                      <div className="text-xs">
                        <p>Payer: <b>{p.payerName || '—'}</b> · Ref: {p.payerReference || '—'}</p>
                        {p.reviewedBy && <p>Reviewed by {p.reviewedBy.name} {p.reviewedAt && formatDateTime(p.reviewedAt)}{p.rejectReason && ` — ${p.rejectReason}`}</p>}
                        {p.status === 'PENDING' && can(user.role, 'payments.review') && (
                          <form action={reviewPaymentAction.bind(null, p.id, back)} className="mt-2 flex flex-wrap items-center gap-2">
                            <input name="reason" placeholder="Reason (for rejection)" className="field max-w-xs" />
                            <button name="decision" value="approve" className="btn btn-primary btn-sm" type="submit">Approve</button>
                            <button name="decision" value="reject" className="btn btn-danger btn-sm" type="submit">Reject</button>
                          </form>
                        )}
                      </div>
                    </div>
                  )}
                  {p.failureReason && <p className="mt-1 text-xs text-[color:var(--bad)]">{p.failureReason}</p>}
                  {p.status === 'PAID' && p.amountCents - p.refundedCents > 0 && can(user.role, 'payments.refund') && (
                    <details className="mt-2 text-xs"><summary className="cursor-pointer underline">Refund</summary>
                      <form action={refundAction.bind(null, p.id, back)} className="mt-2 flex flex-wrap gap-2">
                        <input name="amount" type="number" step="0.01" min="1" max={(p.amountCents - p.refundedCents) / 100} defaultValue={(p.amountCents - p.refundedCents) / 100} className="field max-w-[8rem]" required />
                        <input name="reason" placeholder="Reason" className="field max-w-xs" required />
                        <button className="btn btn-danger btn-sm" type="submit">Refund</button>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-3">
          <section className="card p-4 text-sm">
            <h2 className="mb-1 font-semibold">Customer</h2>
            <p><Link href={`/admin/customers/${order.userId}`} className="underline">{order.user.name}</Link></p>
            <p className="text-xs text-[color:var(--color-ink-500)]">{order.user.email}{order.user.phone && ` · ${order.user.phone}`}</p>
          </section>
          {order.invitation && (
            <section className="card p-4 text-sm">
              <h2 className="mb-1 font-semibold">Invitation</h2>
              <p><Link href={`/admin/invitations/${order.invitation.id}`} className="underline">{order.invitation.title}</Link> · {order.invitation.status.toLowerCase()}</p>
              {order.dfyJob && <p className="mt-1"><Link href={`/admin/dfy/${order.dfyJob.id}`} className="underline">DFY job</Link> · {order.dfyJob.status.toLowerCase().replace(/_/g, ' ')}</p>}
            </section>
          )}
          {order.status === 'PENDING_PAYMENT' && (
            <section className="card space-y-2 p-4 text-sm">
              {can(user.role, 'payments.review') && <form action={activateOrderAction.bind(null, order.id, back)}><button className="btn btn-secondary btn-sm w-full" type="submit">Mark paid & activate (cash / other)</button></form>}
              {can(user.role, 'orders.edit') && <form action={cancelOrderAction.bind(null, order.id, back)} className="flex gap-1"><input name="reason" placeholder="Reason" className="field" /><button className="btn btn-danger btn-sm" type="submit">Cancel</button></form>}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
