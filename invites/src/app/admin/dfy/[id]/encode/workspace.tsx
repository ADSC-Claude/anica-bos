'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Field, SectionData, SectionKey } from '@/lib/sections';
import type { Lang } from '@/lib/copy';
import { SectionFields } from '@/components/builder/fields';
import { saveSectionAction, sectionDoneAction } from '@/app/account/actions';
import { overlayIntake } from '@/lib/intake';
import { invitationPath } from '@/lib/app-url';

/**
 * The encoder's workspace for a Done-For-You order.
 *
 * The client's form is already word for word and photo by segment, and it is
 * copied into the invitation the moment they submit it. What is left is the
 * fit: does the intro sit on the cover, is the prenup in the right order, did
 * they write the milestone in the right box, is the wording what a guest
 * should read. So the three columns are the segments in page order, the
 * client's own words beside the form for the segment in hand, and the page
 * itself scrolled to that segment — every save reloads it there.
 */
export type WorkSection = {
  key: SectionKey;
  label: string;
  description: string;
  /** the block's id on the guest page */
  anchor: string;
  filled: boolean;
  /** the client wrote something here on their intake */
  fromClient: boolean;
};

export function Workspace({
  jobId,
  invitationId,
  slug,
  sections,
  current,
  fields,
  initial,
  intakeRows,
  intakeData,
  intakeNotes,
  lang,
  listLimits,
  listHints,
  done: doneInitial,
}: {
  jobId: string;
  invitationId: string;
  slug: string;
  sections: WorkSection[];
  current: SectionKey;
  fields: Field[];
  initial: SectionData;
  /** the client's answers for this segment, as words */
  intakeRows: { label: string; value: string }[];
  intakeData: SectionData | null;
  intakeNotes: string;
  lang: Lang;
  listLimits: Record<string, number>;
  listHints?: Record<string, string>;
  done: SectionKey[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<SectionData>(initial);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone');
  const [pending, start] = useTransition();
  const [done, setDone] = useState<SectionKey[]>(doneInitial);
  const frame = useRef<HTMLIFrameElement>(null);
  // whether the page has a block for this segment: an empty section is not drawn, so there is nothing to scroll to
  const [onPage, setOnPage] = useState<boolean | null>(null);

  const index = sections.findIndex((s) => s.key === current);
  const section = sections[index];
  const next = sections[index + 1];
  const isDone = done.includes(current);
  const doneCount = sections.filter((s) => done.includes(s.key)).length;
  const href = (key: SectionKey) => `/admin/dfy/${jobId}/encode?section=${key}`;
  const preview = `${invitationPath(slug)}?bare=1#${section?.anchor ?? 'top'}`;

  // The page is the same document across segments; only where it is scrolled
  // to changes. Same origin, so the frame can be told rather than reloaded.
  useEffect(() => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    try {
      win.location.hash = section?.anchor ?? 'top';
    } catch {
      // a frame still loading has no document to scroll; its src carries the anchor
    }
  }, [section?.anchor]);

  /** Once the page is in, look for the segment's block; same origin, so the document is ours to read. */
  function landed() {
    try {
      const doc = frame.current?.contentDocument;
      setOnPage(doc ? Boolean(doc.getElementById(section?.anchor ?? 'top')) : null);
    } catch {
      setOnPage(null);
    }
  }

  function save(markDone: boolean, goNext = false) {
    setError('');
    setMessage('');
    start(async () => {
      const res = await saveSectionAction(invitationId, current, value, markDone ? { done: true } : {});
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirty(false);
      setDone(res.data.done);
      setMessage(res.data.issues.length ? `Saved, with notes: ${res.data.issues.map((i) => `${i.path} — ${i.message}`).join('; ')}` : markDone ? 'Saved and checked off.' : 'Saved.');
      setPreviewKey((k) => k + 1);
      router.refresh();
      if (goNext && next) router.push(href(next.key));
    });
  }

  function uncheck() {
    start(async () => {
      const res = await sectionDoneAction(invitationId, current, false);
      if (!res.ok) { setError(res.error); return; }
      setDone(res.data.done);
      router.refresh();
    });
  }

  /** The client's answers over the form: blanks they left keep what is there. */
  function useClients() {
    if (!intakeData) return;
    setValue(overlayIntake(value, intakeData));
    setDirty(true);
    setMessage('The client’s answers are in the form. Save to put them on the page.');
  }

  // Lists of photographs get a strip of thumbnails above the form: the order
  // of a prenup set is the encoder's call, and dragging rows of upload boxes
  // is no way to make it.
  const photoLists = fields.filter((f) => f.type === 'list' && f.item?.some((i) => i.type === 'image'));

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[13rem_minmax(0,1fr)_24rem]">
      <nav aria-label="Segments" className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--color-ink-500)]">
          <span>{doneCount} of {sections.length} checked</span>
          <span>{Math.round((doneCount / Math.max(1, sections.length)) * 100)}%</span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[color:var(--color-sand-200)]"><div className="h-full rounded-full bg-[color:var(--ok)]" style={{ width: `${Math.round((doneCount / Math.max(1, sections.length)) * 100)}%` }} /></div>
        <ol className="flex gap-1 overflow-x-auto xl:flex-col xl:overflow-visible">
          {sections.map((s, i) => (
            <li key={s.key} className="shrink-0">
              <Link href={href(s.key)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${s.key === current ? 'bg-[color:var(--color-plum-600)] text-white' : 'hover:bg-[color:var(--color-sand-100)]'}`} aria-current={s.key === current ? 'page' : undefined}>
                <span className={`w-4 text-right text-[10px] ${s.key === current ? 'text-white/70' : 'text-[color:var(--color-ink-500)]'}`}>{i + 1}</span>
                {done.includes(s.key) ? (
                  <span aria-label="Checked" className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${s.key === current ? 'bg-white text-[color:var(--color-plum-600)]' : 'bg-[color:var(--ok)] text-white'}`}>✓</span>
                ) : (
                  <span aria-hidden className={`mx-1 h-2 w-2 rounded-full ${s.filled ? 'bg-[color:var(--warn)]' : 'bg-[color:var(--color-sand-300)]'}`} />
                )}
                <span className="truncate">{s.label}</span>
                {s.fromClient && <span title="The client wrote this" aria-label="From the client" className={`ml-auto text-[10px] ${s.key === current ? 'text-white/80' : 'text-[color:var(--color-plum-500)]'}`}>✎</span>}
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-3 hidden text-[11px] text-[color:var(--color-ink-500)] xl:block">✎ the client wrote it · ● started · ✓ checked</p>
      </nav>

      <section className="min-w-0">
        <header className="mb-3">
          <h2 className="display text-2xl">{index + 1}. {section?.label} {isDone && <span className="pill pill-ok align-middle text-xs">Checked</span>}</h2>
          <p className="text-sm text-[color:var(--color-ink-500)]">{section?.description}</p>
        </header>

        <div className="mb-4 rounded-xl border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] p-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">What the client sent for this segment</p>
            {intakeData && intakeRows.length > 0 && <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={useClients}>Put their answers in the form</button>}
          </div>
          {intakeRows.length ? (
            <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[11rem_1fr]">
              {intakeRows.map((r) => <div key={r.label} className="contents"><dt className="text-xs text-[color:var(--color-ink-500)] sm:pt-0.5">{r.label}</dt><dd className="whitespace-pre-line">{r.value}</dd></div>)}
            </dl>
          ) : (
            <p className="text-sm text-[color:var(--color-ink-500)]">Nothing for this segment on their form{intakeNotes ? ' — it may be in their note.' : '.'}</p>
          )}
          {intakeNotes && (
            <details open={index === 0} className="mt-2 rounded-lg bg-white p-2 text-xs text-[color:var(--color-ink-700)]">
              <summary className="cursor-pointer font-semibold">Their note, with the whole form</summary>
              <p className="mt-1 whitespace-pre-line">{intakeNotes}</p>
            </details>
          )}
        </div>

        {photoLists.map((f) => (
          <PhotoStrip key={f.key} field={f} value={Array.isArray(value[f.key]) ? (value[f.key] as Record<string, unknown>[]) : []} onChange={(rows) => { setValue({ ...value, [f.key]: rows }); setDirty(true); }} />
        ))}

        <SectionFields fields={fields} value={value} onChange={(v) => { setValue(v); setDirty(true); }} lang={lang} invitationId={invitationId} listLimits={listLimits} listHints={listHints} />

        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] py-3">
          <button type="button" className="btn btn-primary" onClick={() => save(true, Boolean(next))} disabled={pending}>{pending ? 'Saving…' : next ? `Save, check off & next: ${next.label}` : 'Save & check off'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => save(false)} disabled={pending}>Save</button>
          {isDone && <button type="button" className="btn btn-ghost btn-sm" onClick={uncheck} disabled={pending}>Uncheck</button>}
          {dirty && !pending && <span className="text-xs text-[color:var(--warn)]">Unsaved changes</span>}
          {message && <span className="text-xs text-[color:var(--ok)]">{message}</span>}
          {error && <span role="alert" className="text-xs text-[color:var(--bad)]">{error}</span>}
        </div>
      </section>

      <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">The page, at this segment</p>
          <div className="flex gap-1 text-xs">
            <button type="button" className={`rounded px-2 py-1 ${device === 'phone' ? 'bg-[color:var(--color-sand-200)]' : ''}`} onClick={() => setDevice('phone')}>Phone</button>
            <button type="button" className={`rounded px-2 py-1 ${device === 'desktop' ? 'bg-[color:var(--color-sand-200)]' : ''}`} onClick={() => setDevice('desktop')}>Desktop</button>
          </div>
        </div>
        {device === 'phone' ? (
          <div className="phone mx-auto">
            <iframe ref={frame} key={previewKey} src={preview} title="Preview" onLoad={landed} />
          </div>
        ) : (
          <div className="aspect-[4/5] w-full overflow-hidden rounded-xl border border-[color:var(--color-sand-200)] bg-white">
            <iframe ref={frame} key={previewKey} src={preview} title="Preview" className="h-full w-full border-0" onLoad={landed} />
          </div>
        )}
        {onPage === false && <p className="mt-2 rounded-lg bg-[color:var(--color-sand-100)] p-2 text-center text-xs text-[color:var(--color-ink-700)]">Nothing on the page for this segment yet — it appears once something is saved in it.</p>}
        <p className="mt-2 text-center text-xs text-[color:var(--color-ink-500)]">Reloads on every save. <a href={`${invitationPath(slug)}?preview=1`} target="_blank" rel="noopener" className="underline">Open with the opening, in a new tab</a></p>
      </aside>
    </div>
  );
}

