import { z } from 'zod';
import type { Occasion } from '@prisma/client';
import type { Lang } from './copy';
import type { Look, LineKey, TitleKey } from './looks';
import { MOMENT_KEYS, type MomentKey, type Trigger as MomentTrigger, type Speed as MomentSpeed } from './moments';
import { OCCASION_SECTIONS, sectionLabel, sectionOrder, type SectionKey } from './sections';
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
  /**
   * The photographed parts a moment's scene is built from, by `scene/part`
   * (the keys in MOMENT_PARTS): a design's own camera, curtain or door in
   * place of the set shipped under /moments. Blank keeps the shipped one.
   */
  parts?: Record<string, string>;
};

export const LINE_KEYS: LineKey[] = ['cover', 'verse', 'verseRef', 'moment1', 'moment2', 'moment3', 'story', 'invitation', 'entourage', 'sponsors', 'gallery', 'galleryNote', 'galleryVideo', 'galleryClose', 'venue', 'interlude2', 'dressCode', 'gentsNote', 'ladiesNote', 'dressNote', 'giftThanks', 'program', 'social', 'socialCta', 'guestbook', 'photos', 'photosIntro', 'countdown', 'contact', 'contactNote', 'closingMessage', 'closing'];
export const TITLE_KEYS: TitleKey[] = ['story', 'invitation', 'entourage', 'sponsors', 'gallery', 'venue', 'getting', 'dressCode', 'gift', 'program', 'social', 'guestbook', 'photos', 'rsvp', 'contact'];

/** Where each line is read, for the admin's form. */
/**
 * Where each writing belongs, and where on that part it lands.
 *
 * Two things used to be one. The name of a box — "Prenup — under the
 * heading" — was a fixed string, so a christening's form offered a box
 * called Prenup for a part the app itself calls Baby photos, and offered
 * boxes for Entourage and The Moment, which a christening does not have at
 * all. The section's name already varies by occasion (`sectionLabel`, and
 * `labelFor` in sections.ts has said `CHRISTENING: 'Baby photos'` all
 * along); only this list did not ask it.
 *
 * So a writing names the part it is on, and the place on it. The name is
 * worked out per occasion from the first, which makes the form and the
 * studio speak the occasion's own words without a second list to keep in
 * step — and makes it possible to leave out the writings for parts this
 * occasion does not carry.
 */
export const LINE_ON: Record<LineKey, { on: SectionKey; where: string }> = {
  cover: { on: 'cover', where: 'above the names' },
  verse: { on: 'cover', where: 'the verse' },
  verseRef: { on: 'cover', where: 'the verse\u2019s source' },
  moment1: { on: 'moment', where: 'first line' },
  moment2: { on: 'moment', where: 'second line' },
  moment3: { on: 'moment', where: 'third line' },
  story: { on: 'story', where: 'under the heading' },
  invitation: { on: 'ceremony', where: 'under the heading' },
  sponsors: { on: 'sponsors', where: 'under the heading' },
  entourage: { on: 'entourage', where: 'under the heading' },
  gallery: { on: 'gallery', where: 'under the heading' },
  galleryNote: { on: 'gallery', where: 'between the large photograph and the arches' },
  galleryVideo: { on: 'gallery', where: 'written over the film' },
  galleryClose: { on: 'gallery', where: 'the last word' },
  venue: { on: 'reception', where: 'under the heading' },
  interlude2: { on: 'reception', where: 'the script line after the way there' },
  dressCode: { on: 'dressCode', where: 'under the heading, when no attire is set' },
  gentsNote: { on: 'dressCode', where: 'the note under the gentlemen\u2019s pieces' },
  ladiesNote: { on: 'dressCode', where: 'the note under the ladies\u2019 pieces' },
  dressNote: { on: 'dressCode', where: 'the note under the palette' },
  giftThanks: { on: 'gift', where: 'the thank-you in script' },
  program: { on: 'program', where: 'under the heading' },
  social: { on: 'social', where: 'under the heading' },
  socialCta: { on: 'social', where: 'the call to post' },
  guestbook: { on: 'guestbook', where: 'under the heading' },
  photos: { on: 'photos', where: 'under the heading' },
  photosIntro: { on: 'photos', where: 'the line above the upload' },
  countdown: { on: 'countdown', where: 'the line above the numbers' },
  contact: { on: 'contact', where: 'the small line under the heading' },
  contactNote: { on: 'contact', where: 'the note' },
  closingMessage: { on: 'closing', where: 'the thank-you' },
  closing: { on: 'closing', where: 'the line above the names' },
};

/** The part each heading names. */
export const TITLE_ON: Record<TitleKey, SectionKey> = {
  story: 'story', invitation: 'ceremony', entourage: 'entourage', sponsors: 'sponsors', gallery: 'gallery',
  venue: 'reception', getting: 'reception', dressCode: 'dressCode', gift: 'gift', program: 'program',
  social: 'social', guestbook: 'guestbook', photos: 'photos', rsvp: 'rsvp', contact: 'contact',
};

/** What a writing's box is called, in this occasion's own words. */
export function lineLabel(key: LineKey, occasion: Occasion): string {
  const { on, where } = LINE_ON[key];
  return `${sectionLabel(on, occasion)} \u2014 ${where}`;
}

/**
 * Two headings name the same part: the venue, and the map for getting to it.
 * Without this they would both be called "Heading — Reception" and she would
 * have to guess which box was which.
 */
const TITLE_ALSO: Partial<Record<TitleKey, string>> = { getting: 'getting there' };

/** What a heading's box is called. The heading names a part, so that is its name. */
export function titleLabel(key: TitleKey, occasion: Occasion): string {
  const name = sectionLabel(TITLE_ON[key], occasion);
  const also = TITLE_ALSO[key];
  return also ? `${name} \u2014 ${also}` : name;
}

/**
 * The writings an occasion has at all.
 *
 * A christening carries no entourage and no Moment, so a form that offers
 * boxes for them is asking her to write words that can never be read. Only
 * the parts this occasion carries are offered.
 */
export function wordsFor(occasion: Occasion): { titles: TitleKey[]; lines: LineKey[] } {
  const has = new Set<SectionKey>(OCCASION_SECTIONS[occasion]);
  return {
    titles: TITLE_KEYS.filter((k) => has.has(TITLE_ON[k])),
    lines: LINE_KEYS.filter((k) => has.has(LINE_ON[k].on)),
  };
}
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
  if (raw.parts && typeof raw.parts === 'object') {
    const parts: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.parts as Record<string, unknown>)) {
      const u = url(v);
      if (u && /^[a-z][a-z0-9-]{0,30}\/[a-z][a-z0-9-]{0,30}$/.test(k)) parts[k] = u;
    }
    if (Object.keys(parts).length) out.parts = parts;
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
  /*
   * What the design wrote, kept apart from what it inherited. The look's own
   * wording is written for a wedding and some of it is withheld from other
   * occasions (see `lookLine`); words typed for *this* design are never
   * withheld, and by the time they are read the two are the same shape. So
   * the keys are recorded as they are folded in.
   */
  const own: NonNullable<Look['own']> = { lines: {}, titles: {} };
  for (const lang of langs) {
    const block = words[lang] ?? {};
    for (const key of LINE_KEYS) {
      const v = block[key];
      if (!v) continue;
      lines[key] = { ...lines[key], [lang]: v };
      own.lines![lang] = [...(own.lines![lang] ?? []), key];
    }
    for (const key of TITLE_KEYS) {
      const v = block[titleWord(key)];
      if (!v) continue;
      titles[key] = { ...(titles[key] ?? { en: v, tl: v }), [lang]: v };
      own.titles![lang] = [...(own.titles![lang] ?? []), key];
    }
  }
  return { ...look, lines, titles, own };
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
  /**
   * How many pages after this one sit on this picture where it runs on,
   * one length of it down all of them, instead of on a ground of their own.
   * `runOf` says which pages actually do.
   */
  runsOn?: number;
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

/**
 * How a ground is cut for a page that can outgrow it.
 *
 * The head and the foot are kept whole and only the band between them is
 * stretched, so a bow at the top of the page stays the shape it was drawn.
 * Forty-four percent each is the proportion the ten shipped Baby Blue
 * grounds were cut at: the cover's 2167 pixels came out as 953, 261 and 953,
 * which is what this returns for it. The three tile the picture exactly.
 */
export const HEAD_SHARE = 0.44;

export function sliceHeights(height: number): { head: number; band: number } {
  const head = Math.round(height * HEAD_SHARE);
  return { head, band: height - head * 2 };
}

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

export type SurroundArt = { url: string; fit: 'cover' | 'tile' };

