'use client';

import { useActionState } from 'react';
import { pettyCashAction, requestReplenishmentAction, type SimpleState } from '../actions';

export function PettyCashForm({
  branchId,
  categories,
  canAddCash,
}: {
  branchId: string;
  categories: { id: string; name: string }[];
  canAddCash: boolean;
}) {
  const [state, action] = useActionState<SimpleState, FormData>(pettyCashAction, {});
  const [reqState, reqAction] = useActionState<SimpleState, FormData>(
    requestReplenishmentAction,
    {},
  );

  return (
    <div className="space-y-4">
      <form action={action} className="card-pad space-y-3">
        <p className="section-title">Record a movement</p>
        <input type="hidden" name="branchId" value={branchId} />

        <label className="block">
          <span className="label">Type</span>
          <select name="direction" className="select" defaultValue="OUT">
            <option value="OUT">Cash out (expense)</option>
            {canAddCash && <option value="IN">Cash in / replenishment</option>}
          </select>
        </label>

        <label className="block">
          <span className="label">Amount (₱) *</span>
          <input name="amount" type="number" min="0.01" step="0.01" className="input" required />
        </label>

        <label className="block">
          <span className="label">Description *</span>
          <input name="description" className="input" required
            placeholder="e.g. water delivery, supplies run" />
        </label>

        <label className="block">
          <span className="label">Expense category</span>
          <select name="categoryId" className="select" defaultValue="">
            <option value="">Miscellaneous</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">Receipt photo URL (optional)</span>
          <input name="receiptUrl" className="input" placeholder="Paste a link or leave blank" />
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">Record</button>
      </form>

      <form action={reqAction} className="card-pad space-y-3">
        <p className="section-title">Request a replenishment</p>
        <input type="hidden" name="branchId" value={branchId} />
        <label className="block">
          <span className="label">Amount needed (₱)</span>
          <input name="amount" type="number" min="0.01" step="0.01" className="input" required />
        </label>
        <label className="block">
          <span className="label">Reason</span>
          <input name="reason" className="input" placeholder="e.g. box is down to ₱400" />
        </label>
        {reqState.error && <p className="text-sm text-clay-500">{reqState.error}</p>}
        {reqState.ok && <p className="text-sm text-cocoa-600">{reqState.ok}</p>}
        <button className="btn-secondary w-full" type="submit">Send request</button>
      </form>
    </div>
  );
}
