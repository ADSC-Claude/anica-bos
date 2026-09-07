import type { Lang } from './copy';
import type { Look, LineKey, TitleKey } from './looks';

/**
 * What a design's encoder can change without a release: the words it writes
 * over its look's — every line under a heading and every heading a look
 * names, in each language — and the pictures that are the design's own, by
 * URL. Both live on the Template row as JSON (`words`, `art`) and are edited
 * in the admin; blank means the code's own value stands.
 */
export type DesignWords = Partial<Record<Lang, Partial<Record<LineKey | TitleKey, string>>>>;

export type DesignArt = {
  /** The backgrounds down the page, in order; the last in the list is the one set last. */
  backgrounds?: string[];
  /** The same by night, for the night mode; blank darkens the day ones. */
  night?: string[];
  /** The strand of shell under the prenup photograph. */
  strand?: string;
};

export const LINE_KEYS: LineKey[] = ['cover', 'story', 'invitation', 'entourage', 'gallery', 'galleryNote', 'galleryVideo', 'galleryClose', 'venue', 'interlude2', 'dressCode', 'dressNote', 'giftThanks', 'program', 'social', 'socialCta', 'guestbook', 'photos', 'photosIntro', 'countdown', 'contact', 'contactNote', 'closing'];
export const TITLE_KEYS: TitleKey[] = ['story', 'invitation', 'entourage', 'gallery', 'venue', 'getting', 'dressCode', 'gift', 'program', 'social', 'guestbook', 'photos', 'rsvp', 'contact'];

/** Where each line is read, for the admin's form. */
export const LINE_LABELS: Record<LineKey, string> = {
  cover: 'Cover — above the names',
  story: 'Our Story — under the heading',
  invitation: 'The Invitation — under the heading',
  entourage: 'Entourage — under the heading',
  gallery: 'Prenup — under the heading',
  galleryNote: 'Prenup — between the large photograph and the arches',
  galleryVideo: 'Prenup — written over the film',
  galleryClose: 'Prenup — the last word',
  venue: 'The Venue — under the heading',
  interlude2: 'The Venue — the script line after the way there',
  dressCode: 'Dress Code — under the heading, when no attire is set',
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
  closing: 'Closing — the line above the names',
};
export const TITLE_LABELS: Record<TitleKey, string> = {
  story: 'Our Story', invitation: 'The Invitation', entourage: 'Entourage', gallery: 'Prenup Photos', venue: 'The Venue', getting: 'Getting There',
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
    const clean: Partial<Record<LineKey | TitleKey, string>> = {};
    for (const key of [...LINE_KEYS, ...TITLE_KEYS]) {
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
      const v = block[key];
      if (v) titles[key] = { ...(titles[key] ?? { en: v, tl: v }), [lang]: v };
    }
  }
  return { ...look, lines, titles };
}

/** The Capiz layout's own pictures, when the design names none. */
export const CAPIZ_DEFAULT_ART: Required<Pick<DesignArt, 'backgrounds' | 'strand'>> = {
  backgrounds: Array.from({ length: 8 }, (_, i) => `/capiz/bg-${i + 1}.webp`),
  strand: '/capiz/strand-b.webp',
};