export type DesignDoc = {
  v: 1;
  pages: PageSpec[];
  /** the ground under a page the map does not name (today: the venue's, for Baby Blue) */
  overflowGround?: Ground;
  /** the colour of the column itself behind every page; blank means the palette's bg */
  paper?: string;
  /** the colour beside the column on a laptop; blank means the palette's bg, barely inked */
  surround?: string;
  /**
   * A picture behind the whole website page, edge to edge, on a laptop —
   * the column sits on top of it, and on a phone the column covers it.
   * `cover` stretches one picture across the window and keeps it still as
   * the page scrolls; `tile` repeats a small one. This is the thing the
   * owner exports from Canva as "the background" and judges on the whole
   * page rather than on a phone strip.
   */
  surroundArt?: SurroundArt;
  /**
   * This design's own colours by night.
   *
   * Night was one fixed set of colours for every design — an ivory ink, a
   * pale gold accent, dark glass behind the cards — written in the
   * stylesheet and the same whether the design was a christening in baby
   * blue or a wedding in capiz and shell. A design can now say its own, and
   * each one it does not name keeps the app's, so a design that says nothing
   * has exactly the night it always had.
   *
   * There is no `bg` here, and that is deliberate rather than an omission:
   * by night the column's own colour *is* the background, and it is `paper`.
   * The day palette's `bg` is still read inside the pages by a handful of
   * small things — the dot on a story bullet, two cards — which are pale on
   * purpose and are not the page's ground; turning it down here would change
   * those and nothing else.
   */
  nightColours?: NightPalette;
  /**
   * The piece drawn under the prenup photograph, on a paged design.
   *
   * It is the last thing a copy of Capiz needed from the `art` column. The
   * numbered backgrounds a page-by-page copy does not use at all — a page
   * with a ground of its own always sits on that one ground, whatever the
   * strips say — and the night is each ground's own. This was the remainder,
   * and a design whose document says nothing about it still reads the column
   * exactly as it did, so the original Capiz keeps its strips and its art.
   */
  strand?: string;
  /**
   * The sections this design does not do at all.
   *
   * Stated as a refusal rather than as a list of what it accepts, because
   * the pages already say what is *drawn* and that is a different question:
   * a section no page names still gets a plain page of its own from the
   * renderer, which is how Baby Blue's ten drawn pages sit in front of a
   * plain Contact. So "offers nothing here" has to be said out loud, and an
   * empty list means the design offers everything its occasion has — the
   * same thing an empty `Template.sections` has always meant.
   *
   * A customer's answers for a hidden section are kept, untouched. Hiding is
   * about this design, not about their data.
   */
  hides?: PageSectionKey[];
};

/**
 * The colours a design gives the night: the roles the night actually sets,
 * and the two colours of the column itself.
 *
 * Every one of them is optional and every one falls back to the app's own
 * night, in the stylesheet, where it has always been — so this is a set of
 * overrides rather than a palette to be filled in, and a design that names
 * one colour changes one colour.
 */
export type NightPalette = {
  ink?: string;
  muted?: string;
  surface?: string;
  accent?: string;
  accent2?: string;
  /** the column's own colour by night */
  paper?: string;
  /** the colour beside the column by night */
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
  /**
   * Room at the foot of the page, as a multiple of the usual.
   *
   * A multiple rather than a measurement, because the usual is already
   * `min(11vw, 3.5rem)` — viewport-relative with a cap, so it holds on a
   * phone and on a laptop — and a number of pixels written here would be
   * right on only one of them. 2 is twice the usual gap; absent is 1.
   *
   * What it is for: a ground whose artwork runs along the bottom. Capiz's
   * closing page keeps clear of the shells there, and does it with a CSS
   * rule naming that page by its key — which a design drawn in the studio
   * cannot have without a release.
   */
  footPad?: number;
  /**
   * The same room at the head. A moment or a flourish hung off the top of a
   * page laid out by its words needs the words to start below it; this is
   * how far below, as a multiple of the usual gap. Absent is 1.
   */
  headPad?: number;
  /** a drawn page: its height is the ground's ratio times its width, and its elements are placed */
  drawn?: true;
  /**
   * A drawn page that stretches. Its ground's proportion is a floor rather
   * than a measurement: if a customer's words run past the foot the page
   * grows to hold them, and the ground keeps its head and its foot whole
   * and stretches the band between (`slices`).
   *
   * On a page like this a place is measured from the page's *width* rather
   * than from its height, because a height that moves would carry every
   * element down with it and nothing would stay where it was drawn.
   */
  grow?: true;
  /** the public peek stops after this page */
  peekEnd?: true;
  /**
   * The colour beside this page on a laptop, where the column does not reach
   * the window's edge. Absent, it follows the page: a page on a plain colour
   * carries that colour out to the edges, and a page on a picture leaves the
   * design's own surround. 'design' says the design's surround whatever the
   * page is on; anything else is a palette role or a colour of its own.
   * `outsideOf` is the rule.
   */
  outside?: 'design' | ColorRole | string;
  /**
   * Whether this page's background reaches the whole website page. On a
   * laptop the column stops short of the window's edge; a background that
   * reaches runs edge to edge behind it — a colour out to the edges, or one
   * picture across the whole page with the column showing the middle of it
   * — and a phone shows the middle of it. Absent: a plain colour reaches,
   * a picture stays in the column. `bleeds` is the rule.
   */
  bleed?: boolean;
  /**
   * The page's picture pinned to the screen: it fills the window — a phone's
   * screen, a laptop's — and stays put while the words move over it, and
   * the pages after sit on it too, until one brings a picture of its own or
   * is drawn. The way a website lays a photograph under a scrolling page,
   * and the way a design exported at 1920 by 1080 is meant to be shown: a
   * phone shows the middle of it. Only a page laid out by its words pins;
   * a drawn page is its picture. `pinOf` is the rule.
   */
  pin?: true;
  /**
   * A page laid out by its words, told to be taller than they are: at least
   * this many screens. The words sit in the middle of it and the pieces
   * around them. Absent, the page is as tall as its words.
   */
  minScreens?: number;
  /**
   * The page's own writings taken off its flow, by the ids the renderer
   * marks them with (`data-w`), because a box of words carries each one
   * now — dragged off the page in the studio, still reading the same
   * answer. The renderer draws nothing for these; the box that took a
   * writing's place says which one (`TextEl.lifted`), and taking the box
   * off puts the writing back.
   */
  offFlow?: string[];
  /** the cover page's own settings; ignored on any other page */
  cover?: CoverSpec;
  /**
   * How a page that was designed somewhere else arrived, so the checklist
   * can say what could and could not be read: a picture dropped on the
   * strip, the two-picture difference, or a PDF. A page drawn here has none.
   */
  importedFrom?: 'picture' | 'diff' | 'pdf';
  /** how this page dresses the sections it carries; a drawn page has none */
  sectionStyle?: SectionStyle;
  elements?: Element[];
};

/**
 * How a page laid out by its words dresses the sections it carries.
 *
 * The sections are the app's own components — the RSVP form, the program
 * list, the venue with its map link — and they are the same components on
 * every design, which is why an invitation built in the studio has always
 * come out looking like the app rather than like the design. This is the
 * whole of the answer to that: four settings on the page, read by the
 * sections through a handful of CSS variables and one attribute, so the
 * same RSVP form is centred on a card in one design and left on bare paper
 * with a flourish over it in another, and no component knows.
 *
 * A drawn page has none of this and cannot: its words are placed by hand,
 * one box at a time, which is the other way of getting the same freedom.
 */
export type SectionStyle = {
  /** where this page's headings sit; absent is centred, as they always were */
  align?: 'left' | 'center' | 'right';
  /** the sections sit on a card of the surface colour rather than on the page itself */
  card?: true;
  /** a piece from the library, drawn above each section's first words */
  rule?: string;
  /**
   * How tall that piece is drawn, as a multiple of the page's own gap.
   *
   * A multiple rather than a measurement, for the same reason `footPad` is
   * one: the gap is already `min(11vw, 3.5rem)`, viewport-relative with a
   * cap, so it holds on a phone and on a laptop, and a number of pixels
   * written here would be right on only one of them. Absent is 1.
   */
  ruleHeight?: number;
};

/**
 * How the cover carries the names and the photograph.
 *
 * The cover is the one page every design has and the one page no design
 * lays out by hand: the names, the date and the portrait are the app's, and
 * the design's part is where they sit and how big they are. Left alone,
 * every design carries them exactly where it always did.
 */
