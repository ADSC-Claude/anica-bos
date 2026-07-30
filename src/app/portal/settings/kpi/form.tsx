'use client';

import { useActionState } from 'react';
import { saveKpiTargetsAction, type FormState } from '../actions';

export function KpiTargetForm({
  periodKey,
  rows,
}: {
  periodKey: string;
  rows: { key: string; label: string; format: string; value: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveKpiTargetsAction, {});

  return (
    <form action={action} className="card-pad space-y-3">
      <input type="hidden" name="periodKey" value={periodKey} />
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-3">
          <label className="flex-1 text-sm text-moss-700" htmlFor={`kpi-${r.key}`}>
            {r.label}
          </label>
          <input type="hidden" name="kpiKey" value={r.key} />
          <input type="hidden" name="kpiFormat" value={r.format} />
          <input
            id={`kpi-${r.key}`}
            name="kpiValue"
            type="number"
            step={r.format === 'money' || r.format === 'rating' ? '0.01' : '1'}
            min={0}
            className="input w-32 text-right"
            defaultValue={r.value}
            placeholder="—"
          />
        </div>
      ))}
      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
      <button className="btn-primary" type="submit">Save targets</button>
      <p className="text-[11px] text-moss-400">
        Leave a field blank to track the KPI without a target.
      </p>
    </form>
  );
}
