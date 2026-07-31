import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, EmptyState, StatusBadge, Tabs } from '@/components/ui';
import { SupplierForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Suppliers' };

export default async function SuppliersPage() {
  const user = await requirePage('inventory.view');
  const canEdit = can(user.role, 'inventory.edit');

  const suppliers = await prisma.supplier.findMany({
    include: {
      items: { select: { id: true, name: true } },
      supplierItems: {
        include: {
          item: { select: { name: true } },
          priceHistory: { orderBy: { changedAt: 'desc' }, take: 3 },
        },
      },
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: { name: 'asc' },
  });

  const tabs = [
    { href: '/portal/inventory', label: 'Items' },
    { href: '/portal/inventory/suppliers', label: 'Suppliers' },
    { href: '/portal/inventory/purchase-orders', label: 'Purchase orders' },
    { href: '/portal/inventory/stock-take', label: 'Stock-take' },
  ];

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Contacts, agreed prices and purchase history." />
      <Tabs tabs={tabs} current="/portal/inventory/suppliers" />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {suppliers.length === 0 ? (
            <EmptyState title="No suppliers yet" />
          ) : (
            suppliers.map((s) => (
              <div key={s.id} className="card-pad">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-cocoa-800">{s.name}</p>
                    <p className="text-xs text-cocoa-400">
                      {[s.contactPerson, s.mobile, s.email].filter(Boolean).join(' · ') || 'No contact details'}
                    </p>
                  </div>
                  <StatusBadge status={s.active ? 'ACTIVE' : 'CANCELLED'} label={s.active ? 'active' : 'inactive'} />
                </div>
                <dl className="grid gap-1 text-sm sm:grid-cols-2">
                  <Row label="Address" value={s.address || '—'} />
                  <Row label="Payment terms" value={s.paymentTerms || '—'} />
                  <Row label="Items supplied" value={String(s.supplierItems.length)} />
                  <Row label="Purchase orders" value={String(s.purchaseOrders.length)} />
                </dl>
                {s.supplierItems.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-cocoa-600">Agreed prices</summary>
                    <ul className="mt-1 space-y-0.5">
                      {s.supplierItems.map((si) => (
                        <li key={si.id} className="flex justify-between gap-3">
                          <span className="text-cocoa-600">{si.item.name}</span>
                          <span className="num">
                            {formatPeso(si.priceCents)}
                            {si.priceHistory.length > 0 && (
                              <span className="ml-1 text-[10px] text-cocoa-400">
                                (was {formatPeso(si.priceHistory[0].oldPriceCents)} on{' '}
                                {formatManila(si.priceHistory[0].changedAt)})
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {s.notes && <p className="mt-2 text-xs text-cocoa-400">{s.notes}</p>}
              </div>
            ))
          )}
        </div>

        {canEdit && (
          <SupplierForm
            suppliers={suppliers.map((s) => ({
              id: s.id,
              name: s.name,
              contactPerson: s.contactPerson,
              mobile: s.mobile,
              email: s.email,
              address: s.address,
              paymentTerms: s.paymentTerms,
              notes: s.notes,
              active: s.active,
            }))}
          />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-cocoa-500">{label}</dt>
      <dd className="text-right text-cocoa-700">{value}</dd>
    </div>
  );
}
