'use client';

import { useRef, useState } from 'react';
import type { Field, Person, SectionData } from '@/lib/sections';
import { PALETTE, PRESETS, MOTIF_MAX, swatchByHex, swatchStyle, presetColours } from '@/lib/palette';
import { TITLES, type Lang } from '@/lib/copy';
import { TIER_LABELS } from '@/lib/tiers';

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
        <div key={f.key} className={f.wide || f.type === 'textarea' || f.type === 'list' || f.type === 'colors' || f.type === 'swatches' || f.type === 'checks' ? 'sm:col-span-2' : ''}>
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
    case 'date':
      return <DateSelect field={field} id={id} value={String(value ?? '')} onChange={(v) => onChange(v)} />;
    case 'time':
      return <TimeSelect field={field} id={id} value={String(value ?? '')} onChange={(v) => onChange(v)} />;
    case 'text':
    case 'url':
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
              // A locked option still renders, so the customer can see what
              // the next package would give them rather than wondering why
              // the list is short.
              <option key={o.value} value={o.value} disabled={Boolean(o.lockedTier)}>
                {o.label}{o.lockedTier ? ` — ${TIER_LABELS[o.lockedTier]} only` : ''}
              </option>
            ))}
          </select>
          <Hint text={field.hint} />
        </div>
      );
    case 'image':
      return <ImageInput field={field} value={String(value ?? '')} onChange={(v) => onChange(v)} invitationId={invitationId} />;
    case 'colors':
      return <ColorsInput field={field} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case 'swatches':
      return <SwatchesInput field={field} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case 'checks':
      return <ChecksInput field={field} value={Array.isArray(value) ? (value as string[]) : typeof value === 'string' && value ? [value] : []} onChange={onChange} sibling={sibling} />;
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A date as three pull-up choices — month, day, year — rather than a typed
 * field or a calendar that has to be paged back decade by decade: a birth
 * date for a debut or a fiftieth is picked in three taps. The years run from
 * three ahead back a hundred. Saved as the same YYYY-MM-DD as before; a part
 * still blank saves nothing yet, so a half-picked date never lands as one.
 */
function DateSelect({ field, id, value, onChange }: { field: Field; id: string; value: string; onChange: (v: string) => void }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [parts, setParts] = useState<{ y: string; mo: string; d: string }>({ y: m?.[1] ?? '', mo: m?.[2] ?? '', d: m?.[3] ?? '' });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 104 }, (_, i) => String(thisYear + 3 - i));
  const daysIn = parts.y && parts.mo ? new Date(Number(parts.y), Number(parts.mo), 0).getDate() : 31;
  const set = (next: Partial<typeof parts>) => {
    const p = { ...parts, ...next };
    if (p.d && Number(p.d) > (p.y && p.mo ? new Date(Number(p.y), Number(p.mo), 0).getDate() : 31)) p.d = '';
    setParts(p);
    onChange(p.y && p.mo && p.d ? `${p.y}-${p.mo}-${p.d}` : '');
  };
  return (
    <div>
      <Label field={field} htmlFor={id} />
      <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
        <select id={id} className="field" value={parts.mo} onChange={(e) => set({ mo: e.target.value })} aria-label="Month">
          <option value="">Month</option>
          {MONTHS.map((name, i) => <option key={name} value={pad(i + 1)}>{name}</option>)}
        </select>
        <select className="field" value={parts.d} onChange={(e) => set({ d: e.target.value })} aria-label="Day">
          <option value="">Day</option>
          {Array.from({ length: daysIn }, (_, i) => <option key={i} value={pad(i + 1)}>{i + 1}</option>)}
        </select>
        <select className="field" value={parts.y} onChange={(e) => set({ y: e.target.value })} aria-label="Year">
          <option value="">Year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <Hint text={field.hint} />
    </div>
  );
}

