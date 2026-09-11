'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import Link from 'next/link';
import type { Look } from '@/lib/looks';
import {
  isPicture, pageRatio, place, withFollowers, canAttach, ONE_SCREEN, LEGIBLE_CQW,
  type DesignDoc, type PageSpec, type Element, type PhotoEl, type TextEl, type FieldRef, type Ground, type LineRole,
} from '@/lib/design';
import { DrawnPage, bindingOf } from '@/components/invite/drawn';
import { asksOf, askable, askCounts, SHAPE_GUIDANCE, shapeOf, type Askable } from '@/lib/asks';
import type { Occasion } from '@prisma/client';
import { saveDesignDraftAction } from '../../../actions';
import { uploadGround } from './ground';

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
  occasion: Occasion;
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
  /** every id that is travelling, where each started, and which one the pointer holds */
  | { kind: 'move'; ids: string[]; from: Record<string, { x: number; y: number }>; lead: string; px: number; py: number }
  | { kind: 'size'; id: string; w: number; px: number }
  | { kind: 'turn'; id: string; cx: number; cy: number; from: number; rotate: number };

export function Studio(p: Props) {
  const [doc, setDoc] = useState<DesignDoc>(p.doc);
  const [pageKey, setPageKey] = useState(p.doc.pages[0]?.key ?? '');
  const [sel, setSel] = useState<string[]>([]);
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
  const chosen = useMemo(() => new Set(sel), [sel]);
  /** one thing selected shows its own panel; several show what they have in common */
  const selected = sel.length === 1 ? elements.find((e) => e.id === sel[0]) ?? null : null;
  const group = useMemo(() => (sel.length > 1 ? elements.filter((e) => chosen.has(e.id)) : []), [sel, elements, chosen]);

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

  const editEls = useCallback((ids: string[], fn: (e: Element) => Element, mark = true) => {
    const some = new Set(ids);
    setDoc((now) => {
      if (mark) { past.current = [...past.current.slice(-49), now]; future.current = []; }
      return { ...now, pages: now.pages.map((x) => (x.key === pageKey ? { ...x, elements: (x.elements ?? []).map((e) => (some.has(e.id) ? fn(e) : e)) } : x)) };
    });
    setState('dirty');
  }, [pageKey]);

  const editEl = useCallback((id: string, fn: (e: Element) => Element, mark = true) => editEls([id], fn, mark), [editEls]);

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
      if (mod && e.key.toLowerCase() === 'a' && page?.drawn) { e.preventDefault(); setSel(elements.map((el) => el.id)); return; }
      if (mod && e.key.toLowerCase() === 'd' && sel.length) { e.preventDefault(); duplicate(); return; }
      if (!sel.length) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
      if (e.key === 'Escape') { setSel([]); return; }
      const step = e.shiftKey ? 1 : 0.2;
      const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = by[e.key];
      if (!move) return;
      e.preventDefault();
      const ratio = page ? pageRatio(page) : 1;
      // what is attached comes along, the same as it does under the pointer
      editEls(withFollowers(elements, sel), (el) => ({ ...el, x: place((el.x ?? 50) + move[0]), y: place(el.y + move[1] / ratio) }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, page, elements, editEls, undo, redo]);

  /** A page's own key, free of every other page's. */
  function freePageKey(stem: string): string {
    const taken = new Set(doc.pages.map((x) => x.key));
    const base = stem.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'page';
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }

  /** A new page goes in after the one she is on, so it lands where she is looking. */
  function addPage(from?: PageSpec) {
    const key = freePageKey(from ? `${from.key}-copy` : 'page');
    const made: PageSpec = from
      ? { ...JSON.parse(JSON.stringify(from)) as PageSpec, key, peekEnd: undefined }
      : { key, sections: [] };
    const at = doc.pages.findIndex((x) => x.key === pageKey);
    const pages = [...doc.pages];
    pages.splice(at < 0 ? pages.length : at + 1, 0, made);
    change({ ...doc, pages });
    setPageKey(key);
    setSel([]);
  }

  function removePage(key: string) {
    if (doc.pages.length < 2) return;
    const pages = doc.pages.filter((x) => x.key !== key);
    change({ ...doc, pages });
    if (pageKey === key) setPageKey(pages[0].key);
    setSel([]);
  }

  function movePage(key: string, by: number) {
    const at = doc.pages.findIndex((x) => x.key === key);
    const to = at + by;
    if (at < 0 || to < 0 || to >= doc.pages.length) return;
    const pages = [...doc.pages];
    const [moved] = pages.splice(at, 1);
    pages.splice(to, 0, moved);
    change({ ...doc, pages });
  }

  /** Something new on the page, in the middle of it, selected and ready to drag. */
  function addElement(kind: 'text' | 'photo') {
    if (!page) return;
    const id = freeId(doc, kind === 'photo' ? 'photo' : 'words');
    const made: Element = kind === 'photo'
      ? { id, kind: 'photo', x: 50, y: 40, w: 40, anchor: 'centre', aspect: 1, frame: 'none', bind: { asset: '' } }
      : { id, kind: 'text', block: 'free', x: 50, y: 40, w: 70, anchor: 'top', lines: [{ role: 'body', sources: [{ fixed: { en: 'New words' } }] }] };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  /** The page's background: a picture she uploads, a colour from the palette, or nothing. */
  function setGround(ground: Ground | undefined) {
    editPage((pg) => {
      const next: PageSpec = { ...pg, ground };
      // a page with a ground of known proportions can be drawn on; one with none cannot
      if (!ground) next.drawn = undefined;
      return next;
    });
  }

  /**
   * A copy of everything selected, three across and two down from the
   * originals. An attachment between two of the copies is copied with them —
   * duplicating a polaroid and its caption gives a polaroid and *its* caption,
   * not a second caption still following the first frame.
   */
  function duplicate() {
    if (!page || !sel.length) return;
    const taken = new Set(doc.pages.flatMap((x) => (x.elements ?? []).map((e) => e.id)));
    const renamed: Record<string, string> = {};
    const copies = elements.filter((e) => chosen.has(e.id)).map((el) => {
      const id = freeIdIn(taken, el.id.replace(/-\d+$/, ''));
      taken.add(id);
      renamed[el.id] = id;
      return { ...el, id, x: place((el.x ?? 50) + 3), y: place(el.y + 2) } as Element;
    });
    if (!copies.length) return;
    for (const c of copies) if (c.attachTo && renamed[c.attachTo]) c.attachTo = renamed[c.attachTo];
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), ...copies] }));
    setSel(copies.map((c) => c.id));
  }

  /** Deleting what something followed leaves it free, not pointing at a ghost. */
  function remove() {
    if (!sel.length) return;
    editPage((pg) => ({
      ...pg,
      elements: (pg.elements ?? [])
        .filter((e) => !chosen.has(e.id))
        .map((e) => (e.attachTo && chosen.has(e.attachTo) ? { ...e, attachTo: undefined } : e)),
    }));
    setSel([]);
  }

  function layer(by: number) {
    if (!sel.length || !page) return;
    const list = [...(page.elements ?? [])];
    const ids = list.filter((e) => chosen.has(e.id)).map((e) => e.id);
    // forwards from the front, backwards from the back, so a selection keeps its order
    for (const id of by > 0 ? [...ids].reverse() : ids) {
      const at = list.findIndex((e) => e.id === id);
      const to = Math.max(0, Math.min(list.length - 1, at + by));
      if (at < 0 || at === to) continue;
      const [el] = list.splice(at, 1);
      list.splice(to, 0, el);
    }
    editPage((pg) => ({ ...pg, elements: list }));
  }

  // --- several at once ------------------------------------------------------

  /**
   * The four things a designer does to a handful of elements by eye and gets
   * wrong by a hair. The first one in the page's order is the one the rest
   * agree with, because that is the one she picked first.
   */
  function lineUp() {
    if (group.length < 2) return;
    const x = settled(group[0]).x;
    editEls(group.map((e) => e.id), (el) => ({ ...el, x }));
  }
  function sameWidth() {
    if (group.length < 2) return;
    const w = settled(group[0]).w;
    editEls(group.map((e) => e.id), (el) => ({ ...el, w }));
  }
  function spaceDown() {
    if (group.length < 3) return;
    const order = [...group].sort((a, b) => a.y - b.y);
    const top = order[0].y;
    const gap = (order[order.length - 1].y - top) / (order.length - 1);
    const at: Record<string, number> = {};
    order.forEach((el, i) => { at[el.id] = place(top + gap * i); });
    editEls(Object.keys(at), (el) => ({ ...el, y: at[el.id] ?? el.y }));
  }
  /**
   * Typed into the Across and Down boxes rather than dragged. It travels the
   * same way a drag does — what is attached comes along — because a number is
   * only another way of saying where.
   */
  function moveTo(id: string, at: { x?: number; y?: number }) {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const dx = at.x === undefined ? 0 : at.x - settled(el).x;
    const dy = at.y === undefined ? 0 : at.y - el.y;
    if (!dx && !dy) return;
    editEls(withFollowers(elements, [id]), (e) => ({ ...e, x: place(settled(e).x + dx), y: place(e.y + dy) }));
  }

  /** Everything selected follows one element — or nothing, and travels alone again. */
  function attachAll(to: string | undefined) {
    const ids = to ? sel.filter((id) => canAttach(elements, id, to)) : sel;
    if (!ids.length) return;
    editEls(ids, (el) => ({ ...el, attachTo: to }));
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

  /**
   * Shift adds to the selection, and takes away again — the same gesture every
   * design tool uses. Taking one out is not the start of a drag, so it returns
   * before a drag is armed.
   */
  function startMove(e: RPointerEvent, el: Element) {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey && chosen.has(el.id) && sel.length > 1) { setSel(sel.filter((x) => x !== el.id)); return; }
    const holding = e.shiftKey && !chosen.has(el.id) ? [...sel, el.id] : chosen.has(el.id) ? sel : [el.id];
    setSel(holding);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    past.current = [...past.current.slice(-49), doc];
    future.current = [];
    const ids = withFollowers(elements, holding);
    const from: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const it = elements.find((x) => x.id === id);
      if (!it) continue;
      const { x, w } = settled(it);
      if (it.x === undefined) editEl(it.id, (x2) => ({ ...x2, x, w }), false);
      from[id] = { x, y: it.y };
    }
    drag.current = { kind: 'move', ids, from, lead: el.id, px: e.clientX, py: e.clientY };
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
      // the one under the pointer sets the distance; everything travelling
      // moves by the same, so a group keeps its shape and snaps as one
      const lead = d.from[d.lead];
      if (!lead) return;
      let x = lead.x + ((e.clientX - d.px) / b.width) * 100;
      let y = lead.y + ((e.clientY - d.py) / b.height) * 100;
      if (e.shiftKey) { if (Math.abs(e.clientX - d.px) > Math.abs(e.clientY - d.py)) y = lead.y; else x = lead.x; }
      const still = elements.filter((el) => !d.from[el.id]);
      x = snap(x, [50, ...still.map((el) => el.x ?? 50)]);
      y = snap(y, still.map((el) => el.y));
      const dx = x - lead.x;
      const dy = y - lead.y;
      editEls(d.ids, (el) => {
        const was = d.from[el.id];
        return was ? { ...el, x: place(was.x + dx), y: place(was.y + dy) } : el;
      }, false);
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

  /** What this design asks for, recomputed as she draws. */
  const asks = useMemo(() => asksOf(doc, p.occasion), [doc, p.occasion]);
  const counts = askCounts(asks);

  /**
   * The letters this box holds, measured from the box she drew and the face
   * it is set in. It is what the form counts down from, so it is measured
   * rather than typed: the same canvas the browser lays text out with gives
   * the average advance of the face at the size the page uses it.
   */
  const measureRoom = useCallback((id: string): number | undefined => {
    const node = stage.current?.querySelector<HTMLElement>(`[data-el="${id}"]`);
    if (!node) return undefined;
    // the line the customer's answer lands on is the first one, so it is that
    // line's own box and its own face that decide how much will fit — not the
    // block's, which on a milestone label holds a second line in another size
    const inner = node.querySelector<HTMLElement>('p, h2') ?? node;
    const cs = getComputedStyle(inner);
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return undefined;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const sample = 'Maria Clara at ang mga ninong nila';
    const advance = ctx.measureText(sample).width / sample.length + (parseFloat(cs.letterSpacing) || 0);
    if (!(advance > 0)) return undefined;
    const box = inner.getBoundingClientRect();
    const width = box.width || node.getBoundingClientRect().width;
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    const lines = Math.max(1, Math.round(box.height / line));
    if (!(width > 0)) return undefined;
    return Math.max(1, Math.floor((width / advance) * lines));
  }, []);

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
        <div className="flex items-center justify-between px-1">
          <p className="label">Pages</p>
          <span className="flex gap-1">
            <button type="button" title="A new blank page after this one" onClick={() => addPage()} className="rounded bg-[color:var(--color-sand-200)] px-2 text-sm leading-6">+</button>
            <button type="button" title="A copy of this page after it" onClick={() => page && addPage(page)} className="rounded bg-[color:var(--color-sand-200)] px-2 text-xs leading-6">copy</button>
          </span>
        </div>
        <ol className="mt-1 space-y-1">
          {doc.pages.map((pg, i) => (
            <li key={pg.key}>
              <button
                type="button"
                onClick={() => { setPageKey(pg.key); setSel([]); }}
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
              {pg.key === pageKey && (
                <span className="flex gap-1 px-2 pb-1 pt-0.5 text-[11px]">
                  <button type="button" onClick={() => movePage(pg.key, -1)} disabled={i === 0} className="rounded bg-[color:var(--color-sand-200)] px-1.5 disabled:opacity-40">↑</button>
                  <button type="button" onClick={() => movePage(pg.key, 1)} disabled={i === doc.pages.length - 1} className="rounded bg-[color:var(--color-sand-200)] px-1.5 disabled:opacity-40">↓</button>
                  <button type="button" onClick={() => removePage(pg.key)} disabled={doc.pages.length < 2} className="ml-auto rounded bg-[color:var(--color-sand-200)] px-1.5 text-red-700 disabled:opacity-40">delete</button>
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-3 border-t border-[color:var(--color-sand-300)] pt-2">
          <p className="label px-1">What this design asks for</p>
          {asks.length === 0 ? (
            <p className="hint px-1">Nothing yet. Select a frame or a box and switch on <strong>Ask the customer</strong>.</p>
          ) : (
            <>
              <ol className="mt-1 space-y-0.5">
                {asks.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => { setPageKey(a.page); setSel([a.id]); }}
                      className={`w-full rounded px-2 py-1 text-left text-[11px] leading-snug hover:bg-[color:var(--color-sand-100)] ${a.orphan ? 'text-amber-800' : ''}`}
                    >
                      {a.kind === 'photo' ? '▣' : '✎'} {a.label}
                      {a.room ? <span className="text-[color:var(--color-ink-500)]"> · {a.room} letters</span> : null}
                      {a.orphan ? <span className="block">not a field this occasion has</span> : null}
                    </button>
                  </li>
                ))}
              </ol>
              <p className="hint px-1">{counts.photos} photograph{counts.photos === 1 ? '' : 's'} and {counts.writings} writing{counts.writings === 1 ? '' : 's'}.</p>
            </>
          )}
        </div>
      </aside>

      {/* the page */}
      <section className="card p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {WIDTHS.map((w) => (
            <button key={w.key} type="button" onClick={() => setWidth(w.key)} className={`rounded px-2 py-1 ${width === w.key ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}>{w.label}<span className="ml-1 opacity-60">{w.hint}</span></button>
          ))}
          <span className="mx-1 h-4 w-px bg-[color:var(--color-sand-300)]" />
          <button type="button" onClick={() => addElement('text')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Words</button>
          <button type="button" onClick={() => addElement('photo')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Photo frame</button>
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
                onPointerDown={() => setSel([])}
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
                    <Ties elements={elements} boxes={boxes} on={chosen} />
                    {elements.map((el) => (
                      <Handle
                        key={el.id}
                        el={el}
                        at={boxes[el.id]}
                        on={chosen.has(el.id)}
                        solo={sel.length === 1}
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
        {group.length > 1 ? (
          <GroupProps
            group={group}
            others={elements.filter((e) => !chosen.has(e.id)).map((e) => ({ id: e.id, label: label(e) }))}
            attached={group.every((e) => e.attachTo && e.attachTo === group[0].attachTo) ? group[0].attachTo : undefined}
            onLineUp={lineUp}
            onSameWidth={sameWidth}
            onSpaceDown={spaceDown}
            onAttach={attachAll}
            onLayer={layer}
            onDuplicate={duplicate}
            onRemove={remove}
            label={label}
          />
        ) : selected ? (
          <Properties
            el={selected}
            ratio={ratio}
            occasion={p.occasion}
            onChange={(fn) => editEl(selected.id, fn)}
            onMoveTo={(at) => moveTo(selected.id, at)}
            onLayer={layer}
            onDuplicate={duplicate}
            onRemove={remove}
            label={label(selected)}
            measureRoom={() => measureRoom(selected.id)}
            attachable={elements.filter((e) => canAttach(elements, selected.id, e.id)).map((e) => ({ id: e.id, label: label(e) }))}
          />
        ) : (
          <PageProps page={page} onChange={editPage} onGround={setGround} templateId={p.templateId} vars={p.vars} />
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

/**
 * The grab area over one element: exactly the box the guest page gave it.
 * The corner and the turn knob appear on one selected element only — on six
 * of them they are six pairs of dots over the page, and resizing a group by
 * one corner is not what the corner means.
 */
function Handle({ el, at, on, solo, onDown, onSize, onTurn }: { el: Element; at?: Box; on: boolean; solo: boolean; onDown: (e: RPointerEvent) => void; onSize: (e: RPointerEvent) => void; onTurn: (e: RPointerEvent) => void }) {
  if (!at) return null;
  return (
    <div
      data-handle={el.id}
      data-on={on ? '' : undefined}
      onPointerDown={onDown}
      style={{
        position: 'absolute', left: `${at.x}%`, top: `${at.y}%`, width: `${at.w}%`, height: `${at.h}%`,
        cursor: 'move', background: 'transparent', pointerEvents: 'auto',
        outline: on ? '2px solid #2f6fd0' : '1px dashed rgba(47,111,208,0.4)',
      }}
    >
      {on && solo && (
        <>
          <span onPointerDown={onSize} style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, borderRadius: 2, background: '#2f6fd0', cursor: 'nwse-resize' }} />
          <span onPointerDown={onTurn} style={{ position: 'absolute', left: '50%', top: -22, marginLeft: -6, width: 12, height: 12, borderRadius: 99, background: '#2f6fd0', cursor: 'grab' }} />
        </>
      )}
    </div>
  );
}

/**
 * The tie between a follower and what it follows, drawn while either end is
 * selected. Without it an attachment is invisible until something moves and
 * a caption comes along unbidden. The box is the page's own percentages, so
 * the line is drawn in them and the stroke is kept off the scaling.
 */
function Ties({ elements, boxes, on }: { elements: Element[]; boxes: Record<string, Box>; on: Set<string> }) {
  const ties = elements.flatMap((el) => {
    if (!el.attachTo || (!on.has(el.id) && !on.has(el.attachTo))) return [];
    const a = boxes[el.id];
    const b = boxes[el.attachTo];
    return a && b ? [{ id: el.id, x1: a.x + a.w / 2, y1: a.y + a.h / 2, x2: b.x + b.w / 2, y2: b.y + b.h / 2 }] : [];
  });
  if (!ties.length) return null;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      {/* a circle would be drawn as an ellipse under this scaling, so the line is the whole of it */}
      {ties.map((t) => (
        <line key={t.id} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#2f6fd0" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function Properties({ el, ratio, occasion, onChange, onMoveTo, onLayer, onDuplicate, onRemove, label, measureRoom, attachable }: {
  el: Element; ratio: number; label: string; occasion: Occasion;
  onChange: (fn: (e: Element) => Element) => void;
  onMoveTo: (at: { x?: number; y?: number }) => void;
  onLayer: (by: number) => void; onDuplicate: () => void; onRemove: () => void;
  measureRoom: () => number | undefined;
  attachable: Named[];
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
        <label className="block"><span className="label">Across</span>{num(el.x, (n) => onMoveTo({ x: n }))}</label>
        <label className="block"><span className="label">Down</span>{num(el.y, (n) => onMoveTo({ y: n }))}</label>
        <label className="block"><span className="label">Width</span>{num(el.w, (n) => onChange((e) => ({ ...e, w: n })))}</label>
        <label className="block"><span className="label">Turn</span>{num(el.rotate, (n) => onChange((e) => ({ ...e, rotate: n })), 0.5)}</label>
      </div>
      <p className="hint">Across and width are a share of the page&rsquo;s width; down is a share of its height. This page is {ratio.toFixed(2)} screens tall.</p>
      <Attach value={el.attachTo} options={attachable} onChange={(to) => onChange((e) => ({ ...e, attachTo: to }))} />
      {el.kind === 'photo' && (
        <label className="block"><span className="label">Shape (height over width)</span>{num((el as PhotoEl).aspect, (n) => onChange((e) => ({ ...(e as PhotoEl), aspect: n })), 0.05)}</label>
      )}
      {el.kind === 'text' && <TypeBlock el={el as TextEl} onChange={onChange} />}
      <label className="block">
        <span className="label">Opacity</span>
        <input type="range" min={0} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => onChange((x) => ({ ...x, opacity: Number(e.target.value) }))} className="w-full" />
      </label>
      {(el.kind === 'photo' || el.kind === 'text') && (
        <AskBlock el={el} occasion={occasion} onChange={onChange} measureRoom={measureRoom} />
      )}
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => onLayer(1)} className="btn btn-ghost btn-sm">Bring forward</button>
        <button type="button" onClick={() => onLayer(-1)} className="btn btn-ghost btn-sm">Send back</button>
        <button type="button" onClick={onDuplicate} className="btn btn-ghost btn-sm">Duplicate</button>
        <button type="button" onClick={onRemove} className="btn btn-ghost btn-sm text-red-700">Delete</button>
      </div>
    </>
  );
}

/** The design's own faces. Each one is drawn in itself, so the menu is the answer. */
const FACES: { key: NonNullable<TextEl['face']>; label: string; css: string }[] = [
  { key: 'display', label: 'Heading', css: 'var(--inv-display)' },
  { key: 'names', label: 'Names', css: 'var(--inv-names)' },
  { key: 'script', label: 'Script', css: 'var(--inv-script)' },
  { key: 'body', label: 'Body', css: 'var(--inv-body)' },
];

/** The roles a line can take, and what each is for. */
const ROLES_TEXT: { key: LineRole; label: string }[] = [
  { key: 'title', label: 'Heading' },
  { key: 'script', label: 'Heading in script' },
  { key: 'eyebrow', label: 'Small line above' },
  { key: 'sub', label: 'Line under the heading' },
  { key: 'label-title', label: 'A name' },
  { key: 'label-text', label: 'A sentence under a name' },
  { key: 'caption', label: 'A caption' },
  { key: 'body', label: 'Plain words' },
];

/**
 * How the words are set: the face from the design's own set, the size in
 * shares of the column so it holds at every width, the weight, the spacing
 * between letters, and what sits behind them on a busy picture. Each line
 * keeps its own role, because a heading and the line under it are not the
 * same thing even when they live in one box.
 */
function TypeBlock({ el, onChange }: { el: TextEl; onChange: (fn: (e: Element) => Element) => void }) {
  const edit = (fn: (t: TextEl) => TextEl) => onChange((x) => fn(x as TextEl));
  const small = el.size !== undefined && el.size < LEGIBLE_CQW;
  return (
    <div className="border-t border-[color:var(--color-sand-300)] pt-3">
      <p className="label">How it is set</p>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {FACES.map((f) => (
          <button
            key={f.key}
            type="button"
            title={f.label}
            onClick={() => edit((t) => ({ ...t, face: t.face === f.key ? undefined : f.key }))}
            className={`rounded border px-1 py-1.5 text-base leading-none ${el.face === f.key ? 'border-[color:var(--color-ink-700)] bg-[color:var(--color-sand-200)]' : 'border-[color:var(--color-sand-300)]'}`}
            style={{ fontFamily: f.css }}
          >
            Aa
          </button>
        ))}
      </div>
      <p className="hint">{el.face ? FACES.find((f) => f.key === el.face)?.label : 'Whatever the role is set in'} — tap again to go back to the role&rsquo;s own face.</p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="block">
          <span className="label">Size</span>
          <input
            type="number" min={0.5} max={40} step={0.1}
            value={el.size ?? ''}
            placeholder="role"
            onChange={(e) => edit((t) => ({ ...t, size: Number(e.target.value) > 0 ? place(Number(e.target.value)) : undefined }))}
            className="input w-full"
          />
        </label>
        <label className="block">
          <span className="label">Weight</span>
          <input
            type="number" min={100} max={900} step={100}
            value={el.weight ?? ''}
            placeholder="—"
            onChange={(e) => edit((t) => ({ ...t, weight: Number(e.target.value) >= 100 ? Math.round(Number(e.target.value)) : undefined }))}
            className="input w-full"
          />
        </label>
        <label className="block">
          <span className="label">Spacing</span>
          <input
            type="number" min={-0.05} max={0.4} step={0.01}
            value={el.tracking ?? ''}
            placeholder="—"
            onChange={(e) => edit((t) => ({ ...t, tracking: e.target.value === '' ? undefined : place(Number(e.target.value)) }))}
            className="input w-full"
          />
        </label>
      </div>
      <p className="hint">Size is a share of the column, so it holds at every width. {small && <strong className="text-amber-800">Under {LEGIBLE_CQW} it is hard to read on a small phone.</strong>}</p>

      <label className="mt-2 block">
        <span className="label">Behind the words</span>
        <select className="input w-full" value={el.backing ?? 'none'} onChange={(e) => edit((t) => ({ ...t, backing: e.target.value === 'none' ? undefined : (e.target.value as TextEl['backing']) }))}>
          <option value="none">Nothing</option>
          <option value="shadow">A soft shadow</option>
          <option value="scrim">A pale card</option>
        </select>
        <span className="hint">For words that sit on a busy picture.</span>
      </label>

      <p className="label mt-3">Lines</p>
      <ul className="mt-1 space-y-1">
        {el.lines.map((l, i) => (
          <li key={i} className="rounded bg-[color:var(--color-sand-100)] p-2">
            <select
              className="input w-full text-xs"
              value={l.role}
              onChange={(e) => edit((t) => ({ ...t, lines: t.lines.map((x, j) => (j === i ? { ...x, role: e.target.value as LineRole } : x)) }))}
            >
              {ROLES_TEXT.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <div className="mt-1 flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => edit((t) => ({ ...t, lines: t.lines.map((x, j) => (j === i ? { ...x, align: x.align === a ? undefined : a } : x)) }))}
                  className={`rounded px-2 py-0.5 text-xs ${l.align === a ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-white'}`}
                >
                  {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-[color:var(--color-ink-500)]">{l.sources.length} source{l.sources.length === 1 ? '' : 's'}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ask the customer.
 *
 * One switch on an element, and the form has a question. What it asks for is
 * a field the occasion actually offers, picked from the same list the form is
 * built from, so a design can never ask for something that does not exist.
 * The box she drew sets the size of the answer: the letters it holds are
 * measured from the box and the face, and that is what the form counts down
 * from. A frame she has asked for also says what it shows when nobody
 * answers, so a half-filled page still looks designed.
 */
function AskBlock({ el, occasion, onChange, measureRoom }: {
  el: PhotoEl | TextEl;
  occasion: Occasion;
  onChange: (fn: (e: Element) => Element) => void;
  measureRoom: () => number | undefined;
}) {
  const kind = el.kind;
  const offers = useMemo(() => askable(occasion, kind), [occasion, kind]);
  const ref = bindingOf(el);
  const at = ref ? offers.find((o) => o.section === ref.section && o.field === ref.field && (o.sub ?? undefined) === (ref.sub ?? undefined)) : undefined;
  const value = at ? key(at) : '';

  function bind(next: Askable | undefined, index?: number) {
    const made: FieldRef | undefined = next
      ? { section: next.section, field: next.field, ...(next.sub ? { sub: next.sub } : {}), ...(next.list ? { index: index ?? 0 } : {}) }
      : undefined;
    onChange((e) => {
      if (e.kind === 'photo') return { ...e, bind: made ?? { asset: '' } };
      if (e.kind !== 'text') return e;
      // the first line carries the customer's answer; the rest of the chain stands
      const lines = e.lines.map((l, i) => (i === 0
        ? { ...l, sources: made ? [{ bind: made }, ...l.sources.filter((sx) => !('bind' in sx))] : l.sources.filter((sx) => !('bind' in sx)) }
        : l));
      return { ...e, lines: lines.length ? lines : e.lines };
    });
  }

  return (
    <div className="border-t border-[color:var(--color-sand-300)] pt-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(el.ask)}
          onChange={(e) => onChange((x) => ({ ...x, ask: e.target.checked ? true : undefined }))}
          className="h-4 w-4"
        />
        <span className="font-semibold">Ask the customer</span>
      </label>
      {!el.ask ? (
        <p className="hint">Off: this is the design&rsquo;s own {kind === 'photo' ? 'picture' : 'words'}, and the form says nothing about it.</p>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="label">What is it?</span>
            <select className="input w-full" value={value} onChange={(e) => bind(offers.find((o) => key(o) === e.target.value), ref?.index)}>
              <option value="">— pick a field —</option>
              {Object.entries(groupBy(offers)).map(([section, list]) => (
                <optgroup key={section} label={section}>
                  {list.map((o) => <option key={key(o)} value={key(o)}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {at?.list && (
            <label className="block">
              <span className="label">Which one in the list</span>
              <input
                type="number" min={1} max={40}
                value={(ref?.index ?? 0) + 1}
                onChange={(e) => bind(at, Math.max(0, Math.round(Number(e.target.value)) - 1))}
                className="input w-full"
              />
            </label>
          )}
          {kind === 'photo' && (
            <>
              <p className="hint">A <strong>{shapeOf((el as PhotoEl).aspect)}</strong> frame. {SHAPE_GUIDANCE[shapeOf((el as PhotoEl).aspect)]}</p>
              <label className="block">
                <span className="label">If it is left empty</span>
                <select
                  className="input w-full"
                  value={el.ifEmpty === 'leave' || el.ifEmpty === undefined ? 'leave' : 'piece'}
                  onChange={(e) => onChange((x) => ({ ...x, ifEmpty: e.target.value === 'leave' ? 'leave' : { piece: '' } }))}
                >
                  <option value="leave">Leave the space</option>
                  <option value="piece">Show a piece from the library</option>
                </select>
              </label>
              {el.ifEmpty && el.ifEmpty !== 'leave' && (
                <input
                  className="input w-full font-mono text-xs"
                  placeholder="/babyblue/cloud.webp"
                  value={el.ifEmpty.piece}
                  onChange={(e) => onChange((x) => ({ ...x, ifEmpty: { piece: e.target.value } }))}
                />
              )}
            </>
          )}
          {kind === 'text' && (
            <label className="block">
              <span className="label">Letters the box holds</span>
              <span className="flex gap-1">
                <input
                  type="number" min={1} max={2000}
                  value={(el as TextEl).room ?? ''}
                  onChange={(e) => onChange((x) => ({ ...(x as TextEl), room: Math.max(1, Math.round(Number(e.target.value))) || undefined }))}
                  className="input w-full"
                />
                <button
                  type="button"
                  onClick={() => { const n = measureRoom(); if (n) onChange((x) => ({ ...(x as TextEl), room: n })); }}
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  Measure
                </button>
              </span>
              <span className="hint">What the form counts down from. Measure reads the box you drew and the face it is set in.</span>
            </label>
          )}
          {el.ask && !at && <p className="hint text-amber-800">Nothing picked yet, so this asks for nothing.</p>}
        </div>
      )}
    </div>
  );
}

type Named = { id: string; label: string };

/**
 * Moves with.
 *
 * A polaroid and the caption under it are two elements and one thing. Saying
 * so here means the caption comes along whenever the frame is dragged, so the
 * pair never drifts apart. Anything that would make a ring — this following
 * what already follows it — is not on the list.
 */
function Attach({ value, options, onChange }: { value?: string; options: Named[]; onChange: (to: string | undefined) => void }) {
  return (
    <label className="block">
      <span className="label">Moves with</span>
      <select className="input w-full" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Nothing &mdash; it stands on its own</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.id} &middot; {o.label}</option>)}
      </select>
      {value && !options.some((o) => o.id === value) && <span className="hint text-amber-800">It follows <strong>{value}</strong>, which is not on this page.</span>}
    </label>
  );
}

/**
 * Several things at once.
 *
 * What a designer wants from a handful of selected elements is rarely to set
 * a number on each: it is to line them up, make them the same, space them
 * evenly, or tie them together. Each of those is one press here and a dozen
 * careful drags otherwise.
 */
function GroupProps({ group, others, attached, onLineUp, onSameWidth, onSpaceDown, onAttach, onLayer, onDuplicate, onRemove, label }: {
  group: Element[];
  others: Named[];
  attached?: string;
  onLineUp: () => void; onSameWidth: () => void; onSpaceDown: () => void;
  onAttach: (to: string | undefined) => void;
  onLayer: (by: number) => void; onDuplicate: () => void; onRemove: () => void;
  label: (el: Element) => string;
}) {
  return (
    <>
      <p className="label">{group.length} things selected</p>
      <ul className="space-y-0.5 text-[11px] leading-snug text-[color:var(--color-ink-500)]">
        {group.map((el) => <li key={el.id}>{el.kind === 'photo' ? '▣' : '✎'} {el.id} &middot; {label(el)}</li>)}
      </ul>
      <div className="grid gap-1 border-t border-[color:var(--color-sand-300)] pt-3">
        <button type="button" onClick={onLineUp} className="btn btn-secondary btn-sm">Line them up</button>
        <button type="button" onClick={onSameWidth} className="btn btn-secondary btn-sm">Make them one width</button>
        <button type="button" onClick={onSpaceDown} disabled={group.length < 3} className="btn btn-secondary btn-sm disabled:opacity-40">Space them evenly down</button>
      </div>
      <p className="hint">They follow the first one in the page&rsquo;s order &mdash; {group[0]?.id}.</p>
      <Attach value={attached} options={others} onChange={onAttach} />
      <div className="flex flex-wrap gap-1 border-t border-[color:var(--color-sand-300)] pt-3">
        <button type="button" onClick={() => onLayer(1)} className="btn btn-ghost btn-sm">Bring forward</button>
        <button type="button" onClick={() => onLayer(-1)} className="btn btn-ghost btn-sm">Send back</button>
        <button type="button" onClick={onDuplicate} className="btn btn-ghost btn-sm">Duplicate</button>
        <button type="button" onClick={onRemove} className="btn btn-ghost btn-sm text-red-700">Delete</button>
      </div>
      <p className="hint">Shift and a click adds one, or takes one away. Drag any of them and the rest come along.</p>
    </>
  );
}

const key = (a: Askable) => `${a.section}|${a.field}|${a.sub ?? ''}`;
function groupBy(list: Askable[]): Record<string, Askable[]> {
  const out: Record<string, Askable[]> = {};
  for (const a of list) (out[a.sectionLabel] ??= []).push(a);
  return out;
}

/** The six roles a colour background can take, so night mode keeps working. */
const ROLES = [
  { key: 'bg', label: 'Paper' }, { key: 'surface', label: 'Card' }, { key: 'ink', label: 'Ink' },
  { key: 'muted', label: 'Muted' }, { key: 'accent', label: 'Accent' }, { key: 'accent2', label: 'Second accent' },
];

function PageProps({ page, onChange, onGround, templateId, vars }: {
  page?: PageSpec;
  onChange: (fn: (p: PageSpec) => PageSpec) => void;
  onGround: (g: Ground | undefined) => void;
  templateId: string;
  vars: Record<string, string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!page) return <p className="hint">This design has no pages yet.</p>;
  const ground = page.ground;

  async function pick(file: File) {
    setBusy(true);
    setError('');
    try {
      const up = await uploadGround(file, templateId);
      onGround({ url: up.url, ratio: up.ratio, top: up.top, bottom: up.bottom });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
      <div className="border-t border-[color:var(--color-sand-300)] pt-3">
        <p className="label">Background</p>
        <div className="mt-1 flex items-start gap-2">
          <span
            className="h-16 w-11 shrink-0 rounded border border-black/10 bg-cover bg-top"
            style={ground && isPicture(ground) ? { backgroundImage: `url(${ground.url})` } : { background: ground ? colourOf(ground.color, vars) : 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50%/10px 10px' }}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <label className={`btn btn-secondary btn-sm w-full ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
              {busy ? 'Reading the picture…' : ground && isPicture(ground) ? 'Replace the picture' : 'Upload a picture'}
              <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
            </label>
            {ground && <button type="button" onClick={() => onGround(undefined)} className="btn btn-ghost btn-sm w-full">No background</button>}
          </div>
        </div>
        {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
        <p className="label mt-2">or a colour</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              title={r.label}
              onClick={() => onGround({ color: r.key, ratio: ground && !isPicture(ground) ? ground.ratio : undefined })}
              className={`h-7 w-7 rounded border ${ground && !isPicture(ground) && ground.color === r.key ? 'border-[color:var(--color-ink-700)] ring-2 ring-[color:var(--color-ink-700)]' : 'border-black/15'}`}
              style={{ background: colourOf(r.key, vars) }}
            />
          ))}
          <label className="ml-1 flex items-center gap-1 text-xs">
            <input
              type="color"
              value={ground && !isPicture(ground) && ground.color.startsWith('#') ? ground.color : '#ffffff'}
              onChange={(e) => onGround({ color: e.target.value, ratio: ground && !isPicture(ground) ? ground.ratio : undefined })}
              className="h-7 w-7 cursor-pointer rounded border border-black/15 p-0"
            />
            own
          </label>
        </div>
        <p className="hint">A role colour follows the palette, so it turns itself down at night. A colour of your own does not.</p>

        {ground && (
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(page.drawn)}
              onChange={(e) => onChange((p) => ({ ...p, drawn: e.target.checked ? true : undefined }))}
              className="h-4 w-4"
            />
            <span>Drawn page &mdash; things are placed on it by hand</span>
          </label>
        )}
        {page.drawn && ground && !isPicture(ground) && (
          <label className="mt-2 block">
            <span className="label">How tall, in screens</span>
            <input
              type="number" min={0.3} max={12} step={0.1}
              value={ground.ratio ?? ONE_SCREEN}
              onChange={(e) => onGround({ color: ground.color, ratio: place(Math.max(0.3, Number(e.target.value) || ONE_SCREEN)) })}
              className="input w-full"
            />
          </label>
        )}
        {page.drawn && ground && isPicture(ground) && (
          <p className="hint mt-1">{ground.ratio.toFixed(3)} screens tall, from the picture itself.</p>
        )}
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
  return freeIdIn(new Set(doc.pages.flatMap((p) => (p.elements ?? []).map((e) => e.id))), stem);
}

/** A free id against a set that is still being added to, so a batch of copies cannot collide. */
function freeIdIn(taken: Set<string>, stem: string): string {
  const base = stem.replace(/[^a-z0-9-]/g, '') || 'element';
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