export type CoverSpec = {
  /** where the names sit in the cover's height */
  names?: 'top' | 'middle' | 'bottom';
  /** the air above and below them, as a share of the width */
  inset?: number;
  /** how the portrait sits, when the customer has not chosen for themselves */
  photoStyle?: 'none' | 'veil' | 'arch' | 'oval' | 'round' | 'card';
  /** the portrait's size against the one the design was drawn with: 1 is as drawn */
  photoScale?: number;
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
  /**
   * Which edge the place is measured from. The foot is for what holds the
   * bottom of a page that grows — a closing line, a flourish — so that it
   * stays at the foot however far the words above it push it down. It means
   * nothing on a page that does not grow, where the two edges are a fixed
   * distance apart.
   */
  from?: 'top' | 'bottom';
  z?: number;
  opacity?: number;
  hidden?: 'never' | 'whenEmpty';
  /** marked Ask the customer: its bound field becomes a question on this design's form */
  ask?: boolean;
  /** what an asked-for frame or box shows when the customer leaves it empty */
  ifEmpty?: { piece: string } | 'leave';
  /**
   * How this element arrives, and what it does while it is read.
   *
   * Two different things with one name. `enter` happens once, when the
   * element first comes into view: it fades, rises, or drifts in from the
   * side. `idle` never stops: a slow float, a slow sway. `delay` holds both
   * back, which is what stops three petals moving in lockstep.
   *
   * All of it is off unless the guest's browser says they want motion, and
   * off entirely without JavaScript — see `.inv[data-motion]` in globals.css
   * for why that is the safe way round rather than the timid one.
   */
  motion?: { enter?: 'none' | 'fade' | 'rise' | 'drift'; idle?: 'none' | 'float' | 'sway'; delay?: number };
  /** the id of another element this one follows when that element is moved */
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
  /**
   * On a page laid out by its words: the side the words flow around it on.
   *
   * Only a flow page reads it. A drawn page places everything by hand and
   * has no words to flow, so a float there would mean nothing; the studio
   * offers this only where it applies. See `floatShape` for why a tilted
   * one needs a box of its own.
   */
  float?: 'left' | 'right';
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
  /** the page's own writing this box took the place of (its data-w id, in PageSpec.offFlow); taking the box off puts the writing back */
  lifted?: string;
};

/**
 * A clip on a page. `webm` is the optional second file, offered only to a
 * browser that asks for it; `url` is the MP4 every phone can play.
 *
 * `glare` is the brightest area the studio saw in the frames it decoded
 * while choosing the poster, 0 to 255. It is here rather than measured later
 * because measuring it needs a decoder and the server has none — and the
 * checklist needs it to warn about words laid over a bright clip. It is
 * about the clip's frames rather than about the poster, so replacing the
 * poster by hand leaves it true. Absent on an element the studio did not
 * add, which the checklist says rather than assumes.
 */
export type VideoEl = Base & {
  kind: 'video'; url: string; webm?: string; poster: string; aspect?: number; loop?: boolean; glare?: number;
  /**
   * Behind the whole page rather than in a box on it.
   *
   * A size, not a placement — which is why it is a flag and not four
   * numbers. A page that grows takes its height from its words, so the
   * height a clip must fill is not known until the browser has laid the page
   * out; the stylesheet answers that with `inset: 0` and no element of the
   * document could. A frame's `aspect` cannot do it either: it would make
   * the clip its poster's shape and leave the foot of a long page bare.
   */
  bg?: true;
};
export type AnimEl = Base & { kind: 'anim'; url: string; poster: string; aspect: number; loop?: boolean; speed?: number };
export type ShapeEl = Base & { kind: 'shape'; shape: 'rect' | 'ellipse' | 'line'; fill?: string; stroke?: string; strokeWidth?: number; radius?: number; h?: number };

/**
 * An interactive moment: a thing a guest taps, swipes or holds, and what it
 * reveals — the instant camera, the ring box, the doors. The scene is one of
 * the library's (src/lib/moments.ts); the photographs and the words it
 * reveals are the customer's, bound the way a frame's and a text box's are,
 * so the form asks for them in the one list. `lifted` on a line is the
 * page's own writing dropped into it (see TextEl.lifted).
 */
export type MomentEl = Base & {
  kind: 'moment';
  moment: MomentKey;
  /** a shelf's version of the scene: 'church' doors, a 'cake' candle, a 'mystery' gift */
  variant?: string;
  /** blank means the scene's own first trigger */
  trigger?: MomentTrigger;
  speed?: MomentSpeed;
  /** once: it stays open after the guest opened it; always: it closes again out of view */
  plays?: 'once' | 'always';
  /** its photographs, each a frame like any other */
  photos?: Array<{ bind: FieldRef | { asset: string }; crop?: PhotoEl['crop'] }>;
  /** what it reveals in writing */
  lines?: Line[];
  /** the writing a lifted line took the place of, so removing the moment gives it back */
  lifted?: string;
  /** the Secret Code's answer */
  code?: string;
  /** height over width of its box, where it is not the scene's own */
  aspect?: number;
};

export type Element = PhotoEl | TextEl | VideoEl | AnimEl | ShapeEl | MomentEl;

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
/**
 * Where an element sits, as the style the page is drawn with.
 *
 * `grow` is the page's ratio when the page stretches, and nothing otherwise.
 * A page of fixed proportion places by percentage, which is what it has
 * always done: y is a share of the height and the height cannot move. A page
 * that can grow has to place by the width instead — `cqw`, a hundredth of
 * the page, the page being the query container — or every element would
 * slide down as the page grew and the design would come apart the moment a
 * customer wrote a long sentence. y is still a share of the page's *base*
 * height, so the same number means the same place on both.
 */
export function elementStyle(el: Element, grow?: number): Record<string, string> {
  const st: Record<string, string> = {};
  if (el.x !== undefined) st.left = `${el.x}%`;
  if (grow) {
    const down = place(el.y * grow);
    if (el.from === 'bottom') st.bottom = `${place((100 - el.y) * grow)}cqw`;
    else st.top = `${down}cqw`;
  } else {
    st.top = `${el.y}%`;
  }
  if (el.w !== undefined) st.width = `${el.w}%`;
  const anchor = el.anchor ?? (el.kind === 'text' ? 'top' : 'centre');
  const parts: string[] = [];
  if (el.x !== undefined) parts.push(anchor === 'centre' ? 'translate(-50%, -50%)' : 'translateX(-50%)');
  else if (anchor === 'centre' && grow && el.from === 'bottom') parts.push('translateY(50%)');
  if (el.rotate) parts.push(`rotate(${el.rotate}deg)`);
  if (parts.length) st.transform = parts.join(' ');
  if (el.opacity !== undefined && el.opacity !== 1) st.opacity = String(el.opacity);
  if (el.z !== undefined) st.zIndex = String(el.z);
  return st;
}

/**
 * The frame itself: the shape it holds and the cut it is given.
 *
 * A frame is a square in the stylesheet (`.inv-bb-slot { aspect-ratio: 1 }`)
 * because Baby Blue's four polaroids and six milestones are squares. A frame
 * drawn to any other shape says so here and nowhere else, and a square one
 * says nothing at all, so the markup those two designs have always served is
 * the markup they still serve.
 *
 * A mask is a border radius, which means it cuts the picture and the card
 * alike and costs nothing: no clip path, no SVG, no second element.
 */
export function photoStyle(el: PhotoEl): Record<string, string> {
  const st: Record<string, string> = {};
  if (el.aspect !== undefined && el.aspect !== 1) st.aspectRatio = `1 / ${place(el.aspect)}`;
  const cut = maskRadius(el);
  if (cut) st.borderRadius = cut;
  return st;
}

/**
 * The cut, as a border radius.
 *
 * A circle is the easy one. An arch is a semicircle sitting on straight
 * sides, so its top radius is half the frame's *width* measured both ways —
 * and a border radius reads its second number as a share of the height, so
 * half a width on a box `aspect` widths tall is `50 / aspect` percent. On a
 * frame wider than it is tall that would ask for more height than there is;
 * the browser would scale every corner down together and quietly change the
 * shape, so it is capped here instead, where it can be said out loud: a wide
 * arch is a half-ellipse, because a wide semicircle does not fit.
 */
export function maskRadius(el: PhotoEl): string | undefined {
  if (!el.mask || el.mask === 'none') return undefined;
  if (el.mask === 'circle') return '50%';
  const up = place(Math.min(50 / (el.aspect ?? 1), 100));
  return `50% 50% 0 0 / ${up}% ${up}% 0 0`;
}

/**
 * A crop, as the picture's own size and offset inside its frame.
 *
 * Nothing is re-encoded and no image library runs: the picture is blown up
 * until the window she chose is exactly the size of the frame, then slid so
 * that window lands on it. `w` of 0.5 means the window is half the picture
 * wide, so the picture is drawn two frames wide; `x` of 0.25 means it starts
 * a quarter in, so it is slid half a frame to the left. Exact at every
 * width, and the file that arrives is still the one the transform endpoint
 * sized for the column.
 */
