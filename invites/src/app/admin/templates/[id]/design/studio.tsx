'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import Link from 'next/link';
import type { Look } from '@/lib/looks';
import {
  isPicture, pageRatio, place,
  type DesignDoc, type PageSpec, type Element, type PhotoEl, type TextEl, type FieldRef,
} from '@/lib/design';
import { DrawnPage } from '@/components/invite/drawn';
import { saveDesignDraftAction } from '../../../actions';

/**
 * The Design Studio.
 *
 * Three columns, like the builder our customers use: the pages on the left,
 * the page itself at phone size in the middle, and what is selected on the
 * right. The middle is the real guest markup — the same `DrawnPage` a guest
 * is served, inside the same `.inv` wrapper with the design's own palette —
 * with a layer of handles over it. So what she drags is not a picture of the
 * page; it is the page.
 */

/** The widths a guest actually reads on. "Laptop" is the widest column we ever draw. */
const WIDTHS = [
  { key: 360, label: 'Small phone', hint: '360' },
  { key: 390, label: 'Phone', hint: '390' },
  { key: 430, label: 'Large phone', hint: '430' },
  { key: 512, label: 'Laptop', hint: '512' },
];

/** How far a drag has to come to snap: a fifth of a percent of the page's width. */
const SNAP = 0.8;

type Props = {
  templateId: string;
  name: string;
  layout: string;
  doc: DesignDoc;
  rev: number;
  hasDraft: boolean;
  published: boolean;
  demoSlug: string;
  content: Record<string, unknown>;
  look?: Look;
  vars: Record<string, string>;
  canPublish: boolean;
};

type Drag =
  | { kind: 'move'; id: string; x: number; y: number; px: number; py: number }
  | { kind: 'size'; id: string; w: number; px: number }
  | { kind: 'turn'; id: string; cx: number; cy: number; from: number; rotate: number };

