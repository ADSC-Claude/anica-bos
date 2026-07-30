'use client';

import { useActionState } from 'react';
import { recordCorporatePaymentAction, type FormState } from '../actions';

export function CorporatePaymentForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(recordCorporatePaymentAction, {});

  return (
    <form action={action} className="card-pad space-y-3">
      <p className="section-title">Record a payment received</p>
      <label className="block">
        <span className="label">Company *</span>
        <select name="accountId" className="select" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Amount (₱) *</span>
        <input name="amount" type="number" step="0.01" min="0.01" className="input" required />
      </label>
      <label className="block">
        <span className="label">Method</span>
        <select name="method" className="select" defaultValue="BANK_TRANSFER">
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="GCASH">GCash</option>
          <option value="CASH">Cash</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Reference</span>
        <input name="reference" className="input" />
      </label>
      <label className="block">
        <span className="label">Note</span>
        <input name="note" className="input" />
      </label>
      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
      <button className="btn-primary w-full" type="submit">Record payment</button>
    </form>
  );
}
