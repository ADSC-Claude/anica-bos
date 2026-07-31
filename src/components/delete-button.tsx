'use client';

import { useActionState, useState } from 'react';
import { deleteRecordAction, type DeleteState } from '@/app/portal/delete-actions';

/**
 * Delete, with the confirmation inline rather than in a browser dialog — a
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
}: {
  kind: 'service' | 'serviceCategory' | 'client' | 'employee' | 'item';
  id: string;
  /** What is being deleted, shown in the confirmation. */
  label: string;
  size?: 'sm' | 'md';
}) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteRecordAction, {});
  const [confirming, setConfirming] = useState(false);

  const offersDeactivate = Boolean(state.error && /instead/.test(state.error));

  if (state.ok) {
    return <p className="text-xs font-medium text-cocoa-500">{state.ok}</p>;
  }

  return (
    <div className="space-y-2">
      {!confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`btn-ghost text-clay-500 hover:bg-clay-500/10 ${size === 'sm' ? 'btn-sm' : ''}`}
        >
          Delete
        </button>
      )}

      {confirming && (
        <div className="rounded-xl border border-clay-500/40 bg-clay-500/5 p-3">
          <p className="text-sm font-medium text-cocoa-800">Delete “{label}”?</p>
          <p className="mt-1 text-xs text-cocoa-500">
            This cannot be undone. Anything the books depend on will refuse and offer to be
            hidden instead.
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
                  Hide it instead
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
      )}
    </div>
  );
}
