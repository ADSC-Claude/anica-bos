'use client';

import { useActionState } from 'react';
import { generatePayrollAction, type FormState } from '../actions';

export function PayrollGenerator({
  branchId,
  defaultFrom,
  defaultTo,
}: {
  branchId: string;
  defaultFrom: string;
  defaultTo: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(generatePayrollAction, {});

  return (
    <form action={action} className="card-pad space-y-3">
      <p className="section-title">Generate a period</p>
      <input type="hidden" name="branchId" value={branchId} />
      <label className="block">
        <span className="label">From</span>
        <input name="fromKey" type="date" className="input" defaultValue={defaultFrom} required />
      </label>
      <label className="block">
        <span className="label">To</span>
        <input name="toKey" type="date" className="input" defaultValue={defaultTo} required />
      </label>
      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      <button className="btn-primary w-full" type="submit">
        Generate draft payslips
      </button>
      <p className="text-[11px] text-moss-400">
        Pulls attendance, commissions, tips, late/absence rules, holiday pay, loans and
        contributions. Regenerating keeps any manual adjustments you added.
      </p>
    </form>
  );
}
