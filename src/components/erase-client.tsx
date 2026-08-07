'use client';

import { useActionState, useState } from 'react';
import { eraseClientAction, type FormState } from '@/app/portal/clients/actions';

/**
 * The Owner-only panel for an RA 10173 erasure request.
 *
 * Deliberately not a `DeleteButton`. That one asks "are you sure?", which is
 * the right question for a duplicate record made by a typo and the wrong one
 * here: this is not a mistake being cleaned up, it is a request being carried
 * out, and the person making it is usually at the desk. So the panel spends its
 * space saying what will go and what will stay, and asks for a typed word
 * instead of a second click.
 *
 * Folded shut until asked for. It sits at the bottom of the details tab, and a
 * red box permanently open under the edit form invites the accident it is meant
 * to prevent.
 */
export function EraseClient({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(eraseClientAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <div className="card-pad mt-6 border-clay-500/40">
        <p className="text-sm font-medium text-cocoa-800">Erasure complete</p>
        <p className="muted mt-1">{state.ok}</p>
      </div>
    );
  }

  return (
    <div className="card-pad mt-6 border-clay-500/40">
      <h2 className="section-title mb-1 text-clay-500">Erase personal data</h2>
      <p className="muted">
        For when {clientName} asks to be forgotten under the Data Privacy Act. This cannot be
        undone.
      </p>

      {!open ? (
        <button type="button" className="btn-ghost btn-sm mt-3 text-clay-500" onClick={() => setOpen(true)}>
          She has asked to be erased
        </button>
      ) : (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={clientId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-clay-500/10 px-3 py-2">
              <p className="text-xs font-semibold text-clay-500">Removed for good</p>
              <ul className="mt-1 space-y-0.5 text-xs text-cocoa-600">
                <li>Name, mobile, email, birthday, address</li>
                <li>Every health answer, and her consent record</li>
                <li>Notes, tags, PWD and Senior ID numbers</li>
                <li>Follow-up notes, shift notes, email history</li>
                <li>Photos of her GCash or bank receipts</li>
              </ul>
            </div>
            <div className="rounded-lg bg-cocoa-800/5 px-3 py-2">
              <p className="text-xs font-semibold text-cocoa-600">Kept, because BIR requires it</p>
              <ul className="mt-1 space-y-0.5 text-xs text-cocoa-600">
                <li>Receipts, sales and payment records</li>
                <li>Journal entries and commissions</li>
                <li>Appointment dates and what was booked</li>
                <li>The PWD or Senior ID printed on a receipt</li>
              </ul>
              <p className="mt-1 text-xs text-cocoa-400">
                None of it names her once the record above is empty.
              </p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-cocoa-600">
              Type <strong>ERASE</strong> to confirm
            </span>
            <input
              name="confirm"
              autoComplete="off"
              className="input mt-1 max-w-[12rem]"
              placeholder="ERASE"
              required
            />
          </label>

          {state.error && (
            <p className="rounded-lg bg-clay-500/10 px-2 py-1.5 text-xs text-clay-500">
              {state.error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn-danger btn-sm" disabled={pending}>
              {pending ? 'Erasing…' : 'Erase her personal data'}
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
