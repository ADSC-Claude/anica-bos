'use client';

import { useActionState } from 'react';
import { issueVouchersAction, type FormState } from '../actions';

export function VoucherForm() {
  const [state, action] = useActionState<FormState, FormData>(issueVouchersAction, {});

  return (
    <form action={action} className="card-pad space-y-3">
      <p className="section-title">Issue a voucher batch</p>
      <p className="muted">
        For campaigns, giveaways and apology vouchers. Redeemed by typing the code at checkout.
      </p>

      <label className="block">
        <span className="label">Batch name *</span>
        <input name="batchName" className="input" required placeholder="e.g. October giveaway" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">How many codes</span>
          <input name="count" type="number" min={1} max={500} className="input" defaultValue={10} />
        </label>
        <label className="block">
          <span className="label">Code prefix</span>
          <input name="prefix" className="input" defaultValue="ANC" maxLength={8} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Discount type</span>
          <select name="type" className="select" defaultValue="PERCENT">
            <option value="PERCENT">Percent off</option>
            <option value="FIXED">Fixed ₱ off</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Value</span>
          <input name="value" type="number" step="0.01" min={0} className="input" defaultValue={10} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Uses per code</span>
          <input name="usesAllowed" type="number" min={1} className="input" defaultValue={1} />
        </label>
        <label className="block">
          <span className="label">Expires</span>
          <input name="expiresAt" type="date" className="input" />
        </label>
      </div>
      <label className="block">
        <span className="label">Note</span>
        <input name="note" className="input" />
      </label>

      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
      <button className="btn-primary w-full" type="submit">Issue vouchers</button>
    </form>
  );
}
