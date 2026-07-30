'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit, diff } from '@/lib/audit';
import { businessDate } from '@/lib/datetime';
import { postJournal } from '@/lib/accounting';
import { notify, resolveNotifications } from '@/lib/notifications';
import { formatPeso } from '@/lib/money';

export type FormState = { error?: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const cents = (fd: FormData, k: string) => Math.round(num(fd, k) * 100);

/* ---------------------------------------------------------------- items */

export async function saveItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('inventory.edit');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (name.length < 2) return { error: 'Enter the item name.' };

  const data = {
    name,
    sku: str(formData, 'sku'),
    categoryId: str(formData, 'categoryId'),
    unitId: str(formData, 'unitId'),
    costCents: cents(formData, 'cost'),
    retailPriceCents: cents(formData, 'retailPrice'),
    sellable: formData.get('sellable') === 'on',
    reorderLevel: num(formData, 'reorderLevel'),
    supplierId: str(formData, 'supplierId') || null,
    archived: formData.get('archived') === 'on',
  };
  if (!data.categoryId || !data.unitId) return { error: 'Choose a category and a unit.' };

  if (id) {
    const before = await prisma.item.findUnique({ where: { id } });
    const after = await prisma.item.update({ where: { id }, data });
    await audit(user, {
      module: 'inventory', action: 'update_item', entityType: 'Item', entityId: id,
      summary: `Updated item ${after.name}`,
      sensitive: before?.retailPriceCents !== after.retailPriceCents,
      ...diff(before as never, after as never),
    });
  } else {
    const created = await prisma.item.create({
      data: { ...data, branchId, stockQty: num(formData, 'openingStock') },
    });
    if (num(formData, 'openingStock') > 0) {
      await prisma.stockMovement.create({
        data: {
          branchId, itemId: created.id, type: 'ADJUSTMENT',
          quantity: num(formData, 'openingStock'), unitCostCents: data.costCents,
          reason: 'Opening balance', userId: user.id, userName: user.name,
        },
      });
    }
    await audit(user, {
      module: 'inventory', action: 'create_item', entityType: 'Item', entityId: created.id,
      summary: `Added item ${created.name}`,
    });
  }

  revalidatePath('/portal/inventory');
  return { ok: 'Saved.' };
}

