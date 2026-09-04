'use client';

import { useTransition } from 'react';
import { moderatePhotoAction } from '@/app/account/actions';

export function PhotoButtons({ invitationId, photoId, approved }: { invitationId: string; photoId: string; approved: boolean }) {
  const [pending, start] = useTransition();
  const run = (decision: 'approve' | 'hide' | 'delete') =>
    start(async () => { await moderatePhotoAction(invitationId, photoId, decision); });

  return (
    <div className="flex gap-2">
      {approved ? (
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run('hide')}>Hide</button>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run('approve')}>Approve</button>
      )}
      <button type="button" className="btn btn-ghost btn-sm text-[color:var(--bad)]" disabled={pending} onClick={() => run('delete')}>Delete</button>
    </div>
  );
}
