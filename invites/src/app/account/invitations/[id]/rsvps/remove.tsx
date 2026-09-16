'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteReplyAction } from '@/app/account/actions';

/**
 * Taking one reply off the list, in two taps.
 *
 * Two, because this is the only control on the page that destroys something a
 * guest wrote and there is no undo behind it. One tap is right for settling a
 * headcount, which can be settled again; it is wrong here, on a list a couple
 * reads on a phone with a thumb, where the row under the one they meant is
 * somebody else's answer.
 *
 * The second tap names the guest. "Remove for good?" on its own is a question
 * about whichever row the page happens to have scrolled to — with the name in
 * it, a couple who tapped the wrong line can see that they did.
 */
export function Remove({ invitationId, replyId, name }: { invitationId: string; replyId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  const remove = () =>
    start(async () => {
      const r = await deleteReplyAction(invitationId, replyId);
      if (!r.ok) {
        setError(r.error);
        setAsking(false);
        return;
      }
      // The row is drawn on the server, so the page has to be asked again for
      // it to go. revalidatePath() in the action does the same job; this is
      // the half that runs if the couple's tab has drifted from it.
      router.refresh();
    });

  if (error) return <span className="block text-xs text-[color:var(--bad)]" role="status">{error}</span>;

  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setAsking(true)}
        aria-label={`Remove the reply from ${name}`}
      >
        Remove
      </button>
    );
  }

  return (
    <span className="grid gap-1">
      <span className="text-xs text-[color:var(--color-ink-500)]">Remove {name}?</span>
      <span className="flex gap-1">
        <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={remove}>
          {pending ? 'Removing…' : 'Remove'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setAsking(false)}>
          Keep
        </button>
      </span>
    </span>
  );
}
