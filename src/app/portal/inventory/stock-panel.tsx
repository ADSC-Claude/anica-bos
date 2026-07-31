'use client';

import { useActionState, useState } from 'react';
import { adjustStockAction, saveItemAction, type FormState } from './actions';
import { formatPeso } from '@/lib/money';
import { DeleteButton } from '@/components/delete-button';

type Item = {
  id: string; name: string; sku: string;
  categoryId: string; categoryName: string;
  unitId: string; unitName: string;
  cost: number; retailPrice: number; sellable: boolean;
  stockQty: number; reorderLevel: number;
  supplierId: string; supplierName: string;
  low: boolean;
};
type Option = { id: string; name: string };

export function StockPanel({
  branchId,
  items,
  categories,
  units,
  suppliers,
  canEdit,
}: {
  branchId: string;
  items: Item[];
  categories: Option[];
  units: Option[];
  suppliers: Option[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [adjusting, setAdjusting] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const [itemState, itemAction] = useActionState<FormState, FormData>(saveItemAction, {});
  const [adjustState, adjustAction] = useActionState<FormState, FormData>(adjustStockAction, {});

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Reorder at</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Retail</th>
              <th>Supplier</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.low ? 'bg-clay-500/5' : ''}>
                <td>
                  <span className="font-medium text-cocoa-800">{i.name}</span>
                  {i.sku && <span className="block text-[11px] text-cocoa-400">{i.sku}</span>}
                </td>
                <td className="text-xs text-cocoa-500">{i.categoryName}</td>
                <td className={`num text-right ${i.low ? 'font-semibold text-clay-500' : ''}`}>
                  {i.stockQty} {i.unitName}
                </td>
                <td className="num text-right text-cocoa-400">{i.reorderLevel || '—'}</td>
                <td className="num text-right">{formatPeso(Math.round(i.cost * 100))}</td>
                <td className="num text-right">
                  {i.sellable ? formatPeso(Math.round(i.retailPrice * 100)) : '—'}
                </td>
                <td className="text-xs text-cocoa-500">{i.supplierName || '—'}</td>
                <td className="whitespace-nowrap">
                  <button className="btn-ghost btn-sm" onClick={() => { setAdjusting(i); setEditing(null); setCreating(false); }}>
                    Adjust
                  </button>
                  {canEdit && (
                    <button className="btn-ghost btn-sm" onClick={() => { setEditing(i); setAdjusting(null); setCreating(false); }}>
                      Edit
                    </button>
                  )}
                  {canEdit && <DeleteButton kind="item" id={i.id} label={i.name} />}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-cocoa-400">No items yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        {canEdit && !editing && !creating && (
          <button className="btn-primary w-full" onClick={() => { setCreating(true); setAdjusting(null); }}>
            + New item
          </button>
        )}

        {adjusting && (
          <form action={adjustAction} className="card-pad space-y-3" key={`adj-${adjusting.id}`}>
            <div className="flex items-center justify-between">
              <p className="section-title">Adjust stock</p>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAdjusting(null)}>×</button>
            </div>
            <p className="muted">
              {adjusting.name} — currently {adjusting.stockQty} {adjusting.unitName}
            </p>
            <input type="hidden" name="branchId" value={branchId} />
            <input type="hidden" name="itemId" value={adjusting.id} />
            <label className="block">
              <span className="label">Movement type</span>
              <select name="type" className="select" defaultValue="USAGE">
                <option value="USAGE">Usage (manual deduction)</option>
                <option value="WASTAGE">Wastage / spoilage</option>
                <option value="ADJUSTMENT">Adjustment (+/−)</option>
                <option value="RETURN">Return to supplier</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Quantity ({adjusting.unitName})</span>
              <input name="quantity" type="number" step="0.01" className="input" required
                placeholder="Use a negative number to remove on an adjustment" />
            </label>
            <label className="block">
              <span className="label">Reason * (required for the audit trail)</span>
              <input name="reason" className="input" required />
            </label>
            {adjustState.error && <p className="text-sm text-clay-500">{adjustState.error}</p>}
            {adjustState.ok && <p className="text-sm text-cocoa-600">{adjustState.ok}</p>}
            <button className="btn-primary w-full" type="submit">Record movement</button>
          </form>
        )}

        {(editing || creating) && canEdit && (
          <form action={itemAction} className="card-pad space-y-3" key={editing?.id ?? 'new'}>
            <div className="flex items-center justify-between">
              <p className="section-title">{editing ? 'Edit item' : 'New item'}</p>
              <button type="button" className="btn-ghost btn-sm"
                onClick={() => { setEditing(null); setCreating(false); }}>×</button>
            </div>
            <input type="hidden" name="branchId" value={branchId} />
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <label className="block">
              <span className="label">Name *</span>
              <input name="name" className="input" defaultValue={editing?.name} required />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Category</span>
                <select name="categoryId" className="select" defaultValue={editing?.categoryId}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">Unit</span>
                <select name="unitId" className="select" defaultValue={editing?.unitId}>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Cost (₱)</span>
                <input name="cost" type="number" step="0.01" min={0} className="input"
                  defaultValue={editing?.cost ?? 0} />
              </label>
              <label className="block">
                <span className="label">Retail price (₱)</span>
                <input name="retailPrice" type="number" step="0.01" min={0} className="input"
                  defaultValue={editing?.retailPrice ?? 0} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Reorder level</span>
                <input name="reorderLevel" type="number" step="0.01" min={0} className="input"
                  defaultValue={editing?.reorderLevel ?? 0} />
              </label>
              {!editing && (
                <label className="block">
                  <span className="label">Opening stock</span>
                  <input name="openingStock" type="number" step="0.01" min={0} className="input" defaultValue={0} />
                </label>
              )}
            </div>
            <label className="block">
              <span className="label">Supplier</span>
              <select name="supplierId" className="select" defaultValue={editing?.supplierId ?? ''}>
                <option value="">— none —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">SKU / code</span>
              <input name="sku" className="input" defaultValue={editing?.sku} />
            </label>
            <label className="flex items-center gap-2 text-sm text-cocoa-700">
              <input type="checkbox" name="sellable" className="h-5 w-5 accent-[#6b4e35]"
                defaultChecked={editing?.sellable} />
              Sold at the counter (retail product)
            </label>
            {editing && (
              <label className="flex items-center gap-2 text-sm text-cocoa-700">
                <input type="checkbox" name="archived" className="h-5 w-5 accent-[#6b4e35]" />
                Archive this item (history is kept)
              </label>
            )}
            {itemState.error && <p className="text-sm text-clay-500">{itemState.error}</p>}
            {itemState.ok && <p className="text-sm text-cocoa-600">{itemState.ok}</p>}
            <button className="btn-primary w-full" type="submit">Save item</button>
          </form>
        )}
      </div>
    </div>
  );
}
