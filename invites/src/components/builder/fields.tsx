'use client';

import { useRef, useState } from 'react';
import type { Field, Person, SectionData } from '@/lib/sections';
import { TITLES, type Lang } from '@/lib/copy';

/**
 * The form engine. One component renders any section from its field spec,
 * so the builder, the DFY intake form and the admin's support editor are
 * the same code with different plumbing around it. Controlled: the parent
 * owns the value and decides when to save.
 */

export type FieldsProps = {
  fields: Field[];
  value: SectionData;
  onChange: (next: SectionData) => void;
  lang: Lang;
  invitationId: string;
  /** Lists longer than this show a note (gallery limit per tier). */
  listLimits?: Record<string, number>;
};

export function SectionFields({ fields, value, onChange, lang, invitationId, listLimits = {} }: FieldsProps) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.wide || f.type === 'textarea' || f.type === 'list' || f.type === 'colors' ? 'sm:col-span-2' : ''}>
          <FieldInput field={f} value={value[f.key]} onChange={(v) => set(f.key, v)} onPreset={(target, text) => onChange({ ...value, [f.key]: value[f.key], [target]: text })} lang={lang} invitationId={invitationId} limit={listLimits[f.key]} sibling={value} onSibling={set} />
        </div>
      ))}
    </div>
  );
}

function Label({ field, htmlFor }: { field: Field; htmlFor?: string }) {
  return (
    <label className="label" htmlFor={htmlFor}>
      {field.label}
      {field.required && <span className="text-[color:var(--bad)]"> *</span>}
    </label>
  );
}

function Hint({ text }: { text?: string }) {
  return text ? <p className="hint">{text}</p> : null;
}

function FieldInput({
  field,
  value,
  onChange,
  onPreset,
  lang,
  invitationId,
  limit,
  sibling,
  onSibling,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  onPreset: (target: string, text: string) => void;
  lang: Lang;
  invitationId: string;
  limit?: number;
  sibling: SectionData;
  onSibling: (key: string, v: unknown) => void;
}) {
  const id = `f-${field.key}`;
  switch (field.type) {
    case 'text':
    case 'url':
    case 'date':
    case 'time':
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <input id={id} type={field.type === 'url' ? 'url' : field.type} className="field" value={String(value ?? '')} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
          <Hint text={field.hint} />
        </div>
      );
    case 'number':
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <input id={id} type="number" inputMode="numeric" className="field" value={value == null ? '' : String(value)} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
          <Hint text={field.hint} />
        </div>
      );
    case 'textarea':
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <textarea id={id} className="field" rows={3} value={String(value ?? '')} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
          <Hint text={field.hint} />
        </div>
      );
    case 'toggle':
      return (
        <label className="flex items-start gap-2 pt-6 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>
            {field.label}
            {field.hint && <span className="block text-xs text-[color:var(--color-ink-500)]">{field.hint}</span>}
          </span>
        </label>
      );
    case 'select':
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <select
            id={id}
            className="field"
            value={String(value ?? '')}
            onChange={(e) => {
              const v = e.target.value;
              if (field.presets && field.presetTarget) {
                const p = field.presets.find((x) => x.key === v);
                if (p) {
                  // Fill the sibling text with the preset in the chosen language,
                  // keeping the select value too.
                  onSibling(field.presetTarget, lang === 'tl' ? p.tl : p.en);
                }
              }
              onChange(v);
            }}
          >
            {!field.options?.some((o) => o.value === '') && <option value="">—</option>}
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Hint text={field.hint} />
        </div>
      );
    case 'image':
      return <ImageInput field={field} value={String(value ?? '')} onChange={(v) => onChange(v)} invitationId={invitationId} />;
    case 'colors':
      return <ColorsInput field={field} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case 'person':
      return <PersonInput field={field} value={(value ?? { title: '', name: '', deceased: false }) as Person} onChange={onChange} />;
    case 'list':
      return <ListInput field={field} value={Array.isArray(value) ? (value as Record<string, unknown>[]) : []} onChange={onChange} lang={lang} invitationId={invitationId} limit={limit} />;
  }
}

