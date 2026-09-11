import { z } from 'zod';
import type { Lang } from './copy';
import type { Look, LineKey, TitleKey } from './looks';
import type { SectionKey } from './sections';
import {
  STORY_SLOTS, STORY_LABELS, STORY_HEAD, PHOTO_SLOTS, PHOTO_HEAD, PHOTO_STRIP, PHOTO_ASPECT,
  type Slot,
} from './babyblue';

/**
 * What a design's encoder can change without a release: the words it writes
 * over its look's — every line under a heading and every heading a look
 * names, in each language — and the pictures that are the design's own, by
 * URL. Both live on the Template row as JSON (`words`, `art`) and are edited
 * in the admin; blank means the code's own value stands.
 */
/** A heading's key in a words block: the line under a heading and the heading itself share a name otherwise. */
export type TitleWordKey = `title:${TitleKey}`;
export type WordKey = LineKey | TitleWordKey;
export const titleWord = (key: TitleKey): TitleWordKey => `title:${key}`;
export type DesignWords = Partial<Record<Lang, Partial<Record<WordKey, string>>>>;

export type DesignArt = {
  /** The backgrounds down the page, in order; the last in the list is the one set last. */
  backgrounds?: string[];
  /** The same by night, for the night mode; blank darkens the day ones. */
  night?: string[];
  /** The strand of shell under the prenup photograph. */
  strand?: string;
  /**
   * For a layout whose pages each have a ground of their own (Baby Blue):
   * the ground by the page's key. Blank keys keep the layout's own file.
   */
  grounds?: Record<string, string>;
};

export const LINE_KEYS: LineKey[] = ['cover', 'verse', 'verseRef', 'moment1', 'moment2', 'moment3', 'story', 'invitation', 'entourage', 'sponsors', 'gallery', 'galleryNote', 'galleryVideo', 'galleryClose', 'venue', 'interlude2', 'dressCode', 'gentsNote', 'ladiesNote', 'dressNote', 'giftThanks', 'program', 'social', 'socialCta', 'guestbook', 'photos', 'photosIntro', 'countdown', 'contact', 'contactNote', 'closingMessage', 'closing'];
export const TITLE_KEYS: TitleKey[] = ['story', 'invitation', 'entourage', 'sponsors', 'gallery', 'venue', 'getting', 'dressCode', 'gift', 'program', 'social', 'guestbook', 'photos', 'rsvp', 'contact'];

/** Where each line is read, for the admin's form. */
export const LINE_LABELS: Record<LineKey, string> = {
  cover: 'Cover — above the names',
  verse: 'Cover page — the verse',
  verseRef: 'Cover page — the verse’s source',
  moment1: 'The Moment — first line',
  moment2: 'The Moment — second line',
  moment3: 'The Moment — third line',
  story: 'Our Story — under the heading',
  invitation: 'The Invitation — under the heading',
  sponsors: 'Under the ninong and ninang heading',
  entourage: 'Entourage — under the heading',
  gallery: 'Prenup — under the heading',
  galleryNote: 'Prenup — between the large photograph and the arches',
  galleryVideo: 'Prenup — written over the film',
  galleryClose: 'Prenup — the last word',
  venue: 'The Venue — under the heading',
  interlude2: 'The Venue — the script line after the way there',
  dressCode: 'Dress Code — under the heading, when no attire is set',
  gentsNote: 'Dress Code — the note under the gentlemen’s pieces',
  ladiesNote: 'Dress Code — the note under the ladies’ pieces',
  dressNote: 'Dress Code — the note under the palette',
  giftThanks: 'Gift — the thank-you in script',
  program: 'Program — under the heading',
  social: 'Snap and Share — under the heading',
  socialCta: 'Snap and Share — the call to post',
  guestbook: 'Guestbook — under the heading',
  photos: 'Post Event Photos — under the heading',
  photosIntro: 'Post Event Photos — the line above the upload',
  countdown: 'Countdown — the line above the numbers',
  contact: 'Assistance — the small line under the heading',
  contactNote: 'Assistance — the note',
  closingMessage: 'Closing — the thank-you',
  closing: 'Closing — the line above the names',
};
export const TITLE_LABELS: Record<TitleKey, string> = {
  story: 'Our Story', invitation: 'The Invitation', entourage: 'Entourage', sponsors: 'Ninong and Ninang', gallery: 'Prenup Photos', venue: 'The Venue', getting: 'Getting There',
  dressCode: 'Dress Code', gift: 'Gift Request', program: 'Program', social: 'Snap and Share', guestbook: 'Guestbook', photos: 'Post Event Photos', rsvp: 'RSVP', contact: 'Assistance',
};

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** The JSON column as words, anything malformed dropped. */
export function wordsOf(raw: unknown): DesignWords {
  if (!isRecord(raw)) return {};
  const out: DesignWords = {};
  for (const lang of ['en', 'tl'] as Lang[]) {
    const block = raw[lang];
    if (!isRecord(block)) continue;
    const clean: Partial<Record<WordKey, string>> = {};
    for (const key of [...LINE_KEYS, ...TITLE_KEYS.map(titleWord)]) {
      const v = block[key];
      if (typeof v === 'string' && v.trim()) clean[key] = v.trim().slice(0, 300);
    }
    if (Object.keys(clean).length) out[lang] = clean;
  }
  return out;
}

