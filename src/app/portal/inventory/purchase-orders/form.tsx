'use client';

import { useActionState, useState } from 'react';
import { createPurchaseOrderAction, type FormState } from '../actions';
import { formatPeso } from '@/lib/money';

type ItemOption = { id: string; name: string; unitName: string; cost: number };

let seq = 0;

export function PurchaseOrderForm({
  branchId,
  suppliers,
  items,
}: {
  branchId: string;
  suppliers: { id: string; name: string }[];
  items: ItemOption[];
}) {
  const [state, action] = useActionState<FormState, FormData>(createPurchaseOrderAction, {});
  const [lines, setLines] = useState<{ key: string; itemId: string; quantity: string; unitCost: string }[]>([
    { key: `l${++seq}`, itemId: '', quantity: '', unitCost: '' },
  ]);

  const total = lines.reduce(
    (a, l) => a + Math.round((Number(l.unitCost) || 0) * 100) * (Number(l.quantity) || 0),
    0,
  );

  return (
    <form action={action} className="card-pad space-y-3">
      <p className="section-title">New purchase order</p>
      <input type="hidden" name="branchId" value={branchId} />

      <label className="block">
        <span className="label">Supplier *</span>
        <select name="supplierId" className="select" required defaultValue="">
          <option value="" disabled>Choose a supplier…</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>

      <div className="space-y-2">
        <span className="label">Items</span>
        {lines.map((l, i) => (
          <div key={l.key} className="space-y-1.5 rounded-xl border border-sand-200 p-2">
            <select
              name="itemId"
              className="select"
              value={l.itemId}
              onChange={(e) => {
                const item = items.find((x) => x.id === e.target.value);
                setLines((prev) =>
                  prev.map((x, xi) =>
                    xi === i
                      ? { ...x, itemId: e.target.value, unitCost: item ? String(item.cost) : x.unitCost }
                      : x,
                  ),
                );
              }}
            >
              <option value="">Choose an item…</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>{it.name} ({it.unitName})</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input name="quantity" type="number" step="0.01" min={0} className="input" placeholder="Qty"
                value={l.quantity}
                onChange={(e) => setLines((p) => p.map((x, xi) => xi === i ? { ...x, quantity: e.target.value } : x))} />
              <input name="unitCost" type="number" step="0.01" min={0} className="input" placeholder="Unit cost ₱"
                value={l.unitCost}
                onChange={(e) => setLines((p) => p.map((x, xi) => xi === i ? { ...x, unitCost: e.target.value } : x))} />
              {lines.length > 1 && (
                <button type="button" className="btn-ghost btn-sm text-clay-500"
                  onClick={() => setLines((p) => p.filter((_, xi) => xi !== i))}>×</button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary btn-sm w-full"
          onClick={() => setLines((p) => [...p, { key: `l${++seq}`, itemId: '', quantity: '', unitCost: '' }])}
        >
          + Add line
        </button>
      </div>

      <label className="block">
        <span className="label">Notes</span>
        <input name="notes" className="input" />
      </label>

      <p className="rounded-xl bg-sand-100 px-3 py-2 text-sm">
        Total: <strong className="num">{formatPeso(total)}</strong>
      </p>

      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      <button className="btn-primary w-full" type="submit">Create draft PO</button>
    </form>
  );
}
