'use client';

import { useState, useTransition } from 'react';
import { supportMessageAction } from '../actions';

export function SupportForm({ invitationId = null }: { invitationId?: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const res = await supportMessageAction(invitationId, fd);
          if (!res.ok) setError(res.error);
          else {
            setError('');
            form.reset();
          }
        });
      }}
    >
      <input name="body" className="field" placeholder="Write a message…" required />
      <button type="submit" className="btn btn-primary" disabled={pending}>Send</button>
      {error && <p className="text-xs text-[color:var(--bad)]">{error}</p>}
    </form>
  );
}
