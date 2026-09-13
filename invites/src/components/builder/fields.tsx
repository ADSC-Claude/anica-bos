'use client';

import { useRef, useState, type CSSProperties } from 'react';
import type { Field, Person, SectionData } from '@/lib/sections';
import { PALETTE, PRESETS, MOTIF_MAX, swatchByHex, swatchStyle, presetColours } from '@/lib/palette';
import { TITLES, type Lang } from '@/lib/copy';
import { TIER_LABELS } from '@/lib/tiers';
import { listToGrid, gridToList, sheetFilename } from '@/lib/sheet';
import { toCsv } from '@/lib/csv';
import { parseSheetAction } from '@/app/account/actions';

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
  /** A list's hint from the design, where the page has a fixed number of frames. */
  listHints?: Record<string, string>;
};

export function SectionFields({ fields, value, onChange, lang, invitationId, listLimits = {}, listHints = {} }: FieldsProps) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.wide || f.type === 'textarea' || f.type === 'list' || f.type === 'colors' || f.type === 'swatches' || f.type === 'checks' || f.type === 'audio' ? 'sm:col-span-2' : ''}>
          <FieldInput field={listHints[f.key] ? { ...f, hint: listHints[f.key] } : f} value={value[f.key]} onChange={(v) => set(f.key, v)} onPreset={(target, text) => onChange({ ...value, [f.key]: value[f.key], [target]: text })} lang={lang} invitationId={invitationId} limit={listLimits[f.key]} sibling={value} onSibling={set} />
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
      {/* a fixed writing — seen only by staff editing for the customer */}
      {field.staff && <span className="ml-2 rounded-full bg-[color:var(--color-sand-100)] px-2 py-0.5 text-[10px] font-normal uppercase tracking-wide text-[color:var(--color-ink-500)]">Ours</span>}
    </label>
  );
}

function Hint({ text }: { text?: string }) {
  return text ? <p className="hint">{text}</p> : null;
}

/**
 * How much room is left: the page has so many characters' worth for this
 * writing (Field.max, from FIT in sections.ts), and the count turns amber in
 * the last stretch so nobody is surprised at the cut. Quiet until a third is
 * used, so a short field does not nag.
 */
function Room({ field, value }: { field: Field; value: string }) {
  if (!field.max) return null;
  const used = value.length;
  if (used < field.max / 3) return null;
  const tight = used >= field.max * 0.85;
  return <p className={`mt-0.5 text-right text-[11px] ${tight ? 'text-[color:var(--warn)]' : 'text-[color:var(--color-ink-500)]'}`} aria-live="polite">{used} / {field.max}{used >= field.max ? ' — that is all the room the page has' : ''}</p>;
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
          <input id={id} type={field.type === 'url' ? 'url' : field.type} className="field" value={String(value ?? '')} placeholder={field.placeholder} maxLength={field.type === 'text' ? field.max : undefined} onChange={(e) => onChange(e.target.value)} />
          <Hint text={field.hint} />
          <Examples field={field} lang={lang} onUse={onChange} />
          {field.type === 'text' && <Room field={field} value={String(value ?? '')} />}
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
          <textarea id={id} className="field" rows={3} value={String(value ?? '')} placeholder={field.placeholder} maxLength={field.max} onChange={(e) => onChange(e.target.value)} />
          <Hint text={field.hint} />
          <Examples field={field} lang={lang} onUse={onChange} />
          <Room field={field} value={String(value ?? '')} />
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
    case 'audio':
      return <AudioInput field={field} value={String(value ?? '')} onChange={(v) => onChange(v)} invitationId={invitationId} />;
    case 'offset':
      return <OffsetInput field={field} id={id} value={typeof value === 'number' ? value : null} onChange={onChange} />;
    case 'colors':
      return <ColorsInput field={field} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case 'swatches':
      return <SwatchesInput field={field} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case 'styles':
      return <StylesInput field={field} value={String(value ?? '')} onChange={onChange} />;
    case 'checks':
      return <ChecksInput field={field} value={Array.isArray(value) ? (value as string[]) : typeof value === 'string' && value ? [value] : []} onChange={onChange} sibling={sibling} />;
    case 'person':
      return <PersonInput field={field} value={(value ?? { title: '', name: '', deceased: false }) as Person} onChange={onChange} />;
    case 'list':
      return <ListInput field={field} value={Array.isArray(value) ? (value as Record<string, unknown>[]) : []} onChange={onChange} lang={lang} invitationId={invitationId} limit={limit} />;
  }
}

