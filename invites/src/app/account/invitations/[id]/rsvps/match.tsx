'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { matchReplyAction } from '@/app/account/actions';
import { rankGuests, type Rankable } from '@/lib/guest-match';

/**
 * Joining somebody in a reply to the name they are on the couple's own list.
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
 * The same applies to everyone they brought, which is why this sits under each
 * companion as well as under the reply itself. Pedro's two companions are two
 * more rows on that list, and until somebody says so they are two names in a
 * cell and two guests still being chased.
 *
 * The shortlist comes first because it is almost always right: the person's own
 * name scored against the list, best first. Underneath it, every name, because
 * "almost always" is not always and a couple who cannot find their guest in
 * four suggestions must not be stuck. Nothing is matched without a press.
 *
 * Unmatching is one press from the matched state, because the fastest way to
 * be confident about a control that edits a headcount is to see it undone.
 */
export function MatchToGuest({
  invitationId,
  replyId,
  index,
  who,
  matchedName,
  guests,
  taken,
}: {
  invitationId: string;
  replyId: string;
  /** Position in the party: 0 is the guest who replied, 1 and up are their companions. */
  index: number;
  /** The name shown beside this button — the server checks the reply still reads that way. */
  who: string;
  /** The name on the list this person is already joined to, when they are joined to one. */
  matchedName?: string;
  /** Every name on the list, for the shortlist and the full pull-down. */
  guests: Rankable[];
  /**
   * The names already spoken for, and by whom. A name held by another seat
   * would only be refused — see matchAttendee() — so it is shown greyed with
   * the reason rather than offered and taken away.
   */
  taken: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (guestId: string | null) =>
    start(async () => {
      const r = await matchReplyAction(invitationId, { rsvpId: replyId, index, guestId, who });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError('');
      setOpen(false);
      router.refresh();
    });

  // No list, nothing to match to — and nothing to undo back into, either.
  if (!guests.length) return null;

  if (matchedName) {
    return (
      <span className="block text-xs">
        {/* The head of the party says where it came from in its own sub-line;
            a companion is a name in a cell and has nowhere else to say it. */}
        {index > 0 && (
          <span className="block text-[color:var(--color-ink-500)]">
            {matchedName.trim().toLowerCase() === who.trim().toLowerCase() ? 'on your list' : `on your list as ${matchedName}`}
          </span>
        )}
        <button type="button" className="link" disabled={pending} onClick={() => set(null)}>
          {pending ? 'Undoing…' : 'Not them — undo'}
        </button>
        {error && <span className="block text-[color:var(--bad)]">{error}</span>}
      </span>
    );
  }

  // The shortlist offers only names that can actually be pressed.
  const best = rankGuests(who, guests.filter((g) => !taken[g.id]), 4);
  const why = (id: string, name: string) =>
    taken[id] === name ? `${name} — already replied` : `${name} — with ${taken[id]}`;

  return (
    <span className="block text-xs">
      {!open ? (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          {index === 0 ? 'Match to a name on your list' : 'Match to your list'}
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
            aria-label={`Match ${who} to a name on your guest list`}
            onChange={(e) => e.target.value && set(e.target.value)}
          >
            <option value="">{best.length ? 'or pick another name…' : 'Pick a name…'}</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id} disabled={Boolean(taken[g.id])}>
                {taken[g.id] ? why(g.id, g.name) : g.name}
              </option>
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
