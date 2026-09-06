import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { signedUrl } from '@/lib/storage';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, Money, Empty, PaymentPill } from '@/components/ui';
import { Flash, type FlashParams } from '../flash';
import { reviewPaymentAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  await requireStaffPage('payments.review');
  const sp = await searchParams;
  const [pending, recent] = await Promise.all([
    prisma.payment.findMany({ where: { provider: 'MANUAL', status: 'PENDING' }, include: { order: { include: { user: true, package: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.payment.findMany({ where: { status: { in: ['PAID', 'REJECTED', 'FAILED', 'REFUNDED'] } }, include: { order: { include: { user: true } } }, orderBy: { updatedAt: 'desc' }, take: 30 }),
  ]);
  const urls = await Promise.all(pending.map((p) => (p.proofStoragePath ? signedUrl(p.proofStoragePath) : Promise.resolve(p.proofUrl))));
  return (
    <>
      <PageHeader title="Payments" subtitle={`${pending.length} proof${pending.length === 1 ? '' : 's'} waiting for verification`} />
      <Flash {...sp} />
      {pending.length === 0 ? <Empty>Nothing to verify. Manual transfers appear here the moment a customer uploads a screenshot.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {pending.map((p, i) => (
            <section key={p.id} className="card p-4 text-sm">
              <div className="flex justify-between gap-2"><span className="font-semibold"><Link href={`/admin/orders/${p.orderId}`} className="underline">{p.order.reference}</Link> · <Money cents={p.amountCents} /></span><span className="text-xs text-[color:var(--color-ink-500)]">{formatDateTime(p.createdAt)}</span></div>
              <p className="text-xs text-[color:var(--color-ink-500)]">{p.order.user.name} · {p.order.package.name} · {p.channel} · payer {p.payerName}{p.payerReference && ` · ref ${p.payerReference}`}</p>
              {urls[i] && <a href={urls[i]!} target="_blank" rel="noopener" className="mt-2 block overflow-hidden rounded-lg border border-[color:var(--color-sand-200)]">{urls[i]!.endsWith('.pdf') ? <span className="block p-6 text-center text-xs">Open PDF</span> : <img src={urls[i]!} alt="Proof" className="max-h-72 w-full object-contain bg-[color:var(--color-sand-100)]" />}</a>}
              <form action={reviewPaymentAction.bind(null, p.id, '/admin/payments')} className="mt-3 flex flex-wrap gap-2">
                <input name="reason" placeholder="Reason, if rejecting" className="field" />
                <button name="decision" value="approve" className="btn btn-primary btn-sm" type="submit">Approve</button>
                <button name="decision" value="reject" className="btn btn-danger btn-sm" type="submit">Reject</button>
              </form>
            </section>
          ))}
        </div>
      )}
      <h2 className="mt-8 mb-2 font-semibold">Recent</h2>
      <div className="card overflow-x-auto">
        <table className="data">
          <thead><tr><th>Order</th><th>Customer</th><th>Via</th><th>Amount</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>{recent.map((p) => <tr key={p.id}><td><Link href={`/admin/orders/${p.orderId}`} className="font-mono underline">{p.order.reference}</Link></td><td>{p.order.user.name}</td><td>{p.provider === 'MANUAL' ? 'Transfer' : 'PayMongo'} {p.channel}</td><td><Money cents={p.amountCents} /></td><td><PaymentPill status={p.status} /></td><td className="text-xs">{formatDateTime(p.updatedAt)}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