export function cropStyle(crop: NonNullable<PhotoEl['crop']>): Record<string, string> {
  return {
    width: `${place(100 / crop.w)}%`,
    height: `${place(100 / crop.h)}%`,
    left: `${place(-(crop.x / crop.w) * 100)}%`,
    top: `${place(-(crop.y / crop.h) * 100)}%`,
  };
}

/**
 * The window a zoom and a centre choose, in fractions of the source.
 *
 * The window's shape is locked to the frame's, whatever shape the picture
 * is: a square frame shows a square of the picture, which is exactly what
 * `object-fit: cover` does for an uncropped frame today. That is what makes
 * cropping safe to add — zoom 1 centred is the picture a guest already sees,
 * so switching crop on and pressing nothing changes nothing.
 *
 * Above zoom 1 the window shrinks and can be moved about; it is clamped to
 * the picture's edges, so she can never pan past the paper and leave a strip
 * of frame with nothing in it.
 */
export function cropWindow({ aspect = 1, nw, nh, zoom = 1, cx = 0.5, cy = 0.5 }: {
  aspect?: number; nw: number; nh: number; zoom?: number; cx?: number; cy?: number;
}): NonNullable<PhotoEl['crop']> {
  // the window's height over its width, measured in fractions of the source
  const want = aspect * (nw / nh);
  const z = Math.max(1, zoom);
  const w = (want <= 1 ? 1 : 1 / want) / z;
  const h = (want <= 1 ? want : 1) / z;
  return {
    x: place(Math.min(Math.max(cx - w / 2, 0), 1 - w)),
    y: place(Math.min(Math.max(cy - h / 2, 0), 1 - h)),
    w: place(w),
    h: place(h),
  };
}

/**
 * How far in a crop is zoomed and where its middle sits: what cropWindow
 * takes back. Nothing here is rounded — these are the studio's own numbers
 * while her hand is on the picture, and the window they make is rounded
 * when it is written into the document, which is the only place it matters.
 */
export function cropAt(crop: NonNullable<PhotoEl['crop']>, aspect = 1, nw = 1, nh = 1): { zoom: number; cx: number; cy: number } {
  const want = aspect * (nw / nh);
  const fit = want <= 1 ? 1 : 1 / want;
  return { zoom: fit / crop.w, cx: crop.x + crop.w / 2, cy: crop.y + crop.h / 2 };
}

/** The six roles a colour can take, so night mode keeps working. */
export const COLOR_ROLES: readonly ColorRole[] = ['bg', 'surface', 'ink', 'muted', 'accent', 'accent2'];

/**
 * A colour as CSS: one of the palette's six roles becomes its variable, so
 * it follows the theme and turns itself down at night; anything else is the
 * colour she picked and stays exactly that.
 */
export const colourVar = (colour: string): string =>
  (COLOR_ROLES as readonly string[]).includes(colour) ? `var(--inv-${colour})` : colour;

/**
 * A shape: a card behind some words, a rule across the page, a dot.
 *
 * It is a div and nothing else — no SVG, no script, nothing to download.
 * Its width is a share of the page's width like every other element; its
 * height, its outline and its corners are in cqw, which on a drawn page is
 * the same share of the same width, so a shape keeps its proportions at
 * every phone size without a second number to keep in step.
 *
 * A line is the degenerate rectangle: its thickness is its height, and it
 * takes the outline colour because that is what a line is drawn in.
 */
export function shapeStyle(el: ShapeEl): Record<string, string> {
  const st: Record<string, string> = {};
  if (el.shape === 'line') {
    st.height = `${place(el.strokeWidth ?? 0.3)}cqw`;
    const ink = el.stroke ?? el.fill;
    if (ink) st.background = colourVar(ink);
    return st;
  }
  st.height = `${place(el.h ?? el.w ?? 10)}cqw`;
  if (el.fill) st.background = colourVar(el.fill);
  if (el.stroke && el.strokeWidth) st.border = `${place(el.strokeWidth)}cqw solid ${colourVar(el.stroke)}`;
  if (el.shape === 'rect' && el.radius) st.borderRadius = `${place(el.radius)}cqw`;
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
  runsOn: z.number().int().min(1).max(6).optional(),
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
  from: z.enum(['top', 'bottom']).optional(),
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
    crop: z.object({ x: zPlace(0, 1), y: zPlace(0, 1), w: zPlace(0.001, 1), h: zPlace(0.001, 1) }).strict().optional(),
    frame: z.enum(['none', 'thin', 'polaroid']).optional(),
    mask: z.enum(['none', 'circle', 'arch']).optional(),
    float: z.enum(['left', 'right']).optional(),
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
    lifted: z.string().max(80).optional(),
  }).strict(),
  z.object({ ...zBase, kind: z.literal('video'), url: z.string().max(500), webm: z.string().max(500).optional(), poster: z.string().max(500), aspect: z.number().positive().max(10).optional(), loop: z.boolean().optional(), glare: z.number().int().min(0).max(255).optional(), bg: z.literal(true).optional() }).strict(),
  z.object({ ...zBase, kind: z.literal('anim'), url: z.string().max(500), poster: z.string().max(500), aspect: z.number().positive().max(10), loop: z.boolean().optional(), speed: z.number().positive().max(4).optional() }).strict(),
  z.object({
    ...zBase, kind: z.literal('moment'), moment: z.enum(MOMENT_KEYS), variant: z.string().regex(/^[a-z]{1,20}$/).optional(),
    trigger: z.enum(['tap', 'swipe', 'hold']).optional(), speed: z.enum(['slow', 'normal', 'fast']).optional(), plays: z.enum(['once', 'always']).optional(),
    photos: z.array(z.object({
      bind: z.union([zFieldRef, z.object({ asset: z.string().max(500) }).strict()]),
      crop: z.object({ x: zPlace(0, 1), y: zPlace(0, 1), w: zPlace(0.001, 1), h: zPlace(0.001, 1) }).strict().optional(),
    }).strict()).max(6).optional(),
    lines: z.array(zLine).max(8).optional(), lifted: z.string().max(80).optional(), code: z.string().regex(/^[0-9]{3,8}$/).optional(),
    aspect: z.number().positive().max(10).optional(),
  }).strict(),
  z.object({ ...zBase, kind: z.literal('shape'), shape: z.enum(['rect', 'ellipse', 'line']), fill: zColour.optional(), stroke: zColour.optional(), strokeWidth: z.number().min(0).max(40).optional(), radius: z.number().min(0).max(100).optional(), h: z.number().min(0).max(200).optional() }).strict(),
]);
const zPage = z.object({
  key: z.string().regex(KEY),
  label: z.object({ en: z.string().max(60), tl: z.string().max(60).optional() }).strict().optional(),
  sections: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,40}$/)).max(30),
  ground: zGround.optional(),
  seam: z.number().min(0).max(1).optional(),
  footPad: z.number().min(0).max(12).optional(),
  headPad: z.number().min(0).max(12).optional(),
  drawn: z.literal(true).optional(),
  grow: z.literal(true).optional(),
  peekEnd: z.literal(true).optional(),
  outside: z.union([z.literal('design'), zColour]).optional(),
  bleed: z.boolean().optional(),
  pin: z.literal(true).optional(),
  minScreens: z.number().min(0.3).max(6).optional(),
  offFlow: z.array(z.string().max(80)).max(80).optional(),
  cover: z.object({
    names: z.enum(['top', 'middle', 'bottom']).optional(),
    inset: zPlace(0, 40).optional(),
    photoStyle: z.enum(['none', 'veil', 'arch', 'oval', 'round', 'card']).optional(),
    photoScale: zPlace(0.2, 3).optional(),
  }).strict().optional(),
  importedFrom: z.enum(['picture', 'diff', 'pdf']).optional(),
  sectionStyle: z.object({
    align: z.enum(['left', 'center', 'right']).optional(),
    card: z.literal(true).optional(),
    rule: z.string().min(1).max(500).optional(),
    ruleHeight: zPlace(0, 6).optional(),
  }).strict().optional(),
}).strict();
const zDoc = z.object({
  v: z.literal(1),
  overflowGround: zGround.optional(),
  paper: zColour.optional(),
  surround: zColour.optional(),
  surroundArt: z.object({ url: z.string().min(1).max(500), fit: z.enum(['cover', 'tile']) }).strict().optional(),
  strand: z.string().min(1).max(500).optional(),
  nightColours: z.object({
    ink: zColour.optional(), muted: zColour.optional(), surface: zColour.optional(),
    accent: zColour.optional(), accent2: zColour.optional(),
    paper: zColour.optional(), surround: zColour.optional(),
  }).strict().optional(),
  hides: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,40}$/)).max(40).optional(),
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
    // the milestone's words belong to its photograph: move one and the other follows
    attachTo: `story-photo-${i + 1}`,
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
      attachTo: `photos-photo-${i + 1}`,
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
  // the column and the colour beside it: the two literals the stylesheet
  // carried under `.inv[data-layout='babyblue']`, said by the design now
  return { v: 1, pages, overflowGround: g(BABYBLUE_OVERFLOW), paper: '#eef3f9', surround: '#e4ecf5' };
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

