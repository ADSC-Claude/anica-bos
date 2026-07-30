'use client';

import { useActionState } from 'react';
import { submitExpenseAction, type FormState } from '../actions';

export function ExpenseForm({
  branchId,
  categories,
  autoApproves,
}: {
  branchId: string;
  categories: { id: string; name: string }[];
  autoApproves: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(submitExpenseAction, {});

  return (
    <form action={action} className="card-pad space-y-3">
      <p className="section-title">Record an expense</p>
      <input type="hidden" name="branchId" value={branchId} />

      <label className="block">
        <span className="label">Description *</span>
        <input name="description" className="input" required placeholder="e.g. Meralco electricity" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Amount (₱) *</span>
          <input name="amount" type="number" step="0.01" min="0.01" className="input" required />
        </label>
        <label className="block">
          <span className="label">Date</span>
          <input name="expenseDate" type="date" className="input" />
        </label>
      </div>
      <label className="block">
        <span className="label">Category *</span>
        <select name="categoryId" className="select" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Paid with</span>
        <select name="method" className="select" defaultValue="CASH">
          <option value="CASH">Cash</option>
          <option value="GCASH">GCash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Receipt photo URL</span>
        <input name="receiptUrl" className="input" placeholder="Paste a link (optional)" />
      </label>

      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
      <button className="btn-primary w-full" type="submit">
        {autoApproves ? 'Record expense' : 'Submit for approval'}
      </button>
      {!autoApproves && (
        <p className="text-[11px] text-moss-400">
          Your entry stays pending until the Owner or Manager approves it, and only then does it
          appear in the P&amp;L.
        </p>
      )}
    </form>
  );
}
