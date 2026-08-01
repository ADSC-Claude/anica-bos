'use client';

import { useActionState, useState } from 'react';
import { deleteRecordAction, type DeleteState } from '@/app/portal/delete-actions';

/**
 * Delete, confirmed in a dialog of our own rather than the browser's — a
 * `confirm()` on a tablet is easy to dismiss by accident, and it cannot show
 * what is about to go.
 *
 * A record that history depends on comes back refused, naming what is in the
 * way; where hiding it is the sensible alternative, the refusal offers that as
 * a second button rather than leaving the user stuck.
 */
export function DeleteButton({
  kind,
  id,
  label,
  size = 'sm',
  deactivateLabel = 'Hide it instead',
}: {
  kind: 'service' | 'serviceCategory' | 'resource' | 'client' | 'employee' | 'item' | 'user';
  id: string;
  /** What is being deleted, shown in the confirmation. */
  label: string;
  size?: 'sm' | 'md';
  /** Wording of the fallback button; "hide" makes no sense for an account. */
  deactivateLabel?: string;
}) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteRecordAction, {});
  const [confirming, setConfirming] = useState(false);

  const offersDeactivate = Boolean(state.error && /instead/.test(state.error));

  if (state.ok) {
    return <p className="text-xs font-medium text-cocoa-500">{state.ok}</p>;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`btn-ghost text-clay-500 hover:bg-clay-500/10 ${size === 'sm' ? 'btn-sm' : ''}`}
      >
        Delete
      </button>

      {/* Centred over the page rather than opened inside the row. Every caller
          puts this in a right-hand table cell, where a panel has nowhere to go:
          it either refuses to wrap and shoves the table sideways, or wraps to
          one word per line, and `.table-wrap` clips whatever spills. Fixed
          positioning leaves the table's geometry alone entirely. */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-cocoa-800/40 p-4"
          onClick={() => !pending && setConfirming(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-clay-500/40 bg-white p-4 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-cocoa-800">Delete “{label}”?</p>
            <p className="mt-1 text-xs text-cocoa-500">
              This cannot be undone. Anything the books depend on will refuse, and offer to{' '}
              {deactivateLabel.replace(/ instead$/, '').toLowerCase()} instead.
            </p>

            {state.error && (
              <p className="mt-2 rounded-lg bg-clay-500/10 px-2 py-1.5 text-xs text-clay-500">
                {state.error}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <form action={action}>
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="mode" value="delete" />
                <button type="submit" className="btn-danger btn-sm" disabled={pending}>
                  {pending ? 'Deleting…' : 'Yes, delete'}
                </button>
              </form>

              {offersDeactivate && (
                <form action={action}>
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="mode" value="deactivate" />
                  <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
                    {deactivateLabel}
                  </button>
                </form>
              )}

              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