/** The JSON column as art, only http(s) or site-relative URLs kept. */
export function artOf(raw: unknown): DesignArt {
  if (!isRecord(raw)) return {};
  const url = (v: unknown) => (typeof v === 'string' && /^(https?:\/\/|\/)[^\s"'<>]{1,500}$/.test(v.trim()) ? v.trim() : '');
  // a list keeps its places — the third background stays third when the second is blank — trailing blanks dropped
  const list = (v: unknown) => { const out = Array.isArray(v) ? v.slice(0, 12).map(url) : []; while (out.length && !out[out.length - 1]) out.pop(); return out; };
  const out: DesignArt = {};
  const backgrounds = list(raw.backgrounds);
  const night = list(raw.night);
  const strand = url(raw.strand);
  if (backgrounds.length) out.backgrounds = backgrounds;
  if (night.length) out.night = night;
  if (strand) out.strand = strand;
  if (raw.grounds && typeof raw.grounds === 'object') {
    const grounds: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.grounds as Record<string, unknown>)) {
      const u = url(v);
      if (u && /^[a-z][a-z0-9-]{0,30}$/.test(k)) grounds[k] = u;
    }
    if (Object.keys(grounds).length) out.grounds = grounds;
  }
  return out;
}

/**
 * The look with the design's own words written over it: a line or heading the
 * design gives in a language replaces the look's in that language, the rest
 * stands. The heading keys and the line keys are distinct sets, so one flat
 * block per language serves both.
 */
export function withWords(look: Look | undefined, words: DesignWords): Look | undefined {
  if (!look) return look;
  const langs = Object.keys(words) as Lang[];
  if (!langs.length) return look;
  const lines = { ...look.lines };
  const titles = { ...look.titles };
  for (const lang of langs) {
    const block = words[lang] ?? {};
    for (const key of LINE_KEYS) {
      const v = block[key];
      if (v) lines[key] = { ...lines[key], [lang]: v };
    }
    for (const key of TITLE_KEYS) {
      const v = block[titleWord(key)];
      if (v) titles[key] = { ...(titles[key] ?? { en: v, tl: v }), [lang]: v };
    }
  }
  return { ...look, lines, titles };
}

/**
 * The Baby Blue layout's grounds, one behind each page, with each one's height
 * as a multiple of its width. Six are tall and narrow, four the shape of a
 * phone; the page machinery trims each to the page it sits behind.
 */
export type PictureGround = {
  url: string;
  /** height as a multiple of the width */
  ratio: number;
  /** the colour of the ground's top and bottom edges, for the strips beyond the picture */
  top: string;
  bottom: string;
  /**
   * For a page taller than its ground: the top 44% and the bottom 44% of the
   * picture, kept whole at the page's head and foot, and the band between
   * them stretched to fill. The two drawn pages have none: they are always
   * the ground's own height.
   */
  slices?: { top: string; foot: string; mid: string };
  /** the same picture by night, when the design has one */
  night?: string;
};

/**
 * A page with no artwork behind it: a plain colour, either one of the
 * palette's six roles (so night mode keeps working) or a colour picked from
 * the colour book. Nothing to upload, nothing for a guest to download.
 */
export type ColourGround = {
  color: ColorRole | string;
  /** drawn pages only: height as a multiple of the width. One screen is 1.777. */
  ratio?: number;
};
export type ColorRole = 'bg' | 'surface' | 'ink' | 'muted' | 'accent' | 'accent2';
export type Ground = PictureGround | ColourGround;
export const isPicture = (g: Ground): g is PictureGround => typeof (g as PictureGround).url === 'string';

const slices = (key: string) => ({ top: `/babyblue/${key}-top.webp`, foot: `/babyblue/${key}-foot.webp`, mid: `/babyblue/${key}-mid.webp` });
export const BABYBLUE_GROUNDS: Record<string, PictureGround> = {
  cover: { url: '/babyblue/cover.webp', ratio: 2.989, top: '#b4c3d5', bottom: '#d5cbc5', slices: slices('cover') },
  story: { url: '/babyblue/story.webp', ratio: 2.989, top: '#e3e0dd', bottom: '#c4cbd3' },
  invitation: { url: '/babyblue/invitation.webp', ratio: 1.777, top: '#cbdbec', bottom: '#c1d4e8', slices: slices('invitation') },
  sponsors: { url: '/babyblue/sponsors.webp', ratio: 2.99, top: '#dcd7d0', bottom: '#cccdcf', slices: slices('sponsors') },
  babyphotos: { url: '/babyblue/babyphotos.webp', ratio: 1.777, top: '#f1efef', bottom: '#e6e1dc' },
  venue: { url: '/babyblue/venue.webp', ratio: 2.989, top: '#dcdad7', bottom: '#c4cad2', slices: slices('venue') },
  dresscode: { url: '/babyblue/dresscode.webp', ratio: 1.777, top: '#cbdbec', bottom: '#c1d4e8', slices: slices('dresscode') },
  program: { url: '/babyblue/program.webp', ratio: 2.99, top: '#cddbea', bottom: '#bcd0e9', slices: slices('program') },
  share: { url: '/babyblue/share.webp', ratio: 2.99, top: '#f3ede7', bottom: '#eee5de', slices: slices('share') },
  closing: { url: '/babyblue/closing.webp', ratio: 2.989, top: '#dadee3', bottom: '#c4cfde', slices: slices('closing') },
};
export const BABYBLUE_GROUND_KEYS = Object.keys(BABYBLUE_GROUNDS);