/** A time as pull-up choices: the hour, the minutes in fives, morning or afternoon. Saved as HH:MM, as before. */
function TimeSelect({ field, id, value, onChange }: { field: Field; id: string; value: string; onChange: (v: string) => void }) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  const h24 = m ? Number(m[1]) : NaN;
  const [parts, setParts] = useState<{ h: string; mi: string; p: string }>({ h: m ? String(((h24 + 11) % 12) + 1) : '', mi: m?.[2] ?? '', p: m ? (h24 >= 12 ? 'PM' : 'AM') : '' });
  const minutes = Array.from({ length: 12 }, (_, i) => pad(i * 5));
  if (parts.mi && !minutes.includes(parts.mi)) minutes.push(parts.mi);
  const set = (next: Partial<typeof parts>) => {
    const p = { ...parts, ...next };
    setParts(p);
    if (p.h && p.p) onChange(`${pad((Number(p.h) % 12) + (p.p === 'PM' ? 12 : 0))}:${p.mi || '00'}`);
    else onChange('');
  };
  return (
    <div>
      <Label field={field} htmlFor={id} />
      <div className="grid grid-cols-3 gap-2">
        <select id={id} className="field" value={parts.h} onChange={(e) => set({ h: e.target.value })} aria-label="Hour">
          <option value="">Hour</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
        </select>
        <select className="field" value={parts.mi} onChange={(e) => set({ mi: e.target.value })} aria-label="Minutes">
          <option value="">Min</option>
          {minutes.sort().map((mi) => <option key={mi} value={mi}>{mi}</option>)}
        </select>
        <select className="field" value={parts.p} onChange={(e) => set({ p: e.target.value })} aria-label="AM or PM">
          <option value="">AM / PM</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <Hint text={field.hint} />
    </div>
  );
}

/**
 * Colours picked from the named palette, in the order picked: the chosen ones
 * as chips across the top (each with its name and a remove), the palette below
 * as the designer laid it out — a row per family, a circle with its name under
 * it — tap to pick, tap again to drop. Full is full: the rest grey out. The
 * palette folds away behind a button once the field has what it needs, so
 * three colour fields do not stack three palettes down the section. The motif
 * also offers the sheet's presets — four colours that go together — one tap
 * sets them, and the palette adds to them.
 */