export function Studio(p: Props) {
  const [doc, setDoc] = useState<DesignDoc>(p.doc);
  const [pageKey, setPageKey] = useState(p.doc.pages[0]?.key ?? '');
  const [sel, setSel] = useState<string | null>(null);
  const [width, setWidth] = useState(390);
  const [night, setNight] = useState(false);
  const [rev, setRev] = useState(p.rev);
  const [state, setState] = useState<'clean' | 'dirty' | 'saving' | 'saved' | 'error'>('clean');
  const [error, setError] = useState('');
  const past = useRef<DesignDoc[]>([]);
  const future = useRef<DesignDoc[]>([]);
  const stage = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);

  const page = doc.pages.find((x) => x.key === pageKey) ?? doc.pages[0];
  const elements = useMemo(() => page?.elements ?? [], [page]);
  const selected = elements.find((e) => e.id === sel) ?? null;

  /**
   * Where each element actually landed, in the page's own percentages.
   * Measured rather than computed, because a text block's height comes from
   * its words and the two headings carry no box of their own at all: the
   * stylesheet gives them one. A handle has to sit on what a guest sees.
   */
  const [boxes, setBoxes] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const b = root.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const next: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-el]'))) {
      const r = node.getBoundingClientRect();
      next[node.dataset.el!] = {
        x: ((r.left - b.left) / b.width) * 100,
        y: ((r.top - b.top) / b.height) * 100,
        w: (r.width / b.width) * 100,
        h: (r.height / b.height) * 100,
      };
    }
    setBoxes(next);
  }, [doc, page, width, night, p.content]);

  // --- changing the document ------------------------------------------------

  /** Every change goes through here, so undo and the save flag are never missed. */
  const change = useCallback((next: DesignDoc, { mark = true } = {}) => {
    setDoc((now) => {
      if (mark) { past.current = [...past.current.slice(-49), now]; future.current = []; }
      return next;
    });
    setState('dirty');
  }, []);

  const editPage = useCallback((fn: (p: PageSpec) => PageSpec) => {
    setDoc((now) => {
      past.current = [...past.current.slice(-49), now];
      future.current = [];
      return { ...now, pages: now.pages.map((x) => (x.key === pageKey ? fn(x) : x)) };
    });
    setState('dirty');
  }, [pageKey]);

  const editEl = useCallback((id: string, fn: (e: Element) => Element, mark = true) => {
    setDoc((now) => {
      if (mark) { past.current = [...past.current.slice(-49), now]; future.current = []; }
      return { ...now, pages: now.pages.map((x) => (x.key === pageKey ? { ...x, elements: (x.elements ?? []).map((e) => (e.id === id ? fn(e) : e)) } : x)) };
    });
    setState('dirty');
  }, [pageKey]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setDoc((now) => { future.current = [...future.current, now]; return prev; });
    setState('dirty');
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setDoc((now) => { past.current = [...past.current, now]; return next; });
    setState('dirty');
  }, []);

  // --- saving ---------------------------------------------------------------

  const save = useCallback(async (d: DesignDoc) => {
    setState('saving');
    setError('');
    const res = await saveDesignDraftAction(p.templateId, rev, JSON.stringify(d));
    if (res.ok) { setRev(res.rev); setState('saved'); return; }
    setRev(res.rev);
    setError(res.error);
    setState('error');
  }, [p.templateId, rev]);

  // Two seconds after her hand stops, the draft is saved. Nothing a guest sees
  // changes until she publishes.
  useEffect(() => {
    if (state !== 'dirty') return;
    const id = setTimeout(() => { void save(doc); }, 2000);
    return () => clearTimeout(id);
  }, [state, doc, save]);

  // --- the keyboard ---------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicate(); return; }
      if (!sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
      if (e.key === 'Escape') { setSel(null); return; }
      const step = e.shiftKey ? 1 : 0.2;
      const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = by[e.key];
      if (!move) return;
      e.preventDefault();
      const ratio = page ? pageRatio(page) : 1;
      editEl(sel, (el) => ({ ...el, x: place((el.x ?? 50) + move[0]), y: place(el.y + move[1] / ratio) }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, page, editEl, undo, redo]);

  function duplicate() {
    if (!selected || !page) return;
    const id = freeId(doc, selected.id.replace(/-\d+$/, ''));
    const copy = { ...selected, id, x: place((selected.x ?? 50) + 3), y: place(selected.y + 2) } as Element;
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), copy] }));
    setSel(id);
  }
  function remove() {
    if (!sel) return;
    editPage((pg) => ({ ...pg, elements: (pg.elements ?? []).filter((e) => e.id !== sel) }));
    setSel(null);
  }
  function layer(by: number) {
    if (!sel || !page) return;
    const list = [...(page.elements ?? [])];
    const at = list.findIndex((e) => e.id === sel);
    const to = Math.max(0, Math.min(list.length - 1, at + by));
    if (at < 0 || at === to) return;
    const [el] = list.splice(at, 1);
    list.splice(to, 0, el);
    editPage((pg) => ({ ...pg, elements: list }));
  }

  // --- dragging on the canvas -----------------------------------------------

  const box = () => stage.current?.getBoundingClientRect();

  /**
   * The two headings carry a top and nothing else, because the stylesheet
   * sets their left and right. The moment she moves or resizes one, the
   * numbers become the design's: taken from where the stylesheet had put it,
   * so the box does not jump on the first pixel of the drag.
   */
  const settled = useCallback((el: Element) => {
    const at = boxes[el.id];
    const x = el.x ?? (at ? place(at.x + at.w / 2) : 50);
    const w = el.w ?? (at ? place(at.w) : 20);
    return { x, w };
  }, [boxes]);

  function startMove(e: RPointerEvent, el: Element) {
    e.preventDefault();
    e.stopPropagation();
    setSel(el.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    past.current = [...past.current.slice(-49), doc];
    future.current = [];
    const { x, w } = settled(el);
    if (el.x === undefined) editEl(el.id, (x2) => ({ ...x2, x, w }), false);
    drag.current = { kind: 'move', id: el.id, x, y: el.y, px: e.clientX, py: e.clientY };
  }
  function startSize(e: RPointerEvent, el: Element) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    past.current = [...past.current.slice(-49), doc];
    future.current = [];
    const { x, w } = settled(el);
    if (el.x === undefined) editEl(el.id, (x2) => ({ ...x2, x, w }), false);
    drag.current = { kind: 'size', id: el.id, w, px: e.clientX };
  }
  function startTurn(e: RPointerEvent, el: Element) {
    e.preventDefault();
    e.stopPropagation();
    const b = box();
    if (!b || !page) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const cx = b.left + ((el.x ?? 50) / 100) * b.width;
    const cy = b.top + (el.y / 100) * b.height;
    past.current = [...past.current.slice(-49), doc];
    future.current = [];
    drag.current = { kind: 'turn', id: el.id, cx, cy, from: Math.atan2(e.clientY - cy, e.clientX - cx), rotate: el.rotate ?? 0 };
  }

  function onMove(e: RPointerEvent) {
    const d = drag.current;
    const b = box();
    if (!d || !b || !page) return;
    if (d.kind === 'move') {
      let x = d.x + ((e.clientX - d.px) / b.width) * 100;
      let y = d.y + ((e.clientY - d.py) / b.height) * 100;
      if (e.shiftKey) { if (Math.abs(e.clientX - d.px) > Math.abs(e.clientY - d.py)) y = d.y; else x = d.x; }
      x = snap(x, [50, ...elements.filter((el) => el.id !== d.id).map((el) => el.x ?? 50)]);
      y = snap(y, elements.filter((el) => el.id !== d.id).map((el) => el.y));
      editEl(d.id, (el) => ({ ...el, x: place(x), y: place(y) }), false);
    } else if (d.kind === 'size') {
      // the box is centred on x, so the corner moves half of what the width does
      const w = Math.max(1, d.w + ((e.clientX - d.px) / b.width) * 200);
      editEl(d.id, (el) => ({ ...el, w: place(w) }), false);
    } else {
      let deg = d.rotate + ((Math.atan2(e.clientY - d.cy, e.clientX - d.cx) - d.from) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      editEl(d.id, (el) => ({ ...el, rotate: place(((deg + 180) % 360) - 180) }), false);
    }
  }
  const endDrag = () => { drag.current = null; };

  // --- what an empty frame says ---------------------------------------------

  const label = useCallback((el: Element) => {
    const ref: FieldRef | undefined =
      el.kind === 'photo' ? ('asset' in el.bind ? undefined : el.bind)
        : el.kind === 'text' ? el.lines.flatMap((l) => l.sources).flatMap((s) => ('bind' in s ? [s.bind] : []))[0]
          : undefined;
    if (!ref) return el.kind === 'photo' ? 'A picture of yours' : 'Empty';
    const where = ref.index === undefined ? '' : ` ${ref.index + 1}`;
    return `${ref.sub ?? ref.field}${where} · ${ref.section}`;
  }, []);

  // --- the page's own numbers ------------------------------------------------

  const ratio = page ? pageRatio(page) : 1;
  const ground = page?.ground;
  const stageStyle: CSSProperties = {
    width,
    ...(page?.drawn ? { aspectRatio: `1 / ${ratio}` } : { minHeight: width * 1.2 }),
    ...(ground && isPicture(ground)
      ? { backgroundImage: `url(${ground.url})`, backgroundSize: '100% 100%' }
      : ground ? { background: colourOf(ground.color, p.vars) } : {}),
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[15rem_1fr_19rem]">
      <TopBar {...p} state={state} error={error} rev={rev} doc={doc} onSave={() => void save(doc)} />

      {/* the pages */}
      <aside className="card h-fit p-2">
        <p className="label px-1">Pages</p>
        <ol className="mt-1 space-y-1">
          {doc.pages.map((pg, i) => (
            <li key={pg.key}>
              <button
                type="button"
                onClick={() => { setPageKey(pg.key); setSel(null); }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${pg.key === pageKey ? 'bg-[color:var(--color-sand-200)] font-semibold' : 'hover:bg-[color:var(--color-sand-100)]'}`}
              >
                <span
                  className="h-9 w-6 shrink-0 rounded-sm border border-black/10 bg-cover bg-top"
                  style={pg.ground && isPicture(pg.ground) ? { backgroundImage: `url(${pg.ground.url})` } : { background: pg.ground ? colourOf(pg.ground.color, p.vars) : 'var(--color-sand-200)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{pg.label?.en ?? pg.key}</span>
                  <span className="block text-[11px] text-[color:var(--color-ink-500)]">{i + 1}. {pg.drawn ? 'drawn' : 'flows'}{pg.elements?.length ? ` · ${pg.elements.length}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      {/* the page */}
      <section className="card p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {WIDTHS.map((w) => (
            <button key={w.key} type="button" onClick={() => setWidth(w.key)} className={`rounded px-2 py-1 ${width === w.key ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}>{w.label}<span className="ml-1 opacity-60">{w.hint}</span></button>
          ))}
          <span className="ml-auto" />
          <button type="button" onClick={() => setNight((n) => !n)} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">{night ? '☾ Night' : '☀ Day'}</button>
          <button type="button" onClick={undo} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">Undo</button>
          <button type="button" onClick={redo} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">Redo</button>
        </div>

        <div className="flex justify-center overflow-auto bg-[color:var(--color-sand-100)] p-4">
          <div className="relative shadow-lg" style={{ width }}>
            <div className="inv" data-layout={p.layout} data-doc="" data-paged="" data-mode={night ? 'night' : 'day'} style={{ ...p.vars, minHeight: 0 } as CSSProperties} lang="en">
              <div
                ref={stage}
                className="inv-page relative"
                data-page={page?.key}
                data-drawn={page?.drawn ? '' : undefined}
                style={{ ...stageStyle, ['--page-ratio' as string]: ratio }}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerDown={() => setSel(null)}
              >
                {page && <DrawnPage page={page} content={p.content} look={p.look} lang="en" edit={{ label }} />}
                {/*
                  * The handles, over the real page. The layer itself lets the
                  * pointer through, so a click on bare ground still deselects;
                  * each handle takes it back. Without the layer the frames'
                  * own photographs sit on top and nothing can be grabbed.
                  */}
                {page?.drawn && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
                    {elements.map((el) => (
                      <Handle
                        key={el.id}
                        el={el}
                        at={boxes[el.id]}
                        on={el.id === sel}
                        onDown={(e) => startMove(e, el)}
                        onSize={(e) => startSize(e, el)}
                        onTurn={(e) => startTurn(e, el)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {!page?.drawn && <p className="hint mt-2">This page is laid out by its words, not by hand, so there is nothing to drag on it. Its background and which sections it carries are on the right.</p>}
      </section>

      {/* what is selected */}
      <aside className="card h-fit space-y-3 p-3 text-sm">
        {selected ? (
          <Properties el={selected} ratio={ratio} onChange={(fn) => editEl(selected.id, fn)} onLayer={layer} onDuplicate={duplicate} onRemove={remove} label={label(selected)} />
        ) : (
          <PageProps page={page} onChange={editPage} />
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopBar({ name, demoSlug, canPublish, templateId, state, error, published, onSave }: Props & { state: string; error: string; rev: number; doc: DesignDoc; onSave: () => void }) {
  const said: Record<string, string> = { clean: 'No unsaved changes', dirty: 'Not saved yet', saving: 'Saving…', saved: 'Draft saved', error: 'Not saved' };
  return (
    <div className="card col-span-full flex flex-wrap items-center gap-2 p-3">
      <p className="font-semibold">{name}</p>
      <span className={`rounded-full px-2 py-0.5 text-xs ${published ? 'bg-[color:var(--color-sand-200)]' : 'bg-amber-100 text-amber-900'}`}>{published ? 'Published' : 'Never published'}</span>
      <span className={`text-xs ${state === 'error' ? 'text-red-700' : 'text-[color:var(--color-ink-500)]'}`}>{said[state]}</span>
      {error && <span className="text-xs text-red-700">{error}</span>}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSave} className="btn btn-ghost btn-sm">Save draft</button>
        {demoSlug && <Link href={`/i/${demoSlug}`} target="_blank" className="btn btn-ghost btn-sm">Open as guest</Link>}
        {canPublish
          ? <Link href={`/admin/templates/${templateId}/design/publish`} className="btn btn-primary btn-sm">Publish design…</Link>
          : <span className="text-xs text-[color:var(--color-ink-500)]">Publishing is the owner&rsquo;s to press.</span>}
      </span>
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number };

/** The grab area over one element: exactly the box the guest page gave it. */
function Handle({ el, at, on, onDown, onSize, onTurn }: { el: Element; at?: Box; on: boolean; onDown: (e: RPointerEvent) => void; onSize: (e: RPointerEvent) => void; onTurn: (e: RPointerEvent) => void }) {
  if (!at) return null;
  return (
    <div
      data-handle={el.id}
      onPointerDown={onDown}
      style={{
        position: 'absolute', left: `${at.x}%`, top: `${at.y}%`, width: `${at.w}%`, height: `${at.h}%`,
        cursor: 'move', background: 'transparent', pointerEvents: 'auto',
        outline: on ? '2px solid #2f6fd0' : '1px dashed rgba(47,111,208,0.4)',
      }}
    >
      {on && (
        <>
          <span onPointerDown={onSize} style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, borderRadius: 2, background: '#2f6fd0', cursor: 'nwse-resize' }} />
          <span onPointerDown={onTurn} style={{ position: 'absolute', left: '50%', top: -22, marginLeft: -6, width: 12, height: 12, borderRadius: 99, background: '#2f6fd0', cursor: 'grab' }} />
        </>
      )}
    </div>
  );
}

function Properties({ el, ratio, onChange, onLayer, onDuplicate, onRemove, label }: {
  el: Element; ratio: number; label: string;
  onChange: (fn: (e: Element) => Element) => void;
  onLayer: (by: number) => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const num = (v: number | undefined, set: (n: number) => void, step = 0.1) => (
    <input type="number" value={v ?? ''} step={step} onChange={(e) => set(place(Number(e.target.value)))} className="input w-full" />
  );
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="label">{el.kind === 'photo' ? 'Photo frame' : el.kind === 'text' ? 'Words' : el.kind}</p>
        <p className="text-[11px] text-[color:var(--color-ink-500)]">{el.id}</p>
      </div>
      <p className="text-xs text-[color:var(--color-ink-500)]">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="label">Across</span>{num(el.x, (n) => onChange((e) => ({ ...e, x: n })))}</label>
        <label className="block"><span className="label">Down</span>{num(el.y, (n) => onChange((e) => ({ ...e, y: n })))}</label>
        <label className="block"><span className="label">Width</span>{num(el.w, (n) => onChange((e) => ({ ...e, w: n })))}</label>
        <label className="block"><span className="label">Turn</span>{num(el.rotate, (n) => onChange((e) => ({ ...e, rotate: n })), 0.5)}</label>
      </div>
      <p className="hint">Across and width are a share of the page&rsquo;s width; down is a share of its height. This page is {ratio.toFixed(2)} screens tall.</p>
      {el.kind === 'photo' && (
        <label className="block"><span className="label">Shape (height over width)</span>{num((el as PhotoEl).aspect, (n) => onChange((e) => ({ ...(e as PhotoEl), aspect: n })), 0.05)}</label>
      )}
      {el.kind === 'text' && (
        <div>
          <p className="label">Lines</p>
          <ul className="mt-1 space-y-1 text-xs">
            {(el as TextEl).lines.map((l, i) => <li key={i} className="rounded bg-[color:var(--color-sand-100)] px-2 py-1">{l.role}</li>)}
          </ul>
        </div>
      )}
      <label className="block">
        <span className="label">Opacity</span>
        <input type="range" min={0} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => onChange((x) => ({ ...x, opacity: Number(e.target.value) }))} className="w-full" />
      </label>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => onLayer(1)} className="btn btn-ghost btn-sm">Bring forward</button>
        <button type="button" onClick={() => onLayer(-1)} className="btn btn-ghost btn-sm">Send back</button>
        <button type="button" onClick={onDuplicate} className="btn btn-ghost btn-sm">Duplicate</button>
        <button type="button" onClick={onRemove} className="btn btn-ghost btn-sm text-red-700">Delete</button>
      </div>
    </>
  );
}

function PageProps({ page, onChange }: { page?: PageSpec; onChange: (fn: (p: PageSpec) => PageSpec) => void }) {
  if (!page) return <p className="hint">This design has no pages yet.</p>;
  return (
    <>
      <p className="label">The page</p>
      <label className="block">
        <span className="label">Name</span>
        <input className="input w-full" value={page.label?.en ?? ''} placeholder={page.key} onChange={(e) => onChange((p) => ({ ...p, label: { ...(p.label ?? { en: '' }), en: e.target.value } }))} />
      </label>
      <p className="text-xs text-[color:var(--color-ink-500)]">Key: {page.key}</p>
      <div>
        <p className="label">Sections it carries</p>
        <ul className="mt-1 flex flex-wrap gap-1 text-xs">
          {page.sections.map((s) => <li key={s} className="rounded bg-[color:var(--color-sand-100)] px-2 py-0.5">{s}</li>)}
          {page.sections.length === 0 && <li className="text-[color:var(--color-ink-500)]">none</li>}
        </ul>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(page.peekEnd)} onChange={(e) => onChange((p) => ({ ...p, peekEnd: e.target.checked ? true : undefined }))} className="h-4 w-4" />
        <span>Ends the &ldquo;See it open&rdquo; peek on the website</span>
      </label>
      <p className="hint">Click an element on the page to change it. Nothing here reaches a guest until the design is published.</p>
    </>
  );
}

// ---------------------------------------------------------------------------

/** Snap to a guide when the drag comes within a whisker of it. */
function snap(v: number, guides: number[]): number {
  for (const g of guides) if (Math.abs(v - g) < SNAP) return g;
  return v;
}

/** A colour role reads from the design's own palette; anything else is a colour. */
function colourOf(colour: string, vars: Record<string, string>): string {
  return vars[`--inv-${colour}`] ?? colour;
}

function freeId(doc: DesignDoc, stem: string): string {
  const taken = new Set(doc.pages.flatMap((p) => (p.elements ?? []).map((e) => e.id)));
  const base = stem.replace(/[^a-z0-9-]/g, '') || 'element';
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