/** The Capiz layout's own pictures, when the design names none. */
export const CAPIZ_DEFAULT_ART: Required<Pick<DesignArt, 'backgrounds' | 'strand'>> = {
  backgrounds: Array.from({ length: 8 }, (_, i) => `/capiz/bg-${i + 1}.webp`),
  strand: '/capiz/strand-b.webp',
};

// ---------------------------------------------------------------------------
// The design document
//
// A design's pages, the ground under each one, and the photo frames and
// writings placed on the drawn ones, as data rather than as constants in the
// renderer. `Template.design` holds what guests see and `Template.designDraft`
// what the studio is editing; an empty column means "the layout's built-in",
// which is `builtinDesign(layout)` below — the same numbers the code has
// always used, compiled from the same constants, so nothing moves the day the
// columns land.
//
// Every measurement is a share of the page: x and w of its WIDTH, y of its
// HEIGHT, exactly the convention `Slot` uses (src/lib/babyblue.ts).
// ---------------------------------------------------------------------------

/** A section on a page. Two are not sections: the verse, and the clip that no frame can hold. */
export type PageSectionKey = SectionKey | 'verse' | 'gallery-video';

export type DesignDoc = {
  v: 1;
  pages: PageSpec[];
  /** the ground under a page the map does not name (today: the venue's, for Baby Blue) */
  overflowGround?: Ground;
  /** the colour of the column itself behind every page; blank means the palette's bg */
  paper?: string;
  /** the colour beside the column on a laptop; blank means the palette's bg, barely inked */
  surround?: string;
};

export type PageSpec = {
  /** becomes data-page and the scroll anchor */
  key: string;
  label?: { en: string; tl?: string };
  sections: PageSectionKey[];
  ground?: Ground;
  /** how long the dissolve into this page is, as a share of the width */
  seam?: number;
  /** a drawn page: its height is the ground's ratio times its width, and its elements are placed */
  drawn?: true;
  /** the public peek stops after this page */
  peekEnd?: true;
  elements?: Element[];
};

export type Anchor = 'centre' | 'top';

type Base = {
  id: string;
  /**
   * Left, as a share of the page's width. Left out means "whatever the
   * stylesheet says": the two Baby Blue headings are `left: 6%; right: 6%` in
   * CSS and carry a top and nothing else, and boxing them in would move the
   * words. The studio fills x and w in the moment she drags one.
   */
  x?: number;
  /** Top, as a share of the page's height. */
  y: number;
  /** Width, as a share of the page's width. */
  w?: number;
  anchor?: Anchor;
  rotate?: number;
  z?: number;
  opacity?: number;
  hidden?: 'never' | 'whenEmpty';
  /** marked Ask the customer: its bound field becomes a question on this design's form */
  ask?: boolean;
  /** what an asked-for frame or box shows when the customer leaves it empty */
  ifEmpty?: { piece: string } | 'leave';
  /** phase 4 */
  motion?: { enter?: 'none' | 'fade' | 'rise' | 'drift'; idle?: 'none' | 'float' | 'sway'; delay?: number };
  /** the id of a photo this element follows when that photo is moved */
  attachTo?: string;
};

/**
 * Where an answer is read from. `index` walks a list field; `skipEmpty` names
 * the field a row must have filled to be counted, so the list is read the way
 * the photographs page reads it — the rows that have a picture, in order —
 * rather than the way the story page reads its timeline, which is row by row
 * including the blanks. It names a field rather than being a flag because a
 * frame and the caption beside it must count the same rows.
 */
export type FieldRef = { section: string; field: string; index?: number; sub?: string; skipEmpty?: string };

/** One text source. A line tries its sources in order and shows the first that has something. */
export type Source =
  | { bind: FieldRef }
  | { word: WordKey }
  | { copy: string }
  | { fixed: { en: string; tl?: string } };

export type LineRole = 'title' | 'sub' | 'eyebrow' | 'script' | 'label-title' | 'label-text' | 'caption' | 'body';

export type Line = {
  role: LineRole;
  sources: Source[];
  align?: 'left' | 'center' | 'right';
  /** in cqw, so it scales with the column; blank means the role's own size */
  size?: number;
  color?: 'ink' | 'muted' | 'accent' | 'accent2';
};

