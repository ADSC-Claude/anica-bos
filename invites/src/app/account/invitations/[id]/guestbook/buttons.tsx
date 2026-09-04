'use client';

import { useTransition } from 'react';
import { moderateGuestbookAction } from '@/app/account/actions';

export function ModerateButtons({ invitationId, entryId, approved }: { invitationId: string; entryId: string; approved: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      {!approved && <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { await moderateGuestbookAction(invitationId, entryId, 'approve'); })}>Approve</button>}
      <button type="button" className="btn btn-ghost btn-sm text-[color:var(--bad)]" disabled={pending} onClick={() => start(async () => { await moderateGuestbookAction(invitationId, entryId, 'delete'); })}>Delete</button>
    </div>
  );
}