function SwatchesInput({ field, value, onChange }: { field: Field; value: string[]; onChange: (v: string[]) => void }) {
  const max = field.max ?? MOTIF_MAX;
  const min = field.min ?? 0;
  const chosen = value.map((hex) => hex.toLowerCase());
  const toggle = (hex: string) => {
    if (chosen.includes(hex)) onChange(value.filter((x) => x.toLowerCase() !== hex));
    else if (value.length < max) onChange([...value, hex]);
  };
  const short = min > 0 && value.length < min;
  const [open, setOpen] = useState(short);
  return (
    <div>
      <Label field={field} />
      <div className="mb-2 flex min-h-9 flex-wrap items-center gap-2">
        {value.map((hex, i) => {
          const s = swatchByHex(hex);
          return (
            <span key={`${hex}-${i}`} className="flex items-center gap-1.5 rounded-full border border-[color:var(--color-sand-200)] bg-white py-1 pl-1 pr-2 text-xs">
              <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: swatchStyle(hex, s?.metallic) }} />
              {s?.name ?? hex}
              <button type="button" className="text-[color:var(--color-ink-500)]" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${s?.name ?? hex}`}>✕</button>
            </span>
          );
        })}
        <span className={`text-xs ${short ? 'text-[color:var(--bad)]' : 'text-[color:var(--color-ink-500)]'}`}>
          {value.length} of {min ? `${min}–${max}` : `up to ${max}`}{short ? ` · pick at least ${min}` : value.length >= max ? ' · full' : ''}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide the palette' : value.length ? 'Change colours' : 'Pick from the palette'}
        </button>
      </div>
      {open && field.sets && (
        <div className="mb-2 rounded-xl border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] p-2">
          <p className="mb-1.5 px-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-500)]">Sets that go together — tap one to start from it</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((set) => {
              const hexes = presetColours(set);
              const on = hexes.length === value.length && hexes.every((h) => chosen.includes(h));
              return (
                <button key={set.key} type="button" onClick={() => onChange(hexes.slice(0, max))} aria-pressed={on} title={set.colours.map((k) => swatchByHex(hexes[set.colours.indexOf(k)])?.name).join(', ')} className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-1.5 ${on ? 'border-[color:var(--color-plum-600)] bg-white' : 'border-transparent bg-white/70 hover:bg-white'}`}>
                  <span className="grid grid-cols-2 gap-0.5">
                    {hexes.map((h, i) => <span key={i} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: swatchStyle(h, swatchByHex(h)?.metallic) }} />)}
                  </span>
                  <span className="text-[9px] leading-tight text-[color:var(--color-ink-700)]">{set.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {open && <div className="rounded-xl border border-[color:var(--color-sand-200)] bg-white px-3 py-1">
        {PALETTE.map((g) => (
          <div key={g.key} className="flex items-start gap-2 border-t border-[color:var(--color-sand-100)] py-1.5 first:border-t-0">
            <span className="w-[5.5rem] shrink-0 pt-2 text-[10px] uppercase leading-tight tracking-[0.14em] text-[color:var(--color-ink-500)]">{g.label}</span>
            <div className="flex flex-wrap">
              {g.swatches.map((s) => {
                const on = chosen.includes(s.hex);
                const full = !on && value.length >= max;
                return (
                  <button key={s.key} type="button" onClick={() => toggle(s.hex)} disabled={full} aria-pressed={on} title={`${s.name} ${s.hex}`} className={`flex w-[3.6rem] flex-col items-center gap-1 rounded-lg px-0.5 py-1 text-center ${on ? 'bg-[color:var(--color-sand-100)]' : full ? 'opacity-40' : 'hover:bg-[color:var(--color-sand-50)]'}`}>
                    <span className={`h-7 w-7 rounded-full border border-black/10 ${on ? 'ring-2 ring-[color:var(--color-plum-600)] ring-offset-1' : ''}`} style={{ background: swatchStyle(s.hex, s.metallic) }} />
                    <span className="text-[9px] leading-tight text-[color:var(--color-ink-700)]">{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>}
      <Hint text={field.hint} />
    </div>
  );
}

/**
 * A row of pills to tick. The value keeps the options' order, whatever order
 * they were ticked in. A field that follows a sibling — the clothes follow the
 * dress code — offers only the options marked for what the sibling holds
 * (all of them when fewer than three would be left), plus anything already
 * ticked, so a tick never vanishes unseen. A minimum and a maximum show as a
 * count; at the maximum the rest grey out.
 */
function ChecksInput({ field, value, onChange, sibling }: { field: Field; value: string[]; onChange: (v: string[]) => void; sibling?: SectionData }) {
  const all = field.options ?? [];
  const picked = field.dependsOn ? (Array.isArray(sibling?.[field.dependsOn]) ? (sibling![field.dependsOn] as string[]) : typeof sibling?.[field.dependsOn] === 'string' ? [sibling![field.dependsOn] as string] : []) : [];
  const fit = picked.length ? all.filter((o) => !o.when || o.when.some((w) => picked.includes(w))) : all;
  const offered = fit.length >= 3 ? fit : all;
  const options = all.filter((o) => offered.includes(o) || value.includes(o.value));
  const max = field.max ?? Infinity;
  const min = field.min ?? 0;
  const toggle = (v: string) => {
    if (!value.includes(v) && value.length >= max) return;
    const next = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
    onChange(all.map((o) => o.value).filter((x) => next.includes(x)));
  };
  const short = min > 0 && value.length > 0 && value.length < min;
  return (
    <div>
      <Label field={field} />
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          const full = !on && value.length >= max;
          return (
            <label key={o.value} className={`btn btn-sm select-none ${on ? 'btn-primary' : 'btn-secondary'} ${full ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
              <input type="checkbox" className="sr-only" checked={on} disabled={full} onChange={() => toggle(o.value)} />
              {on ? '✓ ' : ''}{o.label}
            </label>
          );
        })}
      </div>
      {(min > 0 || max < Infinity) && (
        <p className={`mt-1 text-xs ${short ? 'text-[color:var(--bad)]' : 'text-[color:var(--color-ink-500)]'}`}>
          {value.length} of {min > 0 && max < Infinity ? `${min}–${max}` : max < Infinity ? `up to ${max}` : `at least ${min}`}{short ? ` · pick at least ${min}` : value.length >= max ? ' · full' : ''}
          {field.dependsOn && picked.length > 0 && fit.length >= 3 ? ' · showing what suits your dress code' : ''}
        </p>
      )}
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
