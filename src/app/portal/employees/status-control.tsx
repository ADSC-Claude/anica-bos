'use client';

import { useActionState, useState } from 'react';
import { setEmploymentStatusAction, type FormState } from './actions';

const LABELS: Record<string, string> = {
  ACTIVE: 'active',
  ON_LEAVE: 'on leave',
  SUSPENDED: 'suspended',
  SEPARATED: 'separated',
};

const TONE: Record<string, string> = {
  ACTIVE: 'bg-cocoa-100 text-cocoa-700',
  ON_LEAVE: 'bg-sand-200 text-cocoa-700',
  SUSPENDED: 'bg-gilt-500/20 text-gilt-600',
  SEPARATED: 'bg-clay-500/15 text-clay-500',
};

/**
 * The status badge, but you can click it.
 *
 * Separating someone asks for the last day worked, because "when" is the part
 * payroll and any later dispute actually turn on, and nobody remembers it a
 * month afterwards.
 */
export function EmploymentStatusControl({
  employeeId,
  name,
  status,
  separatedAt,
  separationReason,
  canEdit,
}: {
  employeeId: string;
  name: string;
  status: string;
  separatedAt: string | null;
  separationReason: string;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setEmploymentStatusAction,
    {},
  );
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(status);

  const badge = (
    <span
      className={`badge ${TONE[status] ?? TONE.ACTIVE}`}
      title={
        status === 'SEPARATED' && separatedAt
          ? `Last day ${separatedAt}${separationReason ? ` — ${separationReason}` : ''}`
          : undefined
      }
    >
      {LABELS[status] ?? status.toLowerCase()}
    </span>
  );

  if (!canEdit) return badge;

  return (
    <div className="space-y-2">
      {!open && (
        <button
          type="button"
          onClick={() => {
            setChoice(status);
            setOpen(true);
          }}
          className="rounded-full transition hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa-600"
          aria-label={`Change status for ${name}`}
        >
          {badge}
        </button>
      )}

      {status === 'SEPARATED' && separatedAt && !open && (
        <span className="block text-[11px] text-cocoa-400">since {separatedAt}</span>
      )}

      {open && (
        <form action={action} className="rounded-xl border border-sand-200 bg-white p-3">
          <input type="hidden" name="employeeId" value={employeeId} />
          <p className="text-sm font-medium text-cocoa-800">{name}</p>

          <label className="mt-2 block">
            <span className="label">Status</span>
            <select
              name="status"
              className="select"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="SEPARATED">Separated</option>
            </select>
          </label>

          {choice === 'SEPARATED' && (
            <>
              <label className="mt-2 block">
                <span className="label">Last day worked *</span>
                <input
                  type="date"
                  name="separatedOn"
                  className="input"
                  defaultValue={separatedAt ?? ''}
                  required
                />
              </label>
              <label className="mt-2 block">
                <span className="label">Reason</span>
                <input
                  name="reason"
                  className="input"
                  defaultValue={separationReason}
                  placeholder="Resigned, end of contract, …"
                />
              </label>
              <p className="mt-2 text-[11px] text-cocoa-400">
                They move to the separated list. Payslips, commissions and attendance are
                all kept.
              </p>
            </>
          )}

          {choice !== 'ACTIVE' && choice !== 'SEPARATED' && (
            <p className="mt-2 text-[11px] text-cocoa-400">
              They stay on the payroll but come off the roster and the POS.
            </p>
          )}

          {state.error && (
            <p className="mt-2 rounded-lg bg-clay-500/10 px-2 py-1.5 text-xs text-clay-500">
              {state.error}
            </p>
          )}
          {state.ok && <p className="mt-2 text-xs font-medium text-cocoa-500">{state.ok}</p>}

          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