/**
 * The storyline Capiz plays, in the owner's words: tap the wax seal (the
 * opening clip) → the invitation begins → tap the camera in Our Story and a
 * print develops → swipe the curtains for the prenup → tap the church doors
 * for the ceremony → scratch a surprise message at the close.
 *
 * Each moment reads the customer's own form — the camera the story's photo
 * and a line for its print, the curtains the first prenup photograph, the
 * doors the church photo, the scratch card a surprise line at the close — so
 * the form asks for exactly what they need, and a Capiz whose customer left
 * them blank shows none of them. Every one hangs off the head of its page
 * with the words starting below it (`headPad`), except the scratch card,
 * which is the last thing on the closing page (`footPad`). The room is the
 * moment's own height plus its gap, in multiples of the usual gap, worked
 * out for both a phone and the capped laptop column.
 */
const CAPIZ_STORYLINE: Record<string, { headPad?: number; footPad?: number; elements: Element[] }> = {
  story: {
    headPad: 8,
    elements: [{
      id: 'story-camera', kind: 'moment', moment: 'instant-camera', x: 50, y: 4, w: 58, ask: true, ifEmpty: 'leave', plays: 'once',
      photos: [{ bind: { section: 'story', field: 'photo' } }],
      lines: [{ role: 'caption', sources: [{ bind: { section: 'story', field: 'caption' } }] }],
    }],
  },
  prenup: {
    headPad: 11,
    elements: [{
      id: 'prenup-curtains', kind: 'moment', moment: 'curtains', x: 50, y: 4, w: 84, ask: true, ifEmpty: 'leave', plays: 'once',
      photos: [{ bind: { section: 'gallery', field: 'photos', index: 0, sub: 'url' } }],
    }],
  },
  invitation: {
    headPad: 11,
    elements: [{
      id: 'church-doors', kind: 'moment', moment: 'doors', variant: 'church', x: 50, y: 4, w: 84, ask: true, ifEmpty: 'leave', plays: 'once',
      photos: [{ bind: { section: 'ceremony', field: 'photo' } }],
    }],
  },
  closing: {
    footPad: 6,
    elements: [{
      id: 'closing-scratch', kind: 'moment', moment: 'scratch', x: 50, y: 4, w: 80, from: 'bottom', ask: true, ifEmpty: 'leave', plays: 'once',
      lines: [{ role: 'body', sources: [{ bind: { section: 'closing', field: 'surprise' } }] }],
    }],
  },
};

function capizDesign(): DesignDoc {
  return {
    v: 1,
    pages: CAPIZ_PAGES.map((def) => {
      const story = CAPIZ_STORYLINE[def.key];
      return {
        key: def.key,
        sections: [...def.sections],
        ...(def.key === 'story' ? { peekEnd: true as const } : {}),
        ...(story ? { elements: story.elements.map((el) => ({ ...el })), ...(story.headPad ? { headPad: story.headPad } : {}), ...(story.footPad ? { footPad: story.footPad } : {}) } : {}),
      };
    }),
    // as above: Capiz's own two, out of the stylesheet and into the design
    paper: '#f0dccb',
    surround: '#e9dfd2',
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
 * A design with nothing drawn on it yet.
 *
 * Before this, a new template had no pages at all and the studio opened on
 * "This design has no pages yet" — so the only way to make a design was to
 * copy one of the two, and everything she built carried their page names and
 * their proportions whether she wanted them or not.
 *
 * A starter is one page per section, in the order it is handed them — the
 * layout's own order where it has one, so it reads like an invitation and
 * not like the list of questions it came from — each laid out by its own
 * words. The cover comes first because it always does. Nothing is drawn by
 * hand and no picture is asked for: the pages take plain colours from the
 * design's own palette, alternating between the ground and the surface, and
 * every one of them becomes a drawn page the moment she gives it a
 * background. On a palette whose two are nearly the same the run reads as
 * one long sheet, which is what a design with no artwork yet honestly is.
 *
 * The peek stops after the second page, which is what a design with no story
 * falls back to anyway; saying it here means she can see it and move it.
 */
export function starterDesign(sections: PageSectionKey[]): DesignDoc {
  const rest = sections.filter((k) => k !== 'cover');
  return {
    v: 1,
    pages: [
      { key: 'cover', label: { en: 'Cover' }, sections: sections.includes('cover') ? ['cover'] : [], ground: { color: 'bg' } },
      ...rest.map((key, i) => ({
        key: pageKeyOf(key),
        sections: [key],
        ground: { color: i % 2 === 0 ? 'surface' : 'bg' } as ColourGround,
        ...(i === 0 ? { peekEnd: true as const } : {}),
      })),
    ],
  };
}

/** A section's key as a page would spell it: `dressCode` becomes `dress-code`. */
export const pageKeyOf = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

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

/**
 * The document the studio opens: the draft if there is one, else what is
 * published, else the layout's built-in, else a starter made from the
 * occasion's own sections. A design opened for the first time is drawn from
 * its base, which is what makes it editable at all.
 *
 * That last fallback is what lets *every* design be drawn rather than only
 * the two built as pages. Before it, a design on one of the six flat layouts
 * had no document and no base to make one from, so the studio had nothing to
 * open and refused the page — which meant a design made from the Templates
 * list led to a form and stopped there. A starter is one page per section the
 * occasion offers, on plain colours, in the layout's own order: not a design
 * yet, but a place to stand while she draws one.
 *
 * Opening it saves nothing. It is what the canvas draws until her first save
 * writes a draft of her own.
 */
export function studioDoc(t: { design?: unknown; designDraft?: unknown; layout: string; occasion?: Occasion }): DesignDoc | null {
  return (
    documentOf({ design: t.designDraft, layout: t.layout })
    ?? documentOf(t)
    ?? builtinDesign(t.layout)
    ?? (t.occasion ? starterDesign(sectionOrder(t.occasion, t.layout)) : null)
  );
}

/**
 * Small enough to be unreadable on a phone. Below this the studio says so:
 * 2.6% of the column is about nine pixels at 360 across, which is where a
 * caption stops being a caption and becomes a smudge.
 */
/**
 * Everything that travels with the given elements, themselves included.
 *
 * A caption written under a polaroid is not part of the polaroid — it is its
 * own box, set in its own face — but a designer who drags the polaroid means
 * the caption to come along. `attachTo` says so, and the walk is transitive:
 * a sticker attached to the caption travels too. The answer comes back in the
 * page's own order, so a caller can rely on it for layering as well.
 */
export function withFollowers(elements: Element[], ids: string[]): string[] {
  const out = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const el of elements) {
      if (el.attachTo && out.has(el.attachTo) && !out.has(el.id)) { out.add(el.id); grew = true; }
    }
  }
  return elements.filter((e) => out.has(e.id)).map((e) => e.id);
}

/**
 * Whether `id` may be attached to `to`. Nothing follows itself, and nothing
 * follows something that already follows it: a ring of attachments would move
 * for ever, so the studio never offers one.
 */
export function canAttach(elements: Element[], id: string, to: string): boolean {
  if (id === to) return false;
  return !withFollowers(elements, [id]).includes(to);
}

/**
 * A photograph the words flow around, on a page laid out by its words.
 *
 * A drawn page places everything by hand, and a flow page has always placed
 * nothing at all: its height is its words, so there is no coordinate to put
 * a picture at. This is the third thing — a picture the *text* makes room
 * for, which is what a float is for and what `shape-outside` makes follow a
 * tilt instead of a rectangle.
 *
 * The hard part is that `float` and `transform` do not know about each
 * other. A float reserves the element's un-rotated box and a rotation simply
 * draws outside it, so a tilted frame would hang over the words. The answer
 * is to float a box big enough to hold the *rotated* frame — its bounding
 * box — put the frame inside it turned, and give the box a `shape-outside`
 * polygon tracing the frame's real corners. The words then follow the tilt.
 *
 * `aspect` is the frame's height over its width, as everywhere else in this
 * file. The returned `width` and `height` are the bounding box as multiples
 * of the frame's own width: 1 and `aspect` when nothing is turned. `inner`
 * is how wide the frame is inside that box, as a percentage of it.
 *
 * Pure trigonometry, so the polygon can be asserted without a browser — a
 * square turned 45° has to come out a diamond, and it does.
 */
