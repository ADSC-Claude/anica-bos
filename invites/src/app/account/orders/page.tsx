import Link from 'next/link';
import { requireCustomerPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { occasionLabel } from '@/lib/occasions';
import { TIER_LABELS } from '@/lib/tiers';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, OrderPill, Empty, Money } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const user = await requireCustomerPage();
  const orders = await prisma.order.findMany({ where: { userId: user.id }, include: { package: true }, orderBy: { createdAt: 'desc' } });
  return (
    <>
      <PageHeader title="Orders" subtitle="Every purchase, with its receipt." />
      {orders.length === 0 ? <Empty>No orders yet.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr><th>Reference</th><th>Package</th><th>Total</th><th>Status</th><th>Placed</th><th /></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="font-mono">{o.reference}</td>
                  <td>{o.package.name}<span className="block text-xs text-[color:var(--color-ink-500)]">{occasionLabel(o.occasion)} · {TIER_LABELS[o.tier]} · {o.serviceMode}</span></td>
                  <td><Money cents={o.totalCents} /></td>
                  <td><OrderPill status={o.status} /></td>
                  <td className="text-xs">{formatDateTime(o.createdAt)}</td>
                  <td>{o.status === 'PENDING_PAYMENT' ? <Link href={`/checkout/pay/${o.reference}`} className="btn btn-primary btn-sm">Pay</Link> : <Link href={`/account/orders/${o.id}`} className="btn btn-secondary btn-sm">Receipt</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
