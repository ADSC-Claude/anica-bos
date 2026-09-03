import Link from 'next/link';
import type { OrderStatus } from '@prisma/client';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { occasionLabel } from '@/lib/occasions';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, OrderPill, Money, Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';
const STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'PAID', 'ACTIVE', 'CANCELLED', 'REFUNDED'];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireStaffPage('orders.view');
  const { status, q } = await searchParams;
  const orders = await prisma.order.findMany({
    where: {
      ...(status && STATUSES.includes(status as OrderStatus) ? { status: status as OrderStatus } : {}),
      ...(q ? { OR: [{ reference: { contains: q.toUpperCase() } }, { user: { name: { contains: q, mode: 'insensitive' } } }, { user: { email: { contains: q, mode: 'insensitive' } } }] } : {}),
    },
    include: { user: { select: { name: true, email: true } }, package: { select: { name: true } }, payments: { select: { provider: true, status: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Orders" subtitle={`${orders.length} shown`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Reference, name or email" className="field max-w-xs" />
        <select name="status" defaultValue={status ?? ''} className="field max-w-[12rem]"><option value="">Any status</option>{STATUSES.map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}</select>
        <button className="btn btn-secondary" type="submit">Filter</button>
      </form>
      {orders.length === 0 ? <Empty>No orders match.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr><th>Reference</th><th>Customer</th><th>Package</th><th>Total</th><th>Status</th><th>Payment</th><th>Placed</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/orders/${o.id}`} className="font-mono underline">{o.reference}</Link></td>
                  <td>{o.user.name}<span className="block text-xs text-[color:var(--color-ink-500)]">{o.user.email}</span></td>
                  <td>{o.package.name}<span className="block text-xs text-[color:var(--color-ink-500)]">{occasionLabel(o.occasion)} · {o.serviceMode}</span></td>
                  <td><Money cents={o.totalCents} /></td>
                  <td><OrderPill status={o.status} /></td>
                  <td className="text-xs">{o.payments.map((p) => `${p.provider === 'MANUAL' ? 'transfer' : 'online'} ${p.status.toLowerCase()}`).join(', ') || '—'}</td>
                  <td className="text-xs">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