export type PhotoEl = Base & {
  kind: 'photo';
  /** height over width of the frame; 1 is the square .inv-bb-slot */
  aspect?: number;
  bind: FieldRef | { asset: string };
  /** the words read out to someone who cannot see the picture */
  alt?: FieldRef;
  crop?: { x: number; y: number; w: number; h: number };
  frame?: 'none' | 'thin' | 'polaroid';
  mask?: 'none' | 'circle' | 'arch';
  /** a moving picture: never re-encoded, never sent through imageUrl() */
  animated?: boolean;
};

export type TextEl = Base & {
  kind: 'text';
  /** picks the wrapper: .inv-bb-head, .inv-bb-label, .inv-bb-caption, .inv-bb-text */
  block: 'head' | 'label' | 'caption' | 'free';
  lines: Line[];
  backing?: 'none' | 'shadow' | 'scrim';
  face?: 'display' | 'names' | 'script' | 'body';
  size?: number;
  weight?: number;
  tracking?: number;
  /** the letters this box holds, measured from the box and the face: the form's cap for what it asks */
  room?: number;
  /** the design's own line is offered to the customer as an example under their box */
  offerLine?: boolean;
};

export type VideoEl = Base & { kind: 'video'; url: string; poster: string; aspect?: number; loop?: boolean };
export type AnimEl = Base & { kind: 'anim'; url: string; poster: string; aspect: number; loop?: boolean; speed?: number };
export type ShapeEl = Base & { kind: 'shape'; shape: 'rect' | 'ellipse' | 'line'; fill?: string; stroke?: string; strokeWidth?: number; radius?: number; h?: number };

export type Element = PhotoEl | TextEl | VideoEl | AnimEl | ShapeEl;

/** The wrapper class each kind of text block is drawn in. */
export const BLOCK_CLASS: Record<TextEl['block'], string> = {
  head: 'inv-bb-head', label: 'inv-bb-label', caption: 'inv-bb-caption', free: 'inv-bb-text',
};
/** The class each line inside a block is drawn in. A caption's own line adds nothing. */
export const LINE_CLASS: Record<LineRole, string> = {
  title: 'inv-title', sub: 'inv-bb-sub', eyebrow: 'inv-bb-eyebrow', script: 'inv-bb-script',
  'label-title': 't', 'label-text': 'x', caption: '', body: 'inv-bb-body',
};
/** A title and a script are headings; everything else is a paragraph. */
export const LINE_TAG: Record<LineRole, 'h2' | 'p'> = {
  title: 'h2', script: 'h2', sub: 'p', eyebrow: 'p', 'label-title': 'p', 'label-text': 'p', caption: 'p', body: 'p',
};

/**
 * Where an element sits, in the units the drawn pages have always used. This
 * is the one function that turns the document into CSS, and what it produces
 * for Baby Blue is asserted equal to `slotStyle`, `labelStyle` and
 * `captionStyle` in tests/design.test.ts, to the last decimal.
 */
export function elementStyle(el: Element): Record<string, string> {
  const st: Record<string, string> = {};
  if (el.x !== undefined) st.left = `${el.x}%`;
  st.top = `${el.y}%`;
  if (el.w !== undefined) st.width = `${el.w}%`;
  const anchor = el.anchor ?? (el.kind === 'text' ? 'top' : 'centre');
  const parts: string[] = [];
  if (el.x !== undefined) parts.push(anchor === 'centre' ? 'translate(-50%, -50%)' : 'translateX(-50%)');
  if (el.rotate) parts.push(`rotate(${el.rotate}deg)`);
  if (parts.length) st.transform = parts.join(' ');
  if (el.opacity !== undefined && el.opacity !== 1) st.opacity = String(el.opacity);
  if (el.z !== undefined) st.zIndex = String(el.z);
  return st;
}

// ---------------------------------------------------------------------------
// Reading the column
// ---------------------------------------------------------------------------

/**
 * A place on a page, rounded so the document survives the round trip.
 *
 * The database keeps a JSON number to sixteen significant digits, so a value
 * that comes out of a multiplication — 27.3 x 0.92 is 25.116000000000003 in
 * a double — is not the number that comes back out of the column. The studio
 * refuses to autosave a draft it cannot round-trip, so a document that drifts
 * on every save would never save at all. Ten decimal places is a thousandth
 * of a pixel on a phone and round-trips exactly, so every measurement is held
 * to it: here, and in the schema below, so a document written by anything
 * else is normalised on the way in.
 */
export const place = (n: number): number => Math.round(n * 1e10) / 1e10;
const zPlace = (min: number, max: number) => z.number().min(min).max(max).transform(place);

const KEY = /^[a-z][a-z0-9-]{0,30}$/;
const FIELD = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
const zColour = z.string().min(1).max(60);
const zPictureGround = z.object({
  url: z.string().min(1).max(500), ratio: z.number().positive().max(40),
  top: zColour, bottom: zColour,
  slices: z.object({ top: z.string(), foot: z.string(), mid: z.string() }).optional(),
  night: z.string().max(500).optional(),
}).strict();
const zColourGround = z.object({ color: zColour, ratio: z.number().positive().max(40).optional() }).strict();
const zGround = z.union([zPictureGround, zColourGround]);

