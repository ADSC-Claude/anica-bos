'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import Link from 'next/link';
import type { Look } from '@/lib/looks';
import {
  isPicture, pageRatio, place, withFollowers, canAttach, putSection, dropSection, shiftSection, titleWord,
  cropWindow, cropAt,
  LINE_KEYS, LINE_LABELS, TITLE_KEYS, TITLE_LABELS, ONE_SCREEN, LEGIBLE_CQW, BROWSER_BAR,
  type DesignDoc, type PageSpec, type Element, type PhotoEl, type TextEl, type ShapeEl, type CoverSpec, type FieldRef, type Ground, type LineRole, type PageSectionKey,
  type Source, type WordKey,
} from '@/lib/design';
import { sectionsFor, sectionLabel, type SectionKey } from '@/lib/sections';
import { DrawnPage, bindingOf } from '@/components/invite/drawn';
import { asksOf, askable, askCounts, SHAPE_GUIDANCE, shapeOf, type Askable } from '@/lib/asks';
import { pageNeeds, needCount, type Need } from '@/lib/needs';
import { sampleContent, SAMPLES, type Sample } from '@/lib/samples';
import type { Occasion } from '@prisma/client';
import { framesFromDifference, photoFromRect, type Rect } from '@/lib/importing';
import { PDF_TROUBLE, type PdfText } from '@/lib/pdf-import';
import type { Fonts } from '@/lib/theme';
import { saveDesignDraftAction, shareDesignDraftAction, stopSharingDesignDraftAction } from '../../../actions';
import { uploadGround, readPicture, drawAt, sendPicture, type ReadPicture, type Uploaded } from './ground';
import { readPdfFile } from './pdf';

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
  /** the live Share-draft link, or blank when the design is not shared */
  shareLink: string;
};

type Drag =
  /** every id that is travelling, where each started, and which one the pointer holds */
  | { kind: 'move'; ids: string[]; from: Record<string, { x: number; y: number }>; lead: string; px: number; py: number }
  | { kind: 'size'; id: string; w: number; px: number }
  | { kind: 'turn'; id: string; cx: number; cy: number; from: number; rotate: number }
  /** fitting a picture inside a frame that does not move: the window pans */
  | { kind: 'crop'; id: string; px: number; py: number; cx: number; cy: number };

/**
 * A picture being fitted: which frame, how big the file actually is, and
 * where the window sits meanwhile. The window itself is written into the
 * document as she drags, so the page under her hand is the page a guest
 * would get; `was` is what it held before, for Esc.
 */
type Fitting = { id: string; nw: number; nh: number; zoom: number; cx: number; cy: number; was?: PhotoEl['crop'] };

