'use client';

import { useState, useTransition } from 'react';
import { publishAction, unpublishAction, toggleRsvpAction } from '@/app/account/actions';

/**
 * Publish, and what publishing with gaps means.
 *
 * `problems` are the few things an invitation cannot go out without — the
 * names, the date — and they hold the button. `blanks` are the parts left
 * empty, which are allowed: a customer with no story to tell should not be
 * held at the door by a box they will never fill. But nothing vanishes as a
 * surprise, so the blanks are named, the parts that will not appear are said
 * plainly, and the customer ticks once to say send it anyway. What they ticked
 * is passed to the server and kept on the invitation, so whoever works on it
 * next knows those gaps were a decision.
 */
export function PublishControls({ invitationId, status, problems, blanks = [], skipped = [], rsvpClosed, rsvp = true }: {
  invitationId: string;
  status: string;
  problems: string[];
  /** The sections left empty, by their label, and the keys behind them. */
  blanks?: { key: string; label: string }[];
  /** Of those, the ones that will simply not appear on the invitation. */
  skipped?: string[];
  rsvpClosed: boolean;
  rsvp?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError('');
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
    });
  return (
    <div className="mt-3 space-y-2">
      {problems.length > 0 && status !== 'PUBLISHED' && <ul className="text-xs text-[color:var(--warn)]">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
      {status !== 'PUBLISHED' && problems.length === 0 && blanks.length > 0 && (
        <div className="rounded-xl border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] p-3">
          <p className="text-sm font-semibold">{blanks.length} part{blanks.length === 1 ? '' : 's'} still empty</p>
          <p className="mt-1 text-xs text-[color:var(--color-ink-700)]">
            You can send it like this. {skipped.length > 0 ? `These will simply not appear on your invitation: ${skipped.join(', ')}.` : 'Nothing will be missing from the page.'} You can still add a whole part later — message us and we put it in.
          </p>
          <ul className="mt-2 grid gap-0.5 text-xs text-[color:var(--color-ink-700)] sm:grid-cols-2">
            {blanks.map((b) => <li key={b.key}>• {b.label}</li>)}
          </ul>
          <label className="mt-2 flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>Send my invitation with these left blank. I know what will not show.</span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status === 'PUBLISHED' ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => unpublishAction(invitationId))}>Unpublish</button>
            {/* A Save the Date collects no replies, so it has none to close. */}
            {rsvp && <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => toggleRsvpAction(invitationId, !rsvpClosed))}>{rsvpClosed ? 'Reopen RSVP' : 'Close RSVP'}</button>}
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={pending || problems.length > 0 || (blanks.length > 0 && !accepted)} onClick={() => run(() => publishAction(invitationId, blanks.map((b) => b.key)).then((r) => (r.ok ? { ok: true } : r)))}>{pending ? 'Publishing…' : 'Publish invitation'}</button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}

export function ShareBox({ url, title, qr, cardHref, printHref }: { url: string; title: string; qr: string; cardHref: string; printHref: string }) {
  const [copied, setCopied] = useState(false);
  const text = encodeURIComponent(`${title} — you're invited! ${url}`);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link', url);
    }
  }
  return (
    <div className="mt-3 flex flex-wrap items-start gap-4">
      <div className="w-40 shrink-0 rounded-xl border border-[color:var(--color-sand-200)] bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
      <div className="flex flex-1 flex-wrap gap-2 text-sm">
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
        <a className="btn btn-secondary btn-sm" href={`https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&app_id=0&redirect_uri=${encodeURIComponent(url)}`} target="_blank" rel="noopener">Messenger</a>
        <a className="btn btn-secondary btn-sm" href={`viber://forward?text=${text}`}>Viber</a>
        <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener">WhatsApp</a>
        <a className="btn btn-secondary btn-sm" href={`sms:?&body=${text}`}>SMS</a>
        <a className="btn btn-secondary btn-sm" href={cardHref} download>Download image</a>
        <a className="btn btn-secondary btn-sm" href={printHref} target="_blank" rel="noopener">Print / PDF</a>
        <p className="w-full text-xs text-[color:var(--color-ink-500)]">Tip: paste the link in a Messenger group chat — the cover photo and names show up as the preview.</p>
      </div>
    </div>
  );
}