const zFieldRef = z.object({
  section: z.string().regex(FIELD), field: z.string().regex(FIELD),
  index: z.number().int().min(0).max(199).optional(), sub: z.string().regex(FIELD).optional(),
  skipEmpty: z.string().regex(FIELD).optional(),
}).strict();
const zSource = z.union([
  z.object({ bind: zFieldRef }).strict(),
  z.object({ word: z.string().max(60) }).strict(),
  z.object({ copy: z.string().max(60) }).strict(),
  z.object({ fixed: z.object({ en: z.string().max(600), tl: z.string().max(600).optional() }).strict() }).strict(),
]);
const zLine = z.object({
  role: z.enum(['title', 'sub', 'eyebrow', 'script', 'label-title', 'label-text', 'caption', 'body']),
  sources: z.array(zSource).min(1).max(6),
  align: z.enum(['left', 'center', 'right']).optional(),
  size: z.number().positive().max(40).optional(),
  color: z.enum(['ink', 'muted', 'accent', 'accent2']).optional(),
}).strict();

const zBase = {
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  x: zPlace(-50, 150).optional(),
  y: zPlace(-50, 150),
  w: zPlace(0.01, 200).optional(),
  anchor: z.enum(['centre', 'top']).optional(),
  rotate: zPlace(-180, 180).optional(),
  z: z.number().int().min(-50).max(50).optional(),
  opacity: z.number().min(0).max(1).optional(),
  hidden: z.enum(['never', 'whenEmpty']).optional(),
  ask: z.boolean().optional(),
  ifEmpty: z.union([z.object({ piece: z.string().max(80) }).strict(), z.literal('leave')]).optional(),
  motion: z.object({
    enter: z.enum(['none', 'fade', 'rise', 'drift']).optional(),
    idle: z.enum(['none', 'float', 'sway']).optional(),
    delay: z.number().min(0).max(2000).optional(),
  }).strict().optional(),
  attachTo: z.string().max(41).optional(),
};
const zElement = z.union([
  z.object({
    ...zBase, kind: z.literal('photo'), aspect: z.number().positive().max(10).optional(),
    bind: z.union([zFieldRef, z.object({ asset: z.string().max(500) }).strict()]),
    alt: zFieldRef.optional(),
    crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict().optional(),
    frame: z.enum(['none', 'thin', 'polaroid']).optional(),
    mask: z.enum(['none', 'circle', 'arch']).optional(),
    animated: z.boolean().optional(),
  }).strict(),
  z.object({
    ...zBase, kind: z.literal('text'), block: z.enum(['head', 'label', 'caption', 'free']),
    lines: z.array(zLine).min(1).max(8),
    backing: z.enum(['none', 'shadow', 'scrim']).optional(),
    face: z.enum(['display', 'names', 'script', 'body']).optional(),
    size: z.number().positive().max(40).optional(),
    weight: z.number().int().min(100).max(900).optional(),
    tracking: z.number().min(-0.05).max(0.4).optional(),
    room: z.number().int().min(1).max(2000).optional(),
    offerLine: z.boolean().optional(),
  }).strict(),
  z.object({ ...zBase, kind: z.literal('video'), url: z.string().max(500), poster: z.string().max(500), aspect: z.number().positive().max(10).optional(), loop: z.boolean().optional() }).strict(),
  z.object({ ...zBase, kind: z.literal('anim'), url: z.string().max(500), poster: z.string().max(500), aspect: z.number().positive().max(10), loop: z.boolean().optional(), speed: z.number().positive().max(4).optional() }).strict(),
  z.object({ ...zBase, kind: z.literal('shape'), shape: z.enum(['rect', 'ellipse', 'line']), fill: zColour.optional(), stroke: zColour.optional(), strokeWidth: z.number().min(0).max(40).optional(), radius: z.number().min(0).max(100).optional(), h: z.number().min(0).max(200).optional() }).strict(),
]);
const zPage = z.object({
  key: z.string().regex(KEY),
  label: z.object({ en: z.string().max(60), tl: z.string().max(60).optional() }).strict().optional(),
  sections: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,40}$/)).max(30),
  ground: zGround.optional(),
  seam: z.number().min(0).max(1).optional(),
  drawn: z.literal(true).optional(),
  peekEnd: z.literal(true).optional(),
}).strict();
const zDoc = z.object({
  v: z.literal(1),
  overflowGround: zGround.optional(),
  paper: zColour.optional(),
  surround: zColour.optional(),
}).strict();

/**
 * The column as a document, with a list of what would not read.
 *
 * Unlike `artOf` this does not quietly coerce. A page or an element that does
 * not parse is dropped and named, so the studio can refuse to autosave a
 * draft it cannot round-trip and say which piece it lost. An empty column
 * (every design today) means the layout's built-in.
 */
