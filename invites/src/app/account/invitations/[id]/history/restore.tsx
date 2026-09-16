'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreRevisionAction } from '@/app/account/actions';

/**
 * One version's way back. It asks once, because it replaces the whole
 * invitation — and says, once it is done, that the state it replaced is now
 * the first version on the list, so the way back from a restore is known
 * before anybody goes looking for it.
 */
export function RestoreButton({ invitationId, revisionId, when, disabled }: { invitationId: string; revisionId: string; when: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  return (
    <span className="flex flex-wrap items-center gap-2">
      {said && <span className="text-xs text-[color:var(--ok)]">{said}</span>}
      {error && <span role="alert" className="text-xs text-[color:var(--bad)]">{error}</span>}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled || pending}
        onClick={() => {
          if (!window.confirm(`Put the whole invitation back as it was on ${when}? How it is now is kept as a version first.`)) return;
          start(async () => {
            setError('');
            const r = await restoreRevisionAction(invitationId, revisionId);
            if (!r.ok) { setError(r.error); return; }
            setSaid('Restored. The version you left is now at the top of the list.');
            router.refresh();
          });
        }}
      >
        {pending ? 'Restoring…' : 'Restore'}
      </button>
    </span>
  );
}
