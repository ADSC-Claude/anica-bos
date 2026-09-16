'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import Link from 'next/link';
import type { Look, LineKey, TitleKey } from '@/lib/looks';
import { designVars, type SurroundArt, pageKeyOf,   isPicture, pageRatio, place, withFollowers, fillPageWithClip, canAttach, putSection, dropSection, shiftSection, titleWord,
  cropWindow, cropAt, flowFloats, flowDecor, floatAt, floatShape, outsideOf, bleeds, runOf, pinOf, groundKind, kindOfShape, screensOf, sizeOf, sizeToFit, SIZE_RANGE, reachablePages, bookletsOf, APP_NIGHT,
  wordsFor, lineLabel, titleLabel, titleSaid, ONE_SCREEN, LEGIBLE_CQW, BROWSER_BAR,
  type DesignDoc, type PageSpec, type Element, type PhotoEl, type TextEl, type ShapeEl, type VideoEl, type AnimEl, type CoverSpec, type FieldRef, type Ground, type LineRole, type PageSectionKey,
  type Source, type WordKey, type SectionStyle, type NightPalette, type SheetSpec, type SheetSize,
  type MomentEl, type Picture, type ColourGround,
} from '@/lib/design';
import { MOMENTS, MOMENT_BY_KEY, SHELVES, SHELF_KEYS, SHELF_NAMES, SPEEDS, SPEED_NAMES, momentName, momentOf, shelvesOf, type MomentKey, type Shelf, type ShelfEntry, type Trigger as MomentTrigger } from '@/lib/moments';
import { sectionsFor, sectionLabel, SECTION_BY_KEY, type SectionKey, type SectionData } from '@/lib/sections';
import { DrawnPage, FlowDecor, bindingOf } from '@/components/invite/drawn';
import { asksOf, askable, askCounts, fieldOf, SHAPE_GUIDANCE, shapeOf, type Askable } from '@/lib/asks';
import { pageNeeds, needCount, GUTTER, HEAVY_GROUND, type Need } from '@/lib/needs';
import { sampleContent, SAMPLES, type Sample } from '@/lib/samples';
import { withDraft, type StudioDraft } from '@/lib/studio-draft';
import type { Occasion } from '@prisma/client';
import { framesFromDifference, photoFromRect, guessOffer, type Rect, type Offer, type Word } from '@/lib/importing';
import { phraseFor } from '@/lib/copy';
import { PDF_TROUBLE, type PdfText } from '@/lib/pdf-import';
import { cssVars, fontsFrom, PALETTE_PRESETS, type Fonts, type Palette } from '@/lib/theme';
import { colourFamilies, swatchName, swatchStyle, PALETTE } from '@/lib/palette';
import { saveDesignDraftAction, shareDesignDraftAction, stopSharingDesignDraftAction, themeAction } from '../../../actions';
import { uploadGround, readPicture, drawAt, sendPicture, groundFromUrl, movingKind, readMoving, sendMoving, type ReadPicture, type Uploaded } from './ground';
import { readPdfFile } from './pdf';
import { readClip, sendClip, type SentClip } from './clip';
import { readAnim, sendAnim, type SentAnim } from './anim';
import { InvitationDrawer } from './invitation-drawer';
import { VIDEO_MAX_LABEL, VIDEO_MAX_MS } from '@/lib/clips';
import { builtinPieces, shownPieces, groupOf, PIECE_GROUPS, type Piece, type PieceGroup } from '@/lib/library';
import { PAGE_SHAPES, KINDS, RULES, pixelsFor, shippedExamples } from '@/lib/guide';
import { listPiecesAction, keepPieceAction, namePieceAction, dropPieceAction, pagesToCopyAction, copyPageAction, invitationsToDrawAction, invitationContentAction } from '../../../actions';

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
/**
 * The two ways the page is looked at. The website is the page as a laptop
 * shows it — the column on its surround, a background edge to edge — and
 * the phone is the cut of it a guest holds. Each carries the width of the
 * window and the height of the screen it stands for, for the page under the
 * canvas (see --inv-screen). Four phone widths used to sit here; what an
 * owner judges is the website, and the one cut that matters is the phone.
 */
const VIEWS = [
  { key: 'website', label: 'Website', hint: '1280', width: 1280, screen: 800 },
  { key: 'phone', label: 'Phone', hint: '390', width: 390, screen: 844 },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];
/** The invitation column is never wider than this, whatever the window: see `.inv[data-paged]`. */
const COLUMN = 512;
/** How wide a phone is, for the marks the guide draws at website width. */
const PHONE_VIEW = VIEWS.find((v) => v.key === 'phone')!.width;

/** How far a drag has to come to snap: a fifth of a percent of the page's width. */
const SNAP = 0.8;

/** How the sample menu names a customer's invitation: their title, the package, and whether it is live. */
const invitationName = (t: { title: string; tier: string; status: string }) => `${t.title} · ${t.tier.toLowerCase()}${t.status === 'PUBLISHED' ? ' · live' : ''}`;

/** A customer's invitation on the canvas: what the menu names it by, where the whole of it is served, and their answers. */
type Real = { id: string; slug: string; title: string; tier: string; status: string; content: Record<string, unknown> };

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
  /** the demo invitation's row, for the form the studio carries; blank when the design has none */
  demoId: string;
  demoTitle: string;
  content: Record<string, unknown>;
  /** the design's own photographed parts, for the moments on the canvas */
  parts?: Record<string, string>;
  /**
   * The invitation she came from, when the Invitation tab sent her here:
   * the studio opens drawn against it, with its form open beside the
   * canvas, rather than on the demo.
   */
  against?: Real | null;
  /**
   * The way back out, in the studio's own top bar: where she came from and
   * what to call it. The page has a back link of its own above the tabs,
   * but the studio is a screen of its own that scrolls and it goes out of
   * reach — so the way out is beside Save draft, where it stays.
   */
  back?: { href: string; label: string };
  look?: Look;
  vars: Record<string, string>;
  /** what each of this design's own uploads weighs, by address, for the checklist */
  weights: Record<string, number>;
  lengths: Record<string, number>;
  /** what the row knows about the shop, for the checklist */
  shop: { shown: boolean; thumbnail: boolean };
  /**
   * The design's own colours and faces — the two columns the Theme popover
   * edits — as against `vars`, which is what the canvas is drawn in and has
   * the demo invitation's own colours and the look's faces on top of them.
   */
  theme: {
    palette: Palette;
    /** the set in our list these faces are, or blank for faces of their own */
    fontsKey: string;
    /** the look's name when the design is set in one, which overrules the faces */
    look: string;
    /** the demo invitation carries colours of its own, so the canvas is not the design */
    overridden: boolean;
    live: number;
    drafts: number;
    /**
     * Every pairing she has switched on, drawn in its own faces. Handed in
     * rather than imported, because the list is rows now and the studio is
     * a client component.
     */
    sets: { key: string; name: string; tagline: string; fonts: Fonts }[];
    /** One stylesheet drawing the whole menu in the faces it offers. */
    facesUrl: string;
  };
  canPublish: boolean;
  /** the live Share-draft link, or blank when the design is not shared */
  shareLink: string;
};

/**
 * A writing of the page's own, as the frame under the canvas drew it: where
 * it sits on the page (shares of the page's box), what it reads (the sources
 * the box that takes its place is given, from `data-src`), the role its
 * class says, its size as a share of the width, and its words for the label.
 */
type Writing = { id: string; src: TextEl['lines'][number]['sources']; role: LineRole; text: string; x: number; y: number; w: number; h: number; sizeCqw: number };

type Drag =
  /** every id that is travelling, where each started, and which one the pointer holds */
  | { kind: 'move'; ids: string[]; from: Record<string, { x: number; y: number }>; lead: string; px: number; py: number }
  | { kind: 'size'; id: string; w: number; px: number }
  | { kind: 'turn'; id: string; cx: number; cy: number; from: number; rotate: number }
  /** fitting a picture inside a frame that does not move: the window pans */
  | { kind: 'crop'; id: string; px: number; py: number; cx: number; cy: number }
  /** a writing of the page's own being dragged off the flow: nothing moves until the hand lets go */
  | { kind: 'lift'; w: Writing; px: number; py: number };

/**
 * A picture being fitted: which frame, how big the file actually is, and
 * where the window sits meanwhile. The window itself is written into the
 * document as she drags, so the page under her hand is the page a guest
 * would get; `was` is what it held before, for Esc.
 */
type Fitting = { id: string; nw: number; nh: number; zoom: number; cx: number; cy: number; was?: PhotoEl['crop'] };

/** A theme being tried on: the six roles, and which set of faces. */
type Tried = { colours: Palette; fontsKey: string };

/** The variables that set the page's faces, as against the six that colour it. */
const FACE_VARS = ['--inv-display', '--inv-body', '--inv-names', '--inv-script', '--inv-script-style'];