export function designOf(raw: unknown, layout: string): { doc: DesignDoc | null; dropped: string[] } {
  if (!isRecord(raw) || Object.keys(raw).length === 0) return { doc: builtinDesign(layout), dropped: [] };
  const dropped: string[] = [];
  const { pages: rawPages, ...rest } = raw as Record<string, unknown>;
  const head = zDoc.safeParse(rest);
  if (!head.success || !Array.isArray(rawPages)) return { doc: null, dropped: ['the document itself'] };
  const pages: PageSpec[] = [];
  for (const [i, p] of rawPages.entries()) {
    if (!isRecord(p)) { dropped.push(`page ${i + 1}`); continue; }
    const { elements: rawEls, ...pageRest } = p;
    const page = zPage.safeParse(pageRest);
    if (!page.success) { dropped.push(`page ${i + 1}${typeof p.key === 'string' ? ` (${p.key})` : ''}`); continue; }
    const spec = page.data as PageSpec;
    if (rawEls !== undefined) {
      if (!Array.isArray(rawEls)) { dropped.push(`the elements on ${spec.key}`); }
      else {
        const els: Element[] = [];
        for (const [j, e] of rawEls.entries()) {
          const el = zElement.safeParse(e);
          if (!el.success) { dropped.push(`element ${j + 1} on ${spec.key}${isRecord(e) && typeof e.id === 'string' ? ` (${e.id})` : ''}`); continue; }
          els.push(el.data as Element);
        }
        if (els.length) spec.elements = els;
      }
    }
    pages.push(spec);
  }
  return { doc: { ...(head.data as Omit<DesignDoc, 'pages'>), pages }, dropped };
}

// ---------------------------------------------------------------------------
// The built-in: Baby Blue, compiled from the constants the renderer uses
// ---------------------------------------------------------------------------

/**
 * The pages of a layout whose pages each have a ground of their own, in the
 * order the owner set. Lived in the renderer until the document needed to be
 * compiled from it; the renderer still walks this list for Capiz and for
 * every design whose column is empty.
 */
export type PageDef = {
  key: string;
  sections: (SectionKey | 'verse')[];
  /** the ground under the page, by its key in BABYBLUE_GROUNDS */
  bg?: string;
  /** how long the dissolve into this page is, as a share of the width */
  seam?: number;
  /**
   * A drawn page: its ground carries frames and writings at fixed places, so
   * it must sit exactly on the page. The dissolve into it lies wholly below
   * its top edge and is short, so its own header comes up on clean ground.
   */
  drawn?: boolean;
};

/**
 * The Baby Blue pages: the cover with the verse, the story, the invitation,
 * ninong and ninang, the baby photos, the venue, the dress code, the gift
 * request with the program, snap and share with the post-event photos, and
 * the last page with the RSVP, the countdown, the assistance and the ending.
 * The two drawn pages keep their tops clear of the dissolve.
 */
export const BABYBLUE_PAGES: PageDef[] = [
  { key: 'cover', bg: 'cover', sections: ['cover', 'verse'] },
  { key: 'story', bg: 'story', seam: 0.18, drawn: true, sections: ['story'] },
  { key: 'invitation', bg: 'invitation', sections: ['ceremony'] },
  { key: 'sponsors', bg: 'sponsors', sections: ['sponsors'] },
  { key: 'baby-photos', bg: 'babyphotos', seam: 0.18, drawn: true, sections: ['gallery'] },
  { key: 'venue', bg: 'venue', sections: ['reception'] },
  { key: 'dress-code', bg: 'dresscode', sections: ['dressCode'] },
  { key: 'program', bg: 'program', sections: ['gift', 'program'] },
  { key: 'share', bg: 'share', sections: ['social', 'photos'] },
  { key: 'closing', bg: 'closing', sections: ['rsvp', 'countdown', 'contact', 'closing'] },
];
/** The ground a page the map does not name gets, for a layout that names them. */
export const BABYBLUE_OVERFLOW = 'venue';

/**
 * Baby Blue as a document.
 *
 * Every number here is read from the constants the renderer draws with — no
 * number is retyped — so the document and the code cannot drift apart. The
 * six story frames and the four polaroids are painted into the grounds, which
 * is why every frame is `frame: 'none'`; the words that were erased from
 * those grounds are the text blocks, each one holding its lines in flow the
 * way `.inv-bb-head` and `.inv-bb-label` do.
 */
