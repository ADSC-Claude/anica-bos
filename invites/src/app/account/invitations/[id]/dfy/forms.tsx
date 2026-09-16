'use client';

import { useState, useTransition } from 'react';
import { requestRevisionAction, approveAction, commentAction } from '@/app/account/actions';

export function RevisionThread({ invitationId, status, previewHref, revisionsLeft, revisions }: { invitationId: string; status: string; previewHref: string; revisionsLeft: number; revisions: { id: string; round: number; author: string; byStaff: boolean; body: string; at: string }[] }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const canAct = status === 'PREVIEW_SENT';
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError('');
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Something went wrong.');
      else setText('');
    });
  return (
    <div className="space-y-3">
      {canAct && (
        <div className="flex flex-wrap gap-2">
          <a href={previewHref} target="_blank" rel="noopener" className="btn btn-secondary">Open preview</a>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => { if (confirm('Approve this preview? We will publish it as-is.')) act(() => approveAction(invitationId)); }}>Approve & publish</button>
        </div>
      )}
      <ul className="space-y-2">
        {revisions.map((r) => (
          <li key={r.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${r.byStaff ? 'bg-[color:var(--color-sand-100)]' : 'ml-auto bg-[#e3edf7]'}`}>
            <p className="whitespace-pre-line">{r.body}</p>
            <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">{r.author} · round {r.round} · {r.at}</p>
          </li>
        ))}
      </ul>
      {status !== 'PUBLISHED' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); act(() => (canAct && revisionsLeft > 0 ? requestRevisionAction(invitationId, text) : commentAction(invitationId, text))); }}>
          <textarea className="field" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={canAct ? 'What should we change? Be specific — “Ninang Tess should be Maria Teresa Reyes”, “make the motif more sage”.' : 'Leave a note for your encoder'} required />
          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-secondary" disabled={pending}>{canAct && revisionsLeft > 0 ? `Request changes (${revisionsLeft} left)` : 'Send note'}</button>
            {error && <span className="text-sm text-[color:var(--bad)]">{error}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