export function floatShape(aspect: number, rotate = 0): { width: number; height: number; inner: number; polygon: string } {
  const h = Math.max(0.01, aspect);
  const rad = (rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // the bounding box of the turned frame, in multiples of the frame's width
  const W = Math.abs(cos) + Math.abs(h * sin);
  const H = Math.abs(sin) + Math.abs(h * cos);
  // the frame's four corners, turned, as percentages of that box
  const corners: [number, number][] = [[-0.5, -h / 2], [0.5, -h / 2], [0.5, h / 2], [-0.5, h / 2]];
  const points = corners.map(([x, y]) => {
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return `${round(((rx + W / 2) / W) * 100)}% ${round(((ry + H / 2) / H) * 100)}%`;
  });
  return { width: round(W), height: round(H), inner: round((1 / W) * 100), polygon: `polygon(${points.join(', ')})` };
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * The pictures a flow page's words flow around, and the decorations pinned
 * to its head and its foot.
 *
 * A flow page is laid out by its words, and until now the only thing it
 * could carry was a float. Everything else on it — a piece from the library,
 * a rule, a clip — was in the document and drawn nowhere, which is the worst
 * of the three possible answers. So the rule is now complete and has no
 * silent case: on a page laid out by its words, a picture that names a side
 * floats and the words flow past it; anything else is a decoration, hung
 * from the head of the page or from its foot.
 *
 * Words are not offered as a decoration, and that is deliberate: a flow
 * page's words are its sections' and putting a text box over them is how a
 * flow page stops being one. The studio does not offer them there.
 */
export const flowFloats = (page: PageSpec): PhotoEl[] =>
  (page.elements ?? []).filter((e): e is PhotoEl => e.kind === 'photo' && Boolean(e.float));

/**
 * The decorations on a flow page: everything but the floats. Words too, now:
 * a box of words hung off the head or the foot is a caption, a title over a
 * picture, a line beside the numbers — not the section's words, which stay
 * the customer's and keep flowing under it.
 */
export const flowDecor = (page: PageSpec): Element[] =>
  (page.elements ?? []).filter((e) => !(e.kind === 'photo' && e.float));

/**
 * The colour beside a page on a laptop, or nothing for the design's own
 * surround. A page on a plain colour carries that colour out to the window's
 * edges unless it says otherwise: a blue page in a cream window read as "the
 * outside did not change", and a page on a picture keeps the surround the
 * design set, since a picture has edges and the surround is what frames it.
 */
export function outsideOf(page: PageSpec): string | undefined {
  const g = page.ground;
  // a plain colour that reaches the edges is the colour beside the page
  if (g && !isPicture(g) && bleeds(page)) return g.color;
  // a background kept to the column: the design's surround, or a colour said here
  if (!bleeds(page) && page.outside && page.outside !== 'design') return page.outside;
  return undefined;
}

/**
 * Whether a page's background reaches the whole website page. A plain
 * colour does unless the page says otherwise, since a blue page in a cream
 * window read as "the outside did not change"; a picture stays in the
 * column unless the page says otherwise, since a picture has edges. A page
 * with no background has nothing to reach with.
 */
export function bleeds(page: PageSpec): boolean {
  const g = page.ground;
  if (!g) return false;
  return page.bleed ?? !isPicture(g);
}

/**
 * Whether a decoration sits over the page's words or behind them.
 *
 * Behind unless it says otherwise, because that is what a decoration is for
 * and because words a guest cannot read are the one thing a design must not
 * be able to do by accident. A number above zero is the way to say
 * otherwise, and it is said on the element the same way a layer is said
 * everywhere else in the document.
 */
export const decorOver = (el: Element): boolean => (el.z ?? 0) > 0;

/**
 * Where a decoration sits on a page laid out by its words.
 *
 * `y` means something different here from what it means on a drawn page, and
 * it has to. A drawn page has a height, so y is a share of it; a flow page's
 * height is whatever its customer's words come to, so a share of *that*
 * would move as they typed. Here y is the gap from the edge the decoration
 * hangs off, as a share of the page's **width** — the one measurement of a
 * flow page that does not move — written in `cqw` against the band, which is
 * the page's width exactly. So the same number means the same gap on a phone
 * and on a laptop, and a customer's long sentence does not drag a flourish
 * down the page with it.
 *
 * The band is also why a height in `cqw` works at all: a flow page is not a
 * container, so a shape's height and a frame's card would otherwise be
 * measured against the viewport. See `.inv-deco` in globals.css.
 */
export function decorStyle(el: Element): Record<string, string> {
  const st: Record<string, string> = {};
  // written in the order elementStyle writes it: across, down, wide
  if (el.x !== undefined) st.left = `${el.x}%`;
  const gap = `${place(el.y)}cqw`;
  if (el.from === 'bottom') st.bottom = gap;
  else st.top = gap;
  if (el.w !== undefined) st.width = `${el.w}%`;
  const parts: string[] = [];
  // x is the middle of the box, as it is on every drawn page
  if (el.x !== undefined) parts.push('translateX(-50%)');
  if (el.rotate) parts.push(`rotate(${el.rotate}deg)`);
  if (parts.length) st.transform = parts.join(' ');
  if (el.opacity !== undefined && el.opacity !== 1) st.opacity = String(el.opacity);
  if (el.z !== undefined) st.zIndex = String(el.z);
  return st;
}

/**
 * A clip behind a whole page: the page and the element it takes.
 *
 * Two things happen, and the second is the one worth explaining. The clip is
 * marked as the page's background — `bg`, a size and not a placement, which
 * the stylesheet answers with `inset: 0` because a page that grows takes its
 * height from its words and no number in the document could know it — and
 * laid at z -2.
 *
 * Not z 0, which is what the studio plan says. An element with no z of its
 * own is `auto`, and CSS paints auto and 0 together in tree order, so a clip
 * at 0 added after the words would cover them and whether it did would
 * depend on the order somebody happened to draw things in. -1 is already
 * taken by a shape, which is the card a design puts *behind* its words and
 * therefore in front of a background. -2 is the only unambiguous answer.
 *
 * Then the page's ground becomes the clip's own poster — the picture itself,
 * through the machinery a background has always used, rather than a colour
 * sampled off it. That way the page has a real height, the edge strips and
 * the seams into the pages above and below take their colours the way every
 * other page's do, and a guest sees the poster while the clip is still off
 * screen, on a phone in Low Power Mode, or in print. Nothing new to draw and
 * nothing to blend by hand.
 *
 * `measured` is what the browser read off the poster: its proportions and
 * its two edge colours. Only the browser can read those, which is why they
 * are passed in rather than found here — and why this is the pure half,
 * testable without one.
 */
export function fillPageWithClip(
  page: PageSpec,
  id: string,
  measured: { ratio: number; top: string; bottom: string; slices?: { top: string; foot: string; mid: string } },
): PageSpec {
  const clip = (page.elements ?? []).find((e) => e.id === id);
  if (!clip || clip.kind !== 'video' || !clip.poster) return page;
  return {
    ...page,
    drawn: true,
    ground: {
      url: clip.poster,
      ratio: measured.ratio,
      top: measured.top,
      bottom: measured.bottom,
      ...(measured.slices ? { slices: measured.slices } : {}),
    },
    // x, y and w are set to the page-filling values the flag makes moot, so
    // that taking the flag off leaves a clip somewhere sensible rather than
    // wherever it happened to be when she pressed the button. Its own aspect
    // is left alone for the same reason.
    elements: (page.elements ?? []).map((e) => (e.id === id
      ? { ...e, x: 50, y: 0, w: 100, anchor: 'top' as const, z: -2, rotate: undefined, bg: true as const }
      : e)),
  };
}

/**
 * Put a section on a page.
 *
 * A section belongs to one page. Two pages naming it would draw the same
 * answers twice — a couple's ceremony printed in two places — so it is taken
 * off whichever page had it. A section already on this page is left where it
 * is rather than moved to the end, because adding what is already there
 * should do nothing at all.
 */
export function putSection(doc: DesignDoc, pageKey: string, key: PageSectionKey): DesignDoc {
  if (!doc.pages.some((p) => p.key === pageKey)) return doc;
  const already = doc.pages.find((p) => p.key === pageKey)!.sections.includes(key);
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.key === pageKey
      ? (already ? p : { ...p, sections: [...p.sections, key] })
      : (p.sections.includes(key) ? { ...p, sections: p.sections.filter((x) => x !== key) } : p))),
  };
}

/** Take a section off a page. Nothing else carries it afterwards. */
export function dropSection(doc: DesignDoc, pageKey: string, key: string): DesignDoc {
  return { ...doc, pages: doc.pages.map((p) => (p.key === pageKey ? { ...p, sections: p.sections.filter((x) => x !== key) } : p)) };
}

