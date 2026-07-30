'use client';

import { useActionState, useState } from 'react';
import { saveIncentiveSchemeAction, type FormState } from '../actions';

type Scheme = {
  id: string;
  name: string;
  targetRole: string;
  formula: string;
  value: number;
  targetValue: number;
  metric: string;
  period: string;
  active: boolean;
  note: string;
};

export function IncentiveSchemeForm({ schemes }: { schemes: Scheme[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveIncentiveSchemeAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = schemes.find((s) => s.id === selectedId);
  const [formula, setFormula] = useState(current?.formula ?? 'FIXED_AMOUNT');

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an existing scheme</span>
        <select
          className="select"
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setFormula(schemes.find((s) => s.id === e.target.value)?.formula ?? 'FIXED_AMOUNT');
          }}
        >
          <option value="">— create a new scheme —</option>
          {schemes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Scheme name *</span>
          <input name="name" className="input" defaultValue={current?.name} required
            placeholder="e.g. Therapist of the Month" />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Applies to</span>
            <select name="targetRole" className="select" defaultValue={current?.targetRole ?? 'THERAPIST'}>
              <option value="THERAPIST">Therapists</option>
              <option value="RECEPTIONIST">Receptionist</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Period</span>
            <select name="period" className="select" defaultValue={current?.period ?? 'MONTHLY'}>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Measured on</span>
            <select name="metric" className="select" defaultValue={current?.metric ?? 'revenue'}>
              <option value="revenue">Revenue generated</option>
              <option value="rating">Average client rating</option>
              <option value="attendance">Attendance days</option>
              <option value="bookings">Online bookings confirmed</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Formula</span>
            <select name="formula" className="select" value={formula}
              onChange={(e) => setFormula(e.target.value)}>
              <option value="FIXED_AMOUNT">Fixed amount (top performer)</option>
              <option value="PERCENT_OF_REVENUE">Percent of revenue</option>
              <option value="PERCENT_OF_TARGET">Percent of target, pro-rated</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">
              {formula === 'FIXED_AMOUNT' ? 'Amount (₱)' : 'Percent (%)'}
            </span>
            <input name="value" type="number" step="0.01" min={0} className="input"
              defaultValue={current?.value ?? 0} />
          </label>
          {formula === 'PERCENT_OF_TARGET' && (
            <label className="block">
              <span className="label">Monthly target (₱)</span>
              <input name="targetValue" type="number" step="0.01" min={0} className="input"
                defaultValue={current?.targetValue ?? 0} />
            </label>
          )}
        </div>

        <label className="block">
          <span className="label">Note for yourself</span>
          <textarea name="note" className="textarea" rows={2} defaultValue={current?.note} />
        </label>

        <label className="flex items-center gap-2 text-sm text-moss-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#345a3e]"
            defaultChecked={current?.active ?? true} />
          Scheme is active
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
        <button className="btn-primary" type="submit">
          {selectedId ? 'Save scheme' : 'Create scheme'}
        </button>
      </form>
    </div>
  );
}
