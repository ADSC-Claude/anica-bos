'use client';

import { useState, useTransition } from 'react';
import { eraseMyAccountAction } from '@/app/account/actions';

const PHRASE = 'DELETE MY ACCOUNT';

/**
 * Typing the phrase is the confirmation. A dialog with an OK button is the
 * kind of thing people click through on a phone; this one cannot be.
 */
export function EraseAccount() {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-sm text-[color:var(--bad)]" onClick={() => setOpen(true)}>
        Delete my account
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--bad)] p-4">
      <label className="label" htmlFor="erase-confirm">
        Type <strong>{PHRASE}</strong> to confirm
      </label>
      <input
        id="erase-confirm"
        className="field"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {error && <p role="alert" className="rounded-lg bg-[#fbe9e7] p-2 text-sm text-[#8f1d17]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending || typed !== PHRASE}
          onClick={() =>
            start(async () => {
              setError('');
              const r = await eraseMyAccountAction(typed);
              if (!r.ok) setError(r.error ?? 'Something went wrong.');
              // On success the action redirects; nothing to do here.
            })
          }
        >
          {pending ? 'Deleting…' : 'Delete everything'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { setOpen(false); setTyped(''); setError(''); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
