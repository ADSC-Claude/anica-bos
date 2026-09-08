import type { Lang } from './copy';
import type { Look, LineKey, TitleKey } from './looks';

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
export type Ground = {
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
};
const slices = (key: string) => ({ top: `/babyblue/${key}-top.webp`, foot: `/babyblue/${key}-foot.webp`, mid: `/babyblue/${key}-mid.webp` });
export const BABYBLUE_GROUNDS: Record<string, Ground> = {
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
