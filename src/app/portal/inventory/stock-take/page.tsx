import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatManila } from '@/lib/datetime';
import { PageHeader, EmptyState, StatusBadge, Tabs } from '@/components/ui';
import { startStockTakeAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stock-take' };

export default async function StockTakePage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('inventory.edit');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);

  const takes = await prisma.stockTake.findMany({
    where: { branchId },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
    take: 24,
  });

  const tabs = [
    { href: '/portal/inventory', label: 'Items' },
    { href: '/portal/inventory/suppliers', label: 'Suppliers' },
    { href: '/portal/inventory/purchase-orders', label: 'Purchase orders' },
    { href: '/portal/inventory/stock-take', label: 'Stock-take' },
  ];

  return (
    <div>
      <PageHeader
        title="Stock-take"
        subtitle="Enter physical counts; the system computes the variance and adjusts stock on close."
        actions={
          <form action={startStockTakeAction}>
            <input type="hidden" name="branchId" value={branchId} />
            <button className="btn-primary btn-sm" type="submit">Start a new count</button>
          </form>
        }
      />
      <Tabs tabs={tabs} current="/portal/inventory/stock-take" />

      {takes.length === 0 ? (
        <EmptyState
          title="No stock-takes yet"
          hint="Run one at the end of each month to catch shrinkage and correct the books."
        />
      ) : (
        <div className="card divide-y divide-sand-100">
          {takes.map((t) => {
            const variances = t.lines.filter((l) => l.varianceQty !== 0).length;
            return (
              <Link
                key={t.id}
                href={`/portal/inventory/stock-take/${t.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sand-50"
              >
                <div>
                  <p className="text-sm font-medium text-moss-800">
                    {t.takeDate.toISOString().slice(0, 10)}
                  </p>
                  <p className="text-xs text-moss-400">
                    {t.lines.length} item(s) · {variances} variance(s) · started by {t.createdBy}
                    {t.closedAt && ` · closed ${formatManila(t.closedAt)}`}
                  </p>
                </div>
                <StatusBadge status={t.status === 'CLOSED' ? 'COMPLETED' : 'PENDING'} label={t.status.toLowerCase()} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
