'use client';

import { useState, useTransition } from 'react';
import type { Field, SectionData, SectionKey } from '@/lib/sections';
import type { Lang } from '@/lib/copy';
import { SectionFields } from '@/components/builder/fields';
import { saveIntakeAction, requestRevisionAction, approveAction, commentAction } from '@/app/account/actions';

type IntakeSection = { key: SectionKey; label: string; description: string; fields: Field[]; initial: SectionData };

export function IntakeForm({ invitationId, lang, sections, method: initialMethod, notes: initialNotes, editable, messenger, viber }: { invitationId: string; lang: Lang; sections: IntakeSection[]; method: string; notes: string; editable: boolean; messenger: string; viber: string }) {
  const [content, setContent] = useState<Record<string, SectionData>>(Object.fromEntries(sections.map((s) => [s.key, s.initial])));
  const [method, setMethod] = useState(initialMethod);
  const [notes, setNotes] = useState(initialNotes);
  const [open, setOpen] = useState<string>(sections[0]?.key ?? '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = (submit: boolean) =>
    start(async () => {
      const r = await saveIntakeAction(invitationId, { content, method, notes, submit });
      setMsg(r.ok ? { ok: true, text: submit ? 'Submitted — salamat! We will be in touch.' : 'Draft saved.' } : { ok: false, text: r.error });
    });

  return (
    <div className="space-y-4">
      <div>
        <p className="label">How would you like to send the details?</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { key: 'FORM', label: 'Fill in this form', hint: 'Best for accuracy — names get spelled the way you type them.' },
            { key: 'MESSENGER', label: 'Messenger / Viber', hint: 'Send photos, lists and screenshots by chat.' },
            { key: 'EXCEL', label: 'Excel upload', hint: 'Attach your entourage and guest list files below.' },
          ].map((m) => (
            <label key={m.key} className={`card cursor-pointer p-3 text-sm ${method === m.key ? 'ring-2 ring-[color:var(--color-plum-600)]' : ''}`}>
              <input type="radio" name="method" className="mr-2" checked={method === m.key} disabled={!editable} onChange={() => setMethod(m.key)} />
              <span className="font-semibold">{m.label}</span>
              <span className="block text-xs text-[color:var(--color-ink-500)]">{m.hint}</span>
            </label>
          ))}
        </div>
        {method !== 'FORM' && (
          <p className="mt-2 text-sm">
            {method === 'MESSENGER' ? <>Great — message us on <a href={messenger} className="underline">Messenger</a> or <a href={viber} className="underline">Viber</a>, then press Submit below so we know to expect it.</> : <>Attach your files in the sections below (the photo fields accept Excel too) or send them by chat, then press Submit.</>}
          </p>
        )}
      </div>

      {(method === 'FORM' || method === 'EXCEL') && (
        <div className="space-y-2">
          {sections.map((s) => (
            <details key={s.key} open={open === s.key} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setOpen(s.key)} className="card p-4">
              <summary className="cursor-pointer font-semibold">{s.label} <span className="ml-2 text-xs font-normal text-[color:var(--color-ink-500)]">{s.description}</span></summary>
              <div className="mt-3">
                <SectionFields fields={s.fields} value={content[s.key]} onChange={(v) => setContent((c) => ({ ...c, [s.key]: v }))} lang={lang} invitationId={invitationId} />
              </div>
            </details>
          ))}
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">Anything else for your encoder</label>
        <textarea id="notes" className="field" rows={3} value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} placeholder="Colours you love, a design you saw, the vibe you want…" />
      </div>

      {msg && <p role={msg.ok ? undefined : 'alert'} className={`text-sm ${msg.ok ? 'text-[color:var(--ok)]' : 'text-[color:var(--bad)]'}`}>{msg.text}</p>}
      {editable && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => save(false)}>Save draft</button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => save(true)}>{pending ? 'Sending…' : 'Submit details'}</button>
        </div>
      )}
    </div>
  );
}

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
