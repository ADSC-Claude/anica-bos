import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage, assertProperty, visibleProperties, HttpError } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPeso, formatPesoShort, toCents } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import {
  LINEN_LABELS,
  LINEN_STATES,
  linenTotal,
  moveLinen,
  recordPurchase,
  recount,
  type LinenState,
} from '@/lib/inventory';
import { audit } from '@/lib/audit';
import { Card, Empty, Notice, PageHeader, Pill } from '@/components/ui';

export const metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

function back(message: string, kind: 'ok' | 'error' = 'ok', tab = ''): never {
  redirect(`/portal/inventory?${kind}=${encodeURIComponent(message)}${tab ? `&tab=${tab}` : ''}`);
}

async function purchaseAction(formData: FormData) {
  'use server';
  const user = await requirePage('inventory.edit');
  const itemId = String(formData.get('itemId'));
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { propertyId: true } });
  if (!item) back('That item no longer exists.', 'error');
  await assertProperty(user, item.propertyId);

  try {
    const { expenseId } = await recordPurchase({
      itemId,
      quantity: Number(formData.get('quantity') ?? 0),
      amountCents: toCents(String(formData.get('amount') || '0')),
      note: String(formData.get('note') ?? ''),
      user,
    });
    back(expenseId ? 'Stock added and the cost booked to expenses.' : 'Stock added.');
  } catch (err) {
    if (err instanceof HttpError) back(err.message, 'error');
    throw err;
  }
}

async function recountAction(formData: FormData) {
  'use server';
  const user = await requirePage('inventory.edit');
  const itemId = String(formData.get('itemId'));
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { propertyId: true } });
  if (!item) back('That item no longer exists.', 'error');
  await assertProperty(user, item.propertyId);

  try {
    await recount({
      itemId,
      countedQty: Number(formData.get('counted') ?? 0),
      note: String(formData.get('note') ?? ''),
      user,
    });
    back('Recount recorded as an adjustment — the ledger still adds up to the stock figure.');
  } catch (err) {
    if (err instanceof HttpError) back(err.message, 'error');
    throw err;
  }
}

