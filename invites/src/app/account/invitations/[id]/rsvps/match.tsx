'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { matchReplyAction } from '@/app/account/actions';
import { rankGuests, type Rankable } from '@/lib/guest-match';

/**
 * Joining a reply to the name it belongs to on the couple's own list.
 *
 * "there is a rsvp already for pedro, that what im referring to this tab, it
 * doesnt click to the list i have now"
 *
 * Two ways a reply ends up floating free of the list. It arrived before the
 * list did — her first acceptance came in at 2:47 and the guest list at 4:04
 * — or the guest typed "Jhen" where the list says "Jennifer Dela Cruz". Either
 * way the guest sits on the list as "no reply yet" while their answer sits
 * here attached to nobody, and the headcount is wrong in both directions.
 *
 * The shortlist comes first because it is almost always right: the reply's own
 * words scored against the list, best first. Underneath it, every name, because
 * "almost always" is not always and a couple who cannot find their guest in
 * four suggestions must not be stuck. Nothing is matched without a press.
 *
 * Unmatching is one press from the matched state, because the fastest way to
 * be confident about a control that edits a headcount is to see it undone.
 */
export function MatchToGuest({
  invitationId,
  replyId,
  replyName,
  matchedName,
  guests,
}: {
  invitationId: string;
  replyId: string;
  replyName: string;
  /** The guest this reply is already joined to, when it is joined to one. */
  matchedName?: string;
  /** Every name on the list, for the shortlist and the full pull-down. */
  guests: Rankable[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (guestId: string | null) =>
    start(async () => {
      const r = await matchReplyAction(invitationId, replyId, guestId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError('');
      setOpen(false);
      router.refresh();
    });

  if (matchedName) {
    return (
      <span className="block text-xs">
        <button type="button" className="link" disabled={pending} onClick={() => set(null)}>
          {pending ? 'Undoing…' : 'Not them — undo'}
        </button>
        {error && <span className="block text-[color:var(--bad)]">{error}</span>}
      </span>
    );
  }

  if (!guests.length) return null;

  const best = rankGuests(replyName, guests, 4);

  return (
    <span className="block text-xs">
      {!open ? (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Match to a name on your list
        </button>
      ) : (
        <span className="mt-1 block">
          {best.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {best.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={pending}
                  onClick={() => set(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </span>
          )}
          {/*
            * Every name, under the suggestions rather than instead of them.
            * A list of seventy-four is a scroll; the four the reply actually
            * looks like are a glance.
            */}
          <select
            className="field mt-1"
            defaultValue=""
            disabled={pending}
            aria-label={`Match ${replyName} to a name on your guest list`}
            onChange={(e) => e.target.value && set(e.target.value)}
          >
            <option value="">{best.length ? 'or pick another name…' : 'Pick a name…'}</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button type="button" className="link mt-1" onClick={() => { setOpen(false); setError(''); }}>
            Cancel
          </button>
          {error && <span className="block text-[color:var(--bad)]">{error}</span>}
        </span>
      )}
    </span>
  );
}