function ImageInput({ field, value, onChange, invitationId }: { field: Field; value: string; onChange: (v: string) => void; invitationId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('invitationId', invitationId);
      fd.set('kind', field.key === 'coverPhoto' ? 'COVER' : field.key === 'gcashQr' ? 'QR' : field.key === 'photo' ? 'VENUE' : 'GALLERY');
      const res = await fetch('/api/account/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed.');
      onChange(json.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div>
      <Label field={field} />
      <div className="flex items-start gap-3">
        {value ? <img src={value} alt="" className="h-20 w-20 rounded-lg border border-[color:var(--color-sand-200)] object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-[color:var(--color-sand-300)] text-xs text-[color:var(--color-ink-500)]">No photo</div>}
        <div className="flex-1 space-y-2">
          <input ref={input} type="file" accept="image/*" className="field text-sm" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <input type="url" className="field text-xs" placeholder="…or paste an image link" value={value.startsWith('/uploads/') ? '' : value} onChange={(e) => onChange(e.target.value)} />
          {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>Remove</button>}
          {busy && <p className="hint">Uploading…</p>}
          {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
        </div>
      </div>
      <Hint text={field.hint} />
    </div>
  );
}

function ColorsInput({ field, value, onChange }: { field: Field; value: string[]; onChange: (v: string[]) => void }) {
  const max = field.max ?? 5;
  return (
    <div>
      <Label field={field} />
      <div className="flex flex-wrap items-center gap-2">
        {value.map((c, i) => (
          <span key={i} className="flex items-center gap-1 rounded-full border border-[color:var(--color-sand-200)] p-1 pr-2">
            <input type="color" value={c} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} className="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent" aria-label={`Colour ${i + 1}`} />
            <code className="text-xs">{c}</code>
            <button type="button" className="text-xs text-[color:var(--color-ink-500)]" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove colour">✕</button>
          </span>
        ))}
        {value.length < max && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...value, '#c9a86a'])}>+ Add colour</button>
        )}
      </div>
      <Hint text={field.hint} />
    </div>
  );
}

function PersonInput({ field, value, onChange }: { field: Field; value: Person; onChange: (v: Person) => void }) {
  return (
    <div>
      <Label field={field} />
      <div className="flex gap-2">
        <select className="field w-28 shrink-0" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} aria-label="Title">
          {TITLES.map((t) => (
            <option key={t} value={t}>{t || 'Title'}</option>
          ))}
        </select>
        <input className="field" placeholder="Full name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </div>
      <label className="mt-1 flex items-center gap-2 text-xs text-[color:var(--color-ink-500)]">
        <input type="checkbox" className="h-3.5 w-3.5" checked={value.deceased} onChange={(e) => onChange({ ...value, deceased: e.target.checked })} /> The late († shown)
      </label>
    </div>
  );
}

function ListInput({ field, value, onChange, lang, invitationId, limit }: { field: Field; value: Record<string, unknown>[]; onChange: (v: unknown) => void; lang: Lang; invitationId: string; limit?: number }) {
  const item = field.item ?? [];
  const max = Math.min(field.max ?? 200, limit ?? 200);
  const blank = () => Object.fromEntries(item.map((f) => [f.key, f.type === 'toggle' ? false : '']));
  const update = (i: number, next: Record<string, unknown>) => onChange(value.map((r, j) => (j === i ? next : r)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const copy = [...value];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <Label field={field} />
        <span className="text-xs text-[color:var(--color-ink-500)]">{value.length}{Number.isFinite(max) && max < 200 ? ` / ${max}` : ''}</span>
      </div>
      <div className="space-y-2">
        {value.map((row, i) => (
          <div key={i} className="rounded-xl border border-[color:var(--color-sand-200)] bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {item.map((sub) => (
                <div key={sub.key} className={sub.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <FieldInput field={sub} value={row[sub.key]} onChange={(v) => update(i, { ...row, [sub.key]: v })} onPreset={() => {}} lang={lang} invitationId={invitationId} sibling={row} onSibling={(k, v) => update(i, { ...row, [k]: v })} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1 text-xs">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move down">↓</button>
              <button type="button" className="btn btn-ghost btn-sm text-[color:var(--bad)]" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      {value.length < max ? (
        <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => onChange([...value, blank()])}>+ {field.addLabel ?? 'Add'}</button>
      ) : (
        <p className="hint">Your package includes up to {max} here. Upgrade for more.</p>
      )}
      <Hint text={field.hint} />
    </div>
  );
}
