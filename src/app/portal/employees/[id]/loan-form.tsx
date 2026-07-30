'use client';

import { useActionState } from 'react';
import { saveLoanAction, type FormState } from '../actions';

export function LoanForm({ employeeId }: { employeeId: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveLoanAction, {});

  return (
    <form action={action} className="card-pad space-y-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <label className="block">
        <span className="label">Type</span>
        <select name="type" className="select" defaultValue="COMPANY_LOAN">
          <option value="SSS_LOAN">SSS loan</option>
          <option value="PAGIBIG_LOAN">Pag-IBIG loan</option>
          <option value="COMPANY_LOAN">Company loan</option>
          <option value="CASH_ADVANCE">Cash advance</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Principal (₱) *</span>
          <input name="principal" type="number" step="0.01" min="0.01" className="input" required />
        </label>
        <label className="block">
          <span className="label">Per payroll period (₱) *</span>
          <input name="installment" type="number" step="0.01" min="0.01" className="input" required />
        </label>
      </div>
      <label className="block">
        <span className="label">Start date</span>
        <input name="startDate" type="date" className="input" />
      </label>
      <label className="block">
        <span className="label">Note</span>
        <input name="note" className="input" />
      </label>
      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
      <button className="btn-primary w-full" type="submit">Record loan</button>
    </form>
  );
}