export function Studio(p: Props) {
  const [doc, setDoc] = useState<DesignDoc>(p.doc);
  const [pageKey, setPageKey] = useState(p.doc.pages[0]?.key ?? '');
  const [sel, setSel] = useState<string[]>([]);
  const [size, setSize] = useState<ViewKey>('website');
  const width = VIEWS.find((v) => v.key === size)!.width;
  /** the column on the canvas: the window, or the phone column when the window is wider */
  const column = Math.min(width, COLUMN);
  /*
   * Zoom. The website is wider than the studio's middle column, so it is
   * shown to fit unless she asks for more or less; the canvas is scaled as
   * a whole (CSS zoom, which the browser lays out and measures in), so a
   * drag reads the same at every zoom and the handles sit where the boxes
   * are.
   */
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const canvasRef = useRef<HTMLElement | null>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    setRoom(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRoom(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
    // the observer sees the column beside it open and close, which is when the room changes
  }, []);
  // the card's own padding and the canvas's, which the website has to fit inside
  const scale = zoom === 'fit' ? (room ? Math.max(0.25, Math.min(1, (room - 56) / width)) : 1) : zoom;
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  /** the page under her hand, or the whole invitation as a guest scrolls it */
  const [view, setView] = useState<'page' | 'whole' | 'import'>('page');
  const [shown, setShown] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [night, setNight] = useState(false);
  /*
   * The page as a guest is served it, under the canvas.
   *
   * A page laid out by its words has no height of its own — its words
   * decide — so the studio cannot draw it, and for a long time it did not:
   * the canvas was a blank sheet with the decorations on it, and the words
   * were only to be seen under The whole invitation, after a save. That is
   * the canvas somebody opens and asks where the invitation is. Now the
   * guest page draws it, one page at a time, from the draft as last saved,
   * and it sits under the decorations here at its real height. `top` is
   * where that page starts inside its frame and `height` how tall it came
   * out, so the canvas is exactly the page and nothing around it.
   */
  const flowFrame = useRef<HTMLIFrameElement | null>(null);
  const [flowBox, setFlowBox] = useState({ top: 0, height: 0 });
  const flowWatch = useRef<ResizeObserver | null>(null);
  /** the page chooser under +: a new page is asked what it carries */
  const [adding, setAdding] = useState(false);
  /** who the canvas is drawn against: the demo, nobody, anybody, the longest — or a customer, when she came from their tab */
  const [sample, setSample] = useState<Sample | 'real'>(p.against ? 'real' : 'demo');
  /*
   * A real customer's invitation on the canvas. Their answers, drawn; and
   * since the Invitation drawer, edited too — through the tab's own form
   * and the tab's own save, never through the design, which holds no
   * customer's words at all. The list is fetched the first time she opens
   * the menu rather than on every studio load, because most of the time
   * she is drawing against the demo and never asks.
   */
  const [real, setReal] = useState<Real | null>(p.against ?? null);
  const [theirs, setTheirs] = useState<{ id: string; title: string; tier: string; status: string }[] | null>(null);
  const [against, setAgainst] = useState({ busy: false, error: '' });
  /*
   * The demo's own words, kept here because the drawer can change them: a
   * save that lands is folded in, so the canvas and the checklist read the
   * demo as it now is rather than as the page found it.
   */
  const [demoContent, setDemoContent] = useState(p.content);
  /** the part being typed in the drawer, drawn before it is saved: see withDraft */
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  /** the part the drawer is on — kept here, so looking at the Pages list and coming back finds her where she was */
  const [asked, setAsked] = useState<SectionKey | undefined>(undefined);
  /** the library of moments, open under the toolbar */
  const [momentSheet, setMomentSheet] = useState(false);
  /** pages arriving as pictures, dropped on the strip */
  const [drop, setDrop] = useState({ busy: false, error: '' });
  /** the left column: the pages, the invitation's form, or the pieces any design can be built from */
  const [drawer, setDrawer] = useState<'pages' | 'invitation' | 'library' | 'guide'>(p.against ? 'invitation' : 'pages');
  /** what just happened, when it is worth saying and is not a fault */
  const [said, setSaid] = useState('');
  /*
   * The theme. Three pieces, because the colours and the faces are columns
   * on the row rather than part of the design document, and so are saved
   * outside the draft she is drawing: `saved` is what the row holds, `tried`
   * is what she is trying on the canvas and has not saved, and `after` is
   * the canvas once she has saved from here — the page was drawn before that
   * happened and its own variables are a version behind.
   */
  const [themeOpen, setThemeOpen] = useState(false);
  const [saved, setSaved] = useState<Tried>({ colours: p.theme.palette, fontsKey: p.theme.fontsKey });
  const [tried, setTried] = useState<Tried | null>(null);
  const [after, setAfter] = useState<Record<string, string> | null>(null);
  /** the faces of every set, loaded once she asks to see them */
  const [faces, setFaces] = useState(false);
  /*
   * A theme on the canvas. `preview` is what she is trying, and it shows the
   * set she has named whatever else is true, because seeing the faces is the
   * whole point of trying them. Without it the canvas shows what a guest is
   * served — which on a design set in a look is the look's faces, however
   * the column underneath is set, and the popover says so.
   */
  const varsFor = useCallback((t: Tried, preview = false) => {
    const set = !preview && p.theme.look ? undefined : p.theme.sets.find((f) => f.key === t.fontsKey);
    const made = cssVars(t.colours, set?.fonts ?? fontsFrom(null));
    return set ? made : { ...made, ...Object.fromEntries(FACE_VARS.map((k) => [k, p.vars[k]])) };
  }, [p.theme.look, p.theme.sets, p.vars]);
  const vars = useMemo(() => (tried ? varsFor(tried, true) : after ?? p.vars), [tried, after, varsFor, p.vars]);
  /**
   * Who the canvas is drawn against. The checklist above is not switched
   * with it: it is a list about the design, and "the demo has no photo for
   * frame 4" is about the demo, not about whoever the canvas is showing.
   *
   * `shownId` is the invitation on the canvas — the demo's, a customer's,
   * or nobody's for a made-up sample — and the part being typed in the
   * drawer is laid over it only when it is that invitation's. `editing` is
   * the one the drawer holds: the customer when the canvas shows a
   * customer, else the demo.
   */
  const shownId = sample === 'real' ? real?.id ?? '' : sample === 'demo' ? p.demoId : '';
  // a customer she has loaded stays the drawer's while she tries a made-up
  // sample on the canvas; only choosing the demo hands the drawer the demo
  const editing = real && sample !== 'demo' ? real.id : p.demoId;
  const shownContent = useMemo(() => {
    const base = sample === 'real' ? real?.content ?? {} : sampleContent(sample, { doc, occasion: p.occasion, demo: demoContent });
    return withDraft(base, draft, shownId);
  }, [sample, real, doc, p.occasion, demoContent, draft, shownId]);
  // a draft belongs to the invitation it was typed on; the form for another
  // starts from that one's own words
  useEffect(() => { setDraft(null); }, [editing]);
  /**
   * A save from the drawer, folded into what the canvas reads, so the page
   * does not fall back to the words the studio opened with once the draft
   * is gone. Told which invitation it was, rather than reading the one on
   * the canvas: the form's save on the way out of a part lands after she
   * may have moved the canvas to somebody else. And the whole invitation,
   * when it is showing, is drawn again with the saved words.
   */
  const folded = useCallback((id: string, section: SectionKey, data: SectionData) => {
    if (id === p.demoId) setDemoContent((c) => ({ ...c, [section]: data }));
    setReal((r) => (r && r.id === id ? { ...r, content: { ...r.content, [section]: data } } : r));
    // a save that landed outranks whatever the last one said went wrong
    setAgainst((a) => (a.error ? { ...a, error: '' } : a));
    setShown((n) => n + 1);
  }, [p.demoId]);
  /**
   * The canvas follows the part under her hand: the page that carries the
   * section, or the first drawn page with an element bound to it. Without
   * this she would type into Story while the cover stayed on the canvas and
   * see nothing land — which is the moving-out the drawer exists to end.
   */
  const follow = useCallback((key: SectionKey) => {
    const pg = doc.pages.find((x) => x.sections.includes(key) || (x.elements ?? []).some((el) => bindingOf(el)?.section === key));
    if (pg && pg.key !== pageKey) {
      setPageKey(pg.key);
      setSel([]);
    }
  }, [doc, pageKey]);
  /** the invitations on this design, asked for once and kept */
  const loadTheirs = useCallback(async () => {
    if (theirs !== null || against.busy) return;
    setAgainst({ busy: true, error: '' });
    try {
      setTheirs(await invitationsToDrawAction(p.templateId));
      setAgainst({ busy: false, error: '' });
    } catch {
      setAgainst({ busy: false, error: 'The invitations could not be listed.' });
    }
  }, [theirs, against.busy, p.templateId]);
  const drawAgainst = useCallback(async (id: string) => {
    setAgainst({ busy: true, error: '' });
    const r = await invitationContentAction(p.templateId, id).catch(() => ({ ok: false as const, error: 'Their words could not be read.' }));
    if (!r.ok) { setAgainst({ busy: false, error: r.error }); return; }
    setReal({ id, slug: r.slug, title: r.title, tier: r.tier, status: r.status, content: r.content });
    setSample('real');
    setAgainst({ busy: false, error: '' });
  }, [p.templateId]);
  /**
   * The phone guide: what is true of this page on the narrowest phone, drawn
   * on the page itself rather than listed in a drawer.
   *
   * It answers the question somebody asks the first time they work at laptop
   * width: where can I put things so a phone does not cut them? The answer
   * is that a drawn page is capped at a phone column at every width and
   * everything on it is a share of that width, so nothing is ever re-cut —
   * what moves is the size of it. So the guide draws the three things that
   * do differ: the gutter words want from the side, the band a phone's own
   * browser bar keeps for itself, and a ring on anything the checklist has
   * something to say about here.
   */
  const [guide, setGuide] = useState(true);
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
  /** the booklets this design has, for the page panel's field and the element's "Opens" */
  const bookletNames = useMemo(() => bookletsOf(doc).map((b) => b.key), [doc]);
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
  const [ownBoxes, setBoxes] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  /**
   * Where the frame laid the floats.
   *
   * Everything else on the canvas is drawn by the studio itself, so its box
   * is measured from the studio's own page. A float is not: it is in among
   * the words, inside the frame, and only the frame knows where the words
   * let it land. Same-origin, so it is read rather than guessed (`sizeFlow`).
   */
  const [flowBoxes, setFlowBoxes] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  /**
   * The column the words are in, as a share of the page: where it starts and
   * how wide it is. A float's place is a share of *that* — it stands in the
   * column, and a margin on it is a share of the column — while every other
   * number on the canvas is a share of the page. So the hand's travel is
   * turned into the column's numbers before it is written, and the column is
   * measured rather than assumed (`sizeFlow`).
   */
  const [flowCol, setFlowCol] = useState({ left: 0, width: 100 });
  const boxes = useMemo(() => ({ ...ownBoxes, ...flowBoxes }), [ownBoxes, flowBoxes]);
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
      // what holds the foot follows the page down and never pushes it (in the page's own pixels, not the zoomed ones)
      if (!node.hasAttribute('data-foot') && r.height) low = Math.max(low, (r.bottom - b.top) / scaleRef.current);
    }
    setBoxes(next);
    setGrown((was) => (Math.abs(was - low) < 0.5 ? was : low));
    // `view` is in the list because the stage is kept mounted but hidden while
    // the whole invitation is shown: a hidden box measures zero, the guard
    // above keeps the last good numbers, and this measures again on her return
  }, [doc, page, width, night, shownContent, view, grown]);

  /**
   * Everything on the canvas is marked arrived.
   *
   * On a guest's page an element that enters starts invisible and is marked
   * when it scrolls into view. On the canvas that would mean drawing a frame
   * and watching it not appear, so the mark is put on everything a frame
   * after it is drawn: the arrival plays once as she adds it, the idling
   * runs, and nothing she places is invisible while she places it. **Play it
   * again** takes the mark off one element and puts it back, which is the
   * whole of replaying an arrival.
   */
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const id = requestAnimationFrame(() => {
      for (const el of root.querySelectorAll('[data-enter], [data-idle]')) el.setAttribute('data-in', '');
    });
    return () => cancelAnimationFrame(id);
  }, [elements, pageKey, view]);

  /** Take the arrival off and put it back, which is how an arrival is replayed. */
  const replay = useCallback((id: string) => {
    const node = stage.current?.querySelector<HTMLElement>(`[data-el="${CSS.escape(id)}"]`);
    if (!node) return;
    node.removeAttribute('data-in');
    // read a layout value between the two, or the browser coalesces them and
    // nothing happens at all
    void node.offsetWidth;
    requestAnimationFrame(() => node.setAttribute('data-in', ''));
  }, []);

  /** Play a moment on the canvas: it closes and opens again, wherever the canvas drew it — in the studio's own page or in the guest frame. */
  const playMoment = useCallback((id: string) => {
    const sel = `[data-el="${CSS.escape(id)}"]`;
    const node = stage.current?.querySelector<HTMLElement>(sel) ?? flowFrame.current?.contentDocument?.querySelector<HTMLElement>(sel);
    node?.dispatchEvent(new CustomEvent('inv-moment-play'));
  }, []);

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

  // Six tenths of a second after her hand stops, the draft is saved — the
  // page under the canvas is drawn from it, so a long wait is a page that
  // lags behind her hand. Nothing a guest sees changes until she publishes.
  useEffect(() => {
    if (state !== 'dirty') return;
    const id = setTimeout(() => { void save(doc); }, 600);
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
        elements.push(wordsFromPdf(id, t.text, t.from));
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

  /**
   * A piece placed on the page: the design's own picture, not a question.
   *
   * What is copied in is the piece's *address*. A page never holds a
   * reference to a library row, so taking a piece out of the library can
   * never blank a page that used it — which is the one thing a library of
   * shared pieces has to promise.
   */
  async function placePiece(url: string, aspect?: number, animated?: true) {
    if (!page) return;
    // Its own shape, or the browser's reading of it: a strand of flowers
    // dropped into a square frame is a strand of flowers with most of it
    // cut off, which is not what anybody meant by placing it.
    let shape = aspect;
    if (!shape) {
      try { shape = (await groundFromUrl(url)).ratio; } catch { shape = 1; }
    }
    const id = freeId(doc, 'piece');
    const made: PhotoEl = {
      // on a page laid out by its words a piece hangs off the head: there is
      // no canvas to place it on, and flush with the head is where she can
      // see it (addElement says the same thing about a blank frame)
      id, kind: 'photo', x: 50, y: page.drawn ? 40 : 4, w: 40, anchor: 'centre',
      aspect: place(shape), frame: 'none', bind: { asset: url },
      // a moving picture is served as it is: the flag is what keeps it out of
      // the transform endpoint, which would send back one frame of it
      ...(animated ? { animated: true as const } : {}),
    };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  /**
   * A piece as this page's background.
   *
   * A built-in ground already knows its proportions and the colour of its
   * two edges, because those were measured from the file when it shipped.
   * One she uploaded does not, so the browser reads them off the picture —
   * the file is ours and same-origin, so nothing has to be uploaded twice.
   */
  async function groundFromPiece(url: string) {
    const found = builtinPieces().find((x) => x.url === url);
    setDrop({ busy: true, error: '' });
    try {
      const g = found?.ground ?? await groundFromUrl(url);
      /*
       * Which slot it lands in comes from its shape (`kindOfShape`): a
       * picture about the shape of a phone screen is the phone's background,
       * anything wider is the whole website's. She can move it by uploading
       * it into the other slot; nothing about it is cut or stretched either
       * way.
       */
      const pic = { url, ratio: g.ratio, top: g.top, bottom: g.bottom };
      if (page?.drawn) setGround(pic);
      else setBackground(kindOfShape(g.ratio) === 'phone' ? 'phone' : 'website', pic);
      setDrop({ busy: false, error: '' });
    } catch (e) {
      setDrop({ busy: false, error: (e as Error).message });
    }
  }

  /**
   * A page brought over from another design.
   *
   * Its pictures come as addresses, so the file is shared rather than
   * copied and neither design can break the other by being edited. Its key
   * and every element id are made free of this design's, and anything that
   * followed something else on the page it came from follows the same thing
   * here — a caption that travelled with its polaroid still does.
   *
   * What it does not bring is a section this design already carries
   * somewhere else. A section belongs to one page — two pages naming it
   * would print a couple's ceremony twice — and which parts a page carries
   * is this design's business, where the artwork and the layout are the
   * thing worth copying.
   */
  function addBrought(from: PageSpec) {
    const taken = new Set(doc.pages.map((x) => x.key));
    const ids = new Set(doc.pages.flatMap((x) => (x.elements ?? []).map((e) => e.id)));
    const carried = new Set(doc.pages.flatMap((x) => x.sections));
    const copy = JSON.parse(JSON.stringify(from)) as PageSpec;
    const dropped = copy.sections.filter((k) => carried.has(k));
    copy.sections = copy.sections.filter((k) => !carried.has(k));
    const renamed = new Map<string, string>();
    for (const el of copy.elements ?? []) {
      const id = ids.has(el.id) ? freeIdIn(ids, el.id.replace(/-\d+$/, '')) : el.id;
      ids.add(id);
      renamed.set(el.id, id);
      el.id = id;
    }
    for (const el of copy.elements ?? []) {
      if (el.attachTo) el.attachTo = renamed.get(el.attachTo) ?? undefined;
    }
    const made: PageSpec = { ...copy, key: freeKeyIn(taken, copy.key), peekEnd: undefined };
    const at = doc.pages.findIndex((x) => x.key === pageKey);
    const pages = [...doc.pages];
    pages.splice(at < 0 ? pages.length : at + 1, 0, made);
    change({ ...doc, pages });
    setPageKey(made.key);
    setSel([]);
    setSaid(dropped.length
      ? `Brought in without ${dropped.length === 1 ? 'the part' : 'the parts'} this design already has elsewhere: ${dropped.join(', ')}.`
      : '');
  }

  /**
   * A new page goes in after the one she is on, so it lands where she is
   * looking. It is made carrying the part she chose for it, under its own
   * name: a page with nothing on it is not drawn at all, and until the
   * chooser a new page was always that, which is how a page named
   * "countdown" came to carry no countdown.
   */
  function addPage(from?: PageSpec, section?: PageSectionKey) {
    const key = freePageKey(from ? `${from.key}-copy` : section ? pageKeyOf(section) : 'page');
    const made: PageSpec = from
      ? { ...JSON.parse(JSON.stringify(from)) as PageSpec, key, peekEnd: undefined }
      : { key, sections: section ? [section] : [] };
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
  function addElement(kind: 'text' | 'photo' | 'shape' | 'frame' | 'moment', pick?: ShelfEntry) {
    if (!page) return;
    const id = freeId(doc, kind === 'photo' ? 'photo' : kind === 'shape' ? 'shape' : kind === 'frame' ? 'frame' : kind === 'moment' ? (pick?.key ?? 'moment') : 'words');
    if (kind === 'moment') {
      /*
       * A moment from the library: it lands at the width and shape the scene
       * wants, with a slot for each photograph it opens onto — asked of the
       * customer to begin with, since the surprise is theirs.
       */
      if (!pick) return;
      const def = MOMENT_BY_KEY[pick.key];
      if (!def?.built) return;
      const slots = Array.from({ length: def.photos.count }, () => ({ bind: { asset: '' } }));
      const moment: Element = {
        id, kind: 'moment', moment: pick.key, ...(pick.variant ? { variant: pick.variant } : {}),
        x: 50, y: page.drawn ? 40 : 4, w: def.width, anchor: page.drawn ? 'centre' : 'top',
        ...(slots.length ? { photos: slots, ask: true } : {}),
        ...(page.drawn ? {} : { z: 1 }),
      };
      editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), moment] }));
      setSel([id]);
      return;
    }
    /*
     * Where a new piece lands. On a drawn page, four tenths down it, which is
     * in view and clear of both edges. On a page laid out by its words there
     * is no such place — the piece hangs off the head or the foot — so it
     * lands just under the head, where she can see it whole and push it down
     * by as much as she likes.
     */
    const y = page.drawn ? 40 : 4;
    const made: Element = kind === 'photo'
      ? { id, kind: 'photo', x: 50, y, w: 40, anchor: 'centre', aspect: 1, frame: 'none', bind: { asset: '' } }
      : kind === 'shape'
        // behind the words, not over them: a card is what a shape is usually for
        ? { id, kind: 'shape', shape: 'rect', x: 50, y, w: 70, h: 30, anchor: 'centre', z: -1, fill: 'surface', radius: 1.6 }
        // a plain frame: an outline and nothing inside it, around whatever it is put around
        : kind === 'frame'
          ? { id, kind: 'shape', shape: 'rect', x: 50, y, w: 84, h: 60, anchor: 'centre', z: -1, stroke: 'ink', strokeWidth: 0.4, radius: 0 }
        // over the section's own words on a page laid out by them: a box of words behind words cannot be read
        : { id, kind: 'text', block: 'free', x: 50, y, w: 70, anchor: 'top', lines: [{ role: 'body', sources: [{ fixed: { en: 'New words' } }] }], ...(page.drawn ? {} : { z: 1 }) };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  /**
   * A moving picture that has just been uploaded, put on the page at the
   * shape it really is.
   *
   * It is a frame like any other and is placed like any other — the only
   * thing that is different about it is the flag, which is what keeps it out
   * of the transform endpoint. Narrower than a photograph by default because
   * a moving picture is a decoration nine times out of ten: petals, a bow, a
   * flourish, not a portrait.
   */
  function addMoving(up: Uploaded & { animated: true }) {
    if (!page) return;
    const id = freeId(doc, 'moving');
    const made: Element = {
      id, kind: 'photo', x: 50, y: page.drawn ? 40 : 4, w: 32, anchor: 'centre',
      aspect: place(up.ratio), frame: 'none', bind: { asset: up.url }, animated: true,
    };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  /**
   * A vector animation that has just been uploaded.
   *
   * Its shape is not a guess either: an animation carries its own canvas
   * size, so the box is the shape the designer drew it at and nothing is
   * squashed. A third of the page's width by default, because an animation
   * is nearly always an ornament beside something rather than the thing
   * itself.
   */
  function addAnim(up: SentAnim) {
    if (!page) return;
    const id = freeId(doc, 'anim');
    const made: Element = {
      id, kind: 'anim', x: 50, y: page.drawn ? 40 : 4, w: 34, anchor: 'centre',
      url: up.url, poster: up.poster, aspect: place(up.aspect), loop: true,
    };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  /**
   * A clip that has just been uploaded, put on the page at the shape it
   * really is.
   *
   * Its width is the one guess here — narrower than a photo frame, because a
   * portrait clip at forty percent of the page is already tall — and its
   * proportion is not a guess at all: it is what the browser read off the
   * file, so the frame is the clip's own shape and nothing is letterboxed.
   */
  function addClip(up: SentClip) {
    if (!page) return;
    const id = freeId(doc, 'clip');
    const made: Element = { id, kind: 'video', x: 50, y: page.drawn ? 40 : 4, w: 44, anchor: 'centre', url: up.url, poster: up.poster, aspect: up.aspect, loop: true, glare: up.glare };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  /**
   * A clip behind the whole page. The measuring is here because only a
   * browser can do it; everything the document takes from it is in
   * `fillPageWithClip`, where it can be tested without one.
   */
  async function fillPage(id: string) {
    const el = elements.find((x) => x.id === id);
    if (!page || !el || el.kind !== 'video' || !el.poster) return;
    // Read rather than caught: the poster is measured off a canvas, so this
    // fails when the file is not being served yet or the bucket sends no
    // CORS header — and failing quietly would leave her pressing a button
    // that does nothing, which is the worst way to find that out.
    const g = await groundFromUrl(el.poster);
    editPage((pg) => fillPageWithClip(pg, id, g));
    setSel([id]);
  }

  /**
   * A section this design does not do at all.
   *
   * Different from taking a section off a page. A page not carrying a
   * section means the renderer gives that section a plain page of its own,
   * in its place — which is how Baby Blue's ten drawn pages sit in front of
   * a plain Contact and a plain Music. So "not drawn here" and "not offered
   * by this design" are two questions, and only this one answers the second.
   *
   * It goes in the draft and publishes with it, because hiding a section
   * changes every invitation on the design and belongs behind the publish
   * screen's blast-radius report rather than in a form that saves at once.
   */
  function toggleHide(key: PageSectionKey) {
    const hides = new Set(doc.hides ?? []);
    if (hides.has(key)) hides.delete(key);
    else hides.add(key);
    const next: DesignDoc = { ...doc, hides: hides.size ? [...hides] : undefined };
    if (!next.hides) delete next.hides;
    change(next);
  }

  /**
   * The design's own colours: the column, the colour beside it on a laptop,
   * and the colours it gives the night.
   *
   * All three are the document's, so they are in the draft and publish with
   * it — unlike the palette and the faces in the Theme popover, which are
   * columns on the row and reach every invitation the moment they save. A
   * colour taken off is taken out of the document rather than written blank,
   * so the stylesheet's own answer comes back.
   */
  /**
   * The design's paper settings. A field set back to nothing is removed
   * rather than stored empty, and a sheet with nothing left in it goes
   * altogether — so a design nobody has given paper settings has no `sheet`
   * at all and prints exactly as it did.
   */
  function setSheet(patch: Partial<SheetSpec>) {
    const sheet: SheetSpec = { ...(doc.sheet ?? {}), ...patch };
    // A setting turned back off is removed rather than stored as nothing, so
    // "the browser's own" and "0mm" stay distinguishable — the select hands
    // back undefined for its blank option, and an emptied list of hidden
    // pages is an empty array, which is not the same as none.
    for (const k of Object.keys(sheet) as (keyof SheetSpec)[]) {
      const v = sheet[k];
      if (v === undefined || (Array.isArray(v) && !v.length)) delete sheet[k];
    }
    const next: DesignDoc = { ...doc, sheet: Object.keys(sheet).length ? sheet : undefined };
    if (!next.sheet) delete next.sheet;
    change(next);
  }

  function setColumnColour(key: 'paper' | 'surround', colour: string | undefined) {
    const next: DesignDoc = { ...doc, [key]: colour };
    if (!colour) delete next[key];
    change(next);
  }

  /** A picture behind the whole website page, or none: the design's own, so it is in the draft. */
  function setSurroundArt(art: SurroundArt | undefined) {
    const next: DesignDoc = { ...doc, surroundArt: art };
    if (!art) delete next.surroundArt;
    change(next);
  }

  function setNightColour(role: keyof NightPalette, colour: string | undefined) {
    const night = { ...(doc.nightColours ?? {}) };
    if (colour) night[role] = colour;
    else delete night[role];
    const next: DesignDoc = { ...doc, nightColours: Object.keys(night).length ? night : undefined };
    if (!next.nightColours) delete next.nightColours;
    change(next);
  }

  /**
   * The piece under the prenup photograph. The last thing a copy of Capiz
   * still had to take from the `art` column, so it is the document's now.
   */
  function setStrand(url: string | undefined) {
    const next: DesignDoc = { ...doc, strand: url };
    if (!url) delete next.strand;
    change(next);
  }

  /**
   * A picture the words flow around, on a page laid out by its words.
   *
   * A flow page has no canvas — its height is its words, so there is nothing
   * to drag on — which is why this is a button and a list rather than a
   * frame she places. It goes on the left by default, because that is where
   * a reader's eye already is.
   */
  function addFloat() {
    if (!page) return;
    const id = freeId(doc, 'photo');
    // A place of its own from the start, so she can drag it the moment it is
    // there: a fifth of the way in on the left, a little down the words
    // (both shares of the width — see `floatAt`).
    const made: Element = { id, kind: 'photo', x: 24, y: 4, w: 40, aspect: 1, float: 'left', frame: 'none', bind: { asset: '' } };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  /**
   * A decoration on a page laid out by its words: a piece along its head, a
   * flourish at its foot. Not a float — the words do not flow past it, it
   * hangs over them or behind them — and not a placed element either, since
   * the page has no height to place it in. `flowDecor` is the rule.
   */
  function addDecor() {
    if (!page) return;
    const id = freeId(doc, 'photo');
    const made: Element = { id, kind: 'photo', x: 50, y: 0, w: 100, anchor: 'centre', aspect: 0.3, frame: 'none', bind: { asset: '' } };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made] }));
    setSel([id]);
  }

  /**
   * How the page she is on dresses the sections it carries.
   *
   * A page that says nothing about it keeps the dress every design has
   * always had, so the whole setting is absent until she touches it and an
   * empty one is taken off again rather than saved as `{}`.
   */
  function setDress(change: (d: SectionStyle) => SectionStyle) {
    editPage((pg) => {
      const next = change(pg.sectionStyle ?? {});
      const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== '')) as SectionStyle;
      const out = { ...pg, sectionStyle: Object.keys(clean).length ? clean : undefined };
      if (!out.sectionStyle) delete out.sectionStyle;
      return out;
    });
  }

  /**
   * How far this page's background reaches: the pages after it that it also
   * stands behind — the ones she picked it to flow over.
   *
   * A background pinned behind the words simply stays put over them, so the
   * pages keep whatever they have: a page with a colour of its own shows it
   * again the moment the picture stops, and one with a picture of its own
   * ends the reach there. A tall shipped ground is the other case — one
   * length of it is laid down all of them, so the pages it covers lose a
   * ground of their own, which is what they had before this.
   */
  function setRunsOn(n: number) {
    if (!page || !page.ground || !isPicture(page.ground)) return;
    const flows = groundKind(page) === 'flow';
    const at = doc.pages.findIndex((x) => x.key === page.key);
    const pages = doc.pages.map((x, i) => {
      if (i === at) {
        const g = { ...(x.ground as Extract<Ground, { url: string }>) };
        if (n > 0) g.runsOn = n; else delete g.runsOn;
        return { ...x, ground: g };
      }
      if (flows && n > 0 && i > at && i <= at + n && !x.drawn && x.ground) {
        const next = { ...x };
        delete next.ground;
        return next;
      }
      return x;
    });
    change({ ...doc, pages });
  }
  /** the pages that sit on a picture running on from a page before them, by the head's key */
  const runs = useMemo(() => runOf(doc), [doc]);
  const joinedTo = page ? runs.get(page.key) : undefined;
  /** the pages that scroll over a picture pinned to the screen on a page before them, by the head's key */
  const pins = useMemo(() => pinOf(doc), [doc]);
  const pinnedOn = useMemo(() => {
    const head = page ? pins.get(page.key) : undefined;
    if (!head || head === page?.key) return undefined;
    const on = doc.pages.find((x) => x.key === head);
    return on?.label?.en || head;
  }, [doc, page, pins]);

  /** What the page she is on carries, on a page laid out by its words. */
  const pieces = useMemo(
    () => (page && !page.drawn ? { floats: flowFloats(page), decor: flowDecor(page) } : { floats: [], decor: [] }),
    [page],
  );

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

  /** The parts not yet on any page, for a new page to carry. */
  const unplaced = useMemo(() => {
    const carried = new Set<string>(doc.pages.flatMap((x) => x.sections));
    const keys: { key: PageSectionKey; label: string }[] = [
      ...sectionsFor(p.occasion).map((d) => ({ key: d.key as PageSectionKey, label: sectionLabel(d.key, p.occasion) })),
      { key: 'verse', label: 'The verse' },
      { key: 'gallery-video', label: 'The film, and the photographs no frame holds' },
    ];
    return keys.filter((k) => !carried.has(k.key));
  }, [doc, p.occasion]);

  /** A section already on the page, named the way the form names it. */
  const nameOf = useCallback((key: string) => {
    if (key === 'verse') return 'The verse';
    if (key === 'gallery-video') return 'The film, and the photographs no frame holds';
    try { return sectionLabel(key as SectionKey, p.occasion); } catch { return key; }
  }, [p.occasion]);

  /**
   * The page's background: a picture she uploads, a colour from the palette,
   * or nothing. A picture may come pinned to the screen (`pin`); a colour or
   * nothing never is, and the pin goes with the picture it was on.
   */
  function setGround(ground: Ground | undefined, pin?: PageSpec['pin']) {
    editPage((pg) => {
      const next: PageSpec = { ...pg, ground };
      // a page with a ground of known proportions can be drawn on; one with none cannot
      if (!ground) next.drawn = undefined;
      if (pin && ground && isPicture(ground) && !next.drawn) next.pin = pin; else delete next.pin;
      // what the background reaches is the choice's to say, not a leftover tick's
      if (pin) delete next.bleed;
      return next;
    });
  }

  /**
   * The page's two backgrounds: one for the phone, one for the whole
   * website, either or both.
   *
   * Both are her own files and neither is ever cut or stretched: the window
   * picks between them (`PHONE_WINDOW`), and each fills what it was made
   * for — the phone's the phone screen, the website's the whole window.
   * Where she gives only one, that one is the page's background and the pin
   * says which it is: `'column'` for the phone's, which keeps to the column
   * on a laptop with the surround beside it, and `true` for the website's,
   * which is the window. Where she gives both, the wide one is the page's
   * and the phone's rides along in `ground.phone`.
   *
   * What the page already had is read back into the two slots the same way,
   * so replacing one leaves the other alone. The three cuts an older draft
   * carried are dropped: nothing pinned is ever cut.
   */
  function setBackground(which: 'phone' | 'website', pic: Picture | undefined) {
    editPage((pg) => {
      const g = pg.ground && isPicture(pg.ground) ? pg.ground : undefined;
      const own = g ? { url: g.url, ratio: g.ratio, top: g.top, bottom: g.bottom, ...(g.night ? { night: g.night } : {}) } : undefined;
      const had = { phone: pg.pin === 'column' ? own : g?.phone, website: pg.pin === 'column' ? undefined : own };
      const want = { ...had, [which]: pic };
      const next: PageSpec = { ...pg };
      delete next.pin;
      if (want.website) {
        next.ground = { ...want.website, ...(want.phone ? { phone: want.phone } : {}), ...(g?.runsOn ? { runsOn: g.runsOn } : {}) };
        next.pin = true;
      } else if (want.phone) {
        next.ground = { ...want.phone, ...(g?.runsOn ? { runsOn: g.runsOn } : {}) };
        next.pin = 'column';
      } else {
        delete next.ground;
        next.drawn = undefined;
      }
      // what the background reaches is the choice's to say, not a leftover tick's
      delete next.bleed;
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
    editPage((pg) => {
      // a box that took a writing off the flow gives it back as it goes
      const back = new Set((pg.elements ?? []).filter((e) => chosen.has(e.id) && e.kind === 'text' && e.lifted).map((e) => (e as TextEl).lifted as string));
      const offFlow = (pg.offFlow ?? []).filter((id) => !back.has(id));
      const next: PageSpec = {
        ...pg,
        elements: (pg.elements ?? [])
          .filter((e) => !chosen.has(e.id))
          .map((e) => (e.attachTo && chosen.has(e.attachTo) ? { ...e, attachTo: undefined } : e)),
        offFlow: offFlow.length ? offFlow : undefined,
      };
      if (!next.offFlow) delete next.offFlow;
      // the page's own copy comes back at once, not after the save that redraws the frame
      const fdoc = flowFrame.current?.contentDocument;
      for (const id of back) {
        const el = fdoc?.querySelector<HTMLElement>(`[data-page="${pg.key}"] [data-w="${id}"]`);
        if (el) el.style.setProperty('display', 'revert', 'important');
      }
      return next;
    });
    setSel([]);
  }

  /**
   * One writing back into the flow of the words: the box that took it off
   * goes, and the page stops saying the writing is off its flow. `remove`
   * does the same for whatever is selected; this is the button beside its
   * name in the list, which should not have to select it first.
   */
  function putBack(id: string) {
    editPage((pg) => {
      const el = (pg.elements ?? []).find((e) => e.id === id);
      const back = el && el.kind === 'text' ? el.lifted : undefined;
      const offFlow = (pg.offFlow ?? []).filter((w) => w !== back);
      const next: PageSpec = {
        ...pg,
        elements: (pg.elements ?? []).filter((e) => e.id !== id).map((e) => (e.attachTo === id ? { ...e, attachTo: undefined } : e)),
        offFlow: offFlow.length ? offFlow : undefined,
      };
      if (!next.offFlow) delete next.offFlow;
      // the page's own copy comes back at once, not after the save
      const at = back ? flowFrame.current?.contentDocument?.querySelector<HTMLElement>(`[data-page="${pg.key}"] [data-w="${back}"]`) : null;
      if (at) at.style.setProperty('display', 'revert', 'important');
      return next;
    });
    setSel((was) => was.filter((x) => x !== id));
  }

  /** What to call a writing in a list: the words it reads, or where it reads them from. */
  const nameOfWords = (el: TextEl): string => {
    const src = el.lines?.[0]?.sources?.[0];
    if (!src) return 'a writing';
    if ('fixed' in src) return src.fixed.en;
    if ('bind' in src) return `${src.bind.section} · ${src.bind.field}`;
    if ('word' in src) return src.word;
    if ('copy' in src) return src.copy;
    return 'a writing';
  };

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
  /**
   * Where a float would be, for one the frame drew nothing for.
   *
   * An empty frame draws nothing on a page laid out by its words — a
   * customer who gave no picture gets their words and no gap — and a
   * template's floats are mostly frames asked of the customer, so most of
   * them are empty while she is drawing. The handle is put where the place
   * says it will land, worked out the same way the stylesheet does it, so an
   * empty frame is as draggable as a full one.
   */
  const wouldFloat = useCallback((el: Element) => {
    if (el.kind !== 'photo' || !el.float || !column || !flowBox.height) return undefined;
    const shape = floatShape(el.aspect ?? 1, el.rotate ?? 0);
    const wide = (el.w ?? 40) * shape.width;
    const at = floatAt(el, wide);
    // the column's numbers, as a share of the page, and then as the box the
    // handle is drawn in: the page's own percentages like every other box
    const colPx = (flowCol.width / 100) * column;
    const wpx = (wide / 100) * colPx;
    const leftPx = (flowCol.left / 100) * column + (at.side === 'left' ? (at.inset / 100) * colPx : colPx - (at.inset / 100) * colPx - wpx);
    return {
      x: place((leftPx / column) * 100),
      y: place((((at.down / 100) * colPx) / flowBox.height) * 100),
      w: place((wpx / column) * 100),
      h: place(((wpx * (shape.height / shape.width)) / flowBox.height) * 100),
    };
  }, [column, flowBox.height, flowCol]);

  const settled = useCallback((el: Element) => {
    const at = boxes[el.id];
    // a float's place is a share of the words' column, so a box measured off
    // the page is read back in the column's numbers (`floatAt`)
    const floated = el.kind === 'photo' && Boolean(el.float);
    const mid = at ? at.x + at.w / 2 : 50;
    const x = el.x ?? (at && floated && flowCol.width ? place(((mid - flowCol.left) / flowCol.width) * 100) : place(mid));
    const w = el.w ?? (at ? place(floated && flowCol.width ? (at.w / flowCol.width) * 100 : at.w) : 20);
    return { x, w };
  }, [boxes, flowCol]);

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
    // where the box actually landed, which on a page laid out by its words is not a share of its height
    const at = boxes[el.id];
    const cx = at ? b.left + ((at.x + at.w / 2) / 100) * b.width : b.left + ((el.x ?? 50) / 100) * b.width;
    const cy = at ? b.top + ((at.y + at.h / 2) / 100) * b.height : b.top + (el.y / 100) * b.height;
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
      /*
       * On a page laid out by its words, y is not a share of the height —
       * the page has none of its own — but the gap from the edge the piece
       * hangs off, as a share of the width (decorStyle). So the hand's
       * travel is read against the width, and the other way up for a
       * piece hung from the foot, which comes up the page as y grows.
       */
      const flow = !page.drawn;
      const leadEl = elements.find((el) => el.id === d.lead);
      const dir = flow && leadEl?.from === 'bottom' ? -1 : 1;
      /*
       * A float's place is a share of the words' column, not of the page, so
       * the hand's travel is turned into the column's numbers: drag it a
       * tenth of the page and it moves a tenth of the page, which is a
       * little more than a tenth of the narrower column.
       */
      const per = flow && leadEl?.kind === 'photo' && leadEl.float && flowCol.width ? 100 / flowCol.width : 1;
      let x = lead.x + ((e.clientX - d.px) / b.width) * 100 * per;
      let y = flow ? Math.max(0, lead.y + ((e.clientY - d.py) / b.width) * 100 * per * dir) : lead.y + ((e.clientY - d.py) / b.height) * 100;
      if (e.shiftKey) { if (Math.abs(e.clientX - d.px) > Math.abs(e.clientY - d.py)) y = lead.y; else x = lead.x; }
      const still = elements.filter((el) => !d.from[el.id]);
      x = snap(x, [50, ...still.map((el) => el.x ?? 50)]);
      if (!flow) y = snap(y, still.map((el) => el.y));
      const dx = x - lead.x;
      const dy = y - lead.y;
      editEls(d.ids, (el) => {
        const was = d.from[el.id];
        if (!was) return el;
        const at = { ...el, x: place(was.x + dx), y: place(was.y + dy) };
        // a float dragged across the middle of the column changes sides: the
        // side is `floatAt`'s answer, written back so the document reads plainly
        return at.kind === 'photo' && at.float ? { ...at, float: (at.x ?? 50) < 50 ? 'left' as const : 'right' as const } : at;
      }, false);
    } else if (d.kind === 'size') {
      // the box is centred on x, so the corner moves half of what the width does
      const w = Math.max(1, d.w + ((e.clientX - d.px) / b.width) * 200);
      editEl(d.id, (el) => ({ ...el, w: place(w) }), false);
    } else if (d.kind === 'turn') {
      let deg = d.rotate + ((Math.atan2(e.clientY - d.cy, e.clientX - d.cx) - d.from) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      editEl(d.id, (el) => ({ ...el, rotate: place(((deg + 180) % 360) - 180) }), false);
    } else if (d.kind === 'crop') {
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
  const endDrag = (e?: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    // a writing dragged far enough comes off the flow where the hand let go; a mere press leaves it be
    if (d && d.kind === 'lift' && e && Math.hypot(e.clientX - d.px, e.clientY - d.py) >= 4) liftWriting(d.w, e.clientX - d.px, e.clientY - d.py);
  };

  /**
   * A writing of the page's own, off the flow and into a box of its own.
   *
   * "The writings that sync from the form: movable and editable on the
   * page." The box reads what the writing read — the same answer on the
   * form, the same word of the design's — so it stays in step; it is placed
   * where the writing was plus the drag, set in the role and at the size the
   * writing had; and the page says the writing is off its flow, so the app
   * draws it nowhere. Taking the box off puts the writing back (see remove).
   */
  function liftWriting(wr: Writing, dx: number, dy: number) {
    if (!page || page.drawn) return;
    const b = box();
    if (!b || !b.width) return;
    const id = freeId(doc, 'words');
    // x is the box's middle as a share of the width; y is the gap from the head as a share of the width (decorStyle)
    const x = place(Math.max(0, Math.min(100, wr.x + wr.w / 2 + (dx / b.width) * 100)));
    const y = place(Math.max(0, ((wr.y / 100) * b.height) / b.width * 100 + (dy / b.width) * 100));
    const made: Element = {
      id, kind: 'text', block: wr.role === 'title' ? 'head' : 'free', x, y, w: place(Math.max(12, Math.min(100, wr.w + 2))), anchor: 'top', z: 1, lifted: wr.id,
      lines: [{ role: wr.role, align: 'center', sources: wr.src.length ? wr.src : [{ fixed: { en: wr.text, tl: wr.text } }], size: place(Math.max(1, wr.sizeCqw)) }],
    };
    editPage((pg) => ({ ...pg, elements: [...(pg.elements ?? []), made], offFlow: [...new Set([...(pg.offFlow ?? []), wr.id])] }));
    setSel([id]);
    // the page's own copy goes at once, not after the save that redraws the frame
    const el = flowFrame.current?.contentDocument?.querySelector<HTMLElement>(`[data-page="${page.key}"] [data-w="${wr.id}"]`);
    if (el) el.style.display = 'none';
  }

  /** Double-click on a writing: the part it belongs to opens in the Invitation drawer, at the words themselves. */
  function editWriting(wr: Writing) {
    const part = wr.id.split('.')[0];
    if (part in SECTION_BY_KEY) setAsked(part as SectionKey);
    openDrawer('invitation');
  }

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
    if (ref) {
      /*
       * In the customer's own words where the occasion has the field, since
       * this is what an empty box says on the canvas and what the layers
       * list calls every box. `childFull · cover` was the shape of the
       * document; "Child's full name" is the shape of the question.
       */
      const where = ref.index === undefined ? '' : ` ${ref.index + 1}`;
      const field = fieldOf(ref, p.occasion);
      const named = field?.label ?? ref.sub ?? ref.field;
      const section = ref.section in SECTION_BY_KEY ? sectionLabel(ref.section as SectionKey, p.occasion) : ref.section;
      return `${named}${where} · ${section}`;
    }
    if (el.kind === 'photo') return 'A picture of yours';
    if (el.kind === 'video') return 'The design’s own clip';
    if (el.kind === 'moment') return `${momentName(el.moment, el.variant)} — ${MOMENT_BY_KEY[el.moment]?.photos.count ? 'a picture of yours opens it' : 'tap to open'}`;
    /*
     * A box of words with no question behind it is not empty: it holds the
     * design's own word for a section, or words typed straight into it. The
     * seeded headings made calling those "Empty" plainly wrong, and the
     * layers list is the one place a box is named before it is clicked.
     */
    if (el.kind === 'text') {
      const first = el.lines.flatMap((l) => l.sources)[0];
      if (first && 'fixed' in first && first.fixed.en) return `“${first.fixed.en}”`;
      if (first && 'word' in first) {
        const w = first.word;
        return w.startsWith('title:')
          ? titleLabel(w.slice(6) as TitleKey, p.occasion)
          : lineLabel(w as LineKey, p.occasion);
      }
      if (first && 'copy' in first) return first.copy;
    }
    return 'Empty';
  }, [p.occasion]);

  // --- the page's own numbers ------------------------------------------------

  /** What this design asks for, recomputed as she draws. */
  const asks = useMemo(() => asksOf(doc, p.occasion), [doc, p.occasion]);
  const counts = askCounts(asks);
  /**
   * What is still wrong with it, the same list the publish screen reads. It
   * is recomputed on every change because it is pure and cheap, and because
   * a checklist that lags is worse than none.
   */
  const needs = useMemo(
    () => pageNeeds({ doc, occasion: p.occasion, content: demoContent, weights: p.weights, lengths: p.lengths, shop: p.shop }),
    [doc, p.occasion, demoContent, p.weights, p.lengths, p.shop],
  );
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
    // the rectangle is measured zoomed and the faces are not, so it is read back in the page's own pixels
    const width = (box.width || node.getBoundingClientRect().width) / scaleRef.current;
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    const lines = Math.max(1, Math.round(box.height / scaleRef.current / line));
    if (!(width > 0)) return undefined;
    return Math.max(1, Math.floor((width / advance) * lines));
  }, []);

  const ratio = page ? pageRatio(page) : 1;
  const ground = page?.ground;
  const flowKey = page && !page.drawn ? page.key : '';
  /** a page laid out by its words, with the guest page under it: the stage is clear glass over the frame */
  // every design has a frame to draw on now — its demo, a customer, or the form's stand-in
  const framed = Boolean(flowKey);
  const stageStyle: CSSProperties = {
    width: column,
    // a page that grows is at least its ground and taller when its words are,
    // so the canvas gives it a floor where a fixed page gets a proportion
    ...(page?.drawn
      ? (page.grow ? { minHeight: Math.max(column * ratio, grown + column * 0.04) } : { aspectRatio: `1 / ${ratio}` })
      // exactly the page box in the frame under it, whatever the stylesheet gives a page of this name
      : { height: flowBox.height || column * 1.2, minHeight: 0, padding: 0, boxSizing: 'border-box' as const }),
    // its own stacking context, so what is drawn under the words stays in the page
    isolation: 'isolate',
    ...(framed
      ? { background: 'transparent' }
      : ground && isPicture(ground)
        ? { backgroundImage: `url(${ground.url})`, backgroundSize: '100% 100%' }
        : ground ? { background: colourOf(ground.color, vars) } : {}),
  };
  /** the design's own surround — the colour beside the column, and a picture behind the whole page — for the canvas around a drawn page */
  const ownVars = designVars(doc);
  /*
   * The colour beside a page placed by hand, on the canvas around it. A page
   * laid out by its words has it from the frame under the canvas, which is
   * the guest page and lays its own band (PageGround); the canvas over it is
   * clear glass, so it is drawn here only where there is no frame.
   */
  const beside = page && !framed ? outsideOf(page) : undefined;
  const besideVars = beside ? { ['--inv-outside' as string]: `linear-gradient(${colourOf(beside, vars)}, ${colourOf(beside, vars)})` } : {};

  /*
   * The columns. Bringing a page in is one screen: the properties column
   * steps aside rather than describing a page she is not looking at. And
   * the form wants more room than a list of pages does — its fields are the
   * tab's, drawn at the tab's width — so the left column widens with it.
   */
  const wholeSlug = sample === 'real' && real ? real.slug : p.demoSlug;
  /*
   * Both frames are the real guest page, drawn from the draft, against
   * whoever the canvas is drawn against and by day or by night as the
   * canvas is: a made-up sample is asked for by name and the server makes
   * the same one. `shown` is bumped when the draft saves, and the address
   * changes with it, so the frame is re-pointed rather than remade — the
   * last page stays up until the new one paints, where a new element
   * would be a white box in between.
   */
  /*
   * A design with no demo of its own — every design made a minute ago — is
   * drawn on the form's stand-in instead: the preview route puts this
   * design over an invitation of the same occasion. Before this the canvas
   * of a new design was simply empty, which is not a canvas.
   */
  const frameBase = wholeSlug ? `/${wholeSlug}?bare=1&design=draft` : `/preview/template/${p.templateId}?design=draft`;
  const wholeSrc = useMemo(() => {
    const q = new URLSearchParams();
    if (sample !== 'demo' && sample !== 'real') q.set('sample', sample);
    if (night) q.set('mode', 'night');
    const qs = q.toString();
    return qs ? `${frameBase}&${qs}` : frameBase;
  }, [frameBase, sample, night]);
  const screen = VIEWS.find((v) => v.key === size)?.screen ?? 844;
  /** the frame is being drawn again: from the address changing until it has loaded */
  const [drawing, setDrawing] = useState(false);
  /** the page's own writings, as the frame drew them, for the handles that lift one off the flow */
  const [writings, setWritings] = useState<Writing[]>([]);
  const flowSrc = useMemo(() => {
    if (!flowKey) return '';
    const q = new URLSearchParams({ page: flowKey, screen: String(screen), v: String(shown) });
    if (sample !== 'demo' && sample !== 'real') q.set('sample', sample);
    if (night) q.set('mode', 'night');
    return `${frameBase}&${q}`;
  }, [frameBase, flowKey, screen, sample, night, shown]);
  /** Where the page sits in its frame and how tall it is: the frame is same-origin, so it is simply read. */
  const sizeFlow = useCallback(() => {
    const win = flowFrame.current?.contentWindow;
    // the page asked for, not the first: a page on a picture that runs on from above is drawn with those pages over it
    const pg = win?.document.querySelector<HTMLElement>(`[data-page="${flowKey}"]`) ?? win?.document.querySelector<HTMLElement>('[data-page]');
    if (!win || !pg) return;
    const r = pg.getBoundingClientRect();
    const top = r.top + win.scrollY;
    setFlowBox((was) => (Math.abs(was.top - top) < 0.5 && Math.abs(was.height - r.height) < 0.5 ? was : { top, height: r.height }));
    /*
     * The floats, where the words let them land. A float is the one thing on
     * the canvas the studio does not draw — it is in among the words inside
     * the frame — so its handle is put over the box the frame gave it,
     * measured here in the page's own percentages like every other box.
     */
    if (r.width > 0 && r.height > 0) {
      const col = pg.querySelector<HTMLElement>('.inv-flow') ?? pg;
      const cr = col.getBoundingClientRect();
      if (cr.width > 0) {
        const next = { left: place(((cr.left - r.left) / r.width) * 100), width: place((cr.width / r.width) * 100) };
        setFlowCol((was) => (Math.abs(was.left - next.left) < 0.1 && Math.abs(was.width - next.width) < 0.1 ? was : next));
      }
      const found: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const node of Array.from(pg.querySelectorAll<HTMLElement>('.inv-bb-float[data-el]'))) {
        const fr = node.getBoundingClientRect();
        found[node.dataset.el!] = {
          x: ((fr.left - r.left) / r.width) * 100,
          y: ((fr.top - r.top) / r.height) * 100,
          w: (fr.width / r.width) * 100,
          h: (fr.height / r.height) * 100,
        };
      }
      setFlowBoxes((was) => {
        const keys = Object.keys(found);
        const same = keys.length === Object.keys(was).length
          && keys.every((k) => was[k] && Math.abs(was[k].x - found[k].x) < 0.1 && Math.abs(was[k].y - found[k].y) < 0.1 && Math.abs(was[k].w - found[k].w) < 0.1);
        return same ? was : found;
      });
    }
    /*
     * A picture pinned to the screen is a layer fixed to the frame's
     * window — and the frame's window is the whole page, of which the
     * canvas shows this page's box. The layer is told the box, so the
     * picture fills it as it would fill a screen, and the layer's own
     * measuring is asked to run again over the new box.
     */
    const pinsLayer = win.document.querySelector<HTMLElement>('.inv-pins');
    if (pinsLayer) {
      pinsLayer.style.top = `${top}px`;
      pinsLayer.style.height = `${r.height}px`;
      pinsLayer.style.bottom = 'auto';
      win.dispatchEvent(new Event('resize'));
    }
    /*
     * The page's own writings, where the frame drew them. Each is a handle
     * on the canvas she can drag off the flow into a box of its own. The
     * role is read off the class the renderer set, so the box is set the
     * way the writing was; the size off the computed font, as a share of
     * the width, for the same reason.
     */
    if (r.width > 0) {
      const roleOf = (el: HTMLElement): LineRole => {
        const c = el.className;
        if (c.includes('inv-title') || c.includes('inv-names')) return 'title';
        if (c.includes('inv-display')) return 'script';
        if (c.includes('inv-eyebrow')) return 'eyebrow';
        if (c.includes('inv-tagline')) return 'sub';
        if (c.includes('inv-venue-name')) return 'label-title';
        if (c.includes('inv-hero-date')) return 'label-text';
        return 'body';
      };
      const found: Writing[] = [];
      for (const el of Array.from(pg.querySelectorAll<HTMLElement>('[data-w]'))) {
        /*
         * One off the flow is drawn nowhere, so it has no box to measure:
         * it is shown for the measure and hidden again, so that its handle
         * is ready the moment the box that took its place goes.
         */
        const hidden = getComputedStyle(el).display === 'none';
        const was = [el.style.getPropertyValue('display'), el.style.getPropertyPriority('display')] as const;
        if (hidden) el.style.setProperty('display', 'revert', 'important');
        const er = el.getBoundingClientRect();
        if (hidden) el.style.setProperty('display', was[0], was[1]);
        if (!er.width || !er.height) continue;
        let src: Writing['src'] = [];
        try { src = JSON.parse(el.dataset.src || '[]') as Writing['src']; } catch { src = []; }
        found.push({
          id: el.dataset.w || '', src, role: roleOf(el), text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          x: ((er.left - r.left) / r.width) * 100, y: ((er.top - r.top) / r.height) * 100, w: (er.width / r.width) * 100, h: (er.height / r.height) * 100,
          sizeCqw: (parseFloat(getComputedStyle(el).fontSize) / r.width) * 100,
        });
      }
      setWritings(found);
    }
  }, [flowKey]);
  useEffect(() => { if (flowSrc) setDrawing(true); }, [flowSrc]);
  /**
   * The theme, on the frame, the moment she picks it.
   *
   * The frame is the guest page — its own document, drawn by the server in
   * the theme the row holds — so the faces and colours she is *trying* in
   * the Theme popover reached the canvas around it and nothing inside it.
   * On a page laid out by its words, which is every page the frame draws,
   * that is the whole page: she changed the faces and saw no change, which
   * is what she said. So the variables are written onto the frame's own
   * invitation, and the stylesheet that carries every face we offer is put
   * in its head — the frame's page loads only the faces the saved theme
   * asks for, and a face she has not saved yet is not among them.
   *
   * Same-origin, so this is a write rather than a message. It runs again on
   * every reload of the frame, because a reload is the server's answer and
   * carries the saved theme, not the one she is trying.
   */
  const paintFrame = useCallback(() => {
    const doc = flowFrame.current?.contentDocument;
    if (!doc) return;
    if (!doc.getElementById('studio-faces')) {
      const link = doc.createElement('link');
      link.id = 'studio-faces';
      link.rel = 'stylesheet';
      link.href = p.theme.facesUrl;
      doc.head?.appendChild(link);
    }
    for (const el of [doc.querySelector<HTMLElement>('.inv-stage'), doc.querySelector<HTMLElement>('.inv')]) {
      if (!el) continue;
      for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    }
  }, [vars, p.theme.facesUrl]);
  useEffect(() => { if (framed) paintFrame(); }, [framed, paintFrame, flowKey, drawing]);
  /*
   * At once, not after the save. The frame is the guest page and it is
   * same-origin, so a colour, the colour beside the page and a height are
   * put on it the moment they are picked; the save that follows redraws the
   * page from the draft and lands on the same thing. Without this a colour
   * took two seconds to show, and two seconds reads as "nothing happened".
   */
  useEffect(() => {
    if (!framed || !page) return;
    const win = flowFrame.current?.contentWindow;
    const pg = win?.document.querySelector<HTMLElement>(`[data-page="${page.key}"]`);
    if (!win || !pg) return;
    /*
     * The floats, as she drags them. They live in the frame, so without this
     * the handle moved and the picture stayed where the last save left it —
     * two seconds of the page disagreeing with her hand. The place is the
     * same one `FlowFloats` writes, so what she sees while dragging is what
     * the save lands on.
     */
    for (const el of flowFloats(page)) {
      const node = win.document.querySelector<HTMLElement>(`.inv-bb-float[data-el="${CSS.escape(el.id)}"]`);
      if (!node) continue;
      const shape = floatShape(el.aspect ?? 1, el.rotate ?? 0);
      const at = floatAt(el, (el.w ?? 40) * shape.width);
      node.dataset.float = at.side;
      node.style.setProperty('--float-x', `${at.inset}%`);
      node.style.setProperty('--float-y', `${at.down}%`);
    }
    const g = page.ground;
    // a page on a picture pinned to the screen is see-through: its colour waits (pinOf)
    pg.style.background = g && !isPicture(g) && !pins.has(page.key) ? colourOf(g.color, vars) : '';
    /*
     * The page's height and its size, written as the attribute and the
     * variable the frame's own stylesheet reads rather than as a zoom and a
     * height of our own. That matters for the size: it is the website's
     * size, and the stylesheet only applies it above the phone's window
     * (`[data-size]`), so handing it over this way is what makes the phone
     * view show the page whole and the website view show it at the size she
     * set — with no width test written twice.
     */
    const screens = screensOf(page);
    const size = sizeOf(page);
    if (size === undefined) { delete pg.dataset.size; pg.style.removeProperty('--page-size'); }
    else { pg.dataset.size = ''; pg.style.setProperty('--page-size', String(size)); }
    if (screens) { pg.dataset.min = ''; pg.style.setProperty('--page-min', String(screens)); }
    else { delete pg.dataset.min; pg.style.removeProperty('--page-min'); }
    pg.style.zoom = '';
    pg.style.minHeight = '';
    const beside = outsideOf(page);
    const stage = win.document.querySelector<HTMLElement>('.inv-stage');
    if (stage) {
      if (beside) stage.style.setProperty('--inv-outside', `linear-gradient(${colourOf(beside, vars)}, ${colourOf(beside, vars)})`);
      else stage.style.removeProperty('--inv-outside');
    }
  }, [framed, page, vars, pins]);
  /** Measured on arrival, and again as its pictures and faces come in, which the page grows with. */
  const flowLoaded = useCallback(() => {
    setDrawing(false);
    paintFrame();
    sizeFlow();
    flowWatch.current?.disconnect();
    const doc = flowFrame.current?.contentDocument;
    if (!doc || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sizeFlow);
    ro.observe(doc.documentElement);
    for (const pg of Array.from(doc.querySelectorAll('[data-page]'))) ro.observe(pg);
    flowWatch.current = ro;
  }, [sizeFlow, paintFrame]);
  useEffect(() => () => flowWatch.current?.disconnect(), []);
  /**
   * How tall this page came out, in screens of the view she is looking at.
   *
   * Measured, not worked out: the height of a page laid out by its words is
   * whatever the words make it, and no number in the document can say it in
   * advance. The frame is the guest's own markup at the view's width, so
   * this is the number a guest gets.
   */
  const pageScreens = useMemo(
    () => (page && !page.drawn && flowBox.height > 0 && screen > 0 ? place(flowBox.height / screen) : undefined),
    [page, flowBox.height, screen],
  );
  /**
   * "Fit it to one screen": the size that brings this page inside the height
   * it asked for.
   *
   * Tried against the page rather than worked out in one go, because a page
   * of words does not shrink in a straight line: a narrower column wraps its
   * lines differently, so the height at half the size is not half the height.
   * One sum on this page undershot by 2% — 815px into an 800px screen, close
   * but still scrolling, and "Fit it to one screen" that leaves the page a
   * hair too tall is not the promise.
   *
   * So the size is written into the frame, the height read back — reading a
   * rect makes the browser lay the page out, so the number is the truth and
   * not a guess — and the sum done again on it. Three passes is plenty; the
   * frame is put back as it was either way, and the document is what moves
   * the canvas in the end (`paintFrame`).
   */
  const fitPage = useCallback(() => {
    if (!page || page.drawn || size === 'phone') return;
    const win = flowFrame.current?.contentWindow;
    const pg = win?.document.querySelector<HTMLElement>(`[data-page="${page.key}"]`) ?? win?.document.querySelector<HTMLElement>('[data-page]');
    if (!pg) return;
    const had = pg.dataset.size !== undefined ? pg.style.getPropertyValue('--page-size') : undefined;
    const asked = screensOf(page) ?? 1;
    let to = sizeOf(page) ?? 1;
    for (let pass = 0; pass < 3; pass += 1) {
      // the attribute and the variable, not a zoom of our own, so the trial reads the page the way a guest's laptop will
      if (to === 1) { delete pg.dataset.size; pg.style.removeProperty('--page-size'); }
      else { pg.dataset.size = ''; pg.style.setProperty('--page-size', String(to)); }
      const next = sizeToFit(pg.getBoundingClientRect().height, screen, to, asked);
      if (next === to) break;
      to = next;
    }
    if (had === undefined) { delete pg.dataset.size; pg.style.removeProperty('--page-size'); }
    else { pg.dataset.size = ''; pg.style.setProperty('--page-size', had); }
    editPage((pgSpec) => { const next: PageSpec = { ...pgSpec, size: to }; if (to === 1) delete next.size; return next; });
  }, [page, screen, size, editPage]);
  // another page is another height; until it is measured the canvas guesses, as it always did
  useEffect(() => { setFlowBox({ top: 0, height: 0 }); }, [flowKey]);
  const columns = view === 'import'
    ? (drawer === 'invitation' ? 'lg:grid-cols-[26rem_1fr]' : 'lg:grid-cols-[15rem_1fr]')
    : (drawer === 'invitation' ? 'lg:grid-cols-[26rem_1fr] 2xl:grid-cols-[26rem_1fr_19rem]' : 'lg:grid-cols-[15rem_1fr_19rem]');
  // With the form open a laptop has no room for three columns and a page
  // wide enough to read: the properties column waits until she is back on
  // the Pages list, or the screen is wide enough for all three.
  const propsAside = view === 'import' ? 'hidden' : drawer === 'invitation' ? 'hidden 2xl:block' : '';

  /**
   * What she edits is what she sees. The drawer edits an invitation, and a
   * made-up sample is nobody's, so opening it over one puts the demo back
   * on the canvas; a customer already there stays.
   */
  const openDrawer = (k: typeof drawer) => {
    setDrawer(k);
    if (k === 'invitation' && sample !== 'demo' && sample !== 'real') setSample(real ? 'real' : 'demo');
  };

  return (
    <div className={`grid gap-3 ${columns}`}>
      {/*
        * Every face of every set, in one request, so the font menu can be
        * drawn in the faces it offers and a set she tries takes effect on
        * the canvas. Loaded the first time she opens the popover and left
        * loaded after that: forty families is twenty kilobytes of
        * stylesheet, and it is not worth asking for twice.
        *
        * Plainly, with no `precedence`: a stylesheet React is asked to
        * manage is one it waits for before it will show the popover at all,
        * and a menu of faces is not worth a studio that stalls on a slow
        * connection or a request that fails. The faces arrive when they
        * arrive, and until they do the menu is in the fallback.
        */}
      {faces && <link rel="stylesheet" href={p.theme.facesUrl} />}
      <TopBar {...p} state={state} error={error} rev={rev} doc={doc} onSave={() => void save(doc)} />

      {/* the pages */}
      <aside
        className="card h-fit p-2"
        // not while the form is open: a photograph dropped on one of its
        // fields is the customer's, not a page of the design
        onDragOver={(e) => { if (drawer !== 'invitation' && e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={(e) => { if (drawer !== 'invitation' && e.dataTransfer.files.length) { e.preventDefault(); void addSheets([...e.dataTransfer.files]); } }}
      >
        {/* the pages, the invitation's own form, or the pieces any design can be built from */}
        <div className="mb-1 flex gap-1 text-xs">
          {([['pages', 'Pages'], ['invitation', 'Invitation'], ['library', 'Library'], ['guide', 'Guide']] as const).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => openDrawer(k)}
              className={`rounded px-2 py-1 ${drawer === k ? 'bg-[color:var(--color-sand-200)] font-semibold' : 'text-[color:var(--color-ink-500)] hover:bg-[color:var(--color-sand-100)]'}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {drawer === 'guide' ? (
          <GuideDrawer />
        ) : drawer === 'invitation' ? (
          /*
           * The Invitation tab's form, beside the canvas. It edits the
           * invitation on the canvas and saves to it as the tab does; the
           * design's own draft is saved separately, by the bar above.
           */
          editing ? (
            <InvitationDrawer
              invitationId={editing}
              title={real && editing === real.id ? `${real.title} · ${real.tier.toLowerCase()}` : `The demo — ${p.demoTitle}`}
              asked={asked}
              onStep={setAsked}
              onShown={follow}
              onDraft={(id, section, data) => setDraft({ id, section, data })}
              onSaved={folded}
              onError={(message) => setAgainst((a) => ({ ...a, error: message }))}
            />
          ) : (
            <p className="hint px-1 py-2">This design has no demo invitation, so there is nothing to fill in. Give it one on the template&rsquo;s own page.</p>
          )
        ) : drawer === 'library' ? (
          <LibraryDrawer
            selected={selected}
            onPlace={(url, aspect, animated) => void placePiece(url, aspect, animated)}
            onGround={(url) => void groundFromPiece(url)}
            onIfEmpty={(url) => { if (selected?.kind === 'photo') editEls([selected.id], (e) => ({ ...e, ifEmpty: { piece: url } })); }}
            onRule={page && !page.drawn ? (url) => setDress((d) => ({ ...d, rule: url })) : undefined}
            onStrand={(url) => setStrand(url)}
          />
        ) : (
        <>
        <div className="flex items-center justify-between px-1">
          <p className="label">Pages</p>
          <span className="flex gap-1">
            <button type="button" title="A new page after this one, carrying a part not yet on a page" aria-expanded={adding} onClick={() => setAdding((v) => !v)} className={`rounded px-2 text-sm leading-6 ${adding ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}>+</button>
            <button type="button" title="A copy of this page after it" onClick={() => page && addPage(page)} className="rounded bg-[color:var(--color-sand-200)] px-2 text-xs leading-6">copy</button>
          </span>
        </div>
        {adding && (
          <div className="mx-1 mt-1 rounded-lg border border-[color:var(--color-sand-300)] bg-[color:var(--color-sand-100)] p-2 text-xs" data-testid="add-page">
            <p className="mb-1 font-semibold">What will the new page carry?</p>
            {unplaced.length ? (
              <ul className="space-y-0.5">
                {unplaced.map((k) => (
                  <li key={k.key}><button type="button" onClick={() => { addPage(undefined, k.key); setAdding(false); }} className="w-full rounded px-2 py-1 text-left hover:bg-white">{k.label}</button></li>
                ))}
              </ul>
            ) : (
              <p className="hint">Every part is on a page already.</p>
            )}
            <button type="button" onClick={() => { addPage(); setAdding(false); }} className="mt-1 w-full rounded px-2 py-1 text-left text-[color:var(--color-ink-700)] hover:bg-white">A page with no part &mdash; artwork or a picture on its own</button>
            <button type="button" onClick={() => setAdding(false)} className="mt-1 w-full rounded px-2 py-1 text-left text-[color:var(--color-ink-500)] hover:bg-white">Cancel</button>
          </div>
        )}
        <CopyFrom templateId={p.templateId} onCopy={addBrought} />
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
                  style={pg.ground && isPicture(pg.ground) ? { backgroundImage: `url(${pg.ground.url})` } : { background: pg.ground ? colourOf(pg.ground.color, vars) : 'var(--color-sand-200)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{pg.label?.en ?? pg.key}</span>
                  <span className="block text-[11px] text-[color:var(--color-ink-500)]">
                    {i + 1}. {pg.drawn ? 'drawn' : 'flows'}{runs.has(pg.key) ? ' · on the picture above' : ''}{pg.elements?.length ? ` · ${pg.elements.length}` : ''}
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
        {said && <p className="hint mt-1">{said}</p>}
        <HidesPanel occasion={p.occasion} hides={doc.hides ?? []} onToggle={toggleHide} />
        <ColoursPanel doc={doc} onColumn={setColumnColour} onNight={setNightColour} onSurroundArt={setSurroundArt} />
        <PaperPanel doc={doc} onSheet={setSheet} />
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
        </>
        )}

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
      <section ref={canvasRef} className="card min-w-0 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" onClick={() => setSize(v.key)} className={`rounded px-2 py-1 ${size === v.key ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}>{v.label}<span className="ml-1 opacity-60">{v.hint}</span></button>
          ))}
          <span className="mx-1 h-4 w-px bg-[color:var(--color-sand-300)]" />
          <button type="button" title="Zoom out" onClick={() => setZoom(Math.max(0.25, Math.round((scale - 0.1) * 10) / 10))} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">&minus;</button>
          <span className="w-10 text-center tabular-nums" data-testid="zoom">{Math.round(scale * 100)}%</span>
          <button type="button" title="Zoom in" onClick={() => setZoom(Math.min(2, Math.round((scale + 0.1) * 10) / 10))} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+</button>
          <button type="button" title="Fit the whole width" onClick={() => setZoom('fit')} className={`rounded px-2 py-1 ${zoom === 'fit' ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}>Fit</button>
          <span className="mx-1 h-4 w-px bg-[color:var(--color-sand-300)]" />
          {view === 'page' ? (
            <>
              {/* on a page laid out by its words a box of words hangs off its head or foot, over the section's own: see flowDecor */}
              <button type="button" onClick={() => addElement('text')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Words</button>
              <button type="button" onClick={() => addElement('photo')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Photo frame</button>
              <button type="button" onClick={() => addElement('shape')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Shape</button>
              <button type="button" onClick={() => addElement('frame')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">+ Frame</button>
              <button type="button" data-testid="add-moment" title="A thing a guest taps, swipes or holds: the envelope, the doors, the instant camera" onClick={() => setMomentSheet((o) => !o)} className={`rounded px-2 py-1 ${momentSheet ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}>+ Moment</button>
              <AddMoving templateId={p.templateId} onAdd={addMoving} />
              <AddAnim templateId={p.templateId} onAdd={addAnim} />
              <AddClip templateId={p.templateId} onAdd={addClip} />
              {momentSheet && <MomentSheet occasion={p.occasion} onPick={(e) => { addElement('moment', e); setMomentSheet(false); }} onClose={() => setMomentSheet(false)} />}
            </>
          ) : (
            <button type="button" onClick={() => setShown((n) => n + 1)} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">Draw it again</button>
          )}
          <span className="ml-auto" />
          {/*
            * What the canvas is doing, said where she is looking. A page laid
            * out by its words is drawn from the saved draft, so a change is
            * seen a moment after her hand stops — and until this said so,
            * that moment read as nothing having happened.
            */}
          {view === 'page' && framed && (
            <span data-testid="redraw" aria-live="polite" className={`rounded-full px-2 py-0.5 text-[11px] ${state === 'error' ? 'bg-red-50 text-red-800' : state === 'dirty' || state === 'saving' || drawing ? 'bg-amber-50 text-amber-900' : 'bg-[color:var(--color-sand-100)] text-[color:var(--color-ink-500)]'}`}>
              {state === 'error' ? 'Not saved' : state === 'dirty' ? 'Changed · saving in a moment' : state === 'saving' ? 'Saving…' : drawing ? 'Redrawing the page…' : 'The page as saved'}
            </span>
          )}
          {view === 'page' && page?.drawn && (
            <button
              type="button"
              title="Lines only: where words are safe on the narrowest phone, where a phone's edges fall, where the browser's own bar sits, and whatever the checklist says about this page"
              onClick={() => setGuide((x) => !x)}
              className={`rounded px-2 py-1 ${guide ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}
            >
              Phone guide
            </button>
          )}
          {view === 'page' && (
            <>
              <select
                title="Who the page is drawn against. A sample is what the canvas draws and nothing more; the Invitation drawer saves to the invitation itself."
                value={sample === 'real' && real ? `inv:${real.id}` : sample}
                onFocus={() => void loadTheirs()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith('inv:')) void drawAgainst(v.slice(4));
                  else { setSample(v as Sample); setAgainst({ busy: false, error: '' }); }
                }}
                className="rounded bg-[color:var(--color-sand-200)] px-2 py-1"
              >
                {SAMPLES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                <optgroup label="An invitation on this design">
                  {/* the one on the canvas, before the list has been asked for and when the list does not reach it */}
                  {real && !theirs?.some((t) => t.id === real.id) && <option value={`inv:${real.id}`}>{invitationName(real)}</option>}
                  {theirs === null
                    ? <option value="" disabled>{against.busy ? 'finding them…' : 'open again to list them'}</option>
                    : theirs.length === 0
                      ? <option value="" disabled>none built on this design yet</option>
                      : theirs.map((t) => <option key={t.id} value={`inv:${t.id}`}>{invitationName(t)}</option>)}
                </optgroup>
              </select>
              {against.error && <span className="text-[11px] text-[color:var(--bad)]">{against.error}</span>}
              {sample === 'real' && real && (
                <button type="button" onClick={() => openDrawer('invitation')} className="rounded bg-[color:var(--color-sand-200)] px-2 py-1">Edit their details</button>
              )}
            </>
          )}
          {/*
            * The theme. Its button sits with Day and Night because all three
            * are about how the page looks rather than what is on it — but
            * unlike those two this one can be saved, and what it saves is
            * felt by every invitation on the design, which the popover says.
            * It opens to the right, over the panel, because the one thing
            * she must be able to see while she changes a colour is the page.
            */}
          <span className="relative">
            <button
              type="button"
              onClick={() => { setFaces(true); setThemeOpen((o) => !o); }}
              className={`rounded px-2 py-1 ${themeOpen || tried ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-200)]'}`}
            >
              Theme{tried ? ' · trying' : '…'}
            </button>
            {themeOpen && (
              <ThemePopover
                templateId={p.templateId}
                theme={p.theme}
                saved={saved}
                value={tried ?? saved}
                onChange={setTried}
                onSaved={(t) => { setSaved(t); setTried(null); setAfter(varsFor(t)); }}
                onClose={() => setThemeOpen(false)}
              />
            )}
          </span>
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
          <div className="flex justify-center overflow-auto bg-[color:var(--color-sand-100)] p-4">
            {/* the invitation on the canvas — a customer's when she is drawing against one — as the draft design serves it, at the view's width */}
            <div style={{ zoom: scale } as CSSProperties}>
              <iframe
                key={shown}
                ref={frame}
                title="The whole invitation"
                src={wholeSrc}
                onLoad={showPage}
                className="shadow-lg"
                style={{ width, height: size === 'website' ? 800 : 780, border: 0, background: '#fff' }}
              />
            </div>
          </div>
        )}

        <div className={`justify-center overflow-auto bg-[color:var(--color-sand-100)] p-4 ${view === 'page' ? 'flex' : 'hidden'}`}>
          {/*
            * The browser. The whole website page at the width of the view,
            * zoomed to fit or as she asks. It is the guest page's own stage —
            * the same class, the same variables — so the column sits on the
            * design's surround exactly where a laptop puts it, and a picture
            * behind the whole page runs edge to edge under it. Under a page
            * laid out by its words the frame *is* the page, the whole window
            * of it, and everything of ours over it is clear glass.
            */}
          <div className="inv-stage relative shadow-lg" data-canvas="" style={{ ...vars, ...ownVars, ...besideVars, width, zoom: scale, isolation: 'isolate', ...(framed ? { background: 'transparent' } : {}) } as CSSProperties}>
            {framed && flowSrc && (
              <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: -5, pointerEvents: 'none' }}>
                <iframe
                  ref={flowFrame}
                  title="This page, as a guest sees it"
                  src={flowSrc}
                  onLoad={flowLoaded}
                  tabIndex={-1}
                  style={{ position: 'absolute', left: 0, top: -flowBox.top, width: '100%', height: flowBox.top + (flowBox.height || column * 1.2), border: 0, background: 'transparent' }}
                />
              </div>
            )}
            {/*
              * `data-motion` here and not from the island: the canvas is not
              * a guest's page and she is drawing, so what she needs is to see
              * the idling and to be able to replay an arrival on demand. Every
              * element is marked arrived a frame after it is drawn (below), so
              * nothing she places is invisible while she places it.
              */}
            <div className="inv" data-layout={p.layout} data-doc="" data-paged="" data-motion="" data-mode={night ? 'night' : 'day'} style={{ ...vars, minHeight: 0, ...(framed ? { background: 'transparent' } : {}) } as CSSProperties} lang="en">
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
                {/*
                  * A drawn page is its elements. A page laid out by its words
                  * is its decorations here, over the page itself: its words
                  * are its customer's and their height is not known until the
                  * browser has laid them out, so the guest page lays them out
                  * in the frame under the browser box above and this canvas
                  * takes its height from it. (One frame, not two: a second
                  * copy of the same frame used to sit inside the page as
                  * well, loading the page twice and hiding the colour beside
                  * it.) The band is the page's width, and every decoration on
                  * it hangs off an edge by a share of that width — so what she
                  * sees here is exactly where it will be, on a page whose
                  * height is the only part this canvas has to guess.
                  */}
                {page && (page.drawn
                  ? <DrawnPage page={page} content={shownContent} look={p.look} lang="en" occasion={p.occasion} parts={p.parts} edit={{ label, cropping: fit?.id, playing: sel.length === 1 ? sel[0] : undefined }} />
                  : (['under', 'over'] as const).map((layer) => (
                    <FlowDecor key={layer} page={page} content={shownContent} look={p.look} lang="en" occasion={p.occasion} layer={layer} edit={{ label, cropping: fit?.id, playing: sel.length === 1 ? sel[0] : undefined }} />
                  )))}
                {/*
                  * The handles, over the real page. The layer itself lets the
                  * pointer through, so a click on bare ground still deselects;
                  * each handle takes it back. Without the layer the frames'
                  * own photographs sit on top and nothing can be grabbed.
                  */}
                {/*
                  * The phone guide. Hairlines and a set of rings, all of them
                  * over the page and none of them in it: the layer takes no
                  * pointer, so it cannot get between her and a box, and
                  * nothing is shaded or striped over what she is drawing.
                  *
                  * The gutter is the same number the checklist measures words
                  * against (`GUTTER`), so the line on the page and the
                  * sentence in the drawer can never disagree. The bar is a
                  * tenth of a screen — the browser's number, not the
                  * page's — so nothing on the page is measured from it, and
                  * it is only drawn on a page of a screen or less, which is
                  * the only page a bar can cover.
                  */}
                {/*
                  * The same guide over a page laid out by its words, which
                  * until now showed none: she was editing at website width
                  * with nothing on the canvas to say what a phone would do
                  * with it, and asked for exactly this.
                  *
                  * Lines, and nothing else. A guide that shades or stripes
                  * the page is a guide she has to look through to judge
                  * what she is drawing — "it should only be a guide", in
                  * her words — so each limit is one hairline and the design
                  * underneath is untouched: the two the words want to stay
                  * inside, the two where a phone's edges fall at website
                  * width, and one where a phone browser's own bar cuts off
                  * the first screen.
                  */}
                {framed && guide && (
                  <div aria-hidden data-testid="flow-guide" style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none', overflow: 'hidden' }}>
                    {[GUTTER, 100 - GUTTER].map((at) => (
                      <div key={at} style={{ position: 'absolute', top: 0, bottom: 0, left: `${at}%`, width: 0, borderLeft: '1px dashed rgba(47,111,208,0.5)' }} />
                    ))}
                    {column > PHONE_VIEW && [(column - PHONE_VIEW) / 2, column - (column - PHONE_VIEW) / 2].map((at) => (
                      <div key={at} style={{ position: 'absolute', top: 0, bottom: 0, left: at, width: 0, borderLeft: '1px solid rgba(31,29,26,0.35)' }} />
                    ))}
                    {flowBox.height > screen * 0.5 && (
                      <div style={{ position: 'absolute', left: 0, right: 0, top: Math.round(screen * (1 - BROWSER_BAR)), height: 0, borderTop: '1px dashed rgba(31,29,26,0.45)' }} />
                    )}
                  </div>
                )}
                {page?.drawn && guide && (
                  <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' }}>
                    {[GUTTER, 100 - GUTTER].map((at) => (
                      <div key={at} style={{ position: 'absolute', top: 0, bottom: 0, left: `${at}%`, width: 0, borderLeft: '1px dashed rgba(47,111,208,0.5)' }} />
                    ))}
                    {ratio <= ONE_SCREEN + 0.02 && (
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(BROWSER_BAR / ratio) * 100}%`, height: 0, borderTop: '1px dashed rgba(31,29,26,0.45)' }} />
                    )}
                    {/*
                      * And the checklist, on the page. A ring where a line is
                      * about a box, red where it blocks and amber where it is
                      * hers to ignore, so "Milestone 2 is too small to read on
                      * a phone" has somewhere to point.
                      */}
                    {here.map((n) => {
                      const at = n.id ? boxes[n.id] : undefined;
                      if (!at) return null;
                      const bad = n.level === 'blocks';
                      return (
                        <div
                          key={`${n.rule}-${n.id}`}
                          title={n.text}
                          style={{
                            position: 'absolute', left: `${at.x}%`, top: `${at.y}%`, width: `${at.w}%`, height: `${at.h}%`,
                            outline: `2px dashed ${bad ? 'rgba(185,28,28,0.85)' : 'rgba(180,83,9,0.75)'}`,
                            outlineOffset: 2, borderRadius: 2,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                {page && (page.drawn || pieces.decor.length > 0 || writings.length > 0) && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
                    <Ties elements={elements} boxes={boxes} on={chosen} />
                    {/* on a page laid out by its words the floats are among the words, in the frame, and only the decorations have handles here */}
                    {(page.drawn ? elements : [...pieces.floats, ...pieces.decor]).map((el) => (
                      <Handle
                        key={el.id}
                        el={el}
                        at={boxes[el.id] ?? wouldFloat(el)}
                        on={chosen.has(el.id)}
                        solo={sel.length === 1}
                        fitting={fit ? (fit.id === el.id ? 'this' : 'other') : undefined}
                        onDown={(e) => (fit ? startPan(e, el) : startMove(e, el))}
                        onSize={(e) => startSize(e, el)}
                        onTurn={(e) => startTurn(e, el)}
                        onFit={() => startFit(el.id)}
                      />
                    ))}
                    {/*
                      * The page's own writings, each a handle she can drag
                      * off the flow into a box of its own. Faint, and green
                      * rather than the pieces' blue, so what is the app's
                      * and what is hers read apart; one already lifted has
                      * no handle, since the box that took its place has one.
                      */}
                    {!page.drawn && writings.filter((wr) => !(page.offFlow ?? []).includes(wr.id)).map((wr) => (
                      <div
                        key={`w:${wr.id}`}
                        data-writing={wr.id}
                        title={`${wr.text} — drag to take it off the page into a box of its own, still reading the same answer; double-click to edit its words`}
                        onPointerDown={(e) => { e.stopPropagation(); drag.current = { kind: 'lift', w: wr, px: e.clientX, py: e.clientY }; }}
                        onDoubleClick={() => editWriting(wr)}
                        style={{ position: 'absolute', left: `${wr.x}%`, top: `${wr.y}%`, width: `${wr.w}%`, height: `${wr.h}%`, outline: '1px dashed rgba(16, 122, 84, 0.5)', cursor: 'grab', pointerEvents: 'auto' }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {view === 'whole'
          ? <p className="hint mt-2">The design as a guest is served it, from the draft. It is redrawn when the draft saves &mdash; a moment after your hand stops &mdash; and scrolled to the page you are on.{!wholeSlug && ' This design has no demo invitation of its own, so it is drawn on a stand-in of the same occasion; give it a demo under Details to draw it on the real thing.'}</p>
          : view === 'page' && !page?.drawn && (
            <div className="mt-2">
              {/*
                * The sentence somebody reads when they have pressed a button
                * and are asking what happened. It used to offer a way out of
                * the page — drawing it by hand — which left a countdown page
                * as two empty boxes; now it says how to put things on the
                * page as it is.
                */}
              <p className="hint">
                This page is laid out by its words and drawn here as a guest is served it &mdash; the parts it carries, with the words of whoever the canvas is drawn against.
                <strong> + Photo frame</strong>, <strong>+ Words</strong>, <strong>+ Shape</strong>, <strong>+ Frame</strong> and the rest above put a piece on it: it lands just under the head, selected, and you drag it where it goes, from the head or from the foot.
                An empty frame is drawn as a dashed box until a picture is in it, and a piece sits behind the words unless it is set to go over them. A picture the words flow past can be dragged where you want it: the words flow on whichever side of the middle you leave it.
                The page&rsquo;s own writings show a faint green outline: drag one to take it off the flow into a box of its own that still reads the same answer, and it moves and sets like any other box; double-click one to edit its words in the Invitation drawer. Taking the box off (&#x2715;) puts the writing back.
                The parts the app draws &mdash; a countdown, an RSVP form, a map, a film &mdash; stay as they are under the pieces, and a clip you have picked plays where it is.
                A page taller than its words is set on the right, under Background: at least so many screens.
                The page is redrawn from the draft a moment after your hand stops; the label above says when. Its background, the colour beside it, the parts it carries and the pieces on it are on the right. <button type="button" onClick={() => { setView('whole'); if (state === 'dirty') void save(doc); }} className="underline">See it in the whole invitation</button>.
              </p>
            </div>
          )}
        {/*
          * The answer to "if I work at laptop width, will a phone cut it?".
          *
          * It is no, and the reason is worth saying rather than leaving her
          * to find out: the stylesheet caps a drawn invitation at a phone
          * column (32rem) at every window width, and every number in the
          * document is a share of that width — so the page is never laid out
          * twice and nothing is ever re-cut. What changes on a smaller screen
          * is the size of it, which is what the guide's three marks are about.
          */}
        {view === 'page' && page && (
          <p className="hint mt-2">
            {page.drawn
              ? <>This page is the same page at every width: a guest&rsquo;s invitation is never wider than the Laptop 512 above, and everything on the page is a share of that width &mdash; so what you place here lands in the same place on a 360 phone, only smaller. Nothing is cut and nothing moves.{' '}</>
              : <>This page is laid out by its words, so a phone re-wraps them inside a narrower column while the background behind them fills whatever screen it is on. What a phone changes is where the lines break and how much of the background it shows.{' '}</>}
            {guide
              ? <>The guide is lines only, nothing laid over the page: keep words inside the two dashed uprights and a phone will not read them as cut, and the dashed line across is where a phone browser&rsquo;s own bar sits until the guest scrolls. At website width the two solid uprights are where a phone&rsquo;s edges fall. A ring marks anything the checklist has a line about. Switch between the widths above to see how big the writing actually gets.</>
              : <>Turn on <strong>Phone guide</strong> above to see where words are safe, where a phone browser&rsquo;s bar sits, and whatever the checklist says about this page.</>}
          </p>
        )}
      </section>

      {/* what is selected */}
      <aside className={`card h-fit space-y-3 p-3 text-sm ${propsAside}`}>
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
            onReplay={() => replay(selected.id)}
            onPlayMoment={() => playMoment(selected.id)}
            label={label(selected)}
            templateId={p.templateId}
            flow={!page?.drawn}
            onFillPage={() => fillPage(selected.id)}
            measureRoom={() => measureRoom(selected.id)}
            attachable={elements.filter((e) => canAttach(elements, selected.id, e.id)).map((e) => ({ id: e.id, label: label(e) }))}
            grows={Boolean(page?.grow)}
            onFit={() => (fit ? keepFit() : startFit(selected.id))}
            fitting={fit?.id === selected.id}
            vars={vars}
            booklets={bookletNames}
          />
        ) : (
          <PageProps
            page={page}
            booklets={bookletNames}
            onChange={editPage}
            onGround={setGround}
            onBackground={setBackground}
            onRunsOn={setRunsOn}
            words={{
              flowing: writings.map((w) => ({ id: w.id, text: w.text })),
              steady: (page?.elements ?? []).filter((e): e is TextEl => e.kind === 'text' && Boolean(e.lifted)).map((e) => ({ id: e.id, text: nameOfWords(e) })),
              lift: (id) => { const w = writings.find((x) => x.id === id); if (w) liftWriting(w, 0, 0); },
              back: (id) => putBack(id),
              pick: (id) => setSel([id]),
            }}
            pinnedOn={pinnedOn}
            joinedTo={joinedTo ? (doc.pages.find((x) => x.key === joinedTo)?.label?.en || joinedTo) : undefined}
            templateId={p.templateId}
            vars={vars}
            sections={{ offer: sectionOffer, name: nameOf, add: addSection, remove: removeSection, move: moveSection }}
            pieces={{ ...pieces, addFloat, addDecor, pick: (id) => setSel([id]), drop: remove }}
            dress={{ value: page?.sectionStyle, set: setDress }}
            tall={{ screens: pageScreens, fit: fitPage, onPhone: size === 'phone' }}
          />
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopBar({ name, demoSlug, canPublish, templateId, shareLink, state, error, published, back, onSave }: Props & { state: string; error: string; rev: number; doc: DesignDoc; onSave: () => void }) {
  // named, because the Invitation drawer has a saving line of its own on the same screen
  const said: Record<string, string> = { clean: 'Design: no unsaved changes', dirty: 'Design: not saved yet', saving: 'Design: saving…', saved: 'Design draft saved', error: 'Design: not saved' };
  return (
    <div className="card col-span-full flex flex-wrap items-center gap-2 p-3">
      {back && <Link href={back.href} className="btn btn-ghost btn-sm" data-testid="back">&larr; Back to {back.label}</Link>}
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

/**
 * Theme: the six colour roles and the set of faces.
 *
 * Unlike everything else in the studio these two are not part of the design
 * document — they are columns on the row — so they are outside the draft she
 * is drawing and cannot be published: a save is felt by every invitation on
 * this design at once, the live ones included. Which makes the popover two
 * things with a rule between them. Above the rule she is only trying: every
 * change goes onto the canvas and nowhere else, and Put it back undoes the
 * lot. Below it is the one button that writes, and it says how many
 * invitations it reaches before she presses it rather than afterwards.
 *
 * A family of the colour book makes all six in one tap, because six colours
 * that work together is a decision and a family is one a person can make in
 * a second. Every font set is drawn in its own faces, so what she reads in
 * the menu is what the heading will be.
 */
function ThemePopover({ templateId, theme, saved, value, onChange, onSaved, onClose }: {
  templateId: string;
  theme: Props['theme'];
  /** what the row holds, which is what Put it back goes back to */
  saved: Tried;
  value: Tried;
  onChange: (next: Tried | null) => void;
  onSaved: (t: Tried) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const families = useMemo(() => colourFamilies(), []);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const preset = PALETTE_PRESETS.find((x) => JSON.stringify(x.palette) === JSON.stringify(value.colours))?.key ?? '';
  const all = theme.live + theme.drafts;

  const save = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      const r = await themeAction(templateId, value.colours, value.fontsKey);
      if (!r.ok) setError(r.error);
      else {
        onSaved(value);
        setDone(`Saved. ${r.live} live and ${r.drafts} draft invitation${r.live + r.drafts === 1 ? '' : 's'} are drawn in it now.`);
      }
    } catch {
      setError('The theme could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute left-0 top-full z-30 mt-1 max-h-[80vh] w-[23rem] overflow-auto overscroll-contain rounded-lg border border-[color:var(--color-sand-300)] bg-[color:var(--card-bg)] p-3 text-left shadow-xl">
      <div className="flex items-center justify-between">
        <p className="label mb-0">Theme</p>
        <button type="button" onClick={onClose} className="rounded px-1.5 text-base leading-none hover:bg-[color:var(--color-sand-100)]" aria-label="Close">×</button>
      </div>

      <div className="mt-2 space-y-1">
        {ROLES.map((r) => (
          <RoleRow
            key={r.key}
            label={r.label}
            colour={value.colours[r.key as keyof Palette]}
            onPick={(c) => onChange({ ...value, colours: { ...value.colours, [r.key]: c } })}
          />
        ))}
      </div>

      <p className="label mt-3 mb-0">From a family</p>
      <div className="mt-1 grid grid-cols-2 gap-1">
        {families.map((f) => (
          <button
            key={f.key}
            type="button"
            title={`${f.label}: the palest as the paper, the deepest as the ink`}
            onClick={() => onChange({ ...value, colours: f.palette })}
            className="flex items-center gap-1.5 rounded border border-[color:var(--color-sand-300)] px-1.5 py-1 text-left text-[11px] leading-tight hover:bg-[color:var(--color-sand-100)]"
          >
            <span className="flex shrink-0 overflow-hidden rounded-sm border border-black/10">
              {(['bg', 'accent2', 'accent', 'muted', 'ink'] as const).map((role) => (
                <span key={role} className="h-4 w-2" style={{ background: f.palette[role] }} />
              ))}
            </span>
            <span className="truncate">{f.label}</span>
          </button>
        ))}
      </div>

      <label className="mt-2 block">
        <span className="hint">or a palette of ours</span>
        <select
          value={preset}
          onChange={(e) => {
            const pick = PALETTE_PRESETS.find((x) => x.key === e.target.value);
            if (pick) onChange({ ...value, colours: pick.palette });
          }}
          className="input h-8 min-h-0 w-full text-xs"
        >
          {!preset && <option value="">— colours of your own —</option>}
          {PALETTE_PRESETS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
      </label>

      <p className="label mt-3 mb-0">Faces</p>
      {theme.look
        ? <p className="hint">This design is set in the {theme.look} look, so a guest is served the look&rsquo;s faces and the set below is only what it would fall back to — the canvas shows the set while you are trying it, and goes back to the look&rsquo;s faces once it is saved. The look is on <Link href={`/admin/templates/${templateId}`} className="underline">the design&rsquo;s own page</Link>.</p>
        : !value.fontsKey && <p className="hint">These faces are not one of the sets below. Picking one replaces them; leaving it alone keeps them.</p>}
      <div className="mt-1 max-h-56 space-y-0.5 overflow-auto rounded border border-[color:var(--color-sand-300)] p-1">
        {theme.sets.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange({ ...value, fontsKey: f.key })}
            className={`block w-full rounded px-2 py-1 text-left ${value.fontsKey === f.key ? 'bg-[color:var(--color-sand-200)] ring-1 ring-[color:var(--color-ink-700)]' : 'hover:bg-[color:var(--color-sand-100)]'}`}
          >
            <span className="block text-lg leading-tight" style={{ fontFamily: f.fonts.names || f.fonts.display }}>Maria &amp; Juan</span>
            {f.fonts.script && f.fonts.script !== (f.fonts.names || f.fonts.display) && (
              <span className="block text-sm leading-tight" style={{ fontFamily: f.fonts.script, fontStyle: f.fonts.scriptStyle ?? 'normal' }}>together with our families</span>
            )}
            <span className="block text-[11px] leading-snug" style={{ fontFamily: f.fonts.body }}>{f.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-[color:var(--color-sand-300)] pt-2">
        <p className="hint">
          The colours and the faces are the design itself, not a draft: saving them is felt at once by{' '}
          {all === 0 ? 'no invitations yet' : `${theme.live} live and ${theme.drafts} draft invitation${all === 1 ? '' : 's'}`} on this design.
          {theme.overridden && ' This demo invitation carries colours of its own on top, which is what the canvas was drawn in.'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="btn btn-primary btn-sm">{busy ? 'Saving…' : 'Save the theme'}</button>
          <button type="button" disabled={!dirty} onClick={() => onChange(null)} className="btn btn-ghost btn-sm">Put it back</button>
        </div>
        {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
        {done && <p className="hint">{done}</p>}
      </div>
    </div>
  );
}

/**
 * One colour role: a picker, the hex to type or paste, and the colour book's
 * name for it when it is one of the book's. The name is the point of having
 * a book — "Dusty Rose" is a colour a person can talk about on the phone,
 * and #dba8a8 is not.
 */
/**
 * The colours this design gives the column and the night.
 *
 * Night used to be one set of colours for every design, in the stylesheet:
 * an ivory ink, a pale gold accent, cards on dark glass, the same for a
 * christening in baby blue as for a wedding in capiz and shell. Each row
 * here is an override and nothing more — left alone it says *the app's own*
 * and the stylesheet answers as it always has, so a design is only as
 * different by night as she has asked it to be.
 *
 * The column and the colour beside it are the same kind of thing by day, and
 * were the same kind of literal: two per layout, in the stylesheet, which is
 * why a design drawn here wore its layout's and could not say otherwise.
 */
/**
 * How the design falls on paper.
 *
 * The customer's "Print / PDF" button opens `/[slug]/print` and their own
 * browser makes the file, so what a design can say about paper is a set of
 * settings rather than a second layout: the sheet, the margin round it,
 * whether each page of the design gets a sheet to itself, and any page that
 * should not be printed at all. Before this a design could say none of it:
 * the stylesheet's own `@page` gave every printed page a 14mm margin and
 * nothing else, so the browser cut the column wherever it landed.
 *
 * Every row is an override: left alone, the browser's own print dialogue
 * decides, which is exactly what happened before.
 */
function PaperPanel({ doc, onSheet }: { doc: DesignDoc; onSheet: (patch: Partial<SheetSpec>) => void }) {
  const [open, setOpen] = useState(false);
  const sheet = doc.sheet ?? {};
  const hidden = new Set(sheet.hide ?? []);
  const set = (sheet.size ? 1 : 0) + (sheet.margin !== undefined ? 1 : 0) + (sheet.perPage ? 1 : 0) + hidden.size;
  const toggleHide = (key: string, off: boolean) => {
    const next = new Set(hidden);
    if (off) next.add(key); else next.delete(key);
    onSheet({ hide: [...next] });
  };
  return (
    <div className="mt-2 border-t border-[color:var(--color-sand-300)] pt-2">
      <button type="button" onClick={() => setOpen((x) => !x)} className="flex w-full items-center justify-between text-left">
        <span className="label mb-0">On paper</span>
        <span className="text-[11px] text-[color:var(--color-ink-500)]">{set ? `${set} set` : 'the browser\u2019s'} {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-2">
          <label className="block">
            <span className="label">The sheet</span>
            <select className="input" value={sheet.size ?? ''} onChange={(e) => onSheet({ size: (e.target.value || undefined) as SheetSize | undefined })}>
              <option value="">Whatever the printer is set to</option>
              <option value="a4">A4</option>
              <option value="a5">A5 (half of A4)</option>
              <option value="5x7">5 × 7 inches</option>
              <option value="letter">US Letter</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Margin round it</span>
            <input
              type="number" min={0} max={40} step={1} className="input"
              value={sheet.margin ?? ''}
              placeholder="the printer's own"
              onChange={(e) => onSheet({ margin: e.target.value === '' ? undefined : Math.max(0, Math.min(40, Number(e.target.value))) })}
            />
            <span className="hint">Millimetres. A ground that should run to the edge wants 0 — though most printers keep a few millimetres of their own whatever this says.</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(sheet.perPage)} onChange={(e) => onSheet({ perPage: e.target.checked ? true : undefined })} className="h-4 w-4" />
            <span>Each page starts a new sheet</span>
          </label>
          <div className="space-y-1">
            <p className="hint">Left off the paper. The print view shows what will come out of the printer, so these go from it too.</p>
            {reachablePages(doc).map((pg) => (
              <label key={pg.key} className="flex items-center gap-2">
                <input type="checkbox" checked={hidden.has(pg.key)} onChange={(e) => toggleHide(pg.key, e.target.checked)} className="h-4 w-4" />
                <span>{pg.label?.en || pg.key}</span>
              </label>
            ))}
          </div>
          <p className="hint">
            The file itself is made by the guest&rsquo;s own browser from <strong>Print / PDF</strong>, so these are the instructions it is given rather than a layout of their own. They are in the draft and go live when you publish.
          </p>
        </div>
      )}
    </div>
  );
}

function ColoursPanel({ doc, onColumn, onNight, onSurroundArt }: {
  doc: DesignDoc;
  onColumn: (key: 'paper' | 'surround', colour: string | undefined) => void;
  onNight: (role: keyof NightPalette, colour: string | undefined) => void;
  onSurroundArt: (art: SurroundArt | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const night = doc.nightColours ?? {};
  const set = (doc.paper ? 1 : 0) + (doc.surround ? 1 : 0) + (doc.surroundArt ? 1 : 0) + Object.keys(night).length;
  return (
    <div className="mt-2 border-t border-[color:var(--color-sand-300)] pt-2">
      <button type="button" onClick={() => setOpen((x) => !x)} className="flex w-full items-center justify-between text-left">
        <span className="label mb-0">Its own colours</span>
        <span className="text-[11px] text-[color:var(--color-ink-500)]">{set ? `${set} of its own` : 'all ours'} {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-2">
          <div className="space-y-1">
            <p className="hint">The column itself, and what is beside it on a laptop.</p>
            <OwnColour label="The column" colour={doc.paper} fallback={PALETTE_FALLBACK} onPick={(c) => onColumn('paper', c)} />
            <OwnColour label="Beside it" colour={doc.surround} fallback={PALETTE_FALLBACK} onPick={(c) => onColumn('surround', c)} />
            <SurroundPicture art={doc.surroundArt} onChange={onSurroundArt} />
          </div>
          <div className="space-y-1">
            <p className="hint">By night. Anything you leave alone stays ours.</p>
            {NIGHT_ROWS.map((r) => (
              <OwnColour
                key={r.key}
                label={r.label}
                colour={night[r.key]}
                fallback={NIGHT_SWATCH[r.key]}
                onPick={(c) => onNight(r.key, c)}
              />
            ))}
          </div>
          <p className="hint">
            These are the design&rsquo;s own, so they are in the draft and go live when you publish it &mdash; unlike the palette and the faces under <strong>Theme</strong>, which are the design&rsquo;s row and reach every invitation the moment they save.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A picture behind the whole website page, edge to edge.
 *
 * The one thing an owner exports from Canva as "the background" and wants
 * to judge on the whole page rather than on a phone strip: it goes here
 * once, the column sits on it, and a phone covers it with the column. It
 * goes up through the library, so it is also a piece she can place.
 */
function SurroundPicture({ art, onChange }: { art?: SurroundArt; onChange: (a: SurroundArt | undefined) => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function pick(file: File) {
    setError('');
    setBusy('Sending…');
    try {
      const read = await readPicture(file);
      const fd = new FormData();
      fd.set('file', new File([read.blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' }));
      fd.set('library', '1');
      fd.set('name', `Behind the page — ${file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')}`);
      fd.set('width', String(read.width));
      fd.set('height', String(read.height));
      const res = await fetch('/api/admin/design-upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The upload failed.');
      onChange({ url: json.url as string, fit: art?.fit ?? 'cover' });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }
  return (
    <div className="rounded bg-[color:var(--color-sand-100)] p-2" data-testid="surround-picture">
      <p className="text-xs font-semibold">Behind the whole page, on a laptop</p>
      <p className="hint">A picture edge to edge under the column &mdash; the background you export from Canva, 1920 &times; 1080 px. A phone covers it with the column.</p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {art?.url && <span className="h-8 w-12 shrink-0 rounded-sm border border-black/10 bg-cover bg-center" style={{ backgroundImage: `url(${art.url})` }} />}
        <label className="btn btn-secondary btn-sm cursor-pointer">
          {busy || (art?.url ? 'Change the picture' : 'Upload a picture')}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
        </label>
        {art?.url && (
          <>
            <select className="input w-auto text-xs" value={art.fit} onChange={(e) => onChange({ ...art, fit: e.target.value as SurroundArt['fit'] })} aria-label="How the picture fills the page">
              <option value="cover">one picture across the window, still as the page scrolls</option>
              <option value="tile">a small picture, repeated</option>
            </select>
            <button type="button" onClick={() => onChange(undefined)} className="text-xs text-red-700 underline">Remove</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}

/** The night rows, in the order a page is read: the words, then what is behind them. */
const NIGHT_ROWS: { key: keyof NightPalette; label: string }[] = [
  { key: 'ink', label: 'The words' },
  { key: 'muted', label: 'Quiet words' },
  { key: 'surface', label: 'Cards and fields' },
  { key: 'accent', label: 'Accent' },
  { key: 'accent2', label: 'Second accent' },
  { key: 'paper', label: 'The column' },
  { key: 'surround', label: 'Beside it' },
];

/**
 * What a swatch shows for a colour the design has not given.
 *
 * The app's own night surface is dark glass — `rgba(38, 36, 50, 0.72)` — and
 * a colour input cannot hold a colour with a hole in it, so the swatch shows
 * the same colour solid. Picking it writes a solid colour, which is the
 * honest thing: the studio cannot offer a transparency it cannot show.
 */
const NIGHT_SWATCH: Record<keyof NightPalette, string> = { ...APP_NIGHT, surface: '#262432' };
/** and for the column by day, whose own answer is the palette's background */
const PALETTE_FALLBACK = '#ffffff';

/** One colour the design may give, or leave to us. */
function OwnColour({ label, colour, fallback, onPick }: {
  label: string; colour?: string; fallback: string; onPick: (c: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <RoleRow label={label} colour={colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback} onPick={(c) => onPick(c)} />
      </div>
      {colour
        ? <button type="button" title="Leave it to us" onClick={() => onPick(undefined)} className="rounded bg-white px-1.5 text-xs text-red-700">✕</button>
        : <span className="w-14 shrink-0 text-[10px] leading-tight text-[color:var(--color-ink-500)]">ours</span>}
    </div>
  );
}

function RoleRow({ label, colour, onPick }: { label: string; colour: string; onPick: (c: string) => void }) {
  const [text, setText] = useState(colour);
  useEffect(() => setText(colour), [colour]);
  const ok = /^#[0-9a-f]{6}$/i.test(text.trim());
  const named = swatchName(colour);
  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        type="color"
        title={label}
        value={colour}
        onChange={(e) => onPick(e.target.value)}
        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-black/15 p-0"
      />
      <span className="w-24 shrink-0">{label}</span>
      <input
        value={text}
        spellCheck={false}
        aria-label={label}
        onChange={(e) => { setText(e.target.value); const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) onPick(v.toLowerCase()); }}
        className={`h-7 w-24 shrink-0 rounded border px-1.5 font-mono text-xs ${ok ? 'border-[color:var(--color-sand-300)]' : 'border-[color:var(--bad)]'}`}
        style={{ minHeight: 0 }}
      />
      {named && <span className="truncate text-[color:var(--color-ink-500)]">{named}</span>}
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
        // above the page's own writings, which are handles too and are drawn
        // after these: a picture the words flow past stands among them, so
        // without this its handle is under one of theirs and never gets the
        // pointer at all
        zIndex: 1,
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

function Properties({ el, ratio, occasion, onChange, onMoveTo, onLayer, onDuplicate, onRemove, onReplay, onPlayMoment, label, templateId, flow, onFillPage, measureRoom, attachable, grows, onFit, fitting, vars, booklets }: {
  el: Element; ratio: number; label: string; occasion: Occasion; templateId: string;
  /** the booklets this design has; an object can only open one that exists */
  booklets: string[];
  /** the page is laid out by its words, so a picture on it floats rather than being placed */
  flow: boolean;
  onFillPage: () => Promise<void>;
  onChange: (fn: (e: Element) => Element) => void;
  onMoveTo: (at: { x?: number; y?: number }) => void;
  onLayer: (by: number) => void; onDuplicate: () => void; onRemove: () => void;
  /** take the arrival off this element and put it back, so she can watch it again */
  onReplay: () => void;
  /** close a moment on the canvas and open it again */
  onPlayMoment: () => void;
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
  /** On a page laid out by its words: the words flow past this one, or they do not. */
  const floated = flow && el.kind === 'photo' && Boolean(el.float);
  const deco = flow && !floated;
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="label">{el.kind === 'photo' ? 'Photo frame' : el.kind === 'text' ? 'Words' : el.kind === 'shape' ? 'Shape' : el.kind === 'video' ? 'Clip' : el.kind === 'moment' ? 'Moment' : el.kind}</p>
        <p className="text-[11px] text-[color:var(--color-ink-500)]">{el.id}</p>
      </div>
      <p className="text-xs text-[color:var(--color-ink-500)]">{label}</p>
      {/*
        * Which numbers mean anything here.
        *
        * A float has no place of its own: it goes where the words make room
        * for it, so only its width and its turn are offered. A decoration on
        * the same page does have one — it hangs off the head or the foot —
        * but its gap from that edge is a share of the page's *width*, not of
        * a height its customer's words decide, so the number is labelled for
        * the edge it is measured from. A drawn page is as it always was.
        */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="label">Across</span>{num(el.x, (n) => onMoveTo({ x: n }))}</label>
        <label className="block">
          <span className="label">{floated ? 'Down the words' : deco ? (el.from === 'bottom' ? 'Up from the foot' : 'Down from the head') : 'Down'}</span>
          {num(el.y, (n) => onMoveTo({ y: n }))}
        </label>
        <label className="block"><span className="label">Width</span>{num(el.w, (n) => onChange((e) => ({ ...e, w: n })))}</label>
        <label className="block"><span className="label">Turn</span>{num(el.rotate, (n) => onChange((e) => ({ ...e, rotate: n })), 0.5)}</label>
      </div>
      <p className="hint">
        {floated
          ? `Drag it where you want it, or set it here: across is the middle of the box and down is how far down the words it begins, both a share of the page's width — the width for down as well, because this page's height is its customer's words. The words flow past it on whichever side of the middle you leave it, and two floats on the same side stack rather than overlap. A phone is too narrow to read four words a line beside a picture, so there it stands on its own at that point in the words.`
          : deco
            ? `Across, width and the gap from the edge are all a share of the page's width — this page's height is its words', so a share of it would move as a customer typed.`
            : `Across and width are a share of the page's width; down is a share of its height. This page is ${ratio.toFixed(2)} screens tall.`}
      </p>
      {(grows || deco) && (
        <label className="block">
          <span className="label">Measured from</span>
          <select className="input w-full" value={el.from ?? 'top'} onChange={(e) => onChange((x) => ({ ...x, from: e.target.value === 'bottom' ? 'bottom' : undefined }))}>
            <option value="top">The head of the page</option>
            <option value="bottom">{deco ? 'The foot — it stays at the bottom however long the words run' : 'The foot — it holds the bottom however far the words push it'}</option>
          </select>
        </label>
      )}
      <Attach value={el.attachTo} options={attachable} onChange={(to) => onChange((e) => ({ ...e, attachTo: to }))} />
      {/*
        * What a tap on this object opens.
        *
        * A list and not a box: an object can only open a booklet that
        * exists, and one pointing at a name nothing answers to is a door
        * that goes nowhere. The booklet is made by naming it on a page.
        *
        * Not offered on a moment or a Lottie, and the same two reasons as in
        * `opensAttrs`: a moment is already a gesture — the doors open, the
        * seal breaks — and two things on one tap is one of them not
        * happening; a Lottie is drawn by its player, so there is no element
        * of ours to make a button.
        */}
      {el.kind !== 'moment' && el.kind !== 'anim' && (
        <label className="block">
          <span className="label">Opens</span>
          <select
            className="input w-full"
            value={el.opens ?? ''}
            onChange={(e) => onChange((x) => { const v = e.target.value; const next = { ...x, opens: v || undefined }; if (!v) delete next.opens; return next; })}
          >
            <option value="">Nothing — it is artwork</option>
            {booklets.map((b) => <option key={b} value={b}>{b}</option>)}
            {el.opens && !booklets.includes(el.opens) && <option value={el.opens}>{el.opens} — no page is in this booklet</option>}
          </select>
          <span className="hint">
            {booklets.length
              ? 'A tap brings that booklet over the page, with one way back. Draw it as something visibly shut and wanting opening — a door, a folded card — or a guest will scroll straight past it.'
              : 'No booklets yet. Put a page behind a hub first — the page panel, “Behind a hub” — and it will appear here.'}
          </span>
        </label>
      )}
      <MotionBlock el={el} onChange={onChange} onReplay={onReplay} num={num} />
      {el.kind === 'photo' && (
        <PictureBlock el={el as PhotoEl} onChange={onChange} onFit={onFit} fitting={fitting} num={num} flow={flow} />
      )}
      {el.kind === 'shape' && <ShapeBlock el={el as ShapeEl} onChange={onChange} vars={vars} num={num} />}
      {el.kind === 'video' && <ClipBlock el={el as VideoEl} onChange={onChange} templateId={templateId} onFillPage={onFillPage} />}
      {el.kind === 'anim' && <AnimBlock el={el as AnimEl} onChange={onChange} num={num} />}
      {el.kind === 'moment' && <MomentBlock el={el as MomentEl} occasion={occasion} onChange={onChange} onPlay={onPlayMoment} />}
      {el.kind === 'text' && <TypeBlock el={el as TextEl} occasion={occasion} onChange={onChange} vars={vars} />}
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
 * The colour book, for a colour of her own.
 *
 * A role colour is the right answer nearly always — it follows the palette,
 * so it turns itself down at night with everything else — which is why the
 * book is folded away rather than offered first. What it adds over the
 * browser's own picker is a name: these are the colours on the designer's
 * own sheet, and Dusty Rose is a colour two people can agree on over the
 * phone where #dba8a8 is not.
 *
 * The metallics are left out. They are drawn with a sheen where a guest
 * reads a dress code, and a design's shape or ground takes one flat colour;
 * offering a swatch with a sheen that renders without one would be a
 * promise the page does not keep.
 */
function BookColours({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
  const named = value?.startsWith('#') ? swatchName(value) : '';
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] text-[color:var(--color-ink-500)]">
        from the colour book{named ? ` · ${named}` : ''}
      </summary>
      <div className="mt-1 max-h-44 space-y-1.5 overflow-auto rounded border border-[color:var(--color-sand-300)] p-1.5">
        {PALETTE.filter((g) => g.key !== 'metallics').map((g) => (
          <div key={g.key}>
            <p className="text-[10px] leading-tight text-[color:var(--color-ink-500)]">{g.label}</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {g.swatches.map((sw) => (
                <button
                  key={sw.key}
                  type="button"
                  title={sw.name}
                  aria-label={sw.name}
                  onClick={() => onPick(sw.hex)}
                  className={`h-5 w-5 rounded border ${value === sw.hex ? 'border-[color:var(--color-ink-700)] ring-2 ring-[color:var(--color-ink-700)]' : 'border-black/15'}`}
                  style={{ background: swatchStyle(sw.hex) }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
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
    <>
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
      <BookColours value={value} onPick={onPick} />
    </>
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
 * The sections this design does not do.
 *
 * This is the row of ticks that used to live on the design's own page in the
 * admin, moved here and turned the other way up. Two reasons it had to move.
 * It is a fact about the design, and the design is what this screen edits;
 * and hiding a section changes every invitation already built on the design,
 * so it belongs in the draft, behind the publish screen that says how many
 * invitations a change would redraw — not in a form that saves the moment
 * she clicks away.
 *
 * Turned the other way up because a refusal is what is actually being said.
 * A design offers what its occasion has; the list is what it declines. So
 * nothing to tick is the ordinary case, and a design with three ticks is
 * saying three specific things rather than eighteen implied ones.
 *
 * Folded away, because most designs have nothing here at all.
 */
function HidesPanel({ occasion, hides, onToggle }: { occasion: Occasion; hides: string[]; onToggle: (key: PageSectionKey) => void }) {
  const hidden = new Set(hides);
  const keys = sectionsFor(occasion).map((d) => d.key as PageSectionKey);
  return (
    <details className="mt-2 border-t border-[color:var(--color-sand-300)] pt-2">
      <summary className="cursor-pointer text-[11px] text-[color:var(--color-ink-500)]">
        Sections this design does not do{hidden.size ? ` · ${hidden.size}` : ''}
      </summary>
      <p className="hint mt-1">
        A section left unticked here is offered, drawn by whichever page carries it or on a plain page of its own.
        Tick one and this design stops offering it altogether &mdash; on every invitation built on it, from the next publish.
        What a customer already wrote in it is kept.
      </p>
      <div className="mt-1 space-y-0.5">
        {keys.map((k) => (
          <label key={k} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={hidden.has(k)} onChange={() => onToggle(k)} className="h-3.5 w-3.5" />
            <span className={hidden.has(k) ? 'text-[color:var(--color-ink-500)] line-through' : ''}>{sectionLabel(k as SectionKey, occasion)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * Put a clip on the page.
 *
 * The whole of the reading happens here before anything is uploaded, because
 * the browser is the only machine in the chain that can decode a clip — the
 * server has no ffmpeg and sharp does not do video. So a file that a guest's
 * phone would not play is refused while it is still on her disk, and the
 * poster is drawn off a frame of it rather than asked of her.
 *
 * It says what it is doing at each step. Reading an eight-megabyte clip,
 * seeking four times and sending two files is several seconds of silence
 * otherwise, and silence in a studio reads as a broken button.
 */
/**
 * A vector animation onto the page: a Lottie JSON.
 *
 * The refusals are the reason this is its own door and not a flag on the
 * picture one. A Lottie has no magic bytes, so "is this an animation?" can
 * only be answered by reading it — and the export button most people press
 * first gives a `.lottie` bundle, which is a zip, which the app's own
 * sniffing reads as an Excel file. Told that her animation is not a
 * spreadsheet, she would have no idea what to do; told to press the other
 * export button, she has.
 */
function AddAnim({ templateId, onAdd }: { templateId: string; onAdd: (up: SentAnim) => void }) {
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const busy = step !== '';
  async function take(file: File) {
    setError('');
    try {
      setStep('Reading it…');
      const read = await readAnim(file);
      setStep('Uploading…');
      onAdd(await sendAnim(read, templateId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep('');
      if (input.current) input.current.value = '';
    }
  }
  return (
    <>
      <label className={`rounded bg-[color:var(--color-sand-200)] px-2 py-1 ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
        {busy ? step : '+ Animation'}
        <input ref={input} type="file" accept="application/json,.json,.lottie" className="sr-only" disabled={busy}
          onChange={(e) => e.target.files?.[0] && take(e.target.files[0])} />
      </label>
      {error && (
        <span className="basis-full text-[11px] text-[color:var(--bad)]">
          {error}{' '}
          <button type="button" className="underline" onClick={() => setError('')}>Dismiss</button>
        </span>
      )}
    </>
  );
}

/**
 * An animation as an object: how fast it plays, whether it repeats, and the
 * still that stands in for it.
 *
 * The still is not a detail. It is what a guest sees for the second or two
 * before a third of a megabyte of player arrives, and it is what a guest who
 * asked for less motion, or is sparing their data, sees instead of the
 * animation for ever.
 */
function AnimBlock({ el, onChange, num }: {
  el: AnimEl;
  onChange: (fn: (e: Element) => Element) => void;
  num: (v: number | undefined, set: (n: number) => void, step?: number) => ReactNode;
}) {
  const edit = (fn: (x: AnimEl) => AnimEl) => onChange((x) => fn(x as AnimEl));
  return (
    <div className="space-y-2 border-t border-[color:var(--color-sand-300)] pt-3">
      <div className="flex items-start gap-2">
        <span
          className="h-16 w-16 shrink-0 rounded border border-black/10 bg-contain bg-center bg-no-repeat"
          style={el.poster ? { backgroundImage: `url(${el.poster})` } : { background: 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50%/10px 10px' }}
        />
        <div className="min-w-0 flex-1">
          <p className="label">Its first frame</p>
          <p className="hint">Taken off the file when it arrived. It is the page until the player has loaded, and it is the page for good for a guest who asked their phone for less motion or is sparing their data.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="label">Speed</span>{num(el.speed ?? 1, (n) => edit((x) => ({ ...x, speed: n })), 0.1)}</label>
        <label className="flex items-center gap-2 pt-5 text-xs">
          <input type="checkbox" checked={el.loop !== false} onChange={(e) => edit((x) => ({ ...x, loop: e.target.checked }))} />
          It repeats
        </label>
      </div>
      <p className="hint">A loop that never stops pulls the eye for as long as the page is open; one that plays through once and stops is usually the kinder choice for anything near words.</p>
    </div>
  );
}

function AddClip({ templateId, onAdd }: { templateId: string; onAdd: (up: SentClip) => void }) {
  const [step, setStep] = useState('');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const busy = step !== '';
  async function take(file: File) {
    setError('');
    setNote('');
    setPct(0);
    try {
      setStep('Reading the clip…');
      const read = await readClip(file);
      if (read.note) setNote(read.note);
      setStep('Uploading…');
      onAdd(await sendClip(read, templateId, setPct));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep('');
      setPct(0);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <>
      <label className={`rounded bg-[color:var(--color-sand-200)] px-2 py-1 ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
        {busy ? (pct > 0 && pct < 100 ? `${step} ${pct}%` : step) : '+ Clip'}
        <input ref={input} type="file" accept="video/mp4,video/webm" className="sr-only" disabled={busy}
          onChange={(e) => e.target.files?.[0] && take(e.target.files[0])} />
      </label>
      {(error || note) && (
        <span className={`basis-full text-[11px] ${error ? 'text-[color:var(--bad)]' : 'text-[color:var(--color-ink-500)]'}`}>
          {error || note}{' '}
          <button type="button" className="underline" onClick={() => { setError(''); setNote(''); }}>Dismiss</button>
        </span>
      )}
    </>
  );
}

/**
 * A moving picture onto the page: a GIF, an animated WebP, an animated PNG.
 *
 * Its own door rather than the photograph one, because the promise is
 * different: nothing resizes it and nothing re-encodes it, so what she
 * chooses is what every guest downloads, whole. That is why the cap is a
 * megabyte and a half and why the refusal says so in the same breath.
 *
 * A still picture dropped here is refused with the reason and the other
 * door named, rather than being quietly accepted and served at whatever size
 * it happened to be.
 */
function AddMoving({ templateId, onAdd }: { templateId: string; onAdd: (up: Uploaded & { animated: true }) => void }) {
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const busy = step !== '';
  async function take(file: File) {
    setError('');
    try {
      setStep('Reading it…');
      const read = await readMoving(file);
      setStep('Sending it as it is…');
      onAdd(await sendMoving(read, templateId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep('');
      if (input.current) input.current.value = '';
    }
  }
  return (
    <>
      <label className={`rounded bg-[color:var(--color-sand-200)] px-2 py-1 ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
        {busy ? step : '+ Moving picture'}
        <input ref={input} type="file" accept="image/gif,image/webp,image/png" className="sr-only" disabled={busy}
          onChange={(e) => e.target.files?.[0] && take(e.target.files[0])} />
      </label>
      {error && (
        <span className="basis-full text-[11px] text-[color:var(--bad)]">
          {error}{' '}
          <button type="button" className="underline" onClick={() => setError('')}>Dismiss</button>
        </span>
      )}
    </>
  );
}

/**
 * A clip as an object: its poster, whether it loops, and its length and
 * weight said plainly.
 *
 * The poster gets most of the room because it is what most guests see. It
 * is what prints, what somebody sparing their data is served, and what an
 * iPhone in Low Power Mode shows instead of playing — three different
 * people, none of whom ever watch the clip. The one taken off the file is a
 * starting point; a still she chose is nearly always better.
 */
function ClipBlock({ el, onChange, templateId, onFillPage }: { el: VideoEl; onChange: (fn: (e: Element) => Element) => void; templateId: string; onFillPage: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function poster(file: File) {
    setBusy(true);
    setError('');
    try {
      const up = await uploadGround(file, templateId);
      onChange((e) => ({ ...e, poster: up.url }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div className="space-y-2 border-t border-[color:var(--color-sand-200)] pt-2">
      <div className="flex items-start gap-2">
        {el.poster
          ? <img src={el.poster} alt="" className="w-16 shrink-0 rounded border border-[color:var(--color-sand-200)]" style={{ aspectRatio: `1 / ${el.aspect ?? 1}`, objectFit: 'cover' }} />
          : <span className="h-20 w-16 shrink-0 rounded border border-dashed border-[color:var(--color-sand-300)]" />}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="label">The still behind it</p>
          <p className="text-[11px] text-[color:var(--color-ink-500)]">What prints, what a guest sparing their data sees, and what a phone in Low Power Mode shows instead of playing.</p>
          <label className={`btn btn-secondary btn-sm ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
            {busy ? 'Uploading…' : 'Replace the still'}
            <input ref={input} type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && poster(e.target.files[0])} />
          </label>
        </div>
      </div>
      {error && <p className="text-[11px] text-[color:var(--bad)]">{error}</p>}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={el.loop !== false} onChange={(e) => onChange((x) => ({ ...x, loop: e.target.checked }))} />
        Play it again from the start
      </label>
      <p className="hint">
        It only plays while the guest is looking at it, and never on a phone in Low Power Mode or with Reduce Motion on — the still is what those guests get.
        A clip is at most {VIDEO_MAX_LABEL} and {VIDEO_MAX_MS / 1000} seconds, and the checklist adds up every clip on the design.
      </p>
      {el.poster && (
        <div>
          <button type="button" className={`btn btn-secondary btn-sm ${busy ? 'opacity-60' : ''}`} disabled={busy}
            onClick={async () => { setBusy(true); setError(''); try { await onFillPage(); } catch (e) { setError(`${(e as Error).message} The still has to be readable from here for its edge colours to be measured.`); } finally { setBusy(false); } }}>
            Put it behind the whole page
          </button>
          <p className="hint">The clip fills the page and its still becomes the page&rsquo;s background, so the edges and the joins above and below take their colours from it and a guest who never sees the clip still sees the page.</p>
        </div>
      )}
      <p className="break-all font-mono text-[10px] text-[color:var(--color-ink-500)]">{el.url}</p>
    </div>
  );
}

/**
 * The frame as an object: the shape it holds, the card around it, the cut of
 * its corners, and which part of the picture shows through it.
 *
 * Fitting is done on the page rather than in a dialogue, because a frame
 * leaning on a painted polaroid is only right in place. The button is here
 * for somebody who has not learnt the double-click, and it says what the
 * gesture is either way.
 */
/**
 * How this element arrives, and what it does while it is read.
 *
 * Two settings and a delay, and the delay is the one that matters most:
 * three petals that all start together are one petal drawn three times.
 *
 * Everything here is a request rather than a promise, and the note says so.
 * A guest who has asked their phone for less motion, or who is sparing their
 * data, sees none of it — the element is simply where it was drawn, fully
 * visible. That is not a degradation to apologise for: a design that only
 * reads when it moves is a design that does not read.
 */
function MotionBlock({ el, onChange, onReplay, num }: {
  el: Element;
  onChange: (fn: (e: Element) => Element) => void;
  onReplay: () => void;
  num: (v: number | undefined, set: (n: number) => void, step?: number) => ReactNode;
}) {
  type Motion = NonNullable<Element['motion']>;
  const m: Motion = el.motion ?? {};
  const set = (patch: Partial<Motion>) => onChange((x) => {
    const next: Motion = { ...(x.motion ?? {}), ...patch };
    // a motion that says nothing is taken off rather than saved as `{}`
    const clean = Object.fromEntries(
      Object.entries(next).filter(([, v]) => v !== undefined && v !== 'none' && v !== 0),
    ) as Motion;
    const out = { ...x, motion: Object.keys(clean).length ? clean : undefined };
    if (!out.motion) delete out.motion;
    return out;
  });
  const moves = Boolean((m.enter && m.enter !== 'none') || (m.idle && m.idle !== 'none'));
  return (
    <div className="space-y-2 border-t border-[color:var(--color-sand-300)] pt-3">
      <p className="label">Motion</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">It arrives</span>
          <select className="input w-full" value={m.enter ?? 'none'} onChange={(e) => set({ enter: e.target.value as Motion['enter'] })}>
            <option value="none">already there</option>
            <option value="fade">fading in</option>
            <option value="rise">rising into place</option>
            <option value="drift">drifting in from the side</option>
          </select>
        </label>
        <label className="block">
          <span className="label">And then</span>
          <select className="input w-full" value={m.idle ?? 'none'} onChange={(e) => set({ idle: e.target.value as Motion['idle'] })}>
            <option value="none">it is still</option>
            <option value="float">it floats</option>
            <option value="sway">it sways</option>
          </select>
        </label>
      </div>
      {moves && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">After (ms)</span>
            {num(m.delay, (n) => set({ delay: n }), 50)}
          </label>
          <button type="button" onClick={onReplay} className="btn btn-ghost btn-sm mt-5">Play it again</button>
        </div>
      )}
      <p className="hint">
        {moves
          ? 'It arrives the first time a guest scrolls to it, and only once. A guest who has asked their phone for less motion, or who is sparing their data, sees none of this — the element is simply where you drew it, which is how the page has to read anyway.'
          : 'Nothing moves unless you say so.'}
      </p>
    </div>
  );
}

function PictureBlock({ el, onChange, onFit, fitting, num, flow }: {
  el: PhotoEl;
  onChange: (fn: (e: Element) => Element) => void;
  onFit: () => void;
  fitting: boolean;
  num: (v: number | undefined, set: (n: number) => void, step?: number) => ReactNode;
  flow: boolean;
}) {
  const edit = (fn: (x: PhotoEl) => PhotoEl) => onChange((x) => fn(x as PhotoEl));
  return (
    <div className="space-y-2 border-t border-[color:var(--color-sand-300)] pt-3">
      {/*
        * Only offered on a page laid out by its words, because the four
        * answers are only about words. A drawn page places every picture by
        * hand and none of this would mean anything there.
        *
        * There is no fifth answer: a picture on a page is on it. The two
        * sides are floats, the head and the foot are decorations, and taking
        * it off the page is the ✕ beside it in the list — not an option here
        * that leaves it in the document drawn nowhere.
        */}
      {flow && (
        <label className="block">
          <span className="label">Where it sits</span>
          <select
            className="input w-full"
            value={el.float ?? (el.from === 'bottom' ? 'foot' : 'head')}
            onChange={(e) => edit((x) => {
              const v = e.target.value;
              const next = { ...x };
              if (v === 'left' || v === 'right') { next.float = v; delete next.from; return next; }
              delete next.float;
              if (v === 'foot') next.from = 'bottom';
              else delete next.from;
              return next;
            })}
          >
            <option value="left">in among the words, on the left &mdash; they flow past its right</option>
            <option value="right">in among the words, on the right &mdash; they flow past its left</option>
            <option value="head">along the head of the page, the words unmoved</option>
            <option value="foot">along the foot of the page, the words unmoved</option>
          </select>
          <span className="hint">
            {el.float
              ? 'On a phone there is no room for words beside a picture, so it is centred with the words above and below — the same picture, in a narrower place.'
              : 'The words do not move for it, so it sits behind them unless its layer is above zero. Room for it at the foot is the page’s own foot setting.'}
          </span>
        </label>
      )}
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

function TypeBlock({ el, occasion, onChange, vars }: { el: TextEl; occasion: Occasion; onChange: (fn: (e: Element) => Element) => void; vars: Record<string, string> }) {
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
            {/* the line's colour, one of the palette's ink roles so it follows the palette into night; none is the role's own */}
            <div className="mt-1 flex items-center gap-1" data-testid="line-colour">
              <span className="text-[11px] text-[color:var(--color-ink-500)]">Colour</span>
              {ROLES.filter((r) => ['ink', 'muted', 'accent', 'accent2'].includes(r.key)).map((r) => (
                <button
                  key={r.key}
                  type="button"
                  title={r.label}
                  onClick={() => edit((t) => ({ ...t, lines: t.lines.map((x, j) => (j === i ? { ...x, color: x.color === r.key ? undefined : (r.key as TextEl['lines'][number]['color']) } : x)) }))}
                  className={`h-5 w-5 rounded border ${l.color === r.key ? 'border-[color:var(--color-ink-700)] ring-2 ring-[color:var(--color-ink-700)]' : 'border-black/15'}`}
                  style={{ background: colourOf(r.key, vars) }}
                />
              ))}
              {l.color && <button type="button" onClick={() => edit((t) => ({ ...t, lines: t.lines.map((x, j) => (j === i ? { ...x, color: undefined } : x)) }))} className="text-[11px] underline">its own</button>}
            </div>
            <Words
              sources={l.sources}
              occasion={occasion}
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

/**
 * Every word the design can carry of its own, for this occasion: its lines,
 * then its headings, each named the way the occasion names that part. A
 * christening is not offered the Entourage's line or The Moment's three,
 * because a christening has no entourage and no Moment — a word it cannot
 * read is a word not worth offering.
 */
function wordsOffered(occasion: Occasion): { key: WordKey; label: string }[] {
  const offered = wordsFor(occasion);
  return [
    ...offered.lines.map((k) => ({ key: k as WordKey, label: lineLabel(k, occasion) })),
    ...offered.titles.map((k) => ({ key: titleWord(k), label: `Heading — ${titleLabel(k, occasion)}` })),
  ];
}

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
function Words({ sources, occasion, onChange }: { sources: Source[]; occasion: Occasion; onChange: (next: Source[]) => void }) {
  const offered = wordsOffered(occasion);
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
              {offered.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
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
        <button type="button" onClick={() => onChange([...sources, { word: offered[0].key }])} className="rounded bg-white px-2 py-0.5 text-[11px]">+ a word from the design</button>
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
/**
 * The library of moments, under the toolbar: six shelves, seven to a shelf,
 * as she listed them. A row on two shelves says so; one not built yet says
 * it is coming and cannot be placed; one made for other occasions says
 * which, and can still be placed.
 */
function MomentSheet({ occasion, onPick, onClose }: { occasion: Occasion; onPick: (entry: ShelfEntry) => void; onClose: () => void }) {
  const [shelf, setShelf] = useState<Shelf>('opening');
  return (
    <div className="basis-full rounded border border-[color:var(--color-sand-300)] bg-white p-2" data-testid="moment-sheet">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {SHELF_KEYS.map((s) => (
          <button key={s} type="button" onClick={() => setShelf(s)} className={`rounded px-2 py-1 ${shelf === s ? 'bg-[color:var(--color-ink-700)] text-white' : 'bg-[color:var(--color-sand-100)]'}`}>{SHELF_NAMES[s]}</button>
        ))}
        <span className="ml-auto" />
        <span className="hint">{MOMENTS.filter((m) => m.built).length} of {MOMENTS.length} scenes built</span>
        <button type="button" onClick={onClose} className="rounded bg-[color:var(--color-sand-100)] px-2 py-1">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        {SHELVES[shelf].map((e) => {
          const def = momentOf(e);
          const also = shelvesOf(e.key).filter((x) => x !== shelf);
          const forThis = !e.occasions || e.occasions.includes(occasion);
          return (
            <button
              key={`${e.key}:${e.variant ?? ''}`}
              type="button"
              disabled={!def.built}
              data-testid={`moment-${e.key}${e.variant ? `-${e.variant}` : ''}`}
              onClick={() => onPick(e)}
              className="rounded border border-[color:var(--color-sand-300)] p-2 text-left hover:bg-[color:var(--color-sand-100)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block font-semibold">{e.name}{!def.built && <span className="ml-1 font-normal text-[color:var(--color-ink-500)]">· coming</span>}</span>
              <span className="block text-[11px] text-[color:var(--color-ink-500)]">{e.action} — {e.happens}</span>
              {also.length > 0 && <span className="mt-1 block text-[11px] text-[color:var(--color-ink-500)]">also under {also.map((x) => SHELF_NAMES[x]).join(', ')}</span>}
              {!forThis && e.occasions && <span className="mt-1 block text-[11px] text-[color:var(--color-plum-600)]">made for {e.occasions.map((o) => o.toLowerCase().replace('_', ' ')).join(', ')}</span>}
              {def.photos.count > 0 && <span className="mt-1 block text-[11px]">{def.photos.count === 1 ? 'one photograph' : `${def.photos.count} photographs`}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A placed moment's own settings: how it is opened and how fast, whether it
 * plays once or every time, the photographs it opens onto and the words it
 * reveals — each read the way a frame's and a text box's are, so the form
 * asks for them in the one list — and a button to watch it.
 */
function MomentBlock({ el, occasion, onChange, onPlay }: { el: MomentEl; occasion: Occasion; onChange: (fn: (e: Element) => Element) => void; onPlay: () => void }) {
  const def = MOMENT_BY_KEY[el.moment];
  const edit = (fn: (m: MomentEl) => MomentEl) => onChange((x) => fn(x as MomentEl));
  const photoOffers = useMemo(() => askable(occasion, 'photo'), [occasion]);
  const textOffers = useMemo(() => askable(occasion, 'text'), [occasion]);
  const slots = el.photos ?? [];
  const row = SHELF_KEYS.flatMap((s) => SHELVES[s]).find((e) => e.key === el.moment && (e.variant ?? '') === (el.variant ?? ''));
  const setSlot = (i: number, bind: FieldRef | { asset: string }) => edit((m) => {
    const next = [...(m.photos ?? [])];
    while (next.length <= i) next.push({ bind: { asset: '' } });
    next[i] = { ...next[i], bind };
    return { ...m, photos: next };
  });
  const line = el.lines?.[0];
  const lineBind = line?.sources.find((x) => 'bind' in x) as { bind: FieldRef } | undefined;
  const lineFixed = line?.sources.find((x) => 'fixed' in x) as { fixed: { en: string; tl?: string } } | undefined;
  const setLine = (bind: FieldRef | undefined, fixed: { en: string; tl?: string } | undefined) => edit((m) => {
    const sources = [...(bind ? [{ bind }] : []), ...(fixed && fixed.en ? [{ fixed }] : [])];
    if (!sources.length) { const { lines: _gone, ...rest } = m; void _gone; return rest as MomentEl; }
    return { ...m, lines: [{ ...(m.lines?.[0] ?? { role: 'body' as const, align: 'center' as const }), sources }] };
  });
  if (!def) return null;
  return (
    <div className="space-y-2 border-t border-[color:var(--color-sand-300)] pt-3">
      <div className="flex items-center justify-between">
        <p className="label">{momentName(el.moment, el.variant)}</p>
        <button type="button" onClick={onPlay} data-testid="play-moment" className="btn btn-ghost btn-sm">Play it</button>
      </div>
      {row && <p className="hint">{row.action} — {row.happens}</p>}
      <div className="grid grid-cols-2 gap-2">
        {def.triggers.length > 1 ? (
          <label className="block">
            <span className="label">Opened by</span>
            <select className="input w-full" value={el.trigger ?? def.triggers[0]} onChange={(e) => edit((m) => ({ ...m, trigger: e.target.value as MomentTrigger }))}>
              {def.triggers.map((t) => <option key={t} value={t}>{t === 'tap' ? 'a tap' : t === 'swipe' ? `a swipe${def.swipe === 'apart' ? ' apart' : def.swipe === 'down' ? ' down' : def.swipe === 'up' ? ' up' : ''}` : 'a press and hold'}</option>)}
            </select>
          </label>
        ) : (
          <p className="hint self-end">Opened by {def.mechanic === 'rub' ? 'rubbing' : def.mechanic === 'drag' ? 'dragging the pieces' : def.mechanic === 'keys' ? 'the code' : def.triggers[0] === 'hold' ? 'a press and hold' : def.triggers[0] === 'swipe' ? 'a swipe' : 'a tap'}.</p>
        )}
        <label className="block">
          <span className="label">Speed</span>
          <select className="input w-full" value={el.speed ?? 'normal'} onChange={(e) => edit((m) => { const v = e.target.value as MomentEl['speed']; const n: MomentEl = { ...m, speed: v }; if (v === 'normal') delete n.speed; return n; })}>
            {SPEEDS.map((sp) => <option key={sp} value={sp}>{SPEED_NAMES[sp]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Plays</span>
          <select className="input w-full" value={el.plays ?? 'once'} onChange={(e) => edit((m) => { const v = e.target.value as MomentEl['plays']; const n: MomentEl = { ...m, plays: v }; if (v === 'once') delete n.plays; return n; })}>
            <option value="once">once, then stays open</option>
            <option value="always">every time it comes into view</option>
          </select>
        </label>
        {def.variants && (
          <label className="block">
            <span className="label">Version</span>
            <select className="input w-full" value={el.variant ?? ''} onChange={(e) => edit((m) => { const n: MomentEl = { ...m, variant: e.target.value || undefined }; if (!n.variant) delete n.variant; return n; })}>
              <option value="">{def.name}</option>
              {Object.entries(def.variants).map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
          </label>
        )}
      </div>
      {def.photos.count > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(el.ask)} onChange={(e) => onChange((x) => ({ ...x, ask: e.target.checked ? true : undefined }))} className="h-4 w-4" />
            <span className="font-semibold">Ask the customer for {def.photos.count === 1 ? 'the photograph' : 'the photographs'}</span>
          </label>
          {Array.from({ length: def.photos.count }, (_, i) => {
            const b = slots[i]?.bind;
            const ref = b && !('asset' in b) ? b : undefined;
            const at = ref ? photoOffers.find((o) => o.section === ref.section && o.field === ref.field && (o.sub ?? undefined) === (ref.sub ?? undefined)) : undefined;
            return (
              <div key={i} className="rounded border border-[color:var(--color-sand-300)] p-2">
                <p className="label">{def.photos.count === 1 ? def.photos.label : `${def.photos.label} ${i + 1}`} · a {def.photos.shape}</p>
                <select className="input w-full" value={at ? key(at) : ''} onChange={(e) => { const o = photoOffers.find((x) => key(x) === e.target.value); setSlot(i, o ? { section: o.section, field: o.field, ...(o.sub ? { sub: o.sub } : {}), ...(o.list ? { index: ref?.index ?? i } : {}) } : { asset: '' }); }}>
                  <option value="">— the design's own picture —</option>
                  {Object.entries(groupBy(photoOffers)).map(([section, list]) => (
                    <optgroup key={section} label={section}>{list.map((o) => <option key={key(o)} value={key(o)}>{o.label}</option>)}</optgroup>
                  ))}
                </select>
                {at?.list && <input type="number" min={1} max={40} className="input mt-1 w-full" value={(ref?.index ?? 0) + 1} onChange={(e) => setSlot(i, { ...ref!, index: Math.max(0, Math.round(Number(e.target.value)) - 1) })} />}
                {!ref && (
                  <input className="input mt-1 w-full font-mono text-xs" placeholder="/babyblue/cover.webp — or pick one in the Library" value={b && 'asset' in b ? b.asset : ''} onChange={(e) => setSlot(i, { asset: e.target.value })} />
                )}
              </div>
            );
          })}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={el.ifEmpty === 'leave'} onChange={(e) => onChange((x) => { const n: Element = { ...x, ifEmpty: e.target.checked ? ('leave' as const) : undefined }; if (!n.ifEmpty) delete n.ifEmpty; return n; })} className="h-4 w-4" />
            <span>Leave it out when the customer gives no photograph</span>
          </label>
        </div>
      )}
      {def.words && def.words !== 'code' && (
        <div className="space-y-1">
          <p className="label">Words it reveals</p>
          <select className="input w-full" value={lineBind ? key({ section: lineBind.bind.section, field: lineBind.bind.field, sub: lineBind.bind.sub } as Askable) : ''} onChange={(e) => { const o = textOffers.find((x) => key(x) === e.target.value); setLine(o ? { section: o.section, field: o.field, ...(o.sub ? { sub: o.sub } : {}) } : undefined, lineFixed?.fixed); }}>
            <option value="">— none of the customer's —</option>
            {Object.entries(groupBy(textOffers)).map(([section, list]) => (
              <optgroup key={section} label={section}>{list.map((o) => <option key={key(o)} value={key(o)}>{o.label}</option>)}</optgroup>
            ))}
          </select>
          <input className="input w-full" placeholder="Or the design's own words, in English" value={lineFixed?.fixed.en ?? ''} onChange={(e) => setLine(lineBind?.bind, { en: e.target.value, ...(lineFixed?.fixed.tl !== undefined ? { tl: lineFixed.fixed.tl } : {}) })} />
          <input className="input w-full" placeholder="sa Tagalog" value={lineFixed?.fixed.tl ?? ''} onChange={(e) => setLine(lineBind?.bind, { en: lineFixed?.fixed.en ?? '', ...(e.target.value ? { tl: e.target.value } : {}) })} />
        </div>
      )}
      {el.moment === 'code' && (
        <label className="block">
          <span className="label">The code (3 to 8 digits)</span>
          <input className="input w-full font-mono" inputMode="numeric" value={el.code ?? ''} onChange={(e) => edit((m) => { const v = e.target.value.replace(/\D/g, '').slice(0, 8); const n: MomentEl = { ...m, code: v }; if (!v) delete n.code; return n; })} />
        </label>
      )}
      <p className="hint">{def.realism}</p>
    </div>
  );
}

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
                <>
                  <input
                    className="input w-full font-mono text-xs"
                    placeholder="/babyblue/cloud.webp"
                    value={el.ifEmpty.piece}
                    onChange={(e) => onChange((x) => ({ ...x, ifEmpty: { piece: e.target.value } }))}
                  />
                  {el.ifEmpty.piece
                    ? <span className="mt-1 block h-12 w-12 rounded border border-black/10 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${el.ifEmpty.piece})` }} />
                    : <span className="hint">Pick one in the <strong>Library</strong>, on the left, with this frame still selected.</span>}
                </>
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
/**
 * A writing read off an imported page, and what fills it.
 *
 * `pick` is the same idea as a frame's, and for the same reason: a
 * placeholder brought in as the words it was standing in for is a design
 * that says Amelia and Matthew are getting married whoever the customer is.
 * It is one of four things — a question, the design's own heading, the
 * app's own words, or the words kept as typed — so it carries which kind
 * it is as well as which one (`ASK`/`WORD`/`APP`, below).
 *
 * `why` is what the reading made of it, shown beside the answer so she can
 * see at a glance whether the guess was sound rather than having to check
 * it against the page.
 */
type Wording = { text: PdfText; keep: boolean; pick: string; index: number; show?: FieldRef['show']; why?: string };

/** What a writing's pick is wired to. The prefix is what tells the three apart. */
const ASK = 'ask:';
const WORD = 'word:';
const APP = 'app:';

/** A writing's pick as the one source the box will carry, or nothing where the words are kept as typed. */
function sourceOfPick(pick: string, show: FieldRef['show']): Source | undefined {
  if (pick.startsWith(WORD)) return { word: pick.slice(WORD.length) as WordKey };
  if (pick.startsWith(APP)) return { copy: pick.slice(APP.length) };
  if (!pick.startsWith(ASK)) return undefined;
  const [section, field, sub] = pick.slice(ASK.length).split('|');
  if (!section || !field) return undefined;
  return { bind: { section, field, ...(sub ? { sub } : {}), ...(show ? { show } : {}) } };
}

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
  /** The questions a writing can be wired to, in the shape the reading wants them. */
  const sayings = useMemo<Offer[]>(() => askable(occasion, 'text').map((a) => ({
    key: key(a), section: a.section, field: a.field, sub: a.sub, label: a.label, list: a.list, type: a.type,
  })), [occasion]);
  /** The design's own headings, each with every wording it might have been printed as. */
  const headings = useMemo<Word[]>(() => {
    const offered = wordsFor(occasion);
    return [
      ...offered.titles.map((k) => ({ key: titleWord(k) as string, label: titleLabel(k, occasion), said: titleSaid(k, occasion) })),
      ...offered.lines.map((k) => ({ key: k as string, label: lineLabel(k, occasion) })),
    ];
  }, [occasion]);

  // the pages are shown from the blobs in hand, so they are on screen before
  // anything has been sent anywhere
  useEffect(() => () => { for (const s of sheets ?? []) if (s.url) URL.revokeObjectURL(s.url); }, [sheets]);

  /*
   * Every frame and every writing as it arrives, with each writing already
   * read: a guess to confirm rather than a hundred questions to hunt
   * through, and the reason beside it so a bad guess is obvious at a glance.
   *
   * The questions taken are carried down the page, so a master naming the
   * bride on three of them does not wire all three to the same box.
   */
  const carry = (rects: Rect[], texts: PdfText[] = []): Pick<Sheet, 'frames' | 'texts'> => {
    const taken = new Set<string>();
    return {
      frames: rects.map((rect) => ({ rect, keep: true, pick: '', index: 0 })),
      texts: texts.map((text) => {
        const read = guessOffer(text.lines, sayings, headings, taken, phraseFor);
        if (read?.offer) taken.add(read.offer.key);
        const pick = read?.offer ? `${ASK}${read.offer.key}`
          : read?.word ? `${WORD}${read.word}`
          : read?.copy ? `${APP}${read.copy}`
          : '';
        return { text, keep: true, pick, index: 0, show: read?.show, why: read?.why };
      }),
    };
  };

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

  /**
   * What fills a writing, picked or re-picked.
   *
   * A date or a time comes with a way of saying it already chosen, because
   * a box wired to one and told nothing would print `2026-12-18` on a cover
   * — and the whole reason a master carries the date as words is that a
   * guest reads words. Anything else clears it.
   */
  function wire(s: number, at: number, value: string) {
    const chosen = sayings.find((o) => `${ASK}${o.key}` === value);
    const show: Wording['show'] = chosen?.type === 'date' ? 'date' : chosen?.type === 'time' ? 'time' : undefined;
    edit(s, (sheet) => ({
      ...sheet,
      texts: sheet.texts.map((t, i) => (i === at ? { ...t, pick: value, show, index: 0 } : t)),
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
          texts: s.texts.filter((t) => t.keep).map((t) => ({ text: t.text, from: sourceOfPick(t.pick, t.show) })),
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
                  {sheet.texts.map((t, i) => {
                    const chosen = sayings.find((o) => `${ASK}${o.key}` === t.pick);
                    return (
                      <li key={`t${i}`} className={`rounded bg-white p-2 ${t.keep ? '' : 'opacity-50'}`} data-testid="writing">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-[color:var(--color-ink-700)] px-1.5 py-0.5 text-[11px] font-semibold text-white">&ldquo;&rdquo;</span>
                          <span className="min-w-[10rem] flex-1 truncate text-sm">{t.text.lines.join(' / ')}</span>
                          <span className="text-[11px] text-[color:var(--color-ink-500)]">{t.text.size.toFixed(1)}cqw{t.text.face ? ` · the ${t.text.face} face` : ''}</span>
                          <button
                            type="button" className="btn btn-ghost btn-sm"
                            onClick={() => edit(s, (x) => ({ ...x, texts: x.texts.map((y, j) => (j === i ? { ...y, keep: !y.keep } : y)) }))}
                          >
                            {t.keep ? 'Discard' : 'Keep'}
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-end gap-2">
                          <label className="min-w-[14rem] flex-1">
                            <select
                              className="input w-full text-xs" value={t.pick} disabled={!t.keep} data-testid="fills"
                              onChange={(e) => wire(s, i, e.target.value)}
                            >
                              <option value="">Keep these words as they are</option>
                              <optgroup label="The customer answers this">
                                {Object.entries(groupBy(askable(occasion, 'text'))).map(([section, list]) => (
                                  <optgroup key={section} label={`— ${section}`}>
                                    {list.map((o) => <option key={key(o)} value={`${ASK}${key(o)}`}>{o.label}</option>)}
                                  </optgroup>
                                ))}
                              </optgroup>
                              <optgroup label="The design&rsquo;s own words">
                                {headings.map((w) => <option key={w.key} value={`${WORD}${w.key}`}>{w.label}</option>)}
                              </optgroup>
                              {t.pick.startsWith(APP) && (
                                <optgroup label="The app&rsquo;s own words">
                                  <option value={t.pick}>{t.text.lines.join(' ')} — in the guest&rsquo;s language</option>
                                </optgroup>
                              )}
                            </select>
                          </label>
                          {chosen?.list && (
                            <label className="w-20">
                              <span className="label">Which</span>
                              <input
                                type="number" min={1} max={40} className="input w-full" disabled={!t.keep}
                                value={t.index + 1}
                                onChange={(e) => edit(s, (x) => ({ ...x, texts: x.texts.map((y, j) => (j === i ? { ...y, index: Math.max(0, Math.round(Number(e.target.value)) - 1) } : y)) }))}
                              />
                            </label>
                          )}
                          {(chosen?.type === 'date' || chosen?.type === 'time') && (
                            <label className="min-w-[8rem]">
                              <span className="label">Said as</span>
                              <select
                                className="input w-full text-xs" disabled={!t.keep} value={t.show ?? ''}
                                onChange={(e) => edit(s, (x) => ({ ...x, texts: x.texts.map((y, j) => (j === i ? { ...y, show: (e.target.value || undefined) as Wording['show'] } : y)) }))}
                              >
                                <option value="">As it is stored</option>
                                <option value="date">18 December 2026</option>
                                <option value="dateShort">Dec 18, 2026</option>
                                <option value="weekday">Friday</option>
                                <option value="time">4:00 PM</option>
                              </select>
                            </label>
                          )}
                        </div>
                        {t.why && (
                          <p className="hint mt-1" data-testid="why">
                            {t.pick ? 'Read as' : 'Left to you —'} {t.why}.
                          </p>
                        )}
                      </li>
                    );
                  })}
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

/**
 * The two backgrounds a page can carry, in the words she asked for them in.
 * She can give one or both: where both are there the window picks between
 * them, so a guest on a phone gets the phone's picture and a guest on a
 * laptop the wide one, and neither is ever stretched into the other's shape.
 * How far either reaches down the invitation is the one other question, and
 * it is asked once, below them both.
 */
const BACKGROUND_SLOTS: { key: 'phone' | 'website'; name: string; size: string; hint: string }[] = [
  {
    key: 'phone', name: 'Background for the phone', size: '1080 × 1920',
    hint: 'The shape of a phone screen. It fills the screen and stays put while the writings move over it; on a laptop, with no website background beside it, it keeps to the column with the surround at either side.',
  },
  {
    key: 'website', name: 'Background for the whole website', size: '1920 × 1080',
    hint: 'One picture across the whole window, edge to edge on a laptop, and the writings move over it. A phone shows the middle of it, unless you give a phone background above — then the phone gets that one instead.',
  },
];

function PageProps({ page, onChange, onGround, onBackground, onRunsOn, words, joinedTo, pinnedOn, templateId, vars, sections, pieces, dress, tall, booklets }: {
  page?: PageSpec;
  /** the booklets this design already has, so a page can join one by name rather than by spelling */
  booklets: string[];
  onChange: (fn: (p: PageSpec) => PageSpec) => void;
  /** the whole background at once: a colour, a drawn page's picture, or none */
  onGround: (g: Ground | undefined, pin?: PageSpec['pin']) => void;
  /** one of the two background pictures, or taking one away */
  onBackground: (which: 'phone' | 'website', pic: Picture | undefined) => void;
  /** how many pages after this one its background also stands behind */
  onRunsOn: (n: number) => void;
  /**
   * The page's own writings: the ones still flowing with the words, the ones
   * she has made steady, and the two ways between them. A writing flows
   * unless she says otherwise, and saying otherwise used to be a drag and
   * nothing else — which is a gesture nobody finds. It is a button now.
   */
  words: {
    flowing: { id: string; text: string }[];
    steady: { id: string; text: string }[];
    lift: (id: string) => void;
    back: (id: string) => void;
    pick: (id: string) => void;
  };
  /** the page whose picture runs on under this one, by name, when this page sits on one */
  joinedTo?: string;
  /** the page whose picture is pinned to the screen under this one, by name, when this page scrolls over one */
  pinnedOn?: string;
  templateId: string;
  vars: Record<string, string>;
  sections: SectionTools;
  /** what a page laid out by its words carries: the floats, and the decorations */
  pieces: {
    floats: PhotoEl[]; decor: Element[];
    addFloat: () => void; addDecor: () => void; pick: (id: string) => void; drop: (id: string) => void;
  };
  /** how that page dresses the sections it carries */
  dress: { value?: SectionStyle; set: (change: (d: SectionStyle) => SectionStyle) => void };
  /**
   * How tall the page came out, and the way to bring it inside a screen.
   *
   * The height is measured on the canvas rather than worked out, because
   * the height of a page laid out by its words is whatever the words make
   * it — nobody, the studio included, can say it in advance. `screens` is
   * that measurement in screens of the view she is looking at, so the
   * number she reads is the number a guest gets.
   */
  tall: { screens?: number; fit: () => void; onPhone: boolean };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [heavy, setHeavy] = useState('');
  const [kept, setKept] = useState(false);
  /** a picture put in the slot it does not suit, said rather than refused */
  const [shape, setShape] = useState('');
  if (!page) return <p className="hint">This design has no pages yet.</p>;
  const ground = page.ground;
  const picture = ground && isPicture(ground) ? ground : undefined;
  /*
   * The page's two backgrounds, read back out of what it holds the same way
   * `setBackground` puts them in: the page's own picture is the phone's when
   * the pin says the column, and the website's otherwise, with the phone's
   * riding along beside it.
   */
  const slots: Record<'phone' | 'website', Picture | undefined> = {
    phone: page.pin === 'column' ? picture : picture?.phone,
    website: page.pin === 'column' ? undefined : picture,
  };
  const flows = groundKind(page) === 'flow';
  /** both sizes given: the window is what picks between them (`PHONE_WINDOW`) */
  const both = Boolean(slots.phone && slots.website);

  async function pick(file: File, which: 'phone' | 'website') {
    setBusy(true);
    setError('');
    /*
     * What it weighs, said here rather than only on the checklist. The
     * checklist knows the weight of everything already uploaded, from the
     * rows; this knows it while the file is still in her hand, which is the
     * one moment when going back to the design tool and saving it smaller is
     * cheap. The number and the advice are the checklist's own.
     */
    setHeavy(file.size > HEAVY_GROUND
      ? `That file is ${Math.round(file.size / 1024)} kB. Under ${Math.round(HEAVY_GROUND / 1024)} kB is what a guest on mobile data can carry for every page — a WebP export rather than a PNG usually gets there.`
      : '');
    try {
      /*
       * Her picture, as she gave it, in the slot she put it in. Nothing is
       * cut in three and nothing is stretched: each of the two backgrounds
       * fills what it was made for and the window picks between them. A
       * picture whose shape does not suit its slot is still hers to use —
       * it is cropped to fit, and the line below says so rather than the
       * upload refusing it.
       */
      const up = await uploadGround(file, templateId);
      const pic: Picture = { url: up.url, ratio: up.ratio, top: up.top, bottom: up.bottom };
      const suits = kindOfShape(up.ratio);
      setShape(page?.drawn || suits === which || (which === 'website' && suits === 'flow')
        ? ''
        : which === 'phone'
          ? 'That picture is wider than a phone screen, so a phone will show the middle of it. A picture about 1080 × 1920 fills a phone exactly.'
          : 'That picture is taller than a window, so a laptop will show the middle of it. A picture about 1920 × 1080 fills a window exactly.');
      if (page?.drawn) onGround(pic);
      else onBackground(which, pic);
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
      <div className="grid grid-cols-2 gap-2">
        {/*
          * How far the page above dissolves into this one. It is the thing
          * that makes ten separate backgrounds read as one sheet of paper,
          * and it was in the document from the start with no way to set it.
          */}
        <label className="block">
          <span className="label">Join above</span>
          <input
            type="number" step={0.02} min={0} max={1}
            value={page.seam ?? ''}
            placeholder="0.24"
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Math.min(1, Math.max(0, Number(e.target.value)));
              onChange((pg) => { const next = { ...pg, seam: v }; if (v === undefined) delete next.seam; return next; });
            }}
            className="input w-full"
          />
        </label>
        {/*
          * Room at the foot, for a ground whose art runs along the bottom.
          * A multiple of the usual rather than a number of pixels, because
          * the usual is viewport-relative and pixels would be right on a
          * phone and wrong on a laptop.
          */}
        <label className="block">
          <span className="label">Room at the foot</span>
          <input
            type="number" step={0.25} min={0} max={12}
            value={page.footPad ?? ''}
            placeholder="1"
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Math.min(12, Math.max(0, Number(e.target.value)));
              onChange((pg) => { const next = { ...pg, footPad: v }; if (v === undefined) delete next.footPad; return next; });
            }}
            className="input w-full"
          />
        </label>
        {/* the same at the head: the words start this far down, so a moment hung off the top has the page to itself above them */}
        <label className="block">
          <span className="label">Room at the head</span>
          <input
            type="number" step={0.25} min={0} max={12}
            value={page.headPad ?? ''}
            placeholder="1"
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Math.min(12, Math.max(0, Number(e.target.value)));
              onChange((pg) => { const next = { ...pg, headPad: v }; if (v === undefined) delete next.headPad; return next; });
            }}
            className="input w-full"
          />
        </label>
      </div>
      <p className="hint">
        The join is how far the background above dissolves into this one, as a share of the page&rsquo;s width &mdash; 0.24 unless it is said, and it is what makes separate backgrounds read as one sheet of paper.
        The room at the foot is a multiple of the usual gap, for a ground whose art runs along the bottom.
      </p>
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
      {/*
        * What a page laid out by its words carries. Only there — a drawn page
        * places everything by hand — and a list rather than a canvas for the
        * same reason: its height is its customer's words, so there is nowhere
        * to drag to.
        *
        * Two kinds, and the difference is what the words do. A float is in
        * among them and they flow past it. A decoration hangs off the head or
        * the foot and the words do not move for it at all, so it goes behind
        * them unless it is told to go in front, and the room for it at the
        * foot is the page's own foot setting above.
        */}
      {!page.drawn && (
        <div className="border-t border-[color:var(--color-sand-300)] pt-3">
          <p className="label">Pictures and pieces on this page</p>
          <ol className="mt-1 space-y-1">
            {pieces.floats.map((el) => (
              <li key={el.id} className="flex items-center gap-1 rounded bg-[color:var(--color-sand-100)] px-2 py-1 text-xs">
                <button type="button" className="min-w-0 flex-1 truncate text-left underline" onClick={() => pieces.pick(el.id)}>
                  The words flow past it, {el.float === 'right' ? 'on the right' : 'on the left'} · {el.w ?? 40}% wide{el.x !== undefined ? ` · ${Math.round(el.x)} across, ${Math.round(el.y)} down` : ''}{el.rotate ? ` · turned ${el.rotate}°` : ''}
                </button>
                <button type="button" title="Take it off this page" onClick={() => pieces.drop(el.id)} className="rounded bg-white px-1.5 text-red-700">✕</button>
              </li>
            ))}
            {pieces.decor.map((el) => (
              <li key={el.id} className="flex items-center gap-1 rounded bg-[color:var(--color-sand-100)] px-2 py-1 text-xs">
                <button type="button" className="min-w-0 flex-1 truncate text-left underline" onClick={() => pieces.pick(el.id)}>
                  {el.from === 'bottom' ? 'At the foot' : 'At the head'} · {el.kind === 'photo' ? 'a picture' : el.kind === 'shape' ? 'a shape' : el.kind === 'text' ? (el.lifted ? 'a writing of the page\u2019s own, lifted' : 'words') : el.kind === 'anim' ? 'an animation' : el.kind === 'moment' ? `a moment: ${momentName(el.moment, el.variant).toLowerCase()}` : 'a clip'} · {(el.z ?? 0) > 0 ? 'over the words' : 'behind the words'}
                </button>
                <button type="button" title="Take it off this page" onClick={() => pieces.drop(el.id)} className="rounded bg-white px-1.5 text-red-700">✕</button>
              </li>
            ))}
          </ol>
          {/*
            * The page's own writings, and the one thing to say about each:
            * does it flow with the words or stay where she puts it. Making
            * one steady was a drag on a faint outline and nothing else, so
            * it is a button here too — and the way back is a button beside
            * it rather than deleting a box and hoping.
            */}
          {(words.flowing.length > 0 || words.steady.length > 0) && (
            <div className="mt-2">
              <p className="label">The words on this page</p>
              <ol className="mt-1 space-y-1">
                {words.steady.map((w) => (
                  <li key={w.id} className="flex items-center gap-1 rounded bg-[color:var(--color-sand-100)] px-2 py-1 text-xs">
                    <button type="button" className="min-w-0 flex-1 truncate text-left underline" onClick={() => words.pick(w.id)}>
                      {w.text || 'a writing'} &middot; steady where you put it
                    </button>
                    <button type="button" onClick={() => words.back(w.id)} className="shrink-0 rounded bg-white px-1.5">Let it flow</button>
                  </li>
                ))}
                {words.flowing.map((w) => (
                  <li key={w.id} className="flex items-center gap-1 rounded bg-[color:var(--color-sand-100)] px-2 py-1 text-xs">
                    <span className="min-w-0 flex-1 truncate">{w.text || 'a writing'} &middot; flows with the words</span>
                    <button type="button" onClick={() => words.lift(w.id)} className="shrink-0 rounded bg-white px-1.5">Make it steady</button>
                  </li>
                ))}
              </ol>
              <p className="hint">
                A writing flows with the words above and below it, which is how a page laid out by its words reads.
                <strong> Make it steady</strong> takes it out of that flow into a box of its own, where you place it, size it and turn it like any other piece &mdash; and it still reads the same answer from the form. Dragging its faint outline on the page does the same thing.
              </p>
            </div>
          )}
          <div className="mt-1 flex gap-1">
            <button type="button" onClick={pieces.addFloat} className="flex-1 rounded bg-[color:var(--color-sand-200)] px-2 py-1 text-xs">
              + one the words flow past
            </button>
            <button type="button" onClick={pieces.addDecor} className="flex-1 rounded bg-[color:var(--color-sand-200)] px-2 py-1 text-xs">
              + one along the head
            </button>
          </div>
          <p className="hint">
            The section&rsquo;s own words wrap beside a float &mdash; the real ones, not a guess &mdash; and a turned picture is followed by the words at its tilt rather than at its corners.
            A decoration hangs off the head or the foot and the words do not move for it, so keep it clear of them with the page&rsquo;s foot setting above.
            Press one to set what it reads, how wide it is, how far down it hangs and how far it turns.
          </p>
        </div>
      )}
      {/*
        * How this page dresses its sections.
        *
        * The sections are the app's own components and they are the same on
        * every design, which is why a design built here used to come out
        * looking like the app. These four settings are read by all of them
        * through one attribute and a few variables, so the same RSVP form is
        * centred on a card here and left on bare paper under a flourish
        * there, without a component knowing or a new one being written.
        */}
      {!page.drawn && (
        <div className="border-t border-[color:var(--color-sand-300)] pt-3">
          <p className="label">How its sections are dressed</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">The words sit</span>
              <select
                className="input w-full"
                value={dress.value?.align ?? 'center'}
                onChange={(e) => dress.set((d) => ({ ...d, align: e.target.value === 'center' ? undefined : (e.target.value as 'left' | 'right') }))}
              >
                <option value="center">In the middle</option>
                <option value="left">To the left</option>
                <option value="right">To the right</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Each section sits</span>
              <select
                className="input w-full"
                value={dress.value?.card ? 'card' : 'plain'}
                onChange={(e) => dress.set((d) => ({ ...d, card: e.target.value === 'card' ? true : undefined }))}
              >
                <option value="plain">On the page itself</option>
                <option value="card">On a card</option>
              </select>
            </label>
          </div>
          <div className="mt-2 flex items-start gap-2">
            <span
              className="h-10 w-16 shrink-0 rounded border border-black/10 bg-contain bg-center bg-no-repeat"
              style={dress.value?.rule ? { backgroundImage: `url(${dress.value.rule})` } : { background: 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50%/8px 8px' }}
            />
            <div className="min-w-0 flex-1">
              <p className="label">Over each section</p>
              {dress.value?.rule ? (
                <div className="mt-0.5 flex items-center gap-1">
                  <label className="flex-1">
                    <span className="hint">How tall, as a multiple of the page&rsquo;s gap</span>
                    <input
                      type="number" step={0.1} min={0} max={6}
                      value={dress.value.ruleHeight ?? 1}
                      onChange={(e) => dress.set((d) => ({ ...d, ruleHeight: place(Number(e.target.value)) }))}
                      className="input w-full"
                    />
                  </label>
                  <button type="button" onClick={() => dress.set((d) => ({ ...d, rule: undefined, ruleHeight: undefined }))} className="rounded bg-white px-1.5 text-red-700">✕</button>
                </div>
              ) : (
                <p className="hint">Pick a piece in the <strong>Library</strong>, on the left, and press <em>Draw it over each section on this page</em>. It follows the alignment above.</p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="border-t border-[color:var(--color-sand-300)] pt-3">
        <p className="label">Background</p>
        {!ground && joinedTo && (
          <p className="hint mb-1" data-testid="joined">
            On the picture that runs on from <strong>{joinedTo}</strong> &mdash; one length of it down both pages, drawn here where it reaches.
            A picture or a colour picked below gives this page a ground of its own and ends the run here.
          </p>
        )}
        {/*
          * Two backgrounds, and one question about them.
          *
          * She asked for it in these words: one background for the phone,
          * one for the whole website, and the choice of how far either
          * flows over the pages she picks. So the picture is not asked what
          * it is — the slot it goes in says that — and the four ways a
          * background used to be able to be set, which between them could
          * cut a picture in three and stretch its middle down a page, are
          * gone. Neither of these is ever cut, and neither ever stretches:
          * each fills what it was made for and the window picks between
          * them.
          *
          * A page drawn by hand is the one exception: its picture *is* the
          * page, at the page's own proportions, so it takes one picture and
          * no choices.
          */}
        {page.drawn ? (
          <div className="mt-1 flex items-start gap-2">
            <span
              className="h-16 w-11 shrink-0 rounded border border-black/10 bg-cover bg-top"
              style={picture ? { backgroundImage: `url(${picture.url})` } : { background: ground ? colourOf((ground as ColourGround).color, vars) : 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50%/10px 10px' }}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <label className={`btn btn-secondary btn-sm w-full ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
                {busy ? 'Reading the picture…' : picture ? 'Replace the picture' : 'Upload a picture'}
                <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && pick(e.target.files[0], 'website')} />
              </label>
              {ground && <button type="button" onClick={() => onGround(undefined)} className="btn btn-ghost btn-sm w-full">No background</button>}
            </div>
          </div>
        ) : (
          <div className="mt-1 space-y-2" data-testid="slots">
            {BACKGROUND_SLOTS.map(({ key, name, size, hint }) => {
              const pic = slots[key];
              return (
                <div key={key} className="flex items-start gap-2" data-testid={`slot-${key}`}>
                  <span
                    className={`h-16 shrink-0 rounded border bg-cover bg-center ${key === 'phone' ? 'w-9' : 'w-[104px]'} ${pic ? 'border-black/10' : 'border-dashed border-black/25'}`}
                    style={pic ? { backgroundImage: `url(${pic.url})` } : { background: 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50%/10px 10px' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="label">{name}</p>
                    <p className="hint">{hint}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <label className={`btn btn-secondary btn-sm ${busy ? 'opacity-60' : 'cursor-pointer'}`} data-testid={`upload-${key}`}>
                        {busy ? 'Reading the picture…' : pic ? 'Replace it' : `Upload one (${size})`}
                        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && pick(e.target.files[0], key)} />
                      </label>
                      {pic && <button type="button" disabled={busy} onClick={() => onBackground(key, undefined)} className="btn btn-ghost btn-sm">Take it off</button>}
                      {/*
                        * A background she liked once is a background she will
                        * want again. Keeping it costs one tap and no second
                        * upload: the library points at the same file.
                        */}
                      {pic && pic.url.startsWith('/uploads/') && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            const res = await keepPieceAction(pic.url, `${page.label?.en ?? page.key} — ${key === 'phone' ? 'phone' : 'website'}`, 'background');
                            setBusy(false);
                            setError(res.ok ? '' : res.error ?? 'It would not save.');
                            if (res.ok) setKept(true);
                          }}
                          className="btn btn-ghost btn-sm"
                        >
                          {kept ? 'In the library' : 'Keep it in the library'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
        {heavy && <p className="hint text-amber-800">{heavy}</p>}
        {shape && <p className="hint text-amber-800" data-testid="shape">{shape}</p>}
        {/*
          * The four backgrounds, in the four lines she asked for them in:
          * one for the phone and one for the whole website, each of them
          * either this page's alone or flowing over the pages she picks.
          *
          * Which size it is comes from the slot the picture is in, so the
          * size half of each line is checked from that and a line whose
          * size she has not uploaded says so rather than pretending. How
          * far it reaches is `runsOn`, and it is the same answer for both
          * sizes, because the pages a background stands behind are the
          * page's own business and not the picture's: where she has given
          * both, the line under them says the window is what picks.
          */}
        {picture && !page.drawn && (
          <div className="mt-2" data-testid="reach">
            <p className="label">What is this background?</p>
            <div className="mt-1 flex flex-col gap-1">
              {([
                ['phone', 0, 'Background for the phone — this page only'],
                ['phone', 1, 'Background for the phone — flowing over the pages I pick'],
                ['website', 0, 'Background for the whole website — this page only'],
                ['website', 1, 'Background for the whole website — flowing over the pages I pick'],
              ] as const).map(([which, reaches, name]) => {
                const has = Boolean(slots[which]);
                const isSize = both || (which === 'phone' ? page.pin === 'column' : page.pin !== 'column');
                const flowing = (picture.runsOn ?? 0) > 0;
                return (
                  <label key={`${which}-${reaches}`} className={`flex items-start gap-2 ${has ? '' : 'opacity-60'}`}>
                    <input
                      type="radio"
                      name={`reach-${page.key}`}
                      checked={has && isSize && flowing === Boolean(reaches)}
                      disabled={busy || !has}
                      onChange={() => onRunsOn(reaches ? Math.max(1, picture.runsOn ?? 1) : 0)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      {name}
                      {!has && <span className="hint block">Upload one in the {which === 'phone' ? 'phone' : 'website'} slot above to use this.</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            {both && (
              <p className="hint mt-1" data-testid="both">
                You have given both sizes, so the window picks between them: a phone gets the phone background and a laptop the wide one. How far they reach is the same for both.
              </p>
            )}
            {(picture.runsOn ?? 0) > 0 && (
              <label className="mt-2 block">
                <span className="label">Flowing over</span>
                <select className="input w-full text-xs" value={picture.runsOn ?? 1} onChange={(e) => onRunsOn(Number(e.target.value))} data-testid="runs-on">
                  <option value={1}>this page and the next</option>
                  <option value={2}>this page and the next 2</option>
                  <option value={3}>this page and the next 3</option>
                  <option value={4}>this page and the next 4</option>
                </select>
              </label>
            )}
            <p className="hint mt-1">
              {flows
                ? <>This design&rsquo;s own background is laid as one length down the pages it covers, and where they run past its foot it keeps its head and its foot whole and stretches the band between &mdash; which is why an uploaded background is never laid that way.</>
                : <>A background that flows over pages is one still picture standing behind them all: the writings move over it and it never moves or stretches. A page with a background of its own ends it there, and so does a page drawn by hand.</>}
            </p>
          </div>
        )}
        {flows && (
          <p className="hint mt-2" data-testid="flows">
            This page&rsquo;s picture is one of the tall backgrounds this design was drawn on, and is used as it was drawn.
            Uploading a background above puts a still picture behind the page instead, which never stretches.
          </p>
        )}
        {pinnedOn && !page.drawn && (
          <p className="hint mt-2" data-testid="pinned-on">
            This page scrolls over the picture pinned to the screen on <strong>{pinnedOn}</strong>, and a colour of its own waits until that ends. A picture of its own ends it here.
          </p>
        )}
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
        <BookColours
          value={ground && !isPicture(ground) ? ground.color : undefined}
          onPick={(c) => onGround({ color: c, ratio: ground && !isPicture(ground) ? ground.ratio : undefined })}
        />
        {ground && !isPicture(ground) && !page.drawn && (
          <button type="button" onClick={() => onGround(undefined)} className="btn btn-ghost btn-sm mt-1 w-full">No background at all</button>
        )}
        <p className="hint">A role colour follows the palette, so it turns itself down at night. A colour of your own does not.</p>
        {/*
          * Whether the background reaches the whole website page. On a
          * laptop the column stops short of the window's edge; a background
          * that reaches runs edge to edge behind it — a colour out to the
          * edges, or one picture across the whole page with the column
          * showing the middle of it — and a phone shows the middle of it.
          * Kept to the column, the colour beside it is the design's own
          * surround (Theme…, Beside it) or one said here.
          */}
        {ground && !isPicture(ground) && (
          <label className="mt-2 flex items-start gap-2" data-testid="bleed">
            <input
              type="checkbox"
              checked={bleeds(page)}
              onChange={(e) => onChange((p) => { const next: PageSpec = { ...p, bleed: e.target.checked }; if (next.bleed === (p.ground ? !isPicture(p.ground) : false)) delete next.bleed; return next; })}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Reaches the whole website page
              <span className="hint block">On a laptop the colour runs edge to edge behind the column, out to the window&rsquo;s edges. A clip behind the page reaches with it. Off, it stays in the column.</span>
            </span>
          </label>
        )}
        {!bleeds(page) && (
          <>
            <p className="label mt-2">Beside the page, on a laptop</p>
            <div className="mt-1 flex items-center gap-1" data-testid="outside">
              <select
                className="input min-w-0 flex-1 text-xs"
                value={page.outside === undefined || page.outside === 'design' ? '' : ROLES.some((r) => r.key === page.outside) ? page.outside : 'own'}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange((p) => {
                    const next = { ...p, outside: v === '' ? undefined : v === 'own' ? (p.outside?.startsWith('#') ? p.outside : '#ffffff') : v };
                    if (next.outside === undefined) delete next.outside;
                    return next;
                  });
                }}
              >
                <option value="">The design&rsquo;s surround (Theme…, Beside it)</option>
                {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                <option value="own">A colour of its own</option>
              </select>
              {page.outside?.startsWith('#') && (
                <input type="color" value={page.outside} onChange={(e) => onChange((p) => ({ ...p, outside: e.target.value }))} className="h-7 w-7 shrink-0 cursor-pointer rounded border border-black/15 p-0" />
              )}
            </div>
          </>
        )}
        {/*
          * "Make it longer." A page laid out by its words is as tall as they
          * are, and a background or a piece wanting more room had nowhere to
          * get it from. Screens rather than pixels, because a screen is what
          * a guest sees at a time and the same number holds on a phone and a
          * laptop.
          */}
        {!page.drawn && (
          <label className="mt-2 block">
            <span className="label">At least this tall, in screens</span>
            <input
              type="number" min={0.3} max={6} step={0.1}
              value={page.minScreens ?? ''}
              placeholder={groundKind(page) === 'phone' || groundKind(page) === 'website' ? 'one screen' : 'as tall as its words'}
              data-testid="min-screens"
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : place(Math.min(6, Math.max(0.3, Number(e.target.value) || 0.3)));
                onChange((pg) => { const next = { ...pg, minScreens: v }; if (v === undefined) delete next.minScreens; return next; });
              }}
              className="input w-full"
            />
            <span className="hint">1 is one screen, 2 is two; the words sit in the middle of it with the pieces around them. {groundKind(page) === 'phone' || groundKind(page) === 'website' ? 'Blank is one screen, so the background is seen whole.' : 'Blank is as tall as its words.'}</span>
          </label>
        )}

        {/*
          * "It is too big for the website." A page laid out by its words is
          * as tall as its words make it, and the invitation is a column no
          * wider than 32rem whatever the window — so a page carrying a form
          * and a countdown and a closing runs past two screens on a laptop,
          * and until now there was nothing to do about it: `minScreens`
          * only ever made a page taller.
          *
          * So: a size, and the studio works it out for her. The line says
          * how tall this page came out on the canvas, in screens, and the
          * button writes the size that brings it inside one.
          */}
        {!page.drawn && (
          <div className="mt-2" data-testid="page-size">
            <p className="label">How big this page is on the website</p>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="range"
                min={SIZE_RANGE.min} max={SIZE_RANGE.max} step={SIZE_RANGE.step}
                value={page.size ?? 1}
                data-testid="size"
                onChange={(e) => {
                  const v = place(Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, Number(e.target.value) || 1)));
                  onChange((pg) => { const next: PageSpec = { ...pg, size: v }; if (v === 1) delete next.size; return next; });
                }}
                className="min-w-0 flex-1"
              />
              <span className="w-12 shrink-0 text-right text-xs tabular-nums">{Math.round((page.size ?? 1) * 100)}%</span>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost btn-sm flex-1"
                data-testid="fit"
                disabled={tall.onPhone || !tall.screens || tall.screens <= 1.01}
                title={tall.onPhone ? 'The size is the website\u2019s \u2014 look at the page in Website to fit it' : undefined}
                onClick={tall.fit}
              >
                Fit it to one screen
              </button>
              {page.size !== undefined && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid="size-off"
                  onClick={() => onChange((pg) => { const next: PageSpec = { ...pg }; delete next.size; return next; })}
                >
                  As designed
                </button>
              )}
            </div>
            <p className="hint" data-testid="page-screens">
              {tall.screens
                ? `On the canvas this page is ${tall.screens.toFixed(2)} ${tall.screens === 1 ? 'screen' : 'screens'} tall.${tall.screens > 1.01 ? ' A guest scrolls to see the rest of it.' : ' It fits a screen.'}`
                : 'Everything on the page comes down together \u2014 the words, the air between them, the countdown\u2019s tiles, the pieces \u2014 so the page keeps its shape and simply becomes smaller.'}
              {' '}
              {tall.onPhone
                ? 'This is the phone, which shows the page whole whatever the size \u2014 a phone is a column and a guest scrolls it. Look at the page in Website to set the size.'
                : 'A phone shows the page whole whatever this says: the size is the website\u2019s, where the same column has room either side of it and a long page has nowhere to go.'}
            </p>
          </div>
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

      {/*
        * A page kept back for the Save the Date. It leaves the invitation
        * altogether — it is not a page a guest scrolls past — and becomes
        * the whole of the card instead, drawn here like any other page.
        * Turning it off puts it back in the run of pages where it sits.
        */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={page.only === 'std'} onChange={(e) => onChange((p) => ({ ...p, only: e.target.checked ? 'std' : undefined }))} className="h-4 w-4" />
        <span>This page is the Save the Date card, not part of the invitation</span>
      </label>
      {page.only === 'std' && <p className="hint">The card shows this page alone. A Save the Date carries the names, the date and a countdown, so bind its words to those; the rest of the design is not on it.</p>}

      {/*
        * A page behind a hub. It leaves the column a guest scrolls and is
        * reached by tapping an object instead — so it needs an object
        * somewhere that opens it, or nobody ever sees it. A name typed here
        * makes the booklet; the same name on the page after it puts the two
        * in one booklet, read in the order they sit in the list.
        *
        * A text box with the existing names beside it, rather than a list of
        * them: a booklet comes into being by being named, so there is
        * nothing to pick from the first time.
        */}
      <label className="block">
        <span className="label">Behind a hub</span>
        <input
          className="input w-full"
          list="inv-booklets"
          placeholder="Not behind one — this page is in the column"
          value={page.booklet ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 31);
            onChange((p) => { const next = { ...p, booklet: v || undefined }; if (!v) delete next.booklet; return next; });
          }}
        />
        <datalist id="inv-booklets">{booklets.map((b) => <option key={b} value={b} />)}</datalist>
        <span className="hint">
          {page.booklet
            ? `In the “${page.booklet}” booklet. Give an object on another page “Opens” → ${page.booklet}, or a guest will never reach this page.`
            : 'Name a booklet and this page leaves the column, reached by tapping an object that opens that booklet. Several pages with the same name are one booklet.'}
        </span>
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
  texts: { text: PdfText; from?: Source }[];
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
function wordsFromPdf(id: string, t: PdfText, from?: Source): TextEl {
  return {
    id, kind: 'text', block: 'free', anchor: 'top',
    x: place(t.left + t.width / 2),
    y: place(t.top),
    w: place(t.width),
    size: t.size,
    ...(t.face ? { face: t.face } : {}),
    /*
     * Wired, it is one line and nothing else.
     *
     * One line because a placeholder set over three lines \u2014 AMELIA, &,
     * MATTHEW \u2014 is still one answer, and three lines each carrying the
     * same binding would print the name three times. The box keeps the
     * width and the size the placeholder had, so the answer wraps inside it
     * the way the words it replaced did.
     *
     * And nothing else: no fixed words behind it as a fallback. A guest
     * whose answer is empty must see nothing, not the name of whoever the
     * master was designed for \u2014 the canvas draws an empty box labelled
     * with what fills it, which is how she can still see and move one.
     *
     * Unwired, the words stay exactly as they were read, line for line,
     * which is right for a heading nobody can rename and for anything the
     * reading could not place.
     */
    lines: from
      ? [{ role: 'body' as const, align: t.align, sources: [from] }]
      : t.lines.map((words) => ({
        role: 'body' as const,
        align: t.align,
        sources: [{ fixed: { en: words } }],
      })),
  };
}

/**
 * The library, in the left column.
 *
 * Every piece any design can be built from, in one place: the artwork the
 * app ships — Baby Blue's ten grounds, Capiz's eight and its strand, and
 * the wardrobe's hundred and nine drawings — and everything she has
 * uploaded herself, named and tagged so she can find it again.
 *
 * A piece is used three ways, and the drawer says which are open: put it
 * on the page as the design's own picture, make it this page's background,
 * or make it what a frame shows when the customer leaves it empty. Each of
 * them copies the piece's address, never a reference to the row, so
 * deleting a piece from the library cannot blank a page that used it.
 */
function LibraryDrawer({ selected, onPlace, onGround, onIfEmpty, onRule, onStrand }: {
  selected: Element | null;
  onPlace: (url: string, aspect?: number, animated?: true) => void;
  onGround: (url: string) => void;
  onIfEmpty: (url: string) => void;
  /** offered only on a page laid out by its words, which is the only page with sections to divide */
  onRule?: (url: string) => void;
  /** the piece under the prenup photograph: the design's, not the page's */
  onStrand?: (url: string) => void;
}) {
  const built = useMemo(() => builtinPieces(), []);
  const [mine, setMine] = useState<Piece[]>([]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<PieceGroup | 'all'>('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string>('');

  const load = useCallback(async () => {
    try { setMine(await listPiecesAction()); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const all = useMemo(() => [...mine, ...built], [mine, built]);
  const shown = useMemo(() => shownPieces(all, query, group), [all, query, group]);
  const piece = shown.find((x) => x.url === open) ?? null;

  async function upload(file: File) {
    setBusy('Reading the picture…');
    setError('');
    try {
      /*
       * A moving picture takes the other road. The usual one re-encodes
       * through a canvas, which holds one frame, so a GIF down it arrives as
       * a still picture of its first frame — and she would have no way of
       * knowing why her petals stopped falling. So the bytes are asked first
       * (`movingKind` reads the chunk inside the file, since an animated WebP
       * is the same type as a still one), and a picture that moves is sent
       * exactly as it is.
       */
      const moving = await movingKind(file);
      if (moving) {
        setBusy('Sending it as it is…');
        const up = await sendMoving(await readMoving(file), '', true);
        await load();
        setOpen(up.url);
        setBusy('');
        return;
      }
      const read = await readPicture(file);
      const fd = new FormData();
      fd.set('file', new File([read.blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' }));
      fd.set('library', '1');
      fd.set('name', file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      fd.set('width', String(read.width));
      fd.set('height', String(read.height));
      const res = await fetch('/api/admin/design-upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The upload failed.');
      await load();
      setOpen(json.url as string);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  return (
    <div>
      <input
        className="input w-full text-sm"
        placeholder="Search by name or tag"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
        {([['all', 'All'], ...PIECE_GROUPS.map((g) => [g.key, g.label] as const)] as const).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setGroup(k as PieceGroup | 'all')}
            className={`rounded-full px-2 py-0.5 ${group === k ? 'bg-[color:var(--color-plum-600)] text-white' : 'bg-[color:var(--color-sand-200)] hover:bg-[color:var(--color-sand-300)]'}`}
          >
            {lbl}
          </button>
        ))}
      </div>

      <p className="hint mt-1">
        {shown.length === 0 ? 'Nothing by that name.' : `${shown.length} ${shown.length === 1 ? 'piece' : 'pieces'}`}
        {group === 'all' && !query.trim() && ' · the wardrobe is its own group, or search for it'}
      </p>

      <div className="mt-1 grid max-h-72 grid-cols-3 gap-1 overflow-auto">
        {shown.slice(0, 240).map((x) => (
          <button
            key={x.url}
            type="button"
            title={`${x.name}${x.tags.length ? ` · ${x.tags.join(', ')}` : ''}`}
            onClick={() => setOpen(x.url === open ? '' : x.url)}
            className={`aspect-square rounded border bg-white bg-contain bg-center bg-no-repeat ${x.url === open ? 'border-[color:var(--color-plum-600)] ring-2 ring-[color:var(--color-plum-600)]' : 'border-black/10 hover:border-black/30'}`}
            style={{ backgroundImage: `url(${x.url})` }}
          />
        ))}
      </div>

      {piece && (
        <div className="mt-2 rounded bg-[color:var(--color-sand-100)] p-2">
          <p className="truncate text-sm font-semibold">{piece.name}{piece.animated ? ' · moves' : ''}</p>
          <p className="hint truncate">{piece.builtin ? 'The app’s own — it cannot be renamed or removed' : piece.tags.join(', ') || 'no tags yet'}</p>
          {piece.animated && <p className="hint">It is served exactly as it was uploaded — never resized, never re-encoded — so every guest downloads it whole.</p>}
          <div className="mt-1 grid gap-1">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPlace(piece.url, piece.width && piece.height ? piece.height / piece.width : undefined, piece.animated)}>
              Put it on the page
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGround(piece.url)}>
              Make it this page’s background
            </button>
            {selected?.kind === 'photo' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onIfEmpty(piece.url)}>
                Show it when the frame is left empty
              </button>
            )}
            {onRule && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRule(piece.url)}>
                Draw it over each section on this page
              </button>
            )}
            {onStrand && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onStrand(piece.url)}>
                Draw it under the prenup photograph
              </button>
            )}
          </div>
          {!piece.builtin && piece.id && (
            <PieceDetails
              piece={piece}
              onSaved={() => void load()}
              onError={setError}
            />
          )}
        </div>
      )}

      <label className={`mt-2 block rounded border border-dashed border-[color:var(--color-sand-300)] px-2 py-3 text-center text-[11px] leading-snug ${busy ? 'opacity-60' : 'cursor-pointer hover:bg-[color:var(--color-sand-100)]'}`}>
        {busy || 'Add a piece — a bow, a cloud, a flourish, or a moving one: a GIF, an animated WebP or an animated PNG. It stays in the library for every design.'}
        <input
          type="file" accept="image/*" className="sr-only" disabled={Boolean(busy)}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
        />
      </label>
      {error && <p className="hint mt-1 text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}

/** Renaming, retagging and removing one of her own pieces. */
function PieceDetails({ piece, onSaved, onError }: { piece: Piece; onSaved: () => void; onError: (s: string) => void }) {
  const [name, setName] = useState(piece.name);
  const [tags, setTags] = useState(piece.tags.join(', '));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(piece.name); setTags(piece.tags.join(', ')); }, [piece.url, piece.name, piece.tags]);

  async function save() {
    if (!piece.id) return;
    setBusy(true);
    const res = await namePieceAction(piece.id, name, tags);
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'It would not save.');
    else onSaved();
  }

  async function drop() {
    if (!piece.id) return;
    setBusy(true);
    const res = await dropPieceAction(piece.id);
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'It would not go.');
    else onSaved();
  }

  return (
    <div className="mt-2 space-y-1 border-t border-[color:var(--color-sand-300)] pt-2">
      <input className="input w-full text-xs" value={name} placeholder="What it is" onChange={(e) => setName(e.target.value)} />
      <input className="input w-full text-xs" value={tags} placeholder="words to find it by, separated by commas" onChange={(e) => setTags(e.target.value)} />
      <div className="flex gap-1">
        <button type="button" className="btn btn-secondary btn-sm flex-1" disabled={busy} onClick={() => void save()}>Save</button>
        <button type="button" className="btn btn-ghost btn-sm text-red-700" disabled={busy} onClick={() => void drop()}>Remove</button>
      </div>
      <p className="hint">Removing it takes it out of the drawer. Pages already using it keep it: they hold its address, not this row.</p>
    </div>
  );
}

/**
 * A page brought over from another design.
 *
 * The second christening design wants the first one's story page, and
 * redrawing it from nothing is an afternoon. Every other design is offered
 * as its studio version — its draft if it has one, else what is published,
 * else the layout's built-in — because that is the version she has looked
 * at, and because a design still on its built-in is the one with the most
 * worth copying.
 *
 * The list is fetched when she opens it rather than rendered into the page:
 * a studio session lasts hours and designs are added in that time.
 */
function CopyFrom({ templateId, onCopy }: { templateId: string; onCopy: (page: PageSpec) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [designs, setDesigns] = useState<Awaited<ReturnType<typeof pagesToCopyAction>>>([]);

  async function show() {
    setOpen(true);
    if (designs.length) return;
    setBusy(true);
    try { setDesigns(await pagesToCopyAction(templateId)); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function take(id: string, key: string) {
    setBusy(true);
    setError('');
    const res = await copyPageAction(id, key);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onCopy(res.page);
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => void show()} className="mt-1 block w-full rounded px-2 py-1 text-left text-[11px] text-[color:var(--color-plum-600)] hover:bg-[color:var(--color-sand-100)]">
        Copy a page from another design…
      </button>
    );
  }

  return (
    <div className="mt-1 rounded bg-[color:var(--color-sand-100)] p-2">
      <div className="flex items-center justify-between">
        <p className="label">From another design</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[color:var(--color-ink-500)] hover:underline">close</button>
      </div>
      {busy && <p className="hint">Reading the other designs…</p>}
      {!busy && !designs.length && <p className="hint">There is no other design with pages yet.</p>}
      <div className="max-h-64 space-y-2 overflow-auto">
        {designs.map((d) => (
          <div key={d.id}>
            <p className="text-xs font-semibold">{d.name}</p>
            <ol className="mt-0.5 space-y-0.5">
              {d.pages.map((pg) => (
                <li key={pg.key}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void take(d.id, pg.key)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] hover:bg-white disabled:opacity-50"
                  >
                    <span
                      className="h-6 w-4 shrink-0 rounded-sm border border-black/10 bg-cover bg-top"
                      style={pg.ground ? { backgroundImage: `url(${pg.ground})` } : { background: 'var(--color-sand-200)' }}
                    />
                    <span className="min-w-0 flex-1 truncate">{pg.label}</span>
                    <span className="text-[color:var(--color-ink-500)]">{pg.drawn ? 'drawn' : 'flows'}{pg.elements ? ` · ${pg.elements}` : ''}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
      <p className="hint mt-1">Its pictures are shared, not copied: editing one design cannot change the other.</p>
    </div>
  );
}

/**
 * The Guide: what to export artwork at.
 *
 * Every number here is read from the constants the studio and the renderer
 * actually work in — the widest a ground is stored at, what one screen's
 * proportion is, the band a phone's browser keeps, the smallest readable
 * type — so a guide that says 1080 × 1920 says it because that is what the
 * page will be drawn at, and cannot drift from it.
 *
 * The sizes double as Canva custom sizes, which is the one number she needs
 * before she starts drawing anything.
 */
function GuideDrawer() {
  const [open, setOpen] = useState<'sizes' | 'kinds' | 'rules'>('sizes');
  return (
    <div className="text-xs">
      <div className="mb-2 flex gap-1">
        {([['sizes', 'Sizes'], ['kinds', 'Page kinds'], ['rules', 'Rules of thumb']] as const).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setOpen(k)}
            className={`rounded-full px-2 py-0.5 ${open === k ? 'bg-[color:var(--color-plum-600)] text-white' : 'bg-[color:var(--color-sand-200)] hover:bg-[color:var(--color-sand-300)]'}`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {open === 'sizes' && (
        <>
          <div className="mb-2 rounded bg-[color:var(--color-sand-100)] p-2">
            <p className="font-semibold">The website and the phone</p>
            <p className="mt-0.5 text-[color:var(--color-ink-700)]">The canvas is the website at <span className="font-mono">1280</span> px wide; the invitation column on it is <span className="font-mono">512</span> px; the phone is <span className="font-mono">390</span> px. A picture pinned to the screen behind a page&rsquo;s words, or behind the whole page: <span className="font-mono">1920 &times; 1080</span> px, the window&rsquo;s own shape &mdash; a phone shows the middle of it &mdash; or a <span className="font-mono">400 &times; 400</span> px tile to repeat behind the whole page. A tall page background meant to flow down several pages: upload it on the first of them and set <em>Runs on under</em> on that page&rsquo;s Background.</p>
          </div>
          <p className="hint">Type the first size into Canva&rsquo;s <strong>Custom size</strong>, in pixels. The second is for artwork with fine detail; nothing needs more.</p>
          <ul className="mt-2 space-y-2">
            {PAGE_SHAPES.map((sh) => {
              const px = pixelsFor(sh.ratio);
              return (
                <li key={sh.key} className="rounded bg-[color:var(--color-sand-100)] p-2">
                  <p className="font-semibold">{sh.label}</p>
                  <p className="font-mono text-[11px]">{px.small[0]} &times; {px.small[1]} px</p>
                  <p className="text-[10px] text-[color:var(--color-ink-500)]">or {px.large[0]} &times; {px.large[1]} &middot; {sh.ratio} tall for its width</p>
                  <p className="mt-0.5 text-[color:var(--color-ink-700)]">{sh.use}</p>
                </li>
              );
            })}
          </ul>
          <p className="label mt-3">The ten that shipped</p>
          <ul className="mt-1 space-y-0.5">
            {shippedExamples().map((e) => (
              <li key={e.name} className="flex justify-between gap-2">
                <span className="truncate text-[color:var(--color-ink-700)]">{e.name}</span>
                <span className="shrink-0 font-mono text-[10px]">{e.size}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {open === 'kinds' && (
        <ul className="space-y-2">
          {KINDS.map((k) => (
            <li key={k.label} className="rounded bg-[color:var(--color-sand-100)] p-2">
              <p className="font-semibold">{k.label}</p>
              <p className="mt-0.5 text-[color:var(--color-ink-700)]">{k.wants}</p>
            </li>
          ))}
        </ul>
      )}

      {open === 'rules' && (
        <ul className="space-y-1.5">
          {RULES.map((r) => (
            <li key={r} className="flex gap-1.5 text-[color:var(--color-ink-700)]">
              <span aria-hidden>&middot;</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