function babyblueDesign(): DesignDoc {
  const g = (key: string): Ground => ({ ...BABYBLUE_GROUNDS[key] });
  const photoRatio = BABYBLUE_GROUNDS.babyphotos.ratio;

  const frame = (id: string, s: Slot, bind: FieldRef, alt?: FieldRef): PhotoEl => ({
    id, kind: 'photo', x: place(s.cx), y: place(s.cy), w: place(s.size), anchor: 'centre', rotate: place(s.tilt),
    aspect: 1, frame: 'none', bind, ...(alt ? { alt } : {}),
  });

  const storyHead: TextEl = {
    id: 'story-head', kind: 'text', block: 'head', y: place(STORY_HEAD.titleTop), anchor: 'top',
    lines: [
      { role: 'title', sources: [{ word: titleWord('story') }, { copy: 'story.title' }] },
      { role: 'sub', sources: [{ bind: { section: 'story', field: 'line' } }, { word: 'story' }] },
    ],
  };
  const storyLabels: TextEl[] = STORY_LABELS.map((l, i) => ({
    id: `story-label-${i + 1}`, kind: 'text', block: 'label', x: place(l.cx), y: place(l.top), w: place(l.width), anchor: 'top',
    hidden: 'whenEmpty',
    lines: [
      { role: 'label-title', sources: [{ bind: { section: 'story', field: 'timeline', index: i, sub: 'title' } }] },
      { role: 'label-text', sources: [{ bind: { section: 'story', field: 'timeline', index: i, sub: 'text' } }] },
    ],
  }));

  const photosHead: TextEl = {
    id: 'photos-head', kind: 'text', block: 'head', y: place(PHOTO_HEAD.eyebrowTop), anchor: 'top',
    lines: [
      // written in English only, as the page has always been
      { role: 'eyebrow', sources: [{ fixed: { en: 'Share', tl: '' } }] },
      { role: 'script', sources: [{ word: titleWord('gallery') }, { copy: 'gallery.title' }] },
      { role: 'sub', sources: [{ bind: { section: 'gallery', field: 'line' } }, { word: 'gallery' }] },
    ],
  };
  /**
   * The caption on the polaroid's strip. `captionStyle` works it out in cqw —
   * a share of the page's WIDTH — because the polaroid's geometry is measured
   * along the frame's own tilted axis. The document holds y as a share of the
   * page's HEIGHT like everything else, and on a drawn page the height is the
   * ground's ratio times the width, so dividing by that ratio is the same
   * place to the last decimal.
   */
  const captions: TextEl[] = PHOTO_SLOTS.map((s, i) => {
    const rad = (s.tilt * Math.PI) / 180;
    const away = s.size / 2 + PHOTO_STRIP.below;
    return {
      id: `photos-caption-${i + 1}`, kind: 'text', block: 'caption', anchor: 'centre',
      x: place(s.cx - away * Math.sin(rad)),
      y: place((s.cy * PHOTO_ASPECT + away * Math.cos(rad)) / photoRatio),
      w: place(s.size * PHOTO_STRIP.width),
      rotate: place(s.tilt),
      hidden: 'whenEmpty',
      lines: [{ role: 'caption', sources: [{ bind: { section: 'gallery', field: 'photos', index: i, sub: 'caption', skipEmpty: 'url' } }] }],
    };
  });

  const elementsFor = (key: string): Element[] | undefined => {
    // frame then label, frame then label: the order StoryMilestones renders in
    if (key === 'story') return [storyHead, ...STORY_SLOTS.flatMap((s, i) => [frame(`story-photo-${i + 1}`, s, { section: 'story', field: 'timeline', index: i, sub: 'photo' }), storyLabels[i]])];
    if (key === 'baby-photos') {
      const photoFrames = PHOTO_SLOTS.map((s, i) => frame(
        `photos-photo-${i + 1}`, s,
        { section: 'gallery', field: 'photos', index: i, sub: 'url', skipEmpty: 'url' },
        { section: 'gallery', field: 'photos', index: i, sub: 'caption', skipEmpty: 'url' },
      ));
      return [photosHead, ...photoFrames.flatMap((f, i) => [f, captions[i]])];
    }
    return undefined;
  };

  const pages: PageSpec[] = [];
  for (const def of BABYBLUE_PAGES) {
    const spec: PageSpec = { key: def.key, sections: [...def.sections] };
    if (def.bg) spec.ground = g(def.bg);
    if (def.seam !== undefined) spec.seam = def.seam;
    if (def.drawn) spec.drawn = true;
    // the peek is a snippet: it stops after Our Story, by the page's name
    if (def.key === 'story') spec.peekEnd = true;
    const els = elementsFor(def.key);
    if (els) spec.elements = els;
    pages.push(spec);
    // a clip has no frame to sit in, so it takes a page of its own after the photographs
    if (def.key === 'baby-photos') pages.push({ key: 'baby-photos-more', sections: ['gallery-video'], ground: g(BABYBLUE_OVERFLOW) });
  }
  return { v: 1, pages, overflowGround: g(BABYBLUE_OVERFLOW) };
}

/**
 * The Capiz pages. Capiz has no drawn page and no ground of its own per page:
 * its ground is the designer's numbered backgrounds laid down the whole
 * invitation in order (CAPIZ_BG_RATIO and STRIP_ORDER in the renderer), which
 * is the layout's machinery and stays there. So its document is the page map
 * and nothing else — which is exactly what a copy of it needs.
 */
export const CAPIZ_PAGES: PageDef[] = [
  { key: 'cover', sections: ['cover', 'verse'] },
  { key: 'story', sections: ['story'] },
  { key: 'invitation', sections: ['ceremony'] },
  { key: 'entourage', sections: ['entourage'] },
  { key: 'prenup', sections: ['gallery'] },
  { key: 'venue', sections: ['reception'] },
  { key: 'dress-code', sections: ['dressCode'] },
  { key: 'gift', sections: ['gift'] },
  { key: 'program', sections: ['program', 'social'] },
  { key: 'guestbook', sections: ['guestbook'] },
  { key: 'photos', sections: ['photos'] },
  { key: 'rsvp', sections: ['rsvp'] },
  { key: 'closing', sections: ['countdown', 'contact', 'closing'] },
];