export function Studio(p: Props) {
  const [doc, setDoc] = useState<DesignDoc>(p.doc);
  const [pageKey, setPageKey] = useState(p.doc.pages[0]?.key ?? '');
  const [sel, setSel] = useState<string[]>([]);
  const [width, setWidth] = useState(390);
  /** the page under her hand, or the whole invitation as a guest scrolls it */
  const [view, setView] = useState<'page' | 'whole' | 'import'>('page');
  const [shown, setShown] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [night, setNight] = useState(false);
  /** who the canvas is drawn against: the demo, nobody, anybody, or the longest */
  const [sample, setSample] = useState<Sample>('demo');
  /** pages arriving as pictures, dropped on the strip */
  const [drop, setDrop] = useState({ busy: false, error: '' });
  /**
   * Who the canvas is drawn against. The checklist above is not switched
   * with it: it is a list about the design, and "the demo has no photo for
   * frame 4" is about the demo, not about whoever the canvas is showing.
   */
  const shownContent = useMemo(
    () => sampleContent(sample, { doc, occasion: p.occasion, demo: p.content }),
    [sample, doc, p.occasion, p.content],
  );
  /** the band a phone's browser keeps: shown on a page drawn to a screen or less */
  const [bar, setBar] = useState(true);
  const [rev, setRev] = useState(p.rev);
  const [state, setState] = useState<'clean' | 'dirty' | 'saving' | 'saved' | 'error'>('clean');
  const [error, setError] = useState('');
  const past = useRef<DesignDoc[]>([]);
  const future = useRef<DesignDoc[]>([]);
  const stage = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [fit, setFit] = useState<Fitting | null>(null);

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
  /** how far down the lowest thing reaches, in pixels: what a page that grows grows to */
  const [grown, setGrown] = useState(0);
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const b = root.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const next: Record<string, { x: number; y: number; w: number; h: number }> = {};
    let low = 0;
    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-el]'))) {
      const r = node.getBoundingClientRect();
      next[node.dataset.el!] = {
        x: ((r.left - b.left) / b.width) * 100,
        y: ((r.top - b.top) / b.height) * 100,
        w: (r.width / b.width) * 100,
        h: (r.height / b.height) * 100,
      };
      // what holds the foot follows the page down and never pushes it
      if (!node.hasAttribute('data-foot') && r.height) low = Math.max(low, r.bottom - b.top);
    }
    setBoxes(next);
    setGrown((was) => (Math.abs(was - low) < 0.5 ? was : low));
    // `view` is in the list because the stage is kept mounted but hidden while
    // the whole invitation is shown: a hidden box measures zero, the guard
    // above keeps the last good numbers, and this measures again on her return
  }, [doc, page, width, night, shownContent, view, grown]);

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

  // --- the whole invitation -------------------------------------------------

  /**
   * The preview is the real guest page, drawn on the server from the draft —
   * `?design=draft`, which only a previewer is given. So it is refreshed when
   * the draft is saved, and never in the middle of a drag, which would be a
   * reload every few pixels. Switching to it saves first, so what she is
   * looking at is what she has just drawn.
   */
  useEffect(() => { if (state === 'saved') setShown((n) => n + 1); }, [state]);

  /**
   * Same origin, so the preview is scrolled to her page rather than told to.
   * The offset is worked out and handed to the frame's own `scrollTo`:
   * `scrollIntoView` on an element in another document does nothing in
   * Chromium, and the page's `scroll-behavior: smooth` would animate a
   * three-thousand-pixel jump on every reload. It is run again a moment
   * later because the pages settle as their pictures arrive.
   */
  const showPage = useCallback(() => {
    const win = frame.current?.contentWindow;
    const at = win?.document.querySelector(`[data-page="${pageKey}"]`);
    if (!win || !at) return;
    win.scrollTo({ top: win.scrollY + at.getBoundingClientRect().top, behavior: 'instant' as ScrollBehavior });
  }, [pageKey]);
  useEffect(() => {
    if (view !== 'whole') return;
    showPage();
    const id = setTimeout(showPage, 600);
    return () => clearTimeout(id);
  }, [view, shown, showPage]);

  // --- the keyboard ---------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // while she is fitting a picture the keyboard belongs to the fitting
      if (fit) {
        if (e.key === 'Enter') { e.preventDefault(); keepFit(); }
        else if (e.key === 'Escape') { e.preventDefault(); dropFit(); }
        return;
      }
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
  }, [sel, page, elements, editEls, undo, redo, fit]);

  /** A page's own key, free of every other page's. */
  const freePageKey = (stem: string) => freeKeyIn(new Set(doc.pages.map((x) => x.key)), stem);

  /**
   * Pages from finished pictures, dropped on the strip.
   *
   * The other way round from drawing a page and giving it a background: she
   * has the pages already \u2014 laid out elsewhere, exported one picture each
   * \u2014 and wants them in, in order, ready to have frames placed on them.
   * Each becomes a drawn page at its picture's own proportions, named after
   * the file so she can tell them apart before she has renamed anything.
   *
   * They are ordered the way a person numbers files, so page-2 lands before
   * page-10 rather than after it. The whole batch is one change, so one undo
   * takes all of them back and the keys cannot collide with each other.
   */
  async function addSheets(files: File[]) {
    const list = files
      .filter((f) => f.type.startsWith('image/'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (!list.length) { setDrop({ busy: false, error: 'A page comes in as a picture of the page; those are something else.' }); return; }
    setDrop({ busy: true, error: '' });
    try {
      const taken = new Set(doc.pages.map((x) => x.key));
      const made: PageSpec[] = [];
      for (const file of list) {
        const up = await uploadGround(file, p.templateId);
        const stem = file.name.replace(/\.[^.]+$/, '');
        const key = freeKeyIn(taken, stem);
        taken.add(key);
        made.push({ key, label: { en: stem }, sections: [], drawn: true, importedFrom: 'picture', ground: { url: up.url, ratio: up.ratio, top: up.top, bottom: up.bottom } });
      }
      const at = doc.pages.findIndex((x) => x.key === pageKey);
      const pages = [...doc.pages];
      pages.splice(at < 0 ? pages.length : at + 1, 0, ...made);
      change({ ...doc, pages });
      setPageKey(made[0].key);
      setSel([]);
      setDrop({ busy: false, error: '' });
    } catch (e) {
      setDrop({ busy: false, error: (e as Error).message });
    }
  }

  /**
   * Pages brought in from somewhere else, with what the studio found on them.
   *
   * The background is the artwork alone — the export *without* the
   * placeholder photographs, or the PDF page drawn without them — so the
   * frames land on empty artwork rather than on a printed photograph of
   * somebody else's baby. A frame she did not name comes in asked for and
   * pointing at nothing, which the checklist says out loud rather than
   * leaving her to notice: an unnamed frame asks the customer for nothing.
   *
   * The whole batch is one change, so one undo takes all of it back and the
   * keys cannot collide with each other.
   */
  function addImported(brought: Brought[]) {
    if (!brought.length) return;
    const taken = new Set(doc.pages.map((x) => x.key));
    const ids = new Set(doc.pages.flatMap((x) => (x.elements ?? []).map((e) => e.id)));
    const made = brought.map((b) => {
      const key = freeKeyIn(taken, b.name);
      taken.add(key);
      const elements: Element[] = [];
      for (const f of b.frames) {
        const id = freeIdIn(ids, 'photo');
        ids.add(id);
        elements.push(photoFromRect(id, f.rect, b.up.ratio, f.bind ?? { asset: '' }));
      }
      for (const t of b.texts) {
        const id = freeIdIn(ids, 'words');
        ids.add(id);
        elements.push(wordsFromPdf(id, t));
      }
      const page: PageSpec = {
        key, label: { en: b.name }, sections: [], drawn: true, importedFrom: b.from,
        ground: { url: b.up.url, ratio: b.up.ratio, top: b.up.top, bottom: b.up.bottom },
        ...(elements.length ? { elements } : {}),
      };
      return page;
    });
    const at = doc.pages.findIndex((x) => x.key === pageKey);
    const pages = [...doc.pages];
    pages.splice(at < 0 ? pages.length : at + 1, 0, ...made);
    change({ ...doc, pages });
    setPageKey(made[0].key);
    setSel([]);
    setView('page');
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
  function addElement(kind: 'text' | 'photo' | 'shape') {
    if (!page) return;
    const id = freeId(doc, kind === 'photo' ? 'photo' : kind === 'shape' ? 'shape' : 'words');
    const made: Element = kind === 'photo'
      ? { id, kind: 'photo', x: 50, y: 40, w: 40, anchor: 'centre', aspect: 1, frame: 'none', bind: { asset: '' } }
      : kind === 'shape'
        // behind the words, not over them: a card is what a shape is usually for
        ? { id, kind: 'shape', shape: 'rect', x: 50, y: 40, w: 70, h: 30, anchor: 'centre', z: -1, fill: 'surface', radius: 1.6 }
        : { id, kind: 'text', block: 'free', x: 50, y: 40, w: 70, anchor: 'top', lines: [{ role: 'body', sources: [{ fixed: { en: 'New words' } }] }] };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  // --- what a page carries --------------------------------------------------

  const addSection = (key: PageSectionKey) => change(putSection(doc, pageKey, key));
  const removeSection = (key: string) => change(dropSection(doc, pageKey, key));
  const moveSection = (key: string, by: number) => change(shiftSection(doc, pageKey, key, by));

  /**
   * What she can put on this page: everything the occasion offers that is
   * not already here, each saying which page it would come from. The two
   * that are not sections of the form — the verse and the film that no
   * frame can hold — are offered beside them, because on the page they are
   * the same kind of thing.
   */
  const sectionOffer = useMemo(() => {
    const here = new Set<string>(page?.sections ?? []);
    const where = new Map<string, string>();
    for (const pg of doc.pages) for (const k of pg.sections) where.set(k, pg.key);
    const keys: { key: PageSectionKey; label: string }[] = [
      ...sectionsFor(p.occasion).map((d) => ({ key: d.key as PageSectionKey, label: sectionLabel(d.key, p.occasion) })),
      { key: 'verse', label: 'The verse' },
      { key: 'gallery-video', label: 'The film, and the photographs no frame holds' },
    ];
    return keys.filter((k) => !here.has(k.key)).map((k) => ({ ...k, on: where.get(k.key) }));
  }, [doc, page, p.occasion]);

  /** A section already on the page, named the way the form names it. */
  const nameOf = useCallback((key: string) => {
    if (key === 'verse') return 'The verse';
    if (key === 'gallery-video') return 'The film, and the photographs no frame holds';
    try { return sectionLabel(key as SectionKey, p.occasion); } catch { return key; }
  }, [p.occasion]);

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
  /** While a picture is being fitted, its own frame is the surface she drags on. */
  function startPan(e: RPointerEvent, el: Element) {
    e.preventDefault();
    e.stopPropagation();
    if (!fit || fit.id !== el.id) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: 'crop', id: el.id, px: e.clientX, py: e.clientY, cx: fit.cx, cy: fit.cy };
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
    } else if (d.kind === 'turn') {
      let deg = d.rotate + ((Math.atan2(e.clientY - d.cy, e.clientX - d.cx) - d.from) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      editEl(d.id, (el) => ({ ...el, rotate: place(((deg + 180) % 360) - 180) }), false);
    } else {
      // panning a picture inside a frame that does not move. The frame may be
      // turned — Baby Blue's polaroids all are — so the hand's travel is
      // turned back the other way before it is read as across and down.
      const f = fit;
      const el = elements.find((x) => x.id === d.id);
      if (!f || !el || el.kind !== 'photo') return;
      const win = cropWindow({ aspect: el.aspect ?? 1, nw: f.nw, nh: f.nh, zoom: f.zoom });
      const rad = (-(el.rotate ?? 0) * Math.PI) / 180;
      const hx = e.clientX - d.px;
      const hy = e.clientY - d.py;
      const across = hx * Math.cos(rad) - hy * Math.sin(rad);
      const down = hx * Math.sin(rad) + hy * Math.cos(rad);
      const fw = ((el.w ?? 20) / 100) * b.width;
      const fh = fw * (el.aspect ?? 1);
      putFit({ ...f, cx: d.cx - (across / fw) * win.w, cy: d.cy - (down / fh) * win.h });
    }
  }
  const endDrag = () => { drag.current = null; };

  // --- fitting a picture inside its frame -----------------------------------

  /**
   * The window she has chosen, written into the document as she moves.
   *
   * It goes in live and unmarked: the frame under her hand shows the real
   * picture at the real crop, which is the whole point of doing it on the
   * page rather than in a dialogue. One undo step was pushed when she
   * started, so undo afterwards puts back the picture she began with.
   */
  const putFit = useCallback((f: Fitting) => {
    const el = elements.find((x) => x.id === f.id);
    if (!el || el.kind !== 'photo') return;
    setFit(f);
    const win = cropWindow({ aspect: el.aspect ?? 1, nw: f.nw, nh: f.nh, zoom: f.zoom, cx: f.cx, cy: f.cy });
    editEl(f.id, (e) => ({ ...(e as PhotoEl), crop: win }), false);
  }, [elements, editEl]);

  function startFit(id: string) {
    const el = elements.find((x) => x.id === id);
    if (!el || el.kind !== 'photo') return;
    // the file's own size is what locks the window to the frame's shape, and
    // the only place it is known is the picture the browser has loaded
    const img = stage.current?.querySelector<HTMLImageElement>(`[data-el="${id}"] img`);
    if (!img?.naturalWidth || !img.naturalHeight) return;
    past.current = [...past.current.slice(-49), doc];
    future.current = [];
    setSel([id]);
    const at = el.crop ? cropAt(el.crop, el.aspect ?? 1, img.naturalWidth, img.naturalHeight) : { zoom: 1, cx: 0.5, cy: 0.5 };
    setFit({ id, nw: img.naturalWidth, nh: img.naturalHeight, was: el.crop, ...at });
  }
  const keepFit = () => setFit(null);
  function dropFit() {
    if (!fit) return;
    const was = fit.was;
    editEl(fit.id, (e) => {
      const back = { ...(e as PhotoEl) };
      if (was) back.crop = was; else delete back.crop;
      return back;
    }, false);
    // the step pushed when she started is hers no longer
    past.current = past.current.slice(0, -1);
    setFit(null);
  }

  /**
   * Scrolling zooms. React binds a wheel listener passively at the root, so
   * it cannot be a prop: without `passive: false` the canvas would zoom and
   * the panel behind it would scroll at the same time.
   */
  useEffect(() => {
    const node = stage.current;
    if (!node || !fit) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      putFit({ ...fit, zoom: Math.min(10, Math.max(1, fit.zoom * (e.deltaY < 0 ? 1.09 : 1 / 1.09))) });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [fit, putFit]);

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
   * What is still wrong with it, the same list the publish screen reads. It
   * is recomputed on every change because it is pure and cheap, and because
   * a checklist that lags is worse than none.
   */
  const needs = useMemo(() => pageNeeds({ doc, occasion: p.occasion, content: p.content }), [doc, p.occasion, p.content]);
  const here = useMemo(() => needs.filter((n) => n.page === pageKey), [needs, pageKey]);
  /** lines about the design rather than about any one page */
  const overall = useMemo(() => needs.filter((n) => !n.page), [needs]);
  const tally = needCount(needs);

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
    // a page that grows is at least its ground and taller when its words are,
    // so the canvas gives it a floor where a fixed page gets a proportion
    ...(page?.drawn
      ? (page.grow ? { minHeight: Math.max(width * ratio, grown + width * 0.04) } : { aspectRatio: `1 / ${ratio}` })
      : { minHeight: width * 1.2 }),
    ...(ground && isPicture(ground)
      ? { backgroundImage: `url(${ground.url})`, backgroundSize: '100% 100%' }
      : ground ? { background: colourOf(ground.color, p.vars) } : {}),
  };

  return (
    // Bringing a page in is one screen: the properties column steps aside
    // rather than describing a page she is not looking at.
    <div className={`grid gap-3 ${view === 'import' ? 'lg:grid-cols-[15rem_1fr]' : 'lg:grid-cols-[15rem_1fr_19rem]'}`}>
      <TopBar {...p} state={state} error={error} rev={rev} doc={doc} onSave={() => void save(doc)} />

      {/* the pages */}
      <aside
        className="card h-fit p-2"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void addSheets([...e.dataTransfer.files]); } }}
      >
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
                  <span className="block text-[11px] text-[color:var(--color-ink-500)]">
                    {i + 1}. {pg.drawn ? 'drawn' : 'flows'}{pg.elements?.length ? ` · ${pg.elements.length}` : ''}
                    {(() => {
                      const c = needCount(needs, pg.key);
                      if (c.blocks) return <span className="font-semibold text-red-700"> · {c.blocks} to fix</span>;
                      if (c.says) return <span className="text-amber-800"> · {c.says} to know</span>;
                      return null;
                    })()}
                  </span>
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
        {/*
          * The other way round from drawing a page: she has the pages
          * already, exported one picture each, and drops them here to get
          * one drawn page apiece, in order, ready for frames.
          */}
        <label className={`mt-2 block rounded border border-dashed border-[color:var(--color-sand-300)] px-2 py-3 text-center text-[11px] leading-snug ${drop.busy ? 'opacity-60' : 'cursor-pointer hover:bg-[color:var(--color-sand-100)]'}`}>
          {drop.busy ? 'Reading the pictures…' : 'Drop finished pages here, or choose them — one drawn page each, in order'}
          <input
            type="file" accept="image/*" multiple className="sr-only" disabled={drop.busy}
            onChange={(e) => { if (e.target.files?.length) { void addSheets([...e.target.files]); e.target.value = ''; } }}
          />
        </label>
        {drop.error && <p className="hint mt-1 text-[color:var(--bad)]">{drop.error}</p>}
        {/*
          * The same page, but with its frames found rather than placed by
          * hand. Two exports instead of one is the whole price of it.
          */}
        <button
          type="button"
          onClick={() => setView('import')}
          className="mt-1 block w-full rounded border border-dashed border-[color:var(--color-sand-300)] px-2 py-2 text-[11px] leading-snug hover:bg-[color:var(--color-sand-100)]"
        >
          Or bring one in from Canva &mdash; export it twice and the studio finds the frames
        </button>

        <div className="mt-3 border-t border-[color:var(--color-sand-300)] pt-2">
          <p className="label px-1">
            This page{tally.blocks > 0 && <span className="ml-1 font-normal text-red-700">· {tally.blocks} to fix in all</span>}
          </p>
          {here.length === 0 ? (
            <p className="hint px-1">{tally.blocks ? 'Nothing on this page. Another page has something.' : 'Nothing to fix.'}</p>
          ) : (
            <ol className="mt-1 space-y-0.5">
              {here.map((n, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => { if (n.id) setSel([n.id]); }}
                    className={`w-full rounded px-2 py-1 text-left text-[11px] leading-snug hover:bg-[color:var(--color-sand-100)] ${n.level === 'blocks' ? 'text-red-800' : 'text-[color:var(--color-ink-500)]'}`}
                  >
                    {n.level === 'blocks' ? '✗' : '·'} {n.text}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {overall.map((n, i) => (
            <p key={i} className={`px-2 pt-1 text-[11px] leading-snug ${n.level === 'blocks' ? 'text-red-800' : 'text-[color:var(--color-ink-500)]'}`}>
              {n.level === 'blocks' ? '✗' : '·'} {n.text}
            </p>
          ))}
        </div>

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
          {view === 'page' ? (
            <>
              <button type="button" onClick={() => addElement('text')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Words</button>
              <button type="button" onClick={() => addElement('photo')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Photo frame</button>
              <button type="button" onClick={() => addElement('shape')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Shape</button>
            </>
          ) : (
            <button type="button" onClick={() => setShown((n) => n + 1)} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">Draw it again</button>
          )}
          <span className="ml-auto" />
          {view === 'page' && page?.drawn && ratio <= ONE_SCREEN + 0.02 && (
            <button type="button" title="The band a phone's browser keeps for itself until the guest scrolls" onClick={() => setBar((x) => !x)} className={`rounded px-2 py-1 ${bar ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}>Browser bar</button>
          )}
          {view === 'page' && (
            <select
              title="Who the page is drawn against. None of it is saved: it is what the canvas draws, not what anybody has."
              value={sample}
              onChange={(e) => setSample(e.target.value as Sample)}
              className="rounded bg-[color:var(--color-sand-200)] px-2 py-1"
            >
              {SAMPLES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setNight((n) => !n)} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">{night ? '☾ Night' : '☀ Day'}</button>
          <button type="button" onClick={undo} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">Undo</button>
          <button type="button" onClick={redo} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">Redo</button>
        </div>

        {/*
          * This page, or the whole thing. The first is the page under her
          * hand, with handles over it; the second is the real guest page,
          * drawn on the server from the draft she has saved, scrolled to
          * where she is working.
          */}
        <div className="mb-3 flex gap-1 text-sm">
          {(view === 'import'
            ? ([['import', 'Bringing a page in']] as const)
            : ([['page', 'This page'], ['whole', 'The whole invitation']] as const)
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setView(k); if (k === 'whole' && state === 'dirty') void save(doc); }}
              className={`rounded-t px-3 py-1.5 ${view === k ? 'bg-[color:var(--color-sand-200)] font-semibold' : 'text-[color:var(--color-ink-500)] hover:bg-[color:var(--color-sand-100)]'}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {view === 'import' && (
          <ImportPair
            templateId={p.templateId}
            occasion={p.occasion}
            fonts={p.look?.fonts}
            onClose={() => setView('page')}
            onAdd={addImported}
          />
        )}

        {view === 'whole' && (
          <div className="flex justify-center bg-[color:var(--color-sand-100)] p-4">
            {p.demoSlug ? (
              <iframe
                key={shown}
                ref={frame}
                title="The whole invitation"
                src={`/${p.demoSlug}?bare=1&design=draft`}
                onLoad={showPage}
                className="shadow-lg"
                style={{ width, height: 780, border: 0, background: '#fff' }}
              />
            ) : (
              <p className="hint py-12">This design has no demo invitation, so there is nothing to draw it against. Give it one on the template&rsquo;s own page.</p>
            )}
          </div>
        )}

        <div className={`justify-center overflow-auto bg-[color:var(--color-sand-100)] p-4 ${view === 'page' ? 'flex' : 'hidden'}`}>
          <div className="relative shadow-lg" style={{ width }}>
            <div className="inv" data-layout={p.layout} data-doc="" data-paged="" data-mode={night ? 'night' : 'day'} style={{ ...p.vars, minHeight: 0 } as CSSProperties} lang="en">
              <div
                ref={stage}
                className="inv-page relative"
                data-page={page?.key}
                data-drawn={page?.drawn ? '' : undefined}
                data-grow={page?.drawn && page.grow ? '' : undefined}
                style={{ ...stageStyle, ['--page-ratio' as string]: ratio }}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerDown={() => { if (!fit) setSel([]); }}
              >
                {page && <DrawnPage page={page} content={shownContent} look={p.look} lang="en" edit={{ label, cropping: fit?.id }} />}
                {/*
                  * The handles, over the real page. The layer itself lets the
                  * pointer through, so a click on bare ground still deselects;
                  * each handle takes it back. Without the layer the frames'
                  * own photographs sit on top and nothing can be grabbed.
                  */}
                {/*
                  * A page drawn to a screen or less loses its foot to the
                  * browser's own bar on the first look. The band is drawn at
                  * a tenth of a screen — the browser's number, not the
                  * page's — so nothing on the page can be measured from it.
                  */}
                {page?.drawn && bar && ratio <= ONE_SCREEN + 0.02 && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6, pointerEvents: 'none',
                      height: `${(BROWSER_BAR / ratio) * 100}%`,
                      background: 'repeating-linear-gradient(135deg, rgba(31,29,26,0.20) 0 6px, rgba(31,29,26,0.10) 6px 12px)',
                      borderTop: '1px dashed rgba(31,29,26,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <span style={{ font: '500 10px/1.2 system-ui, sans-serif', color: '#1f1d1a', background: 'rgba(255,255,255,0.75)', padding: '2px 6px', borderRadius: 3 }}>
                      the browser&rsquo;s bar sits about here
                    </span>
                  </div>
                )}
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
                        fitting={fit ? (fit.id === el.id ? 'this' : 'other') : undefined}
                        onDown={(e) => (fit ? startPan(e, el) : startMove(e, el))}
                        onSize={(e) => startSize(e, el)}
                        onTurn={(e) => startTurn(e, el)}
                        onFit={() => startFit(el.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {view === 'whole'
          ? <p className="hint mt-2">The design as a guest is served it, from the draft. It is redrawn when the draft saves &mdash; two seconds after your hand stops &mdash; and scrolled to the page you are on.</p>
          : view === 'page' && !page?.drawn && <p className="hint mt-2">This page is laid out by its words, not by hand, so there is nothing to drag on it. Its background and which sections it carries are on the right. <button type="button" onClick={() => { setView('whole'); if (state === 'dirty') void save(doc); }} className="underline">See it in the whole invitation</button>.</p>}
      </section>

      {/* what is selected */}
      <aside className={`card h-fit space-y-3 p-3 text-sm ${view === 'import' ? 'hidden' : ''}`}>
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
            grows={Boolean(page?.grow)}
            onFit={() => (fit ? keepFit() : startFit(selected.id))}
            fitting={fit?.id === selected.id}
            vars={p.vars}
          />
        ) : (
          <PageProps
            page={page}
            onChange={editPage}
            onGround={setGround}
            templateId={p.templateId}
            vars={p.vars}
            sections={{ offer: sectionOffer, name: nameOf, add: addSection, remove: removeSection, move: moveSection }}
          />
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopBar({ name, demoSlug, canPublish, templateId, shareLink, state, error, published, onSave }: Props & { state: string; error: string; rev: number; doc: DesignDoc; onSave: () => void }) {
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
        {!shareLink && demoSlug && (
          <form action={shareDesignDraftAction.bind(null, templateId, `/admin/templates/${templateId}/design`)}>
            <button type="submit" className="btn btn-ghost btn-sm">Share the draft</button>
          </form>
        )}
        {canPublish
          ? <Link href={`/admin/templates/${templateId}/design/publish`} className="btn btn-primary btn-sm">Publish design…</Link>
          : <span className="text-xs text-[color:var(--color-ink-500)]">Publishing is the owner&rsquo;s to press.</span>}
      </span>
      {/*
        * The link to the unfinished design, for somebody with no account. It
        * opens this design's own demo and nothing else, and Stop sharing
        * ends it and every copy of it at once.
        */}
      {shareLink && (
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-[color:var(--color-sand-300)] pt-2">
          <span className="label">Shared</span>
          <input readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-xs" />
          <button type="button" onClick={() => void navigator.clipboard?.writeText(shareLink)} className="btn btn-secondary btn-sm">Copy</button>
          <form action={stopSharingDesignDraftAction.bind(null, templateId, `/admin/templates/${templateId}/design`)}>
            <button type="submit" className="btn btn-ghost btn-sm text-red-700">Stop sharing</button>
          </form>
          <p className="hint w-full">Anyone with this link sees the draft on {demoSlug}, and nothing else of yours. It lasts thirty days, or until you stop it.</p>
        </div>
      )}
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
function Handle({ el, at, on, solo, fitting, onDown, onSize, onTurn, onFit }: {
  el: Element; at?: Box; on: boolean; solo: boolean;
  /** 'this' is the picture she is fitting; 'other' is everything else, which waits */
  fitting?: 'this' | 'other';
  onDown: (e: RPointerEvent) => void; onSize: (e: RPointerEvent) => void; onTurn: (e: RPointerEvent) => void; onFit: () => void;
}) {
  if (!at) return null;
  return (
    <div
      data-handle={el.id}
      data-on={on ? '' : undefined}
      data-fitting={fitting === 'this' ? '' : undefined}
      onPointerDown={onDown}
      onDoubleClick={el.kind === 'photo' && !fitting ? onFit : undefined}
      style={{
        position: 'absolute', left: `${at.x}%`, top: `${at.y}%`, width: `${at.w}%`, height: `${at.h}%`,
        cursor: fitting === 'this' ? 'grab' : 'move', background: 'transparent',
        // everything but the picture being fitted waits: a stray click while
        // she is panning must not pick something else up
        pointerEvents: fitting === 'other' ? 'none' : 'auto',
        outline: fitting === 'this' ? '2px solid #f59e0b' : on ? '2px solid #2f6fd0' : '1px dashed rgba(47,111,208,0.4)',
      }}
    >
      {on && solo && !fitting && (
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

function Properties({ el, ratio, occasion, onChange, onMoveTo, onLayer, onDuplicate, onRemove, label, measureRoom, attachable, grows, onFit, fitting, vars }: {
  el: Element; ratio: number; label: string; occasion: Occasion;
  onChange: (fn: (e: Element) => Element) => void;
  onMoveTo: (at: { x?: number; y?: number }) => void;
  onLayer: (by: number) => void; onDuplicate: () => void; onRemove: () => void;
  measureRoom: () => number | undefined;
  attachable: Named[];
  grows: boolean;
  onFit: () => void;
  fitting: boolean;
  vars: Record<string, string>;
}) {
  const num = (v: number | undefined, set: (n: number) => void, step = 0.1) => (
    <input type="number" value={v ?? ''} step={step} onChange={(e) => set(place(Number(e.target.value)))} className="input w-full" />
  );
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="label">{el.kind === 'photo' ? 'Photo frame' : el.kind === 'text' ? 'Words' : el.kind === 'shape' ? 'Shape' : el.kind}</p>
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
      {grows && (
        <label className="block">
          <span className="label">Measured from</span>
          <select className="input w-full" value={el.from ?? 'top'} onChange={(e) => onChange((x) => ({ ...x, from: e.target.value === 'bottom' ? 'bottom' : undefined }))}>
            <option value="top">The head of the page</option>
            <option value="bottom">The foot &mdash; it holds the bottom however far the words push it</option>
          </select>
        </label>
      )}
      <Attach value={el.attachTo} options={attachable} onChange={(to) => onChange((e) => ({ ...e, attachTo: to }))} />
      {el.kind === 'photo' && (
        <PictureBlock el={el as PhotoEl} onChange={onChange} onFit={onFit} fitting={fitting} num={num} />
      )}
      {el.kind === 'shape' && <ShapeBlock el={el as ShapeEl} onChange={onChange} vars={vars} num={num} />}
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

/**
 * A swatch row: the palette's six roles, a colour of her own, and nothing.
 *
 * A role follows the theme, so it turns itself down at night with everything
 * else; a colour of her own is the colour she picked and stays exactly that,
 * which the row says rather than leaving her to find out at six in the
 * evening.
 */
function Swatches({ value, onPick, vars, none = 'none' }: { value?: string; onPick: (c: string | undefined) => void; vars: Record<string, string>; none?: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {ROLES.map((r) => (
        <button
          key={r.key}
          type="button"
          title={r.label}
          onClick={() => onPick(r.key)}
          className={`h-6 w-6 rounded border ${value === r.key ? 'border-[color:var(--color-ink-700)] ring-2 ring-[color:var(--color-ink-700)]' : 'border-black/15'}`}
          style={{ background: colourOf(r.key, vars) }}
        />
      ))}
      <input
        type="color"
        title="A colour of your own"
        value={value?.startsWith('#') ? value : '#ffffff'}
        onChange={(e) => onPick(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded border border-black/15 p-0"
      />
      <button type="button" onClick={() => onPick(undefined)} className={`rounded px-1.5 text-[11px] ${value === undefined ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}>{none}</button>
    </div>
  );
}

/** The three shapes, and what each is usually for. */
const SHAPES: { key: ShapeEl['shape']; label: string }[] = [
  { key: 'rect', label: 'A card — a rectangle, with corners as round as you like' },
  { key: 'ellipse', label: 'An ellipse — a circle when it is as tall as it is wide' },
  { key: 'line', label: 'A line — a rule across the page' },
];

/**
 * A shape: a card behind some words, a rule across the page, a dot.
 *
 * Its width is a share of the page like everything else; its height, its
 * outline and its corners are in cqw, which on a drawn page is the same
 * share of the same width — so the panel says "of the width" rather than
 * giving her two units to hold in her head.
 *
 * A new one arrives behind the words, because that is what a shape is
 * usually for; Bring forward is there when it is not.
 */
function ShapeBlock({ el, onChange, vars, num }: {
  el: ShapeEl;
  onChange: (fn: (e: Element) => Element) => void;
  vars: Record<string, string>;
  num: (v: number | undefined, set: (n: number) => void, step?: number) => ReactNode;
}) {
  const edit = (fn: (x: ShapeEl) => ShapeEl) => onChange((x) => fn(x as ShapeEl));
  return (
    <div className="space-y-2 border-t border-[color:var(--color-sand-300)] pt-3">
      <label className="block">
        <span className="label">Shape</span>
        {/*
          * A line is drawn in its outline colour, so a card turned into one
          * takes its fill with it. Without this the page would keep drawing
          * the colour she chose while the panel showed no colour at all.
          */}
        <select
          className="input w-full"
          value={el.shape}
          onChange={(e) => {
            const shape = e.target.value as ShapeEl['shape'];
            edit((x) => (shape === 'line' ? { ...x, shape, stroke: x.stroke ?? x.fill } : { ...x, shape }));
          }}
        >
          {SHAPES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      {el.shape !== 'line' && (
        <label className="block"><span className="label">Height, as a share of the width</span>{num(el.h, (n) => edit((x) => ({ ...x, h: n })), 0.5)}</label>
      )}
      {el.shape === 'rect' && (
        <label className="block"><span className="label">Corners</span>{num(el.radius, (n) => edit((x) => ({ ...x, radius: n })), 0.2)}</label>
      )}
      {el.shape !== 'line' && (
        <div>
          <p className="label">Fill</p>
          <Swatches value={el.fill} onPick={(c) => edit((x) => ({ ...x, fill: c }))} vars={vars} none="none" />
        </div>
      )}
      <div>
        <p className="label">{el.shape === 'line' ? 'Colour' : 'Outline'}</p>
        <Swatches value={el.stroke} onPick={(c) => edit((x) => ({ ...x, stroke: c }))} vars={vars} none="none" />
      </div>
      <label className="block">
        <span className="label">{el.shape === 'line' ? 'Thickness' : 'Outline thickness'}</span>
        {num(el.strokeWidth, (n) => edit((x) => ({ ...x, strokeWidth: n })), 0.1)}
      </label>
      <p className="hint">Height, corners and thickness are all shares of the page&rsquo;s width, so the shape keeps itself at every phone size.</p>
      {el.shape !== 'line' && el.stroke && !el.strokeWidth && <p className="hint text-amber-800">An outline with no thickness draws nothing. Give it one.</p>}
    </div>
  );
}

/** What a frame can be given: no card, a thin border, or a polaroid with a strip. */
const FRAMES: { key: NonNullable<PhotoEl['frame']>; label: string }[] = [
  { key: 'none', label: 'No frame \u2014 the ground has one painted on, or none is wanted' },
  { key: 'thin', label: 'A thin white border' },
  { key: 'polaroid', label: 'A polaroid, with a strip under it to write on' },
];

/** How the corners are cut. A cut costs nothing: it is a border radius. */
const MASKS: { key: NonNullable<PhotoEl['mask']>; label: string }[] = [
  { key: 'none', label: 'Square corners' },
  { key: 'circle', label: 'A circle' },
  { key: 'arch', label: 'An arch' },
];

/**
 * The frame as an object: the shape it holds, the card around it, the cut of
 * its corners, and which part of the picture shows through it.
 *
 * Fitting is done on the page rather than in a dialogue, because a frame
 * leaning on a painted polaroid is only right in place. The button is here
 * for somebody who has not learnt the double-click, and it says what the
 * gesture is either way.
 */
function PictureBlock({ el, onChange, onFit, fitting, num }: {
  el: PhotoEl;
  onChange: (fn: (e: Element) => Element) => void;
  onFit: () => void;
  fitting: boolean;
  num: (v: number | undefined, set: (n: number) => void, step?: number) => ReactNode;
}) {
  const edit = (fn: (x: PhotoEl) => PhotoEl) => onChange((x) => fn(x as PhotoEl));
  return (
    <div className="space-y-2 border-t border-[color:var(--color-sand-300)] pt-3">
      <label className="block"><span className="label">Shape (height over width)</span>{num(el.aspect, (n) => edit((x) => ({ ...x, aspect: n })), 0.05)}</label>
      <label className="block">
        <span className="label">Frame</span>
        <select className="input w-full" value={el.frame ?? 'none'} onChange={(e) => edit((x) => ({ ...x, frame: e.target.value as PhotoEl['frame'] }))}>
          {FRAMES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Corners</span>
        <select className="input w-full" value={el.mask ?? 'none'} onChange={(e) => edit((x) => ({ ...x, mask: e.target.value as PhotoEl['mask'] }))}>
          {MASKS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </label>
      {el.mask === 'arch' && (el.aspect ?? 1) < 1 && (
        <p className="hint">This frame is wider than it is tall, so its arch is a half-ellipse: a semicircle that wide would not fit in the height there is.</p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={onFit} className={`btn btn-sm ${fitting ? 'btn-primary' : 'btn-ghost'}`}>
          {fitting ? 'Fitting\u2026' : el.crop ? 'Fit the picture again' : 'Fit the picture'}
        </button>
        {el.crop && !fitting && (
          <button type="button" onClick={() => edit((x) => { const back = { ...x }; delete back.crop; return back; })} className="btn btn-ghost btn-sm">Show all of it</button>
        )}
      </div>
      <p className="hint">
        {fitting
          ? 'Drag the picture to move it and scroll to zoom. Enter keeps it, Esc puts back what was there.'
          : 'Or double-click the frame on the page. Unfitted, a frame shows the middle of the picture, filled to the frame.'}
      </p>
      {el.crop && !fitting && <p className="hint">Changing the shape after fitting trims the fitting to the new shape rather than stretching it; fit it again to choose afresh.</p>}
    </div>
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
const offerable = (el: TextEl): boolean => {
  const sources = el.lines.flatMap((l) => l.sources);
  return sources.some((x) => 'bind' in x) && sources.some((x) => 'fixed' in x && x.fixed.en.trim());
};

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
          <option value="shadow">A soft halo, in the card colour</option>
          <option value="scrim">A pale card</option>
        </select>
        <span className="hint">For words that sit on a busy picture. Both follow the palette, so both turn themselves down at night.</span>
      </label>

      {/*
        * A box that reads a customer's answer and has her own words behind
        * it can offer those words as a starting point. A blank box is the
        * hardest thing to fill in, and the person who knows best what
        * belongs in this one is the one who drew the page.
        */}
      {offerable(el) && (
        <label className="mt-2 flex items-start gap-2">
          <input type="checkbox" checked={Boolean(el.offerLine)} onChange={(e) => edit((t) => ({ ...t, offerLine: e.target.checked ? true : undefined }))} className="mt-0.5 h-4 w-4" />
          <span>
            Offer your words as an example
            <span className="hint block">Under the customer&rsquo;s own box, to tap and edit. Only what you typed here is offered &mdash; a line read from the look would change with the look they pick.</span>
          </span>
        </label>
      )}

      <p className="label mt-3">Lines</p>
      <p className="hint">Stacked in flow inside the one box: a heading with its line under it, a name with its sentence. An empty line is dropped and the ones under it close up.</p>
      <ul className="mt-1 space-y-1">
        {el.lines.map((l, i) => (
          <li key={i} className="rounded bg-[color:var(--color-sand-100)] p-2">
            <div className="flex items-center gap-1">
              <select
                className="input w-full text-xs"
                value={l.role}
                onChange={(e) => edit((t) => ({ ...t, lines: t.lines.map((x, j) => (j === i ? { ...x, role: e.target.value as LineRole } : x)) }))}
              >
                {ROLES_TEXT.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <button type="button" title="Higher in the box" onClick={() => edit((t) => moveLine(t, i, -1))} disabled={i === 0} className="rounded bg-white px-1.5 text-xs disabled:opacity-40">↑</button>
              <button type="button" title="Lower in the box" onClick={() => edit((t) => moveLine(t, i, 1))} disabled={i === el.lines.length - 1} className="rounded bg-white px-1.5 text-xs disabled:opacity-40">↓</button>
              <button type="button" title="Take the line out" onClick={() => edit((t) => ({ ...t, lines: t.lines.filter((_, j) => j !== i) }))} disabled={el.lines.length < 2} className="rounded bg-white px-1.5 text-xs text-red-700 disabled:opacity-40">✕</button>
            </div>
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
              {l.sources.length > 1 && <span className="ml-auto text-[11px] text-[color:var(--color-ink-500)]">falls back {l.sources.length - 1}×</span>}
            </div>
            <Words
              sources={l.sources}
              onChange={(next) => edit((t) => ({ ...t, lines: t.lines.map((x, j) => (j === i ? { ...x, sources: next } : x)) }))}
            />
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => edit((t) => ({ ...t, lines: [...t.lines, { role: 'body', sources: [{ fixed: { en: '' } }] }] }))} className="mt-1 rounded bg-[color:var(--color-sand-200)] px-2 py-1 text-xs">+ a line</button>
    </div>
  );
}

/** A line higher or lower inside its box. */
function moveLine(t: TextEl, i: number, by: number): TextEl {
  const to = i + by;
  if (to < 0 || to >= t.lines.length) return t;
  const lines = [...t.lines];
  const [moved] = lines.splice(i, 1);
  lines.splice(to, 0, moved);
  return { ...t, lines };
}

/** Every word the design can carry of its own: the look's lines, then its headings. */
const WORDS: { key: WordKey; label: string }[] = [
  ...LINE_KEYS.map((k) => ({ key: k as WordKey, label: LINE_LABELS[k] })),
  ...TITLE_KEYS.map((k) => ({ key: titleWord(k), label: `Heading — ${TITLE_LABELS[k]}` })),
];

/**
 * What a line says.
 *
 * A line tries its sources in order and shows the first that has anything,
 * which is how the same design serves a customer who filled the field, one
 * who did not, and the demo. So they are edited as a list rather than as one
 * value: the words she types, the design's own word for that line, and —
 * where **Ask the customer** put one — the customer's answer at the front of
 * the chain.
 *
 * Two kinds are shown but not made here. The customer's answer belongs to
 * **Ask the customer** above, which keeps the field list honest; the app's
 * own words are a key into the copy file, and a key typed by hand would be a
 * blank line nobody could explain. Both can still be taken out.
 */
function Words({ sources, onChange }: { sources: Source[]; onChange: (next: Source[]) => void }) {
  const set = (i: number, next: Source) => onChange(sources.map((x, j) => (j === i ? next : x)));
  const drop = (i: number) => onChange(sources.filter((_, j) => j !== i));
  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= sources.length) return;
    const list = [...sources];
    const [moved] = list.splice(i, 1);
    list.splice(to, 0, moved);
    onChange(list);
  };
  return (
    <div className="mt-1 space-y-1">
      {sources.map((src, i) => (
        <div key={i} className="rounded border border-[color:var(--color-sand-300)] bg-white p-1.5">
          <div className="flex items-center gap-1">
            <span className="flex-1 text-[11px] font-semibold text-[color:var(--color-ink-500)]">
              {'fixed' in src ? 'Words you type' : 'word' in src ? 'The design’s own word' : 'bind' in src ? 'What the customer wrote' : 'The app’s own words'}
            </span>
            <button type="button" title="Try this one earlier" onClick={() => move(i, -1)} disabled={i === 0} className="rounded bg-[color:var(--color-sand-100)] px-1.5 text-xs disabled:opacity-40">↑</button>
            <button type="button" title="Try this one later" onClick={() => move(i, 1)} disabled={i === sources.length - 1} className="rounded bg-[color:var(--color-sand-100)] px-1.5 text-xs disabled:opacity-40">↓</button>
            <button type="button" title="Take it out" onClick={() => drop(i)} className="rounded bg-[color:var(--color-sand-100)] px-1.5 text-xs text-red-700">✕</button>
          </div>
          {'fixed' in src ? (
            <div className="mt-1 grid grid-cols-2 gap-1">
              <input className="input w-full text-xs" placeholder="in English" value={src.fixed.en} onChange={(e) => set(i, { fixed: { ...src.fixed, en: e.target.value } })} />
              <input className="input w-full text-xs" placeholder="sa Tagalog" value={src.fixed.tl ?? ''} onChange={(e) => set(i, { fixed: { en: src.fixed.en, ...(e.target.value ? { tl: e.target.value } : {}) } })} />
            </div>
          ) : 'word' in src ? (
            <select className="input mt-1 w-full text-xs" value={src.word} onChange={(e) => set(i, { word: e.target.value as WordKey })}>
              {WORDS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          ) : 'bind' in src ? (
            <p className="mt-0.5 text-[11px] text-[color:var(--color-ink-500)]">{src.bind.sub ?? src.bind.field}{src.bind.index === undefined ? '' : ` ${src.bind.index + 1}`} &middot; {src.bind.section} &mdash; set by <strong>Ask the customer</strong>.</p>
          ) : (
            <p className="mt-0.5 font-mono text-[11px] text-[color:var(--color-ink-500)]">{src.copy}</p>
          )}
        </div>
      ))}
      <div className="flex gap-1">
        <button type="button" onClick={() => onChange([...sources, { fixed: { en: '' } }])} className="rounded bg-white px-2 py-0.5 text-[11px]">+ words you type</button>
        <button type="button" onClick={() => onChange([...sources, { word: WORDS[0].key }])} className="rounded bg-white px-2 py-0.5 text-[11px]">+ a word from the design</button>
      </div>
      {sources.length === 0 && <p className="hint">Nothing yet, so this line draws nothing.</p>}
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

/**
 * Bringing a page in from Canva, two ways into one screen.
 *
 * Canva hands another system nothing about a design, so a link is a locked
 * door and one picture of a page is only paint. Two things are not:
 *
 * - **Two pictures.** The page as designed, and the same page with the
 *   placeholder photographs deleted. The second is the background, and
 *   everything that differs between them is where a photograph belongs.
 *   She says which file is which rather than the studio guessing: a guess
 *   is cheap to make and expensive to be wrong about — it would put the
 *   frames on a printed photograph of somebody else's baby and look almost
 *   right — and naming two files is two taps.
 * - **The PDF.** Every photograph in it is an object with its own
 *   rectangle and the words are usually still words, so both are lifted
 *   off and the background is drawn without them.
 *
 * Either way what comes back is a list of pages, each with its background
 * and what was found on it, and the same confirm screen: every frame drawn
 * on the page with a numbered tag, a field picker beside it, and Discard on
 * any it got wrong. Nothing is written until she presses Add — the
 * backgrounds are not even uploaded before then, so an import she thinks
 * better of leaves nothing behind.
 */
type Proposal = { rect: Rect; keep: boolean; pick: string; index: number };
type Wording = { text: PdfText; keep: boolean };

/** One page waiting to be brought in, whichever way it was read. */
type Sheet = {
  name: string;
  from: 'diff' | 'pdf';
  /** the background as it will be, already read but not yet sent anywhere */
  read?: ReadPicture;
  url?: string;
  frames: Proposal[];
  texts: Wording[];
  /** why this page could not be read, in the owner's words */
  trouble?: string;
};

function ImportPair({ templateId, occasion, fonts, onClose, onAdd }: {
  templateId: string;
  occasion: Occasion;
  fonts?: Fonts;
  onClose: () => void;
  onAdd: (pages: Brought[]) => void;
}) {
  const [designed, setDesigned] = useState<File | null>(null);
  const [emptied, setEmptied] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const offers = useMemo(() => askable(occasion, 'photo'), [occasion]);

  // the pages are shown from the blobs in hand, so they are on screen before
  // anything has been sent anywhere
  useEffect(() => () => { for (const s of sheets ?? []) if (s.url) URL.revokeObjectURL(s.url); }, [sheets]);

  const carry = (rects: Rect[], texts: PdfText[] = []): Pick<Sheet, 'frames' | 'texts'> => ({
    frames: rects.map((rect) => ({ rect, keep: true, pick: '', index: 0 })),
    texts: texts.map((text) => ({ text, keep: true })),
  });

  async function readPair() {
    if (!designed || !emptied) return;
    setBusy('Reading the two pictures…');
    setError('');
    try {
      const plain = await readPicture(emptied, true);
      if (!plain.pixels) throw new Error('This browser cannot read the picture.');
      const filled = await drawAt(designed, plain.width, plain.height);
      const rects = framesFromDifference(plain.pixels, filled);
      if (!rects.length) {
        throw new Error('Those two pictures are the same page. Check that the photographs were deleted from the second one rather than hidden or moved off the canvas.');
      }
      setSheets([{
        name: emptied.name.replace(/\.[^.]+$/, ''), from: 'diff',
        read: { ...plain, pixels: undefined }, url: URL.createObjectURL(plain.blob),
        ...carry(rects),
      }]);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  async function readPdf(file: File) {
    setBusy('Reading the PDF…');
    setError('');
    try {
      const read = await readPdfFile(file, fonts);
      if (!read.length) throw new Error('That PDF has no pages.');
      const stem = file.name.replace(/\.[^.]+$/, '');
      setSheets(read.map(({ sheet, ground }) => ({
        name: read.length > 1 ? `${stem} ${sheet.n}` : stem,
        from: 'pdf' as const,
        ...(ground ? { read: ground, url: URL.createObjectURL(ground.blob) } : {}),
        ...carry(sheet.frames, sheet.texts),
        ...(sheet.trouble ? { trouble: PDF_TROUBLE[sheet.trouble] } : {}),
      })));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  /** The field a frame points at, or nothing while she has not said. */
  function refOf(row: Proposal): FieldRef | undefined {
    const at = offers.find((o) => key(o) === row.pick);
    if (!at) return undefined;
    return { section: at.section, field: at.field, ...(at.sub ? { sub: at.sub } : {}), ...(at.list ? { index: row.index } : {}) };
  }

  const edit = (s: number, fn: (sheet: Sheet) => Sheet) => setSheets((old) => (old ?? []).map((x, i) => (i === s ? fn(x) : x)));

  /**
   * Picking a list field for one frame puts the next frame on the next one
   * along, because six frames on a page are six photographs and never the
   * same photograph six times. She can still change any of them.
   */
  function pick(s: number, at: number, value: string) {
    edit(s, (sheet) => ({
      ...sheet,
      frames: sheet.frames.map((r, i) => {
        if (i !== at) return r;
        const taken = sheet.frames.filter((o, j) => j !== at && o.pick === value).map((o) => o.index);
        let index = 0;
        while (taken.includes(index)) index++;
        return { ...r, pick: value, index };
      }),
    }));
  }

  async function add() {
    const usable = (sheets ?? []).filter((s) => s.read && !s.trouble);
    if (!usable.length) return;
    setBusy('Sending the backgrounds…');
    setError('');
    try {
      const pages: Brought[] = [];
      for (const s of usable) {
        const up = await sendPicture(s.read as ReadPicture, `${s.name}.webp`, templateId);
        pages.push({
          name: s.name, up, from: s.from,
          frames: s.frames.filter((r) => r.keep).map((r) => ({ rect: r.rect, bind: refOf(r) })),
          texts: s.texts.filter((t) => t.keep).map((t) => t.text),
        });
      }
      onAdd(pages);
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  const usable = (sheets ?? []).filter((s) => s.read && !s.trouble);

  if (!sheets) {
    return (
      <div className="rounded bg-[color:var(--color-sand-100)] p-4">
        <div className="mx-auto max-w-xl">
          <h2 className="display text-lg">A page you designed in Canva</h2>
          <p className="hint mt-1">
            Canva hands another system nothing about a design, so the way in is a file you export.
            The best of the two is the first: it is the one that leaves the artwork behind your frames whole.
          </p>

          <p className="label mt-4">Two pictures &mdash; the studio finds the frames</p>
          <p className="hint">
            Export the page twice at the same size: once as it is, and once with the placeholder photographs
            deleted. The second becomes the page&rsquo;s background, and everything that differs between the two is a frame.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {([
              ['The page as designed', 'with the placeholder photographs in their frames', designed, setDesigned],
              ['The same page, photographs deleted', 'this one becomes the background', emptied, setEmptied],
            ] as const).map(([label, note, file, set]) => (
              <label
                key={label}
                className={`block cursor-pointer rounded border border-dashed px-3 py-4 text-center text-xs leading-snug ${file ? 'border-[color:var(--color-plum-600)] bg-white' : 'border-[color:var(--color-sand-300)] hover:bg-white'}`}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
                onDrop={(e) => { const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) { e.preventDefault(); set(f); } }}
              >
                <span className="block font-semibold">{label}</span>
                <span className="block text-[color:var(--color-ink-500)]">{file ? file.name : note}</span>
                <input
                  type="file" accept="image/*" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) set(f); e.target.value = ''; }}
                />
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-sm mt-2" disabled={!designed || !emptied || Boolean(busy)} onClick={() => void readPair()}>
            {busy || 'Find the frames'}
          </button>

          <p className="label mt-5">Or the PDF &mdash; one file, frames and words together</p>
          <p className="hint">
            A PDF is not flat: every photograph in it is a separate object with its own rectangle, and the words
            are usually still words. Both are lifted off, so the background comes through as the artwork alone.
            Where Canva flattened the page or turned the words into outlines there is nothing to read, and the
            studio says so rather than guessing.
          </p>
          <label
            className="mt-2 block cursor-pointer rounded border border-dashed border-[color:var(--color-sand-300)] px-3 py-4 text-center text-xs leading-snug hover:bg-white"
            onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
            onDrop={(e) => { const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') { e.preventDefault(); void readPdf(f); } }}
          >
            <span className="block font-semibold">Drop the PDF here, or choose it</span>
            <span className="block text-[color:var(--color-ink-500)]">every page becomes a page of the design, in order</span>
            <input
              type="file" accept="application/pdf,.pdf" className="sr-only" disabled={Boolean(busy)}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readPdf(f); e.target.value = ''; }}
            />
          </label>

          <div className="mt-4">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          </div>
          {error && <p className="hint mt-2 text-[color:var(--bad)]">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded bg-[color:var(--color-sand-100)] p-4">
      {sheets.map((sheet, s) => (
        <div key={s} className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <div className="relative self-start shadow-lg" style={{ width: '100%', maxWidth: '20rem' }}>
            {sheet.url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={sheet.url} alt="" className="block w-full" />
              : <div className="aspect-[3/4] w-full bg-[color:var(--color-sand-200)]" />}
            {sheet.frames.map((r, i) => (
              <span
                key={i}
                className={`absolute border-2 ${r.keep ? 'border-[color:var(--color-plum-600)] bg-[rgba(122,58,118,0.14)]' : 'border-dashed border-[color:var(--color-ink-500)] opacity-40'}`}
                style={{ left: `${r.rect.left}%`, top: `${r.rect.top}%`, width: `${r.rect.width}%`, height: `${r.rect.height}%` }}
              >
                <span className="absolute left-0 top-0 bg-[color:var(--color-plum-600)] px-1 text-[10px] font-semibold text-white">{i + 1}</span>
              </span>
            ))}
            {sheet.texts.map((t, i) => (
              <span
                key={`t${i}`}
                className={`absolute border border-dashed ${t.keep ? 'border-[color:var(--color-ink-700)]' : 'border-[color:var(--color-ink-500)] opacity-30'}`}
                style={{ left: `${t.text.left}%`, top: `${t.text.top}%`, width: `${t.text.width}%`, minHeight: 4 }}
              />
            ))}
          </div>

          <div>
            <h2 className="display text-lg">{sheet.name}</h2>
            {sheet.trouble ? (
              <p className="mt-1 rounded bg-white p-3 text-sm text-[color:var(--color-ink-700)]">{sheet.trouble}</p>
            ) : (
              <>
                <p className="hint mt-1">
                  {sheet.frames.length === 1 ? 'One frame' : `${sheet.frames.length} frames`}
                  {sheet.texts.length > 0 && `, ${sheet.texts.length === 1 ? 'one writing' : `${sheet.texts.length} writings`}`}.
                  Say what each frame holds. One you leave unnamed still comes in &mdash; the checklist will ask for it &mdash;
                  and one that is not a frame at all can be discarded here.
                  {sheet.from === 'pdf' && ' The words are lifted off the background, so a writing you discard takes its words with it.'}
                </p>
                <ol className="mt-3 space-y-2">
                  {sheet.frames.map((r, i) => {
                    const at = offers.find((o) => key(o) === r.pick);
                    return (
                      <li key={i} className={`flex flex-wrap items-end gap-2 rounded bg-white p-2 ${r.keep ? '' : 'opacity-50'}`}>
                        <span className="rounded bg-[color:var(--color-plum-600)] px-1.5 py-0.5 text-[11px] font-semibold text-white">{i + 1}</span>
                        <span className="text-[11px] text-[color:var(--color-ink-500)]">{r.rect.width}% &times; {r.rect.height}%</span>
                        <label className="min-w-[12rem] flex-1">
                          <select className="input w-full" value={r.pick} disabled={!r.keep} onChange={(e) => pick(s, i, e.target.value)}>
                            <option value="">&mdash; what is it? &mdash;</option>
                            {Object.entries(groupBy(offers)).map(([section, list]) => (
                              <optgroup key={section} label={section}>
                                {list.map((o) => <option key={key(o)} value={key(o)}>{o.label}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                        {at?.list && (
                          <label className="w-20">
                            <span className="label">Which</span>
                            <input
                              type="number" min={1} max={40} className="input w-full" disabled={!r.keep}
                              value={r.index + 1}
                              onChange={(e) => edit(s, (x) => ({ ...x, frames: x.frames.map((y, j) => (j === i ? { ...y, index: Math.max(0, Math.round(Number(e.target.value)) - 1) } : y)) }))}
                            />
                          </label>
                        )}
                        <button
                          type="button" className="btn btn-ghost btn-sm"
                          onClick={() => edit(s, (x) => ({ ...x, frames: x.frames.map((y, j) => (j === i ? { ...y, keep: !y.keep } : y)) }))}
                        >
                          {r.keep ? 'Discard' : 'Keep'}
                        </button>
                      </li>
                    );
                  })}
                  {sheet.texts.map((t, i) => (
                    <li key={`t${i}`} className={`flex flex-wrap items-center gap-2 rounded bg-white p-2 ${t.keep ? '' : 'opacity-50'}`}>
                      <span className="rounded bg-[color:var(--color-ink-700)] px-1.5 py-0.5 text-[11px] font-semibold text-white">&ldquo;&rdquo;</span>
                      <span className="min-w-[12rem] flex-1 truncate text-sm">{t.text.lines.join(' / ')}</span>
                      <span className="text-[11px] text-[color:var(--color-ink-500)]">{t.text.size.toFixed(1)}cqw{t.text.face ? ` · the ${t.text.face} face` : ''}</span>
                      <button
                        type="button" className="btn btn-ghost btn-sm"
                        onClick={() => edit(s, (x) => ({ ...x, texts: x.texts.map((y, j) => (j === i ? { ...y, keep: !y.keep } : y)) }))}
                      >
                        {t.keep ? 'Discard' : 'Keep'}
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-sand-300)] pt-3">
        <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy) || !usable.length} onClick={() => void add()}>
          {busy || (usable.length > 1 ? `Add ${usable.length} pages` : 'Add the page')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => { setSheets(null); setDesigned(null); setEmptied(null); }}>Start again</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={onClose}>Cancel</button>
        {!usable.length && <span className="hint">Nothing here can be brought in.</span>}
      </div>
      {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}

const key = (a: Askable) => `${a.section}|${a.field}|${a.sub ?? ''}`;
function groupBy(list: Askable[]): Record<string, Askable[]> {
  const out: Record<string, Askable[]> = {};
  for (const a of list) (out[a.sectionLabel] ??= []).push(a);
  return out;
}

/** How the cover carries its photograph, when the customer has not chosen. */
const COVER_PHOTO: { key: NonNullable<CoverSpec['photoStyle']>; label: string }[] = [
  { key: 'veil', label: 'A veil behind the names' },
  { key: 'arch', label: 'An arch above them' },
  { key: 'oval', label: 'An oval, double-lined' },
  { key: 'round', label: 'A round medallion' },
  { key: 'card', label: 'A tucked photo card' },
  { key: 'none', label: 'No photograph on the cover' },
];

/**
 * The cover's own settings.
 *
 * Every one of them is a nothing by default, and a nothing writes nothing:
 * a design that has never been here renders the cover it always rendered.
 * The photograph's is a *default* rather than a rule — a customer who picks
 * a style on their own form still gets theirs.
 */
function CoverBlock({ cover, onChange }: { cover?: CoverSpec; onChange: (fn: (p: PageSpec) => PageSpec) => void }) {
  const set = (next: Partial<CoverSpec>) => onChange((p) => {
    const merged = { ...(p.cover ?? {}), ...next };
    for (const k of Object.keys(merged) as (keyof CoverSpec)[]) if (merged[k] === undefined) delete merged[k];
    return { ...p, cover: Object.keys(merged).length ? merged : undefined };
  });
  const scale = cover?.photoScale ?? 1;
  return (
    <div className="space-y-2 border-t border-[color:var(--color-sand-300)] pt-3">
      <p className="label">The cover</p>
      <label className="block">
        <span className="label">Where the names sit</span>
        <select className="input w-full" value={cover?.names ?? ''} onChange={(e) => set({ names: (e.target.value || undefined) as CoverSpec['names'] })}>
          <option value="">As this design was drawn</option>
          <option value="top">Near the top</option>
          <option value="middle">In the middle</option>
          <option value="bottom">Near the foot</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Air above and below them</span>
        <input
          type="number" min={0} max={40} step={0.5}
          value={cover?.inset ?? ''}
          placeholder="as drawn"
          onChange={(e) => set({ inset: e.target.value === '' ? undefined : place(Math.min(40, Math.max(0, Number(e.target.value)))) })}
          className="input w-full"
        />
        <span className="hint">A share of the page&rsquo;s width, so it holds at every phone size.</span>
      </label>
      <label className="block">
        <span className="label">The photograph, unless the customer chooses</span>
        <select className="input w-full" value={cover?.photoStyle ?? ''} onChange={(e) => set({ photoStyle: (e.target.value || undefined) as CoverSpec['photoStyle'] })}>
          <option value="">As this design was drawn</option>
          {COVER_PHOTO.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Its size &mdash; {scale.toFixed(2)}&times; the size it was drawn</span>
        <input
          type="range" min={0.4} max={2} step={0.05}
          value={scale}
          onChange={(e) => set({ photoScale: Number(e.target.value) === 1 ? undefined : place(Number(e.target.value)) })}
          className="w-full"
        />
      </label>
      {cover && <button type="button" onClick={() => onChange((p) => ({ ...p, cover: undefined }))} className="btn btn-ghost btn-sm">Put the cover back as drawn</button>}
    </div>
  );
}

/** The six roles a colour background can take, so night mode keeps working. */
const ROLES = [
  { key: 'bg', label: 'Paper' }, { key: 'surface', label: 'Card' }, { key: 'ink', label: 'Ink' },
  { key: 'muted', label: 'Muted' }, { key: 'accent', label: 'Accent' }, { key: 'accent2', label: 'Second accent' },
];

type SectionTools = {
  offer: { key: PageSectionKey; label: string; on?: string }[];
  name: (key: string) => string;
  add: (key: PageSectionKey) => void;
  remove: (key: string) => void;
  move: (key: string, by: number) => void;
};

function PageProps({ page, onChange, onGround, templateId, vars, sections }: {
  page?: PageSpec;
  onChange: (fn: (p: PageSpec) => PageSpec) => void;
  onGround: (g: Ground | undefined) => void;
  templateId: string;
  vars: Record<string, string>;
  sections: SectionTools;
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
      {/*
        * What the page carries, in the order it is drawn in. A section is on
        * one page only, so putting it here takes it off wherever it was —
        * the menu says which page that is before she picks it.
        */}
      <div>
        <p className="label">Sections it carries</p>
        <ol className="mt-1 space-y-1">
          {page.sections.map((k, i) => (
            <li key={k} className="flex items-center gap-1 rounded bg-[color:var(--color-sand-100)] px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate" title={k}>{sections.name(k)}</span>
              <button type="button" title="Earlier on the page" onClick={() => sections.move(k, -1)} disabled={i === 0} className="rounded bg-white px-1.5 disabled:opacity-40">↑</button>
              <button type="button" title="Later on the page" onClick={() => sections.move(k, 1)} disabled={i === page.sections.length - 1} className="rounded bg-white px-1.5 disabled:opacity-40">↓</button>
              <button type="button" title="Take it off this page" onClick={() => sections.remove(k)} className="rounded bg-white px-1.5 text-red-700">✕</button>
            </li>
          ))}
          {page.sections.length === 0 && (
            <li className="text-xs text-[color:var(--color-ink-500)]">
              Nothing yet.{page.drawn ? ' A drawn page still needs one, so the design knows what it is for.' : ' A page with nothing on it is not drawn at all.'}
            </li>
          )}
        </ol>
        <select
          className="input mt-1 w-full text-xs"
          value=""
          onChange={(e) => { if (e.target.value) sections.add(e.target.value as PageSectionKey); }}
        >
          <option value="">+ put a section on this page</option>
          {sections.offer.map((o) => (
            <option key={o.key} value={o.key}>{o.label}{o.on ? ` — moves from ${o.on}` : ''}</option>
          ))}
        </select>
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
        {page.drawn && (
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(page.grow)}
              onChange={(e) => onChange((p) => ({ ...p, grow: e.target.checked ? true : undefined }))}
              className="h-4 w-4"
            />
            <span>It grows &mdash; longer words push the page down</span>
          </label>
        )}
        {page.drawn && page.grow && (
          <p className="hint">
            The proportion above becomes the least it can be, and anything set to hold the foot stays at the foot.
            {ground && isPicture(ground)
              ? ' The picture keeps its head and its foot whole and stretches the band between, so it wants a plain middle — sky, paper, a wash. A picture with things painted all the way down will pull them away from whatever you have placed on top of them.'
              : ' A plain colour stretches perfectly, so a page like this can grow as far as it needs to.'}
          </p>
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

      {/*
        * The cover is the one page no design lays out by hand: the names,
        * the date and the portrait are the app's. What the design says is
        * where they sit and how big they are, and saying nothing leaves
        * every one of them exactly where it was.
        */}
      {page.sections.includes('cover') && <CoverBlock cover={page.cover} onChange={onChange} />}

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

/** A key made from a name, free of the ones already taken. */
function freeKeyIn(taken: Set<string>, stem: string): string {
  const base = stem.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'page';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

function freeId(doc: DesignDoc, stem: string): string {
  return freeIdIn(new Set(doc.pages.flatMap((p) => (p.elements ?? []).map((e) => e.id))), stem);
}

/** A free id against a set that is still being added to, so a batch of copies cannot collide. */
function freeIdIn(taken: Set<string>, stem: string): string {
  const base = stem.replace(/[^a-z0-9-]/g, '') || 'element';
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** One page read out of a file, ready to become a page of the design. */
type Brought = {
  name: string;
  up: Uploaded;
  from: 'diff' | 'pdf';
  frames: { rect: Rect; bind?: FieldRef }[];
  texts: PdfText[];
};

/**
 * A writing read off a PDF, as the box it becomes.
 *
 * It arrives as the design's own words rather than as a question, because
 * that is what it was on the page she designed: a heading, a line of
 * welcome, the words under a photograph. The Tagalog is deliberately left
 * unwritten, so the checklist asks for it — English with no Tagalog beside
 * it is a line half the country cannot read.
 */
function wordsFromPdf(id: string, t: PdfText): TextEl {
  return {
    id, kind: 'text', block: 'free', anchor: 'top',
    x: place(t.left + t.width / 2),
    y: place(t.top),
    w: place(t.width),
    size: t.size,
    ...(t.face ? { face: t.face } : {}),
    lines: t.lines.map((words) => ({
      role: 'body' as const,
      align: t.align,
      sources: [{ fixed: { en: words } }],
    })),
  };
}