export async function adjustStockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('inventory.usage');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const itemId = str(formData, 'itemId');
  const quantity = num(formData, 'quantity');
  const type = str(formData, 'type') || 'ADJUSTMENT';
  const reason = str(formData, 'reason');

  if (!itemId || quantity === 0) return { error: 'Enter a quantity.' };
  if (!reason) return { error: 'A reason is required for every stock adjustment.' };

  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) return { error: 'That item no longer exists.' };

  // Usage and wastage always remove stock; adjustments may go either way.
  const signed = type === 'USAGE' || type === 'WASTAGE' ? -Math.abs(quantity) : quantity;
  if (item.stockQty + signed < 0) {
    return { error: `Only ${item.stockQty} ${item.name} left — cannot remove ${Math.abs(signed)}.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.item.update({ where: { id: itemId }, data: { stockQty: { increment: signed } } });
    await tx.stockMovement.create({
      data: {
        branchId, itemId, type: type as never, quantity: signed,
        unitCostCents: item.costCents, reason,
        userId: user.id, userName: user.name,
      },
    });
    // Wastage is a real cost — write it off to COGS.
    if (type === 'WASTAGE') {
      const value = Math.round(item.costCents * Math.abs(quantity));
      if (value > 0) {
        await postJournal(tx, {
          branchId, source: 'GENERAL', entryDate: businessDate(),
          reference: `WASTE-${Date.now().toString(36)}`,
          memo: `Wastage: ${item.name} — ${reason}`,
          createdBy: user.name,
          lines: [{ code: '5000', debit: value }, { code: '1200', credit: value }],
        });
      }
    }
  });

  await audit(user, {
    module: 'inventory', action: `stock_${type.toLowerCase()}`, entityType: 'Item', entityId: itemId,
    summary: `${signed > 0 ? '+' : ''}${signed} ${item.name} — ${reason}`,
    sensitive: type === 'WASTAGE',
    branchId,
    before: { stockQty: item.stockQty },
    after: { stockQty: item.stockQty + signed },
  });

  const updated = await prisma.item.findUnique({ where: { id: itemId } });
  if (updated && updated.reorderLevel > 0 && updated.stockQty <= updated.reorderLevel) {
    await notify({
      kind: 'LOW_STOCK',
      title: `Low stock — ${updated.name}`,
      body: `${updated.stockQty} left (reorder at ${updated.reorderLevel})`,
      link: `/portal/inventory`,
      dedupeKey: `low-stock:${updated.id}`,
      branchId,
      roles: ['RECEPTIONIST', 'ADMIN', 'OWNER'],
    });
  } else {
    await resolveNotifications(`low-stock:${itemId}`);
  }

  revalidatePath('/portal/inventory');
  return { ok: 'Stock updated.' };
}

/* ------------------------------------------------------- categories/units */

export async function saveTaxonomyAction(formData: FormData) {
  const user = await requirePage('inventory.edit');
  const kind = str(formData, 'kind');
  const name = str(formData, 'name');
  if (!name) return;

  if (kind === 'category') {
    await prisma.itemCategory.create({ data: { name } });
  } else if (kind === 'unit') {
    await prisma.unit.create({ data: { name } });
  }
  await audit(user, {
    module: 'inventory', action: `create_${kind}`, entityType: kind === 'category' ? 'ItemCategory' : 'Unit',
    summary: `Added ${kind} "${name}"`,
  });
  revalidatePath('/portal/inventory/settings');
}

/* ------------------------------------------------------------- suppliers */

export async function saveSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('inventory.edit');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (name.length < 2) return { error: 'Enter the supplier name.' };

  const data = {
    name,
    contactPerson: str(formData, 'contactPerson'),
    mobile: str(formData, 'mobile'),
    email: str(formData, 'email'),
    address: str(formData, 'address'),
    paymentTerms: str(formData, 'paymentTerms'),
    notes: str(formData, 'notes'),
    active: formData.get('active') === 'on',
  };

  const supplier = id
    ? await prisma.supplier.update({ where: { id }, data })
    : await prisma.supplier.create({ data });

  await audit(user, {
    module: 'inventory', action: id ? 'update_supplier' : 'create_supplier',
    entityType: 'Supplier', entityId: supplier.id,
    summary: `${id ? 'Updated' : 'Added'} supplier ${supplier.name}`,
    after: data,
  });
  revalidatePath('/portal/inventory/suppliers');
  return { ok: 'Saved.' };
}

/* -------------------------------------------------------- purchase orders */

export async function createPurchaseOrderAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('inventory.edit');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const supplierId = str(formData, 'supplierId');
  if (!supplierId) return { error: 'Choose a supplier.' };

  const itemIds = formData.getAll('itemId').map(String);
  const quantities = formData.getAll('quantity').map(Number);
  const costs = formData.getAll('unitCost').map(Number);

  const lines = itemIds
    .map((itemId, i) => ({
      itemId,
      quantity: quantities[i] ?? 0,
      unitCostCents: Math.round((costs[i] ?? 0) * 100),
    }))
    .filter((l) => l.itemId && l.quantity > 0);

  if (!lines.length) return { error: 'Add at least one item with a quantity.' };

  const count = await prisma.purchaseOrder.count();
  const po = await prisma.purchaseOrder.create({
    data: {
      branchId,
      number: `PO-${String(count + 1).padStart(6, '0')}`,
      supplierId,
      notes: str(formData, 'notes'),
      createdBy: user.name,
      totalCents: lines.reduce((a, l) => a + l.unitCostCents * l.quantity, 0),
      lines: { create: lines },
    },
  });

  await audit(user, {
    module: 'inventory', action: 'create_po', entityType: 'PurchaseOrder', entityId: po.id,
    summary: `Drafted ${po.number} for ${formatPeso(po.totalCents)}`,
    branchId,
  });

  await notify({
    kind: 'PURCHASE_ORDER',
    title: `Purchase order ${po.number} needs approval`,
    body: formatPeso(po.totalCents),
    link: `/portal/inventory/purchase-orders`,
    dedupeKey: `po-approval:${po.id}`,
    branchId,
    roles: ['ADMIN', 'OWNER'],
  });

  revalidatePath('/portal/inventory/purchase-orders');
  redirect('/portal/inventory/purchase-orders');
}

export async function decidePurchaseOrderAction(formData: FormData) {
  const user = await requirePage('purchasing.approve');
  const id = str(formData, 'id');
  const decision = str(formData, 'decision');

  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!po) return;

  if (decision === 'approve') {
    await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: user.name, approvedAt: new Date() },
    });
    await audit(user, {
      module: 'inventory', action: 'approve_po', entityType: 'PurchaseOrder', entityId: id,
      summary: `Approved ${po.number} (${formatPeso(po.totalCents)})`, sensitive: true,
      branchId: po.branchId,
    });
  } else if (decision === 'cancel') {
    await prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit(user, {
      module: 'inventory', action: 'cancel_po', entityType: 'PurchaseOrder', entityId: id,
      summary: `Cancelled ${po.number}`, sensitive: true, branchId: po.branchId,
    });
  } else if (decision === 'receive') {
    if (po.status === 'RECEIVED') return;

    await prisma.$transaction(async (tx) => {
      // Inventory purchases are capitalised: they hit the P&L later, as COGS,
      // when the stock is actually consumed.
      const category =
        (await tx.expenseCategory.findFirst({ where: { name: 'Inventory Purchases' } })) ??
        (await tx.expenseCategory.create({
          data: { name: 'Inventory Purchases', accountCode: '1200', capitalized: true },
        }));

      const expense = await tx.expense.create({
        data: {
          branchId: po.branchId,
          categoryId: category.id,
          description: `Purchase order ${po.number}`,
          amountCents: po.totalCents,
          expenseDate: businessDate(),
          method: 'CASH',
          status: 'APPROVED',
          submittedById: user.id,
          approvedById: user.id,
          approvedAt: new Date(),
          refType: 'purchase_order',
          refId: po.id,
        },
      });

      for (const line of po.lines) {
        await tx.item.update({
          where: { id: line.itemId },
          data: {
            stockQty: { increment: line.quantity },
            costCents: line.unitCostCents || undefined,
          },
        });
        await tx.stockMovement.create({
          data: {
            branchId: po.branchId, itemId: line.itemId, type: 'PURCHASE',
            quantity: line.quantity, unitCostCents: line.unitCostCents,
            reason: `Received on ${po.number}`, refType: 'purchase_order', refId: po.id,
            userId: user.id, userName: user.name,
          },
        });
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedQty: line.quantity },
        });
        await tx.supplierItem.upsert({
          where: { supplierId_itemId: { supplierId: po.supplierId, itemId: line.itemId } },
          create: { supplierId: po.supplierId, itemId: line.itemId, priceCents: line.unitCostCents },
          update: { priceCents: line.unitCostCents },
        });
      }

      await postJournal(tx, {
        branchId: po.branchId,
        source: 'CASH_DISBURSEMENTS',
        entryDate: businessDate(),
        reference: po.number,
        memo: `Stock received on ${po.number}`,
        expenseId: expense.id,
        createdBy: user.name,
        lines: [
          { code: '1200', debit: po.totalCents },
          { code: '1000', credit: po.totalCents },
        ],
      });

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED', receivedAt: new Date(), expenseId: expense.id },
      });
    });

    for (const line of po.lines) await resolveNotifications(`low-stock:${line.itemId}`);

    await audit(user, {
      module: 'inventory', action: 'receive_po', entityType: 'PurchaseOrder', entityId: id,
      summary: `Received ${po.number}: stock incremented and ${formatPeso(po.totalCents)} recorded in Finance`,
      sensitive: true, branchId: po.branchId,
    });
  }

  await resolveNotifications(`po-approval:${id}`);
  revalidatePath('/portal/inventory/purchase-orders');
  revalidatePath('/portal/inventory');
}

/* -------------------------------------------------------------- stocktake */

export async function startStockTakeAction(formData: FormData) {
  const user = await requirePage('inventory.edit');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));

  const items = await prisma.item.findMany({ where: { branchId, archived: false } });
  const take = await prisma.stockTake.create({
    data: {
      branchId,
      takeDate: businessDate(),
      createdBy: user.name,
      lines: {
        create: items.map((i) => ({ itemId: i.id, systemQty: i.stockQty, countedQty: i.stockQty })),
      },
    },
  });

  await audit(user, {
    module: 'inventory', action: 'start_stocktake', entityType: 'StockTake', entityId: take.id,
    summary: `Started a stock-take of ${items.length} item(s)`, branchId,
  });
  redirect(`/portal/inventory/stock-take/${take.id}`);
}

export async function saveStockTakeAction(formData: FormData) {
  const user = await requirePage('inventory.edit');
  const id = str(formData, 'id');
  const close = str(formData, 'close') === '1';

  const take = await prisma.stockTake.findUnique({ where: { id }, include: { lines: true } });
  if (!take || take.status === 'CLOSED') return;

  for (const line of take.lines) {
    const counted = Number(formData.get(`counted_${line.id}`) ?? line.countedQty);
    await prisma.stockTakeLine.update({
      where: { id: line.id },
      data: { countedQty: counted, varianceQty: counted - line.systemQty },
    });
  }

  if (close) {
    const lines = await prisma.stockTakeLine.findMany({
      where: { stockTakeId: id },
      include: { item: true },
    });
    for (const line of lines) {
      if (line.varianceQty === 0) continue;
      await prisma.item.update({
        where: { id: line.itemId },
        data: { stockQty: line.countedQty },
      });
      await prisma.stockMovement.create({
        data: {
          branchId: take.branchId, itemId: line.itemId, type: 'STOCKTAKE',
          quantity: line.varianceQty, unitCostCents: line.item.costCents,
          reason: `Stock-take variance on ${take.takeDate.toISOString().slice(0, 10)}`,
          refType: 'stock_take', refId: id,
          userId: user.id, userName: user.name,
        },
      });
    }
    await prisma.stockTake.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), notes: str(formData, 'notes') },
    });
    await audit(user, {
      module: 'inventory', action: 'close_stocktake', entityType: 'StockTake', entityId: id,
      summary: `Closed the stock-take; ${lines.filter((l) => l.varianceQty !== 0).length} item(s) adjusted`,
      sensitive: true, branchId: take.branchId,
    });
  }

  revalidatePath(`/portal/inventory/stock-take/${id}`);
}

/** Turns every below-reorder item into a draft PO, grouped by supplier. */
export async function suggestPurchaseOrdersAction(formData: FormData) {
  const user = await requirePage('inventory.edit');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));

  const items = await prisma.item.findMany({
    where: { branchId, archived: false, reorderLevel: { gt: 0 } },
    include: { supplier: true },
  });
  const low = items.filter((i) => i.stockQty <= i.reorderLevel && i.supplierId);
  if (!low.length) return;

  const bySupplier = new Map<string, typeof low>();
  for (const i of low) {
    bySupplier.set(i.supplierId!, [...(bySupplier.get(i.supplierId!) ?? []), i]);
  }

  let count = await prisma.purchaseOrder.count();
  for (const [supplierId, list] of bySupplier) {
    count += 1;
    // Order back up to twice the reorder level.
    const lines = list.map((i) => ({
      itemId: i.id,
      quantity: Math.max(1, Math.ceil(i.reorderLevel * 2 - i.stockQty)),
      unitCostCents: i.costCents,
    }));
    const po = await prisma.purchaseOrder.create({
      data: {
        branchId,
        number: `PO-${String(count).padStart(6, '0')}`,
        supplierId,
        notes: 'Auto-suggested from reorder-level breaches.',
        createdBy: user.name,
        totalCents: lines.reduce((a, l) => a + l.unitCostCents * l.quantity, 0),
        lines: { create: lines },
      },
    });
    await audit(user, {
      module: 'inventory', action: 'suggest_po', entityType: 'PurchaseOrder', entityId: po.id,
      summary: `Auto-drafted ${po.number} from low stock`, branchId,
    });
  }

  revalidatePath('/portal/inventory/purchase-orders');
  redirect('/portal/inventory/purchase-orders');
}
