import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatusBadge, EmptyState, Tabs, Alert } from '@/components/ui';
import { PurchaseOrderForm } from './form';
import { decidePurchaseOrderAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Purchase orders' };

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('purchasing.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const canApprove = can(user.role, 'purchasing.approve');

  const [orders, suppliers, items] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { branchId },
      include: {
        supplier: { select: { name: true } },
        lines: { include: { item: { select: { name: true, unit: { select: { name: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.item.findMany({
      where: { branchId, archived: false },
      include: { unit: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const tabs = [
    { href: '/portal/inventory', label: 'Items' },
    { href: '/portal/inventory/suppliers', label: 'Suppliers' },
    { href: '/portal/inventory/purchase-orders', label: 'Purchase orders' },
    { href: '/portal/inventory/stock-take', label: 'Stock-take' },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        subtitle="Draft → approved → received. Receiving increments stock and records the purchase in Finance."
      />
      <Tabs tabs={tabs} current="/portal/inventory/purchase-orders" />

      <div className="mb-4">
        <Alert tone="info">
          Received stock is <strong>capitalised</strong>: it appears in cash flow immediately but
          only hits the P&amp;L as COGS when the stock is actually consumed. That keeps profit
          from being double-counted.
        </Alert>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {orders.length === 0 ? (
            <EmptyState title="No purchase orders yet" />
          ) : (
            orders.map((po) => (
              <div key={po.id} className="card-pad">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-cocoa-800">
                      {po.number} · {po.supplier.name}
                    </p>
                    <p className="text-xs text-cocoa-400">
                      {formatManila(po.createdAt)} · by {po.createdBy}
                      {po.approvedBy && ` · approved by ${po.approvedBy}`}
                      {po.receivedAt && ` · received ${formatManila(po.receivedAt)}`}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="num font-semibold">{formatPeso(po.totalCents)}</span>
                    <StatusBadge status={po.status} />
                  </span>
                </div>

                <ul className="space-y-0.5 text-sm">
                  {po.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3">
                      <span className="text-cocoa-600">
                        {l.item.name} — {l.quantity} {l.item.unit.name}
                      </span>
                      <span className="num">{formatPeso(l.unitCostCents * l.quantity)}</span>
                    </li>
                  ))}
                </ul>

                {po.notes && <p className="mt-2 text-xs text-cocoa-400">{po.notes}</p>}

                {canApprove && po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {po.status === 'DRAFT' && (
                      <form action={decidePurchaseOrderAction}>
                        <input type="hidden" name="id" value={po.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <button className="btn-primary btn-sm" type="submit">Approve</button>
                      </form>
                    )}
                    {po.status === 'APPROVED' && (
                      <form action={decidePurchaseOrderAction}>
                        <input type="hidden" name="id" value={po.id} />
                        <input type="hidden" name="decision" value="receive" />
                        <button className="btn-primary btn-sm" type="submit">
                          Mark received (updates stock &amp; Finance)
                        </button>
                      </form>
                    )}
                    <form action={decidePurchaseOrderAction}>
                      <input type="hidden" name="id" value={po.id} />
                      <input type="hidden" name="decision" value="cancel" />
                      <button className="btn-secondary btn-sm" type="submit">Cancel</button>
                    </form>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <PurchaseOrderForm
          branchId={branchId}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          items={items.map((i) => ({
            id: i.id,
            name: i.name,
            unitName: i.unit.name,
            cost: i.costCents / 100,
          }))}
        />
      </div>
    </div>
  );
}
