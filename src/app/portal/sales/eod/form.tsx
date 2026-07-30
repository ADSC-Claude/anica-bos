'use client';

import { useActionState, useState } from 'react';
import { closeDayAction, type SimpleState } from '../actions';
import { formatPeso } from '@/lib/money';

const METHODS = [
  { key: 'CASH', label: 'Cash drawer' },
  { key: 'GCASH', label: 'GCash' },
  { key: 'BANK_TRANSFER', label: 'Bank transfer' },
];

export function EodForm({
  branchId,
  dateKey,
  expected,
  pettyExpected,
}: {
  branchId: string;
  dateKey: string;
  expected: Record<string, number>;
  pettyExpected: number;
}) {
  const [state, action] = useActionState<SimpleState, FormData>(closeDayAction, {});

  const [counted, setCounted] = useState<Record<string, string>>(
    Object.fromEntries(METHODS.map((m) => [m.key, String((expected[m.key] ?? 0) / 100)])),
  );
  const [petty, setPetty] = useState(String(pettyExpected / 100));

  const cashDiff = Math.round(Number(counted.CASH || 0) * 100) - (expected.CASH ?? 0);
  const pettyDiff = Math.round(Number(petty || 0) * 100) - pettyExpected;
  const overShort = cashDiff + pettyDiff;

  return (
    <form action={action} className="card-pad space-y-3">
      <p className="section-title">Count the drawer</p>
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="dateKey" value={dateKey} />

      {METHODS.map((m) => (
        <div key={m.key} className="flex items-center justify-between gap-3">
          <span className="text-sm">
            {m.label}
            <span className="block text-xs text-moss-400">
              expected {formatPeso(expected[m.key] ?? 0)}
            </span>
          </span>
          <input
            name={`counted_${m.key}`}
            type="number"
            step="0.01"
            className="input w-32 text-right"
            value={counted[m.key] ?? '0'}
            onChange={(e) => setCounted({ ...counted, [m.key]: e.target.value })}
          />
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 border-t border-sand-200 pt-3">
        <span className="text-sm">
          Petty cash box
          <span className="block text-xs text-moss-400">expected {formatPeso(pettyExpected)}</span>
        </span>
        <input
          name="counted_PETTY"
          type="number"
          step="0.01"
          className="input w-32 text-right"
          value={petty}
          onChange={(e) => setPetty(e.target.value)}
        />
      </div>

      <p
        className={`rounded-xl px-3 py-2 text-sm font-semibold ${
          overShort === 0
            ? 'bg-moss-100 text-moss-700'
            : 'bg-clay-500/10 text-clay-500'
        }`}
      >
        {overShort === 0
          ? 'Balanced — nothing over or short.'
          : overShort > 0
            ? `Over by ${formatPeso(overShort)}`
            : `Short by ${formatPeso(-overShort)}`}
      </p>

      <label className="block">
        <span className="label">Notes (explain any difference)</span>
        <textarea name="notes" className="textarea" rows={2} />
      </label>

      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}

      <button className="btn-primary w-full" type="submit">
        Close &amp; lock this day
      </button>
      <p className="text-[11px] text-moss-400">
        Once closed, sales, voids and edits for this date are blocked. Only the Owner or Manager
        can reopen it, and the reopening is audit-logged.
      </p>
    </form>
  );
}

