'use client';

import { useState, useTransition } from 'react';
import { publishAction, unpublishAction, toggleRsvpAction } from '@/app/account/actions';

export function PublishControls({ invitationId, status, problems, rsvpClosed, editsLeft }: { invitationId: string; status: string; problems: string[]; rsvpClosed: boolean; editsLeft: number | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError('');
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
    });
  return (
    <div className="mt-3 space-y-2">
      {problems.length > 0 && status !== 'PUBLISHED' && <ul className="text-xs text-[color:var(--warn)]">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
      <div className="flex flex-wrap gap-2">
        {status === 'PUBLISHED' ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => unpublishAction(invitationId))}>Unpublish</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => toggleRsvpAction(invitationId, !rsvpClosed))}>{rsvpClosed ? 'Reopen RSVP' : 'Close RSVP'}</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={pending || problems.length > 0} onClick={() => run(() => publishAction(invitationId).then((r) => (r.ok ? { ok: true } : r)))}>{pending ? 'Publishing…' : 'Publish invitation'}</button>
        )}
      </div>
      {editsLeft !== null && status === 'PUBLISHED' && <p className="text-xs text-[color:var(--color-ink-500)]">{editsLeft} edit{editsLeft === 1 ? '' : 's'} left on your package.</p>}
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