/**
 * The photographs in a list, as a strip: which comes first, which sits under
 * which arch. Arrows move one; "First" brings one to the front — the large
 * photo at the top of a prenup page is the first in the list.
 */
function PhotoStrip({ field, value, onChange }: { field: Field; value: Record<string, unknown>[]; onChange: (rows: Record<string, unknown>[]) => void }) {
  const imageKey = field.item?.find((i) => i.type === 'image')?.key;
  const captionKey = field.item?.find((i) => i.type === 'text')?.key;
  if (!imageKey || value.length < 2) return null;
  const move = (i: number, j: number) => {
    if (j < 0 || j >= value.length) return;
    const rows = [...value];
    const [row] = rows.splice(i, 1);
    rows.splice(j, 0, row);
    onChange(rows);
  };
  return (
    <div className="mb-4 rounded-xl border border-[color:var(--color-sand-200)] bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">{field.label}: the order on the page</p>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {value.map((row, i) => {
          const url = String(row[imageKey] ?? '');
          return (
            <li key={`${url}-${i}`} className="w-24 shrink-0">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-[color:var(--color-sand-100)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="flex h-full items-center justify-center text-xs text-[color:var(--color-ink-500)]">no photo</span>}
                <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white">{i + 1}</span>
              </div>
              {captionKey && <p className="mt-1 truncate text-[10px] text-[color:var(--color-ink-500)]" title={String(row[captionKey] ?? '')}>{String(row[captionKey] ?? '') || ' '}</p>}
              <div className="mt-1 flex justify-between text-xs">
                <button type="button" className="btn btn-ghost btn-sm px-1" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move earlier">◀</button>
                <button type="button" className="btn btn-ghost btn-sm px-1" onClick={() => move(i, 0)} disabled={i === 0} title="Make it the first">1st</button>
                <button type="button" className="btn btn-ghost btn-sm px-1" onClick={() => move(i, i + 1)} disabled={i === value.length - 1} aria-label="Move later">▶</button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
