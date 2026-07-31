import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatDateKey, formatTimeManila, manilaDateKey, dateKeyToBusinessDate } from '@/lib/datetime';
import { salesSummary } from '@/lib/metrics';
import { PageHeader, StatCard, StatusBadge, EmptyState, Tabs } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales' };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branchId?: string }>;
}) {
  const user = await requirePage('pos.use');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const dateKey = params.date ?? manilaDateKey();
  const showMoney = can(user.role, 'dashboard.financials');

  const [sales, summary] = await Promise.all([
    prisma.sale.findMany({
      where: { branchId, businessDate: dateKeyToBusinessDate(dateKey) },
      include: {
        client: { select: { name: true } },
        cashier: { select: { name: true } },
        payments: true,
        lines: { select: { description: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    salesSummary([branchId], { fromKey: dateKey, toKey: dateKey }),
  ]);

  const tabs = [
    { href: '/portal/sales', label: "Today's sales" },
    { href: '/portal/sales/pos', label: 'New sale (POS)' },
    { href: '/portal/sales/petty-cash', label: 'Petty cash' },
    { href: '/portal/sales/eod', label: 'End of day' },
  ];

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={formatDateKey(dateKey)}
        actions={
          <Link href="/portal/sales/pos" className="btn-primary btn-sm">
            + New sale
          </Link>
        }
      />
      <Tabs tabs={tabs} current="/portal/sales" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Receipts" value={String(summary.saleCount)} />
        {showMoney && <StatCard label="Net sales" value={formatPeso(summary.netSalesCents)} />}
        {showMoney && <StatCard label="Discounts given" value={formatPeso(summary.discountCents)} />}
        {showMoney && <StatCard label="Tips" value={formatPeso(summary.tipsCents)} />}
        {!showMoney && (
          <StatCard label="Payment methods" value={String(summary.byMethod.length)} hint="See EOD for totals" />
        )}
      </div>

      <form className="mb-4 flex gap-2" action="/portal/sales">
        <input type="date" name="date" defaultValue={dateKey} className="input w-auto" />
        <button className="btn-secondary" type="submit">Go</button>
      </form>

      {sales.length === 0 ? (
        <EmptyState title="No sales recorded for this day yet" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Time</th>
                <th>Client</th>
                <th>Items</th>
                <th>Payment</th>
                {showMoney && <th className="text-right">Total</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className={s.status === 'VOIDED' ? 'opacity-60' : ''}>
                  <td>
                    <Link href={`/portal/sales/${s.id}`} className="num font-medium text-cocoa-800 hover:underline">
                      {s.receiptNo}
                    </Link>
                    <span className="block text-[11px] text-cocoa-400">{s.cashier.name}</span>
                  </td>
                  <td className="num whitespace-nowrap text-xs">{formatTimeManila(s.createdAt)}</td>
                  <td className="text-sm">{s.client?.name ?? 'Walk-in'}</td>
                  <td className="max-w-56 truncate text-xs text-cocoa-500">
                    {s.lines.map((l) => l.description).join(', ')}
                  </td>
                  <td className="text-xs capitalize">
                    {s.payments.map((p) => p.method.replaceAll('_', ' ').toLowerCase()).join(' + ')}
                  </td>
                  {showMoney && <td className="num text-right">{formatPeso(s.totalCents)}</td>}
                  <td><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