/**
 * A select whose options are pictures of themselves.
 *
 * The cover photograph's treatments cannot be chosen from a list of words —
 * "oval, double line" tells a client nothing about what their invitation will
 * look like, and the one that matters most, having no photograph on the cover
 * at all, does not read as a choice when it is an empty entry in a dropdown.
 * So each option is drawn: a little page with the words on it and the frame the
 * option would put the photograph in. Nothing is loaded to draw them; they are
 * boxes and radii, so they cost nothing and cannot 404.
 *
 * The first tile is the blank value, which is what an untouched invitation
 * holds and means "whatever this design was drawn to do" — the select this
 * replaces offered the same thing as a dash.
 */
function StylesInput({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const options = field.options?.some((o) => o.value === '') ? field.options : [{ value: '', label: "The design's own" }, ...(field.options ?? [])];
  return (
    <div>
      <Label field={field} />
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 [&>button]:min-w-0">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value || 'default'}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              // min-w-0: a grid item's default min-width is its content, so a
              // two-word label would push the tile past its column and over
              // the next one.
              className={`min-w-0 rounded-xl border p-1.5 text-left transition ${on ? 'border-[color:var(--color-ink-700)] bg-[color:var(--color-sand-100)] shadow-sm' : 'border-[color:var(--color-sand-200)] hover:border-[color:var(--color-sand-300)]'}`}
            >
              <StyleThumb kind={o.art ?? o.value} />
              <span className="mt-1 block break-words text-[11px] leading-tight text-[color:var(--color-ink-700)]">{o.label}</span>
              {o.hint && <span className="mt-0.5 block break-words text-[10px] leading-tight text-[color:var(--color-ink-500)]">{o.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One option, drawn: a page, the words on it, and where the photograph goes. */
function StyleThumb({ kind }: { kind: string }) {
  // the page's own colours, close enough to a pale design ground to read as one
  const ink = 'var(--color-ink-500)';
  const photo = 'color-mix(in srgb, var(--color-ink-500) 38%, transparent)';
  const line = (w: string) => <span style={{ display: 'block', height: 3, width: w, borderRadius: 2, background: ink, opacity: 0.55, margin: '0 auto' }} />;
  if (kind.startsWith('pass-')) return <PassThumb look={kind.slice(5)} ink={ink} photo={photo} />;
  const frame: Record<string, CSSProperties> = {
    arch: { width: '58%', aspectRatio: '4 / 5', borderRadius: '999px 999px 3px 3px' },
    oval: { width: '52%', aspectRatio: '3 / 4', borderRadius: '50%', outline: `1px solid ${ink}`, outlineOffset: 2 },
    round: { width: '46%', aspectRatio: '1 / 1', borderRadius: '50%' },
    card: { width: '48%', aspectRatio: '4 / 5', borderRadius: 2, transform: 'rotate(-4deg)', boxShadow: '0 2px 4px rgba(0,0,0,0.18)' },
  };
  return (
    <span
      aria-hidden
      className="relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)]"
      style={{ aspectRatio: '3 / 5', padding: '10% 8%' }}
    >
      {kind === 'veil' && (
        <span
          style={{
            position: 'absolute', left: '50%', top: '42%', translate: '-50% -50%', width: '96%', height: '62%',
            background: photo, borderRadius: '50%', filter: 'blur(5px)', opacity: 0.85,
          }}
        />
      )}
      {kind === '' && (
        <span style={{ width: '52%', aspectRatio: '4 / 5', border: `1px dashed ${ink}`, borderRadius: 4, opacity: 0.5, marginBottom: 4 }} />
      )}
      {frame[kind] && <span style={{ background: photo, marginBottom: 4, ...frame[kind] }} />}
      <span className="relative w-full">
        {line('62%')}
        <span style={{ display: 'block', height: 5 }} />
        {line('44%')}
      </span>
    </span>
  );
}

/**
 * The three check-in fronts, drawn rather than described.
 *
 * Each tile has to read as a poster — picture edge to edge, the dark falling
 * off the bottom, big words on it — and it has to draw the code the way the
 * page draws it: on a square of the couple's own paper, at the same alpha, so
 * the picture carries faintly through it. That is the part a couple cannot
 * picture from words. An earlier set drew a bordered card three times, which
 * is the thing these fronts took out.
 */
function PassThumb({ look, photo }: { look: string; ink: string; photo: string }) {
  const line = (w: string, h = 3, o = 0.95) => (
    <span style={{ display: 'block', height: h, width: w, borderRadius: 1, background: '#fff', opacity: o }} />
  );
  /*
   * The code on its square of paper, drawn the way the page draws it: straight
   * edges, no radius, no shadow, and the picture carrying faintly through the
   * paper rather than the code sitting on an opaque white sticker. The panel is
   * the box, so it reserves its own room and cannot eat the line above it.
   */
  const mark = (
    <span
      style={{
        display: 'grid', placeItems: 'center', width: '42%', aspectRatio: '1',
        margin: '0 auto', padding: '6%', background: 'rgba(252,249,243,0.8)',
      }}
    >
      <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '1' }}>
        {[[0, 0], [66, 0], [0, 66]].map(([l, t]) => (
          <span key={`${l}-${t}`} style={{ position: 'absolute', left: `${l}%`, top: `${t}%`, width: '34%', height: '34%', border: '2px solid var(--color-ink-900)' }} />
        ))}
        {[[46, 22], [74, 40], [40, 52], [60, 66], [82, 72], [34, 78], [56, 88]].map(([l, t]) => (
          <span key={`d-${l}-${t}`} style={{ position: 'absolute', left: `${l}%`, top: `${t}%`, width: '10%', height: '10%', background: 'var(--color-ink-900)' }} />
        ))}
      </span>
    </span>
  );
  // A picture rather than a flat rectangle: two figures against a sky.
  const picture = (
    <>
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, var(--color-sand-200) 0%, var(--color-sand-100) 42%, var(--color-sand-300) 100%)' }} />
      <span style={{ position: 'absolute', left: '14%', bottom: '18%', width: '34%', height: '46%', borderRadius: '50% 50% 40% 40%', background: photo, opacity: 0.9 }} />
      <span style={{ position: 'absolute', left: '44%', bottom: '16%', width: '36%', height: '52%', borderRadius: '50% 50% 40% 40%', background: photo, opacity: 0.75 }} />
    </>
  );
  const fall = (css: string) => <span style={{ position: 'absolute', inset: 0, background: css }} />;
  const words = (
    <span style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
      {line('54%', 2, 0.75)}
      {line('88%', 7)}
      {line('42%', 2, 0.6)}
    </span>
  );
  return (
    <span
      aria-hidden
      className="relative block w-full overflow-hidden rounded-lg border border-[color:var(--color-sand-200)]"
      style={{ aspectRatio: '3 / 5', background: 'var(--color-sand-50)' }}
    >
      {look !== 'ground' && picture}
      {look === 'ground' && (
        <span style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(135deg, ${photo} 0 5px, transparent 5px 12px), var(--color-sand-200)` }} />
      )}
      {/* the silhouette: the dark comes up off the bottom, the words sit in it */}
      {look !== 'cover' && (
        <>
          {fall('linear-gradient(to bottom, rgba(12,10,8,0.3) 0%, rgba(12,10,8,0) 24%, rgba(12,10,8,0) 40%, rgba(12,10,8,0.72) 66%, rgba(12,10,8,0.96) 100%)')}
          <span style={{ position: 'absolute', left: '9%', right: '9%', bottom: '44%' }}>{words}</span>
        </>
      )}
      {/* the masthead: the dark at the top, the words across it */}
      {look === 'cover' && (
        <>
          {fall('linear-gradient(to bottom, rgba(12,10,8,0.9) 0%, rgba(12,10,8,0.5) 24%, rgba(12,10,8,0) 48%, rgba(12,10,8,0) 60%, rgba(12,10,8,0.85) 92%, rgba(12,10,8,0.96) 100%)')}
          <span style={{ position: 'absolute', left: '9%', right: '9%', top: '8%' }}>{words}</span>
        </>
      )}
      {/* the guest's own line and the code, centred, on every one. No rule
          across the tile: there is none on the page either. */}
      <span style={{ position: 'absolute', left: '9%', right: '9%', bottom: '6%', display: 'grid', justifyItems: 'center', gap: 5 }}>
        {line('52%', 4, 0.9)}
        {mark}
      </span>
    </span>
  );
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
        <div className="min-w-0 flex-1 space-y-2">
          <input ref={input} type="file" accept="image/*" className="field max-w-full text-sm" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
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
  const over = value.length > max;
  // a folding list: the ticked ones as chips, the list behind a button
  const [open, setOpen] = useState(!field.fold);
  const labelOf = (v: string) => all.find((o) => o.value === v)?.label ?? v;
  return (
    <div>
      <Label field={field} />
      {field.fold && (
        <div className="mb-2 flex min-h-9 flex-wrap items-center gap-2">
          {value.map((v) => (
            <span key={v} className="flex items-center gap-1.5 rounded-full border border-[color:var(--color-sand-200)] bg-white px-2.5 py-1 text-xs">
              <span aria-hidden className="text-[color:var(--bad)]">⊘</span>{labelOf(v)}
              <button type="button" className="text-[color:var(--color-ink-500)]" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${labelOf(v)}`}>✕</button>
            </span>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide the list' : value.length ? 'Change the list' : 'Pick from the list'}
          </button>
        </div>
      )}
      {open && <div className="flex flex-wrap gap-1.5">
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
      </div>}
      {(min > 0 || max < Infinity) && (
        <p className={`mt-1 text-xs ${short || over ? 'text-[color:var(--bad)]' : 'text-[color:var(--color-ink-500)]'}`}>
          {value.length} of {min > 0 && max < Infinity ? `${min}–${max}` : max < Infinity ? `up to ${max}` : `at least ${min}`}{short ? ` · pick at least ${min}` : over ? ` · untick ${value.length - max} — only the first ${max} are kept` : value.length >= max ? ' · full' : ''}
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

/**
 * Ready-made wording, for the writings a customer does themselves.
 *
 * A blank box is the hardest thing to fill in, and "How we met" is a blank box
 * with a lifetime in it. Three examples sit under the field; one tap puts the
 * words in and the cursor stays theirs, so it reads as a place to start rather
 * than as words we put in their mouth. The Tagalog reading is used when the
 * invitation is in Tagalog, so an example never arrives in the wrong language.
 *
 * Nothing renders where a field carries no examples, which is every field we
 * fill for a customer: an encoder working through twenty boxes does not need
 * three suggestions on each of them.
 */
function Examples({ field, lang, onUse }: { field: Field; lang: Lang; onUse: (v: string) => void }) {
  if (!field.examples?.length) return null;
  return (
    <div className="mt-1.5">
      <p className="text-[11px] text-[color:var(--color-ink-500)]">Need a starting point? Tap one and edit it.</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {field.examples.map((e) => (
          <button
            key={e.key}
            type="button"
            className="btn btn-secondary btn-sm max-w-full whitespace-normal text-left text-[11px] leading-snug"
            title={lang === 'tl' ? e.tl : e.en}
            onClick={() => onUse(lang === 'tl' ? e.tl : e.en)}
          >
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The same list as a spreadsheet, out and back.
 *
 * Eighteen pairs of ninongs and ninangs is eighteen pairs of boxes and a lot of
 * scrolling, and it is a list the family almost certainly already keeps in
 * Excel. Down comes what is filled in — headers alone if nothing is — and back
 * comes whatever they send: the workbook itself, or the CSV either spreadsheet
 * saves.
 *
 * It replaces the rows rather than appending, because the file is the list: a
 * second upload of a corrected file should leave what the file says, not twice
 * what it says. Nothing is saved until the section is, so a mistaken upload is
 * undone by leaving the page.
 */
function ListSheet({ field, value, onChange, invitationId, max }: { field: Field; value: Record<string, unknown>[]; onChange: (v: unknown) => void; invitationId: string; max: number }) {
  const item = field.item ?? [];
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  if (item.length === 0) return null;

  function download() {
    const [header, ...body] = listToGrid(item, value);
    const csv = toCsv(header, body);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = sheetFilename(field.label);
    // In the document, or the click is ignored and no file arrives. Revoking is
    // left to the next tick for the same reason: the download has to start
    // first, and it starts after this function returns.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function upload(file: File) {
    setBusy(true);
    setNote('');
    try {
      const form = new FormData();
      form.set('file', file);
      const r = await parseSheetAction(invitationId, form);
      if (!r.ok) throw new Error(r.error ?? 'That file could not be read.');
      const rows = gridToList(item, r.data as string[][], max);
      if (rows.length === 0) throw new Error('No rows in that file. Is the first row the column names?');
      onChange(rows);
      setNote(`${rows.length} row${rows.length === 1 ? '' : 's'} read.`);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    // shrink-0 and nowrap together: on a phone the label is what gives way, not
    // the buttons — "↓ Sheet" broken over two lines reads as two controls.
    <span className="flex shrink-0 items-center gap-1 text-xs">
      {note && <span className="text-[color:var(--color-ink-500)]">{note}</span>}
      <button type="button" className="btn btn-ghost btn-sm whitespace-nowrap" onClick={download} title="Download this list as a spreadsheet">↓ Sheet</button>
      <button type="button" className="btn btn-ghost btn-sm whitespace-nowrap" onClick={() => input.current?.click()} disabled={busy} title="Replace this list from a spreadsheet">{busy ? '…' : '↑ Sheet'}</button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".csv,.tsv,.txt,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
    </span>
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-[color:var(--color-ink-500)]">{value.length}{Number.isFinite(max) && max < 200 ? ` / ${max}` : ''}</span>
          <ListSheet field={field} value={value} onChange={onChange} invitationId={invitationId} max={max} />
        </div>
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
        <p className="hint">{limit !== undefined && limit < (field.max ?? 200) && limit <= 12 ? `The page holds ${max} here.` : `Your package includes up to ${max} here. Upgrade for more.`}</p>
      )}
      <Hint text={field.hint} />
    </div>
  );
}

/**
 * The couple's own song file. A photo passes through the server; a song is
 * often bigger than a serverless function's request may carry, so the
 * browser asks for a signed address, puts the file in storage itself, and
 * has the server record it. Where there is no cloud storage (development)
 * the server says so and takes the file the ordinary way.
 */
function AudioInput({ field, value, onChange, invitationId }: { field: Field; value: string; onChange: (v: string) => void; invitationId: string }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const contentType =
        file.type === 'audio/mpeg' || file.type === 'audio/mp3' || /\.mp3$/i.test(file.name) ? 'audio/mpeg'
        : file.type === 'audio/mp4' || file.type === 'audio/x-m4a' || /\.m4a$/i.test(file.name) ? 'audio/mp4'
        : '';
      if (!contentType) throw new Error('Only MP3 and M4A audio files are accepted.');
      if (file.size > 20 * 1024 * 1024) throw new Error('Songs must be 20 MB or smaller.');
      const signRes = await fetch('/api/account/upload/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitationId, contentType, size: file.size }) });
      const sign = await signRes.json();
      if (!signRes.ok) throw new Error(sign.error ?? 'Upload failed.');
      if (sign.direct) {
        const fd = new FormData();
        fd.set('file', file);
        fd.set('invitationId', invitationId);
        fd.set('kind', 'AUDIO');
        const res = await fetch('/api/account/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Upload failed.');
        onChange(json.url);
      } else {
        await putWithProgress(sign.uploadUrl, file, contentType, setProgress);
        const res = await fetch('/api/account/upload/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitationId, storagePath: sign.storagePath, contentType }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Upload failed.');
        onChange(json.url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  const uploaded = value.startsWith('/uploads/') || value.includes('/storage/v1/object/public/');
  return (
    <div>
      <Label field={field} />
      <div className="space-y-2">
        {value && <audio controls preload="metadata" src={value} className="w-full" />}
        <input ref={input} type="file" accept="audio/mpeg,audio/mp4,.mp3,.m4a" className="field max-w-full text-sm" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <input type="url" className="field text-xs" placeholder="…or paste a direct link to an MP3" value={uploaded ? '' : value} onChange={(e) => onChange(e.target.value)} />
        {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>Remove</button>}
        {busy && <p className="hint">{progress > 0 && progress < 100 ? `Uploading… ${progress}%` : 'Uploading…'}</p>}
        {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
      </div>
      <Hint text={field.hint} />
    </div>
  );
}

/** PUT a file with a progress readout — fetch cannot report upload progress, XHR can. */
function putWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The file could not be sent to storage. Please try again.')));
    xhr.onerror = () => reject(new Error('The file could not be sent to storage. Please check your connection and try again.'));
    xhr.send(file);
  });
}

/** A moment in the song, as minutes and seconds — pull-up choices, like a date. Stored as seconds; none is null. */
function OffsetInput({ field, id, value, onChange }: { field: Field; id: string; value: number | null; onChange: (v: number | null) => void }) {
  const total = value ?? 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  const set = (mm: number, ss: number) => {
    const n = mm * 60 + ss;
    onChange(n > 0 ? n : null);
  };
  return (
    <div>
      <Label field={field} htmlFor={id} />
      <div className="grid grid-cols-2 gap-2">
        <select id={id} className="field" value={m} onChange={(e) => set(Number(e.target.value), s)} aria-label="Minutes">
          {Array.from({ length: 15 }, (_, i) => <option key={i} value={i}>{i} min</option>)}
        </select>
        <select className="field" value={s} onChange={(e) => set(m, Number(e.target.value))} aria-label="Seconds">
          {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')} sec</option>)}
        </select>
      </div>
      <Hint text={field.hint} />
    </div>
  );
}