function capizDesign(): DesignDoc {
  return {
    v: 1,
    pages: CAPIZ_PAGES.map((def) => ({ key: def.key, sections: [...def.sections], ...(def.key === 'story' ? { peekEnd: true as const } : {}) })),
  };
}

/**
 * A layout's own pages as a document: what a copy of that design starts life
 * holding, and what the studio then edits. The originals do not render from
 * this — their columns are empty and the renderer walks the constants — which
 * is what makes a copy safe to make.
 */
export function builtinDesign(layout: string): DesignDoc | null {
  if (layout === 'babyblue') return babyblueDesign();
  if (layout === 'capiz') return capizDesign();
  return null;
}

/**
 * The document a design renders from, or null for one that has none — which
 * is every design today. An empty column is deliberately NOT the built-in
 * here: the two originals keep the renderer's own path, so nothing about them
 * can move, and only a design whose column was written by the studio takes
 * the document path.
 */
export function documentOf(t: { design?: unknown; layout?: string }): DesignDoc | null {
  if (!isRecord(t.design) || Object.keys(t.design).length === 0) return null;
  return designOf(t.design, t.layout ?? '').doc;
}

/** A drawn page's height, as a multiple of its width. One screen is 1.777. */
export const ONE_SCREEN = 1.777;
export function pageRatio(page: PageSpec): number {
  const g = page.ground;
  if (!g) return ONE_SCREEN;
  return (isPicture(g) ? g.ratio : g.ratio ?? ONE_SCREEN);
}

/**
 * How many frames this design gives one list — six for Baby Blue's timeline,
 * four for its photographs. What a design shows is what its form should ask
 * for, so this is the cap the form reads (phase 2) and the number the asks
 * sheet quotes.
 */
export function frameCount(doc: DesignDoc | null, section: string, field: string): number {
  if (!doc) return 0;
  let n = 0;
  for (const page of doc.pages) {
    for (const el of page.elements ?? []) {
      if (el.kind !== 'photo') continue;
      const bind = el.bind as FieldRef;
      if (bind.section === section && bind.field === field && bind.index !== undefined) n = Math.max(n, bind.index + 1);
    }
  }
  return n;
}

/**
 * Where the public peek stops: the page the design marks, and no fallback to
 * a page called 'story' — a design that marks none shows its first page only,
 * which is the safe way round. A design that renames its story page keeps its
 * peek, because the mark travels with the page and not with its name.
 */
export function peekEndPage(doc: DesignDoc | null): string | undefined {
  return doc?.pages.find((p) => p.peekEnd)?.key;
}

/** The page a section is drawn on, for the anchor a preview scrolls to. */
export function pageOfSection(doc: DesignDoc | null, key: string): PageSpec | undefined {
  return doc?.pages.find((p) => p.sections.includes(key as PageSectionKey));
}

// ---------------------------------------------------------------------------
// Reading an answer out of the invitation, for a bound element
// ---------------------------------------------------------------------------

type Rowish = Record<string, unknown>;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/**
 * What a binding points at, as a string. A list binding walks the rows: by
 * their place in the list, or — where `skipEmpty` names a field — by their
 * place among the rows that have that field filled, which is how the
 * photographs page counts and why a frame and its caption agree.
 */
export function valueAt(content: Record<string, unknown> | undefined, ref: FieldRef): string {
  const data = isRecord(content?.[ref.section]) ? (content![ref.section] as Rowish) : undefined;
  if (!data) return '';
  if (ref.index === undefined) return text(data[ref.field]);
  const raw = data[ref.field];
  if (!Array.isArray(raw)) return '';
  const all = raw.filter(isRecord) as Rowish[];
  const list = ref.skipEmpty ? all.filter((r) => text(r[ref.skipEmpty!])) : all;
  const row = list[ref.index];
  if (!row) return '';
  return text(ref.sub ? row[ref.sub] : row.value);
}

/** A design's word, through the look it is written over. */
export type WordReader = (key: WordKey) => string;

/**
 * A line shows the first of its sources that has something: the client's own
 * answer, then the design's word, then the app's copy, then a fixed writing.
 * That order is the renderer's today — a one-of source would blank the line
 * under a heading for every customer who typed nothing.
 */
export function lineText(sources: Source[], read: { content?: Record<string, unknown>; word: WordReader; copy: (key: string) => string; lang: Lang }): string {
  for (const s of sources) {
    let v = '';
    if ('bind' in s) v = valueAt(read.content, s.bind);
    else if ('word' in s) v = read.word(s.word);
    else if ('copy' in s) v = read.copy(s.copy);
    else v = (read.lang === 'tl' ? s.fixed.tl ?? s.fixed.en : s.fixed.en) ?? '';
    if (v) return v;
  }
  return '';
}
