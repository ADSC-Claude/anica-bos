'use client';

import { useTransition } from 'react';
import { toggleRsvpAction } from '@/app/account/actions';

export function RsvpToggle({ invitationId, closed }: { invitationId: string; closed: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await toggleRsvpAction(invitationId, !closed); })}>
      {closed ? 'Reopen RSVP' : 'Close RSVP'}
    </button>
  );
}
