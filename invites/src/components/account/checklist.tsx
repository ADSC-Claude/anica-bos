'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import type { ChecklistLine } from '@/lib/checklist';
import { saveIntakeAction } from '@/app/account/actions';
import { Tour, INVITATION_TOUR } from './tour';

/**
 * Get started: the six lines, ticked by the invitation itself, a bar that
 * fills as they are, and the tour. Put away with "Don't show again" it
 * folds to one line that still says how far along they are — the ticks are
 * the plan, and the plan should stay in sight.
 */
export function GetStarted({ invitationId, lines, send }: { invitationId: string; lines: ChecklistLine[]; send: SendToUs | null }) {
  const key = `yit:checklist:${invitationId}`;
  const [hidden, setHidden] = useState(false);
  const [tour, setTour] = useState(false);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(key) === 'hidden');
    } catch {
      /* a private window: shown */
    }
  }, [key]);
  const put = (v: boolean) => {
    setHidden(v);
    try {
      if (v) window.localStorage.setItem(key, 'hidden');
      else window.localStorage.removeItem(key);
    } catch {
      /* not remembered, still hidden for now */
    }
  };
  const done = lines.filter((l) => l.done).length;
  const pct = Math.round((done / Math.max(1, lines.length)) * 100);

  if (hidden) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--color-sand-200)] bg-white px-4 py-2 text-sm">
        <span><b>Get started</b> · {done} of {lines.length} done</span>
        <button type="button" className="text-xs underline" onClick={() => put(false)}>Show</button>
      </div>
    );
  }
  return (
    <div className="card mb-4 p-4" data-tour="checklist">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Get started</h2>
        <span className="text-xs text-[color:var(--color-ink-500)]">{done} of {lines.length} done</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--color-sand-200)]"><div className="h-full rounded-full bg-[color:var(--ok)] transition-all" style={{ width: `${pct}%` }} /></div>
      <ol className="mt-3 space-y-1.5">
        {lines.map((l) => (
          <li key={l.key} className="flex items-start gap-2 text-sm">
            <span aria-hidden className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${l.done ? 'bg-[color:var(--ok)] text-white' : 'border border-[color:var(--color-sand-300)]'}`}>{l.done ? '✓' : ''}</span>
            <span className="min-w-0">
              <Link href={l.href} className={`underline-offset-2 hover:underline ${l.done ? 'text-[color:var(--color-ink-500)] line-through' : 'font-medium'}`}>{l.label}</Link>
              <span className="block text-xs text-[color:var(--color-ink-500)]">{l.hint}</span>
            </span>
          </li>
        ))}
      </ol>
      {send && <SendToUsCard invitationId={invitationId} {...send} />}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTour(true)}>Show me around</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => put(true)}>Don’t show again</button>
      </div>
      {tour && <Tour steps={INVITATION_TOUR} onClose={() => setTour(false)} />}
    </div>
  );
}

/**
 * The other two ways of handing us the details, for a customer whose
 * package has us typing them in. The form is still the best way — names
 * get spelled the way they type them — but a family with an Excel of
 * ninongs, or a bride who would rather send screenshots by chat, should not
 * have to copy it all into boxes. One button tells the team to expect it.
 */
export type SendToUs = { method: string; submittedAt: string | null; messenger: string; viber: string; reference: string; editable: boolean };

function SendToUsCard({ invitationId, method: initial, submittedAt, messenger, viber, reference, editable }: SendToUs & { invitationId: string }) {
  const [pending, start] = useTransition();
  const [method, setMethod] = useState(initial === 'EXCEL' ? 'EXCEL' : 'MESSENGER');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(submittedAt);
  const tell = () =>
    start(async () => {
      const r = await saveIntakeAction(invitationId, { content: {}, method, notes: '', submit: true });
      if (r.ok) setSent(new Date().toISOString());
      else setNote(r.error);
    });
  return (
    <div className="mt-3 rounded-xl border border-dashed border-[color:var(--color-sand-300)] p-3 text-sm">
      <p className="font-semibold">Prefer to send it to us?</p>
      <p className="text-xs text-[color:var(--color-ink-700)]">Message your details, photos or an Excel over Messenger or Viber — mention order <b>{reference}</b> — and we will type them in for you.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {messenger && <a href={messenger} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Messenger</a>}
        {viber && <a href={viber} className="btn btn-secondary btn-sm">Viber</a>}
        {editable && !sent && (
          <>
            <select className="field min-h-0 w-auto py-1 text-xs" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="How you are sending it">
              <option value="MESSENGER">by chat</option>
              <option value="EXCEL">as an Excel file</option>
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={tell}>{pending ? 'Telling the team…' : 'I have sent it — tell the team'}</button>
          </>
        )}
        {sent && <span className="text-xs text-[color:var(--ok)]">Noted — our team is expecting it.</span>}
        {note && <span role="alert" className="text-xs text-[color:var(--bad)]">{note}</span>}
      </div>
    </div>
  );
}