/** Move a section earlier or later within its own page. */
export function shiftSection(doc: DesignDoc, pageKey: string, key: string, by: number): DesignDoc {
  return {
    ...doc,
    pages: doc.pages.map((p) => {
      if (p.key !== pageKey) return p;
      const list = [...p.sections];
      const at = list.indexOf(key as PageSectionKey);
      const to = at + by;
      if (at < 0 || to < 0 || to >= list.length) return p;
      const [moved] = list.splice(at, 1);
      list.splice(to, 0, moved);
      return { ...p, sections: list };
    }),
  };
}

export const LEGIBLE_CQW = 2.6;

/**
 * The widest a ground is ever stored at, and the widest column a guest ever
 * gets. A page is drawn at most 512 CSS pixels across — the laptop column —
 * so 1536 is three pixels for every one, and nothing needs more.
 */
export const MAX_GROUND = 1536;
export const WIDEST_COLUMN = 512;

/** A drawn page's height, as a multiple of its width. One screen is 1.777. */
export const ONE_SCREEN = 1.777;

/**
 * What the browser keeps for itself, as a share of one screen.
 *
 * A phone does not give a page the whole screen: Safari holds a bar at the
 * foot and Chrome one at the head, and until the guest scrolls, about a
 * tenth of the screen is not the page's. A cover drawn to exactly one screen
 * therefore loses its last tenth on the first look — the line a designer
 * most wants seen. The studio draws the band so she can see it going, which
 * is the only honest way to show it: the height is the browser's, not the
 * page's, so it cannot be measured from anything on the page.
 */
export const BROWSER_BAR = 0.1;
export function pageRatio(page: PageSpec): number {
  const g = page.ground;
  if (!g) return ONE_SCREEN;
  return (isPicture(g) ? g.ratio : g.ratio ?? ONE_SCREEN);
}

/**
 * Every list this design gives frames to, and how many: six for Baby Blue's
 * timeline, four for its photographs. What a design shows is what its form
 * should ask for, so this is the cap the form reads and the number the asks
 * sheet quotes. Keyed `section.field`, with the page each list is drawn on.
 */
export type FrameList = { section: string; field: string; page: string; count: number };
export function frameLists(doc: DesignDoc | null): FrameList[] {
  const out = new Map<string, FrameList>();
  for (const page of doc?.pages ?? []) {
    for (const el of page.elements ?? []) {
      if (el.kind !== 'photo') continue;
      const bind = el.bind as FieldRef;
      if (bind.index === undefined || !bind.section || !bind.field) continue;
      const key = `${bind.section}.${bind.field}`;
      const seen = out.get(key);
      if (seen) seen.count = Math.max(seen.count, bind.index + 1);
      else out.set(key, { section: bind.section, field: bind.field, page: page.key, count: bind.index + 1 });
    }
  }
  return [...out.values()];
}

export function frameCount(doc: DesignDoc | null, section: string, field: string): number {
  return frameLists(doc).find((f) => f.section === section && f.field === field)?.count ?? 0;
}

// ---------------------------------------------------------------------------
// What publishing would do
// ---------------------------------------------------------------------------

/** A list whose number of frames changes, and the page it is drawn on. */
export type FrameChange = { section: string; field: string; page: string; from: number; to: number };

export type DocChange = {
  pagesAdded: string[];
  pagesRemoved: string[];
  /** sections a design stops carrying: their answers stop appearing */
  sectionsRemoved: string[];
  sectionsAdded: string[];
  frames: FrameChange[];
};

/**
 * The sections a design's pages actually draw, in page order.
 *
 * Not the same thing as what the design *offers* — see `offeredSections`.
 * The renderer draws a section no page names in its own generic page, in
 * occasion order, after the drawn ones, which is how Baby Blue's ten drawn
 * pages sit in front of a plain Contact and a plain Music without anybody
 * drawing those. So this answers "what is drawn by hand", and nothing else.
 *
 * Deduped: a section belongs to one page (see `putSection`), so the order is
 * the order a guest meets them.
 */
