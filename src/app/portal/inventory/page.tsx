import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState, Tabs, Alert } from '@/components/ui';
import { StockPanel } from './stock-panel';
import { suggestPurchaseOrdersAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; q?: string }>;
}) {
  const user = await requirePage('inventory.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const q = (params.q ?? '').trim();
  const canEdit = can(user.role, 'inventory.edit');

  const [items, categories, units, suppliers, movements] = await Promise.all([
    prisma.item.findMany({
      where: {
        branchId,
        archived: false,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { category: true, unit: true, supplier: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.itemCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.stockMovement.findMany({
      where: { branchId },
      include: { item: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  const low = items.filter((i) => i.reorderLevel > 0 && i.stockQty <= i.reorderLevel);
  const stockValue = items.reduce((a, i) => a + Math.round(i.costCents * i.stockQty), 0);

  const tabs = [
    { href: '/portal/inventory', label: 'Items' },
    { href: '/portal/inventory/suppliers', label: 'Suppliers' },
    ...(can(user.role, 'purchasing.view')
      ? [{ href: '/portal/inventory/purchase-orders', label: 'Purchase orders' }]
      : []),
    ...(canEdit ? [{ href: '/portal/inventory/stock-take', label: 'Stock-take' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={`${items.length} active item(s) · stock value ${formatPeso(stockValue)}`}
        actions={
          canEdit && low.length > 0 ? (
            <form action={suggestPurchaseOrdersAction}>
              <input type="hidden" name="branchId" value={branchId} />
              <button className="btn-secondary btn-sm" type="submit">
                Draft POs for low stock
              </button>
            </form>
          ) : null
        }
      />
      <Tabs tabs={tabs} current="/portal/inventory" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items tracked" value={String(items.length)} />
        <StatCard label="Low stock" value={String(low.length)} tone={low.length ? 'bad' : 'good'} />
        <StatCard label="Stock value" value={formatPeso(stockValue)} hint="at cost" />
        <StatCard label="Retail products" value={String(items.filter((i) => i.sellable).length)} />
      </div>

      {low.length > 0 && (
        <div className="mb-4">
          <Alert tone="warn">
            <strong>Low stock:</strong>{' '}
            {low.map((i) => `${i.name} (${i.stockQty} ${i.unit.name})`).join(', ')}
          </Alert>
        </div>
      )}

      <form className="mb-4 flex gap-2" action="/portal/inventory">
        <input name="q" defaultValue={q} className="input" placeholder="Search items…" />
        <button className="btn-secondary" type="submit">Search</button>
      </form>

      <StockPanel
        branchId={branchId}
        canEdit={canEdit}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          categoryId: i.categoryId,
          categoryName: i.category.name,
          unitId: i.unitId,
          unitName: i.unit.name,
          cost: i.costCents / 100,
          retailPrice: i.retailPriceCents / 100,
          sellable: i.sellable,
          stockQty: i.stockQty,
          reorderLevel: i.reorderLevel,
          supplierId: i.supplierId ?? '',
          supplierName: i.supplier?.name ?? '',
          low: i.reorderLevel > 0 && i.stockQty <= i.reorderLevel,
        }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        units={units.map((u) => ({ id: u.id, name: u.name }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      />

      <h2 className="section-title mb-3 mt-8">Recent stock movements</h2>
      {movements.length === 0 ? (
        <EmptyState title="No movements recorded yet" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Item</th>
                <th>Type</th>
                <th className="text-right">Qty</th>
                <th>Reason</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs">{formatManila(m.createdAt, { time: true })}</td>
                  <td className="text-sm">{m.item.name}</td>
                  <td><StatusBadge status={m.quantity >= 0 ? 'OK' : 'WARN'} label={m.type.toLowerCase()} /></td>
                  <td className={`num text-right ${m.quantity < 0 ? 'text-clay-500' : 'text-cocoa-600'}`}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                  </td>
                  <td className="text-xs text-cocoa-500">{m.reason}</td>
                  <td className="text-xs text-cocoa-400">{m.userName || 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