async function newItemAction(formData: FormData) {
  'use server';
  const user = await requirePage('inventory.edit');
  const propertyId = String(formData.get('propertyId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!propertyId || !name) back('A property and a name are required.', 'error');
  await assertProperty(user, propertyId);

  const existing = await prisma.inventoryItem.findFirst({ where: { propertyId, name } });
  if (existing) back(`${name} is already tracked at that property.`, 'error');

  const item = await prisma.inventoryItem.create({
    data: {
      propertyId,
      name,
      category: String(formData.get('category') || 'Supplies'),
      unit: String(formData.get('unit') || 'pc'),
      minLevel: Number(formData.get('minLevel') ?? 0),
      costCents: toCents(String(formData.get('cost') || '0')),
    },
  });
  await audit(user, {
    module: 'inventory',
    action: 'create',
    entityType: 'InventoryItem',
    entityId: item.id,
    propertyId,
    summary: `Now tracking ${name}`,
  });
  back(`Now tracking ${name}. Stock starts at zero — record a purchase to set it.`);
}

async function linenAction(formData: FormData) {
  'use server';
  const user = await requirePage('inventory.edit');
  const linenItemId = String(formData.get('linenItemId'));
  const item = await prisma.linenItem.findUnique({ where: { id: linenItemId }, select: { propertyId: true } });
  if (!item) back('That linen item no longer exists.', 'error', 'linen');
  await assertProperty(user, item.propertyId);

  try {
    await moveLinen({
      linenItemId,
      from: String(formData.get('from')) as LinenState,
      to: String(formData.get('to')) as LinenState,
      quantity: Number(formData.get('quantity') ?? 0),
      note: String(formData.get('note') ?? ''),
      user,
    });
    back('Linen moved.', 'ok', 'linen');
  } catch (err) {
    if (err instanceof HttpError) back(err.message, 'error', 'linen');
    throw err;
  }
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; property?: string; tab?: string }>;
}) {
  const user = await requirePage('inventory.view');
  const sp = await searchParams;
  const mayEdit = can(user.role, 'inventory.edit');
  const propertyIds = await visibleProperties(user);
  const tab = sp.tab === 'linen' ? 'linen' : 'stock';

  const where = {
    ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
    ...(sp.property ? { propertyId: sp.property } : {}),
  };

  const [items, linen, properties, movements] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { ...where, archived: false },
      include: { property: { select: { name: true } }, vendor: { select: { name: true } } },
      orderBy: [{ propertyId: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    }),
    prisma.linenItem.findMany({
      where,
      include: { property: { select: { name: true } } },
      orderBy: [{ propertyId: 'asc' }, { name: 'asc' }],
    }),
    prisma.property.findMany({
      where: propertyIds ? { id: { in: propertyIds } } : {},
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.inventoryMovement.findMany({
      where: { item: where },
      include: {
        item: { select: { name: true, unit: true, property: { select: { name: true } } } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  const low = items.filter((i) => i.stockQty <= i.minLevel);
  const stockValue = items.reduce((sum, i) => sum + i.stockQty * i.costCents, 0);

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Stock is the running sum of its movements — every change here leaves a line with a date and a name on it."
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          className={`btn ${tab === 'stock' ? 'btn-primary' : 'btn-secondary'}`}
          href={`/portal/inventory${sp.property ? `?property=${sp.property}` : ''}`}
        >
          Supplies
        </Link>
        <Link
          className={`btn ${tab === 'linen' ? 'btn-primary' : 'btn-secondary'}`}
          href={`/portal/inventory?tab=linen${sp.property ? `&property=${sp.property}` : ''}`}
        >
          Linen
        </Link>
        <form className="ml-auto flex gap-2" method="get">
          {tab === 'linen' && <input type="hidden" name="tab" value="linen" />}
          <select className="field w-auto" name="property" defaultValue={sp.property ?? ''}>
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" type="submit">
            Filter
          </button>
        </form>
      </div>

      {tab === 'stock' ? (
        <>
          {low.length > 0 && (
            <Notice kind="error">
              {low.length} item{low.length === 1 ? '' : 's'} at or below the restock level:{' '}
              {low.map((i) => `${i.name} (${i.property.name})`).join(', ')}.
            </Notice>
          )}

          <Card
            title="Stock on hand"
            actions={
              <span className="text-xs text-[color:var(--color-ink-500)]">
                Value at cost: {formatPeso(stockValue)}
              </span>
            }
            className="mb-4"
          >
            {items.length === 0 ? (
              <Empty>Nothing tracked yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                      <th className="py-2">Item</th>
                      <th className="py-2">Property</th>
                      <th className="py-2 text-right">On hand</th>
                      <th className="py-2 text-right">Restock at</th>
                      <th className="py-2 text-right">Unit cost</th>
                      {mayEdit && <th className="py-2">Add stock</th>}
                      {mayEdit && <th className="py-2">Recount</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                    {items.map((i) => (
                      <tr key={i.id} className={i.stockQty <= i.minLevel ? 'bg-[#fbe9e7]' : ''}>
                        <td className="py-2">
                          <div className="font-medium">{i.name}</div>
                          <div className="text-xs text-[color:var(--color-ink-500)]">
                            {i.category}
                            {i.vendor ? ` · ${i.vendor.name}` : ''}
                          </div>
                        </td>
                        <td className="py-2 text-xs">{i.property.name}</td>
                        <td className="py-2 text-right tabular-nums">
                          {i.stockQty} {i.unit}
                          {i.stockQty <= i.minLevel && (
                            <Pill tone="bad">low</Pill>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums">{i.minLevel}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatPesoShort(i.costCents)}
                        </td>
                        {mayEdit && (
                          <td className="py-2">
                            <form action={purchaseAction} className="flex items-center gap-1">
                              <input type="hidden" name="itemId" value={i.id} />
                              <input
                                className="field w-16 py-1 text-sm"
                                name="quantity"
                                type="number"
                                min="1"
                                placeholder="qty"
                                required
                              />
                              <input
                                className="field w-20 py-1 text-sm"
                                name="amount"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="cost"
                              />
                              <button className="btn btn-secondary px-2 py-1 text-xs" type="submit">
                                Add
                              </button>
                            </form>
                          </td>
                        )}
                        {mayEdit && (
                          <td className="py-2">
                            <form action={recountAction} className="flex items-center gap-1">
                              <input type="hidden" name="itemId" value={i.id} />
                              <input
                                className="field w-16 py-1 text-sm"
                                name="counted"
                                type="number"
                                min="0"
                                placeholder="count"
                                required
                              />
                              <button className="btn btn-secondary px-2 py-1 text-xs" type="submit">
                                Set
                              </button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {mayEdit && (
            <Card title="Track something new" className="mb-4">
              <form action={newItemAction} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <label className="block">
                  <span className="label">Property *</span>
                  <select className="field" name="propertyId" required defaultValue="">
                    <option value="" disabled>
                      Choose…
                    </option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Name *</span>
                  <input className="field" name="name" required placeholder="Toilet paper" />
                </label>
                <label className="block">
                  <span className="label">Category</span>
                  <input className="field" name="category" defaultValue="Supplies" />
                </label>
                <label className="block">
                  <span className="label">Unit</span>
                  <input className="field" name="unit" defaultValue="pc" />
                </label>
                <label className="block">
                  <span className="label">Restock at</span>
                  <input className="field" name="minLevel" type="number" min="0" defaultValue="0" />
                </label>
                <label className="block">
                  <span className="label">Unit cost</span>
                  <input className="field" name="cost" type="number" step="0.01" min="0" defaultValue="0" />
                </label>
                <div className="sm:col-span-3 lg:col-span-6">
                  <button className="btn btn-primary" type="submit">
                    Track it
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card title="Recent movements">
            {movements.length === 0 ? (
              <Empty>No movements yet.</Empty>
            ) : (
              <ul className="space-y-1 text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span
                        className={`font-mono tabular-nums ${m.quantity > 0 ? 'text-[color:var(--ok)]' : 'text-[color:var(--bad)]'}`}
                      >
                        {m.quantity > 0 ? '+' : ''}
                        {m.quantity}
                      </span>{' '}
                      {m.item.name}{' '}
                      <span className="text-xs text-[color:var(--color-ink-500)]">
                        {m.item.property.name} · {m.kind.toLowerCase()}
                        {m.note ? ` · ${m.note}` : ''}
                      </span>
                    </span>
                    <span className="text-xs text-[color:var(--color-ink-500)]">
                      {formatManila(m.createdAt, { time: true })}
                      {m.createdBy ? ` · ${m.createdBy.name}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <Card title="Linen by state">
          {linen.length === 0 ? (
            <Empty>No linen tracked yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                    <th className="py-2">Item</th>
                    <th className="py-2">Property</th>
                    {LINEN_STATES.map((s) => (
                      <th key={s} className="py-2 text-right">
                        {LINEN_LABELS[s]}
                      </th>
                    ))}
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Par</th>
                    {mayEdit && <th className="py-2">Move</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                  {linen.map((l) => {
                    const total = linenTotal(l);
                    return (
                      <tr key={l.id}>
                        <td className="py-2 font-medium">{l.name}</td>
                        <td className="py-2 text-xs">{l.property.name}</td>
                        <td className="py-2 text-right tabular-nums">{l.cleanQty}</td>
                        <td className="py-2 text-right tabular-nums">{l.inUseQty}</td>
                        <td className="py-2 text-right tabular-nums">{l.dirtyQty}</td>
                        <td className="py-2 text-right tabular-nums">{l.atLaundryQty}</td>
                        <td className="py-2 text-right tabular-nums">{l.damagedQty}</td>
                        <td className="py-2 text-right tabular-nums">{l.missingQty}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">{total}</td>
                        <td className="py-2 text-right tabular-nums">
                          {l.parLevel}
                          {total < l.parLevel && <Pill tone="warn">under</Pill>}
                        </td>
                        {mayEdit && (
                          <td className="py-2">
                            <form action={linenAction} className="flex flex-wrap items-center gap-1">
                              <input type="hidden" name="linenItemId" value={l.id} />
                              <input
                                className="field w-14 py-1 text-sm"
                                name="quantity"
                                type="number"
                                min="1"
                                placeholder="qty"
                                required
                              />
                              <select className="field w-auto py-1 text-xs" name="from" defaultValue="dirty">
                                {LINEN_STATES.map((s) => (
                                  <option key={s} value={s}>
                                    {LINEN_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                              <span aria-hidden className="text-xs">
                                →
                              </span>
                              <select className="field w-auto py-1 text-xs" name="to" defaultValue="atLaundry">
                                {LINEN_STATES.map((s) => (
                                  <option key={s} value={s}>
                                    {LINEN_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                              <button className="btn btn-secondary px-2 py-1 text-xs" type="submit">
                                Move
                              </button>
                            </form>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
