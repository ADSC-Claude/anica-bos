'use client';

import { useState, useTransition } from 'react';
import { decideSeatsAction, messageGuestAction } from '@/app/account/actions';
import { trimNote, asChatText, chatLinks } from '@/lib/seat-message';

export type Reply = {
  id: string;
  /** What to call them in a message — their salutation where there is one. */
  guestName: string;
  /** What they put down. */
  claimed: number;
  /** What the couple settled on, or null while they have not. */
  approved: number | null;
  /** Whether this one is queued for a decision. */
  awaiting: boolean;
  /** Whether there is an address to send to. */
  address: string;
};

/**
 * Settling one reply, and then telling the guest about it.
 *
 * The two are separate buttons on purpose. Settling is the number the caterer
 * needs and takes one tap; the message is a sentence the couple has to mean,
 * and holding the headcount hostage until they have written it would leave the
 * count wrong for as long as they put it off.
 *
 * The drawer opens by itself after a cut, though, because a cut that nobody is
 * told about is the worst outcome available here: the guest turns up with four
 * people and finds two chairs.
 */
export function Decide({
  invitationId,
  hosts,
  link,
  reply,
}: {
  invitationId: string;
  hosts: string;
  link: string;
  reply: Reply;
}) {
  const [pending, start] = useTransition();
  // Not held in state: a guest may edit their reply, and a frozen copy would
  // leave the draft quoting a number that is no longer on the row.
  const claimed = reply.claimed;
  const [want, setWant] = useState(reply.approved ?? reply.claimed);
  const [settled, setSettled] = useState<number | null>(reply.approved);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const note = trimNote({ guestName: reply.guestName, hosts, claimed, approved: settled ?? want, link });
  const [subject, setSubject] = useState(note.subject);
  const [body, setBody] = useState(note.body);

  const settle = (n: number) =>
    start(async () => {
      const r = await decideSeatsAction(invitationId, reply.id, n);
      if (!r.ok) { setSaid({ ok: false, text: r.error }); return; }
      setSettled(r.data.approved);
      setSaid(null);
      if (r.data.trimmed) {
        // Re-draft against the number that was actually saved, then show it.
        const fresh = trimNote({ guestName: reply.guestName, hosts, claimed, approved: r.data.approved, link });
        setSubject(fresh.subject);
        setBody(fresh.body);
        setOpen(true);
      }
    });

  const send = () =>
    start(async () => {
      const r = await messageGuestAction(invitationId, reply.id, subject, body);
      setSaid(r.ok
        ? { ok: true, text: r.data.status === 'sent' ? `Sent to ${r.data.to}.` : `Written down — no mail key set, so nothing left the building.` }
        : { ok: false, text: r.error });
    });

  const trimmed = settled !== null && settled < claimed;
  const chat = asChatText({ subject, body });

  return (
    <div className="grid gap-2">
      {settled === null ? (
        <>
          <span className="text-xs text-[color:var(--color-ink-500)]">
            They put down <b className="text-[color:var(--color-ink-900)]">{claimed}</b>, and nothing was set aside for them.
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg border border-[color:var(--color-sand-300)] bg-white">
              <button type="button" className="px-2.5 py-1 text-base leading-none text-[color:var(--color-plum-600)] disabled:text-[color:var(--color-sand-300)]" disabled={pending || want <= 0} onClick={() => setWant(want - 1)} aria-label="One fewer">−</button>
              <span className="min-w-[2.5rem] text-center text-xs tabular-nums">{want}</span>
              <button type="button" className="px-2.5 py-1 text-base leading-none text-[color:var(--color-plum-600)] disabled:text-[color:var(--color-sand-300)]" disabled={pending || want >= 99} onClick={() => setWant(want + 1)} aria-label="One more">+</button>
            </span>
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => settle(want)}>
              {want === claimed ? `Keep all ${claimed}` : `Settle at ${want}`}
            </button>
          </span>
        </>
      ) : (
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`pill ${trimmed ? 'pill-muted' : 'pill-ok'}`}>
            {trimmed ? `Settled at ${settled} of ${claimed}` : `Kept all ${settled}`}
          </span>
          {trimmed && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(!open)}>
              {open ? 'Close' : 'Tell them'}
            </button>
          )}
        </span>
      )}

      {said && <p className={`text-xs ${said.ok ? 'text-[color:var(--ok)]' : 'text-[color:var(--bad)]'}`} role="status">{said.text}</p>}

      {open && (
        <div className="grid gap-2 rounded-lg border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50,#fbf8f3)] p-3">
          <p className="text-xs text-[color:var(--color-ink-500)]">
            Your words, not ours — change anything. Nothing has gone to this guest yet.
          </p>
          <label className="grid gap-1">
            <span className="text-xs font-medium">Subject</span>
            <input className="field text-xs" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium">Message</span>
            <textarea className="field text-xs" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>

          <span className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={pending || !reply.address} onClick={send}>
              Send by e-mail
            </button>
            {/* The chat apps take the words in the link, so these open the
                couple's own app with the message already typed. Their phone
                sends it, which costs nobody anything and lands in the thread
                the family is already using. */}
            {chatLinks(chat).map((l) => (
              <a key={l.label} className="btn btn-secondary btn-sm" href={l.href} target="_blank" rel="noopener">{l.label}</a>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const fallback = () => setSaid({ ok: false, text: 'Could not copy here — select the message above and copy it by hand.' });
                if (!navigator.clipboard) { fallback(); return; }
                navigator.clipboard.writeText(chat).then(() => setSaid({ ok: true, text: 'Copied — paste it into Messenger.' }), fallback);
              }}
            >
              Copy
            </button>
          </span>
          {!reply.address && (
            <p className="text-xs text-[color:var(--color-ink-500)]">
              This guest left no e-mail address, so send it from your own phone with one of the buttons above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