export function drawnSections(doc: DesignDoc | null): PageSectionKey[] {
  const out: PageSectionKey[] = [];
  const seen = new Set<string>();
  for (const page of doc?.pages ?? []) {
    for (const key of page.sections) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * The sections a design offers: everything its occasion has, less what the
 * design says it does not do.
 *
 * `Template.sections` has always been a second opinion about this — a row of
 * ticks in the admin, kept by hand. For a design that carries a document
 * that is one source of truth too many, so the document carries it and the
 * column becomes a copy of the answer rather than a rival to it.
 *
 * It is stated as what the design *refuses* rather than what it accepts, and
 * that is the whole reason this is not simply `drawnSections`. A design that
 * draws no Music page still offers Music — the renderer gives it a plain page
 * of its own — so "the pages name it" and "the design offers it" are
 * different questions, and the pages cannot answer the second one. An empty
 * `hides` therefore means "everything", which is exactly what an empty
 * `Template.sections` has always meant.
 *
 * Whether the *product* offers a section at all — the six features held back
 * for now — is `sectionOffered`'s to answer, and the renderer asks it
 * separately. Repeating that judgement here would be the second opinion this
 * function exists to remove.
 */
export function offeredSections(doc: DesignDoc, occasion: Occasion): PageSectionKey[] {
  const hidden = new Set(doc.hides ?? []);
  return (OCCASION_SECTIONS[occasion] as readonly string[]).filter((k) => !hidden.has(k as PageSectionKey)) as PageSectionKey[];
}

/** What the second document does that the first did not. */
export function designChange(before: DesignDoc | null, after: DesignDoc | null): DocChange {
  const keys = (d: DesignDoc | null) => (d?.pages ?? []).map((p) => p.key);
  const sections = (d: DesignDoc | null) => new Set(drawnSections(d));
  const was = new Set(keys(before));
  const now = new Set(keys(after));
  const wasSec = sections(before);
  const nowSec = sections(after);
  const lists = new Map<string, FrameChange>();
  for (const f of frameLists(before)) lists.set(`${f.section}.${f.field}`, { section: f.section, field: f.field, page: f.page, from: f.count, to: 0 });
  for (const f of frameLists(after)) {
    const key = `${f.section}.${f.field}`;
    const seen = lists.get(key);
    if (seen) { seen.to = f.count; seen.page = f.page; }
    else lists.set(key, { section: f.section, field: f.field, page: f.page, from: 0, to: f.count });
  }
  return {
    pagesAdded: keys(after).filter((k) => !was.has(k)),
    pagesRemoved: keys(before).filter((k) => !now.has(k)),
    sectionsAdded: [...nowSec].filter((k) => !wasSec.has(k)),
    sectionsRemoved: [...wasSec].filter((k) => !nowSec.has(k)),
    frames: [...lists.values()].filter((f) => f.from !== f.to),
  };
}

/**
 * How many rows of a list an invitation has actually filled. A row counts
 * when anything in it is filled, or — where the design counts the way the
 * photographs page counts — when the field it counts by is filled.
 */
export function filledRows(content: unknown, section: string, field: string, by?: string): number {
  const data = isRecord(content) && isRecord(content[section]) ? (content[section] as Record<string, unknown>) : undefined;
  const raw = data?.[field];
  if (!Array.isArray(raw)) return 0;
  return raw.filter((r) => {
    if (!isRecord(r)) return false;
    if (by) return Boolean(text(r[by]));
    return Object.values(r).some((v) => Boolean(text(v)));
  }).length;
}

/**
 * What pressing Publish would touch, in numbers she can read before she
 * presses it: how many invitations are on this design, and for every list
 * whose frame count changes, how many of them hold answers on the wrong side
 * of the change — a fifth photograph that will now appear, or a sixth
 * milestone that will stop showing. Nothing is deleted either way; a frame
 * that goes simply stops being drawn.
 */
export type BlastRadius = Omit<DocChange, 'frames'> & {
  live: number;
  drafts: number;
  frames: (FrameChange & { beyond: number })[];
};
export function blastRadius(
  before: DesignDoc | null,
  after: DesignDoc | null,
  invitations: { status: string; content: unknown }[],
): BlastRadius {
  const change = designChange(before, after);
  return {
    ...change,
    live: invitations.filter((i) => i.status === 'PUBLISHED').length,
    drafts: invitations.filter((i) => i.status !== 'PUBLISHED').length,
    frames: change.frames.map((f) => {
      const floor = Math.min(f.from, f.to);
      return { ...f, beyond: invitations.filter((i) => filledRows(i.content, f.section, f.field) > floor).length };
    }),
  };
}

/**
 * Where the public peek stops: the page the design marks, and no fallback to
 * a page called 'story' — a design that marks none shows its first page only,
 * which is the safe way round. A design that renames its story page keeps its
 * peek, because the mark travels with the page and not with its name.
 */
/**
 * Which page's picture each page sits on, where a picture runs on.
 *
 * A picture that says it runs on under the next pages is laid once, down all
 * of them, one length of it — a tall design flows down the invitation the
 * way it was drawn instead of starting again at every page. The page it was
 * uploaded on is the head of the run, and the pages after sit on it for as
 * long as they have no ground of their own and are not placed by hand:
 * either ends the run early, whatever the number says. Only the pages that
 * sit on another page's picture are in the map; a head sits on its own.
 */
export function runOf(doc: DesignDoc): Map<string, string> {
  const on = new Map<string, string>();
  const pages = doc.pages;
  for (let i = 0; i < pages.length; i++) {
    const g = pages[i].ground;
    if (!g || !isPicture(g) || !g.runsOn) continue;
    for (let j = i + 1; j <= i + g.runsOn && j < pages.length; j++) {
      const p = pages[j];
      if (p.ground || p.drawn) break;
      on.set(p.key, pages[i].key);
    }
  }
  return on;
}

/**
 * The pages that sit on a pinned picture, each mapped to the page whose
 * picture it is — the head itself included, mapped to itself. A pinned
 * picture runs on down every page after its head, a colour of their own or
 * not, until a page brings a picture of its own or is drawn; either starts
 * afresh. A pin on a page with no picture, or on a drawn page, pins nothing.
 */
export function pinOf(doc: DesignDoc): Map<string, string> {
  const on = new Map<string, string>();
  let head: string | undefined;
  for (const p of doc.pages) {
    const own = p.ground && isPicture(p.ground);
    if (p.drawn || own) head = undefined;
    if (own && p.pin && !p.drawn) head = p.key;
    if (head) on.set(p.key, head);
  }
  return on;
}

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

/**
 * The cover's own settings, from the page that carries it.
 *
 * The cover is found by the section it carries rather than by its key, the
 * same way every other page is found, so a design that names its first page
 * something else still has a cover.
 */
export function coverOf(doc: DesignDoc | null): CoverSpec | undefined {
  return doc?.pages.find((p) => p.sections.includes('cover'))?.cover;
}

/**
 * What the cover's settings do to the hero: where the names sit in its
 * height, and how much air is above and below them. A setting she has not
 * touched says nothing at all, so every design carries its names exactly
 * where it always did.
 */
const NAMES_AT: Record<NonNullable<CoverSpec['names']>, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
/**
 * A page's dress, as the one attribute and the few variables the built
 * sections read it through.
 *
 * Everything here could have been a class per setting, and then every
 * combination would have needed a rule. This way the stylesheet has one
 * block, the document has four fields, and the combinations are the
 * browser's to work out.
 *
 * The gap under the divider is a share of the divider's own height rather
 * than a number, so a piece set taller pushes the words further down and a
 * page with no piece at all has no gap and no box: the height falls to zero
 * and `calc(0px * 0.35)` is nought.
 *
 * `--sec-rule-x` is the divider's own alignment and is not a second choice:
 * a flourish over a heading follows the heading. It is a separate variable
 * only because a text alignment and a background position are different
 * kinds of value to CSS.
 */
/**
 * The app's own night, which is what the stylesheet falls back to.
 *
 * Written here as well as there because the checklist has to read the ink to
 * ask whether a colour she typed will be legible against it, and because a
 * studio that offers a design its own night has to be able to show her what
 * she is changing. The stylesheet keeps the literals as `var()` fallbacks,
 * so a page rendered with no variables at all still has a night — and these
 * two have to be kept in step, which the test asserts.
 */
export const APP_NIGHT: Required<NightPalette> = {
  ink: '#f1e9dd',
  muted: '#cfc3b3',
  surface: 'rgba(38, 36, 50, 0.72)',
  accent: '#d9b98c',
  accent2: '#b39468',
  paper: '#1a1b26',
  surround: '#12131c',
};

const NIGHT_VAR: Record<keyof NightPalette, string> = {
  ink: '--night-ink', muted: '--night-muted', surface: '--night-surface',
  accent: '--night-accent', accent2: '--night-accent2',
  paper: '--night-paper', surround: '--night-surround',
};

/**
 * A design's own colours, as the variables the stylesheet reads.
 *
 * The column's colour and the colour beside it were two literals per layout
 * in the stylesheet, keyed by the layout's name, which meant a design drawn
 * in the studio had whatever its layout's happened to be and no way to say
 * otherwise. They are the document's now, pinned to those same literals for
 * the two shipped designs so neither moves by a shade, and every colour that
 * is not named falls back in the stylesheet to what it has always been.
 */
export function designVars(doc: DesignDoc | null): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!doc) return vars;
  if (doc.paper) vars['--inv-paper'] = colourVar(doc.paper);
  if (doc.surround) vars['--inv-surround'] = colourVar(doc.surround);
  if (doc.surroundArt?.url) {
    vars['--inv-surround-art'] = `url(${doc.surroundArt.url})`;
    vars['--inv-surround-size'] = doc.surroundArt.fit === 'tile' ? 'auto' : 'cover';
    vars['--inv-surround-repeat'] = doc.surroundArt.fit === 'tile' ? 'repeat' : 'no-repeat';
    vars['--inv-surround-attach'] = doc.surroundArt.fit === 'tile' ? 'scroll' : 'fixed';
  }
  for (const [role, name] of Object.entries(NIGHT_VAR) as [keyof NightPalette, string][]) {
    const colour = doc.nightColours?.[role];
    // a role name by night would follow the *day* palette, which is the one
    // thing a night colour cannot be, so these are colours and not roles
    if (colour) vars[name] = colour;
  }
  return vars;
}

export const ENTERS = ['none', 'fade', 'rise', 'drift'] as const;
export const IDLES = ['none', 'float', 'sway'] as const;

/**
 * An element's motion, as the two attributes and the one variable the
 * stylesheet reads.
 *
 * Attributes rather than classes because the stylesheet has to be able to
 * say "anything that enters" in one rule, and one variable rather than an
 * inline animation because the timing is the design system's to decide and
 * the delay is hers.
 *
 * Nothing here says when: the attributes only describe. A guest's page adds
 * `data-in` when the element is actually on screen (`Motion` in client.tsx),
 * which is what makes an enter an arrival rather than something that
 * happened while the page was still three screens above.
 */
export function motionOf(el: Element): { attrs: Record<string, string>; vars: Record<string, string> } {
  const m = el.motion;
  const attrs: Record<string, string> = {};
  const vars: Record<string, string> = {};
  if (!m) return { attrs, vars };
  if (m.enter && m.enter !== 'none') attrs['data-enter'] = m.enter;
  if (m.idle && m.idle !== 'none') attrs['data-idle'] = m.idle;
  // the delay holds back both, which is how three petals stop moving as one
  if (m.delay && (attrs['data-enter'] || attrs['data-idle'])) vars['--motion-delay'] = `${Math.round(m.delay)}ms`;
  return { attrs, vars };
}

/** Does this element move at all? The checklist counts these per page. */
export const moves = (el: Element): boolean => {
  const m = el.motion;
  return Boolean(m && ((m.enter && m.enter !== 'none') || (m.idle && m.idle !== 'none')));
};

export function sectionDress(dress: SectionStyle | undefined): { kind?: 'card' | 'plain'; vars: Record<string, string> } {
  if (!dress) return { vars: {} };
  const vars: Record<string, string> = {};
  if (dress.align) {
    vars['--sec-align'] = dress.align;
    vars['--sec-rule-x'] = dress.align === 'center' ? 'center' : dress.align;
  }
  if (dress.rule) {
    vars['--sec-rule'] = `url(${dress.rule})`;
    // the page's own gap is the unit, so the piece holds its size on a phone
    // and on a laptop the way every other measurement on the page does
    vars['--sec-rule-h'] = `calc(${place(dress.ruleHeight ?? 1)} * min(11vw, 3.5rem))`;
  }
  return { kind: dress.card ? 'card' : 'plain', vars };
}

export function coverStyle(cover: CoverSpec | undefined): Record<string, string> {
  const st: Record<string, string> = {};
  if (!cover) return st;
  if (cover.names) st.alignItems = NAMES_AT[cover.names];
  // a share of the width, so the air holds its proportion at every phone size
  if (cover.inset !== undefined) st.paddingBlock = `${place(cover.inset)}%`;
  if (cover.photoScale !== undefined && cover.photoScale !== 1) st['--inv-portrait-scale'] = String(place(cover.photoScale));
  return st;
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
