import type { Tier } from '@prisma/client';
import type { LookKey } from './looks';
import { LOOKS, LOOK_MIN_TIER } from './looks';
import { FONT_PRESETS, type Fonts } from './theme';

/**
 * The owner's faces and pairings, as data rather than as code.
 *
 * Until now a typeface was a literal: the five looks in looks.ts and the
 * thirty-odd pairings in theme.ts, both of them a developer's file. This is
 * the same information in a shape the two tables can hold, plus the pure
 * functions that turn a row back into the `Fonts` object every renderer
 * already speaks — so nothing downstream learns a new vocabulary, and a
 * pairing she adds in the admin reaches a guest by exactly the path the
 * shipped ones take.
 *
 * Two tables rather than one, because a face is reused: Cormorant Garamond
 * is in nine of the pairings, and asking her to retype its fallback chain
 * and its weights nine times is asking for nine different answers. A set
 * names faces; a face says how to draw and how to fetch itself.
 *
 * Nothing here touches the database. The rows are handed in — the same
 * discipline the checklist's file weights follow — so the renderer stays
 * synchronous and every rule in here can be tested without a server.
 */

export type FaceSource = 'google' | 'file';

/** One typeface. */
export type FaceRow = {
  key: string;
  /** What she calls it in the admin. */
  name: string;
  /** The family a CSS rule asks for, and the family a Google request names. */
  family: string;
  /** The whole CSS value: the family first, then what to draw in until it arrives. */
  stack: string;
  source: FaceSource;
  /**
   * The axis spec after the family in a Google request, e.g.
   * `ital,wght@0,400;1,400`. Blank asks for the four weights
   * `googleFontsUrl` asks for by default.
   */
  weights: string;
  /** The file, for a face she uploaded; blank for a Google one. */
  url: string;
  /** Her own declaration of where the right to serve this file came from. */
  licence: string;
  enabled: boolean;
  sortOrder: number;
};

/** One pairing: which face plays which part, and whose wording it speaks in. */
export type SetRow = {
  key: string;
  name: string;
  /** Face keys. A set with no `names` sets the names in the display face, and one with no `script` likewise. */
  displayKey: string;
  bodyKey: string;
  namesKey: string;
  scriptKey: string;
  scriptStyle: 'normal' | 'italic';
  /**
   * Faces the set loads without naming in any of the four parts above,
   * because the design's own stylesheet asks for them — Capiz draws its
   * headings in Cinzel from CSS the document does not know about.
   */
  alsoKeys: string[];
  /** Which of the five looks' wording this set speaks in. */
  voice: LookKey;
  minTier: Tier;
  enabled: boolean;
  sortOrder: number;
};

export type FontBook = { faces: FaceRow[]; sets: SetRow[] };

/** A set with its faces already looked up: what a picker and `resolveTheme` want. */
export type BookSet = { key: string; name: string; fonts: Fonts; voice: LookKey; minTier: Tier };

/** The family a CSS stack begins with: `'Cormorant Garamond', Georgia, serif` → `Cormorant Garamond`. */
export function familyOf(stack: string): string {
  const trimmed = stack.trim();
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
    const quote = trimmed[0];
    const end = trimmed.indexOf(quote, 1);
    if (end > 1) return trimmed.slice(1, end);
  }
  return trimmed.split(',')[0].trim();
}

/** A family's key: what the admin's URLs and a set's columns call it. */
export const faceKey = (family: string): string => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The weights `googleFontsUrl` asks for when a face names none. */
export const DEFAULT_WEIGHTS = 'wght@400;500;600;700';

type Spec = { axes: string[]; tuples: string[][] };

function parseSpec(spec: string): Spec {
  const at = (spec || DEFAULT_WEIGHTS).split('@');
  const axes = at.length > 1 ? at[0].split(',') : ['wght'];
  const values = at.length > 1 ? at[1] : at[0];
  return { axes, tuples: values.split(';').map((t) => t.split(',')) };
}

/** The low end of an axis value, so `6..96` sorts where 6 does. */
const low = (value: string): number => Number(value.split('..')[0]);

/**
 * One axis spec covering every weight two specs ask for.
 *
 * Needed because thirteen families are asked for differently in different
 * pairings — Cormorant Garamond five ways, from a bare family name to an
 * italic axis — and a face is one row. Taking the longer of the two strings
 * would quietly drop weights: the bare form means four weights including
 * 700, and the longest italic spec in the file has no 700 in it.
 *
 * An axis one spec does not carry is filled in: `ital` with 0, an upright
 * face, and anything else with whatever the other spec asked for, which for
 * an optical size is the family's whole range. Google wants the axes in
 * alphabetical order and the tuples in ascending order, and refuses the
 * whole request otherwise — which would leave every face on the page drawn
 * in its fallback — so both are sorted here rather than trusted.
 */
export function mergeWeights(a: string, b: string): string {
  const specs = [parseSpec(a), parseSpec(b)];
  const axes = [...new Set(specs.flatMap((s) => s.axes))].sort();
  const filler = (axis: string): string => {
    if (axis === 'ital') return '0';
    for (const s of specs) {
      const at = s.axes.indexOf(axis);
      if (at >= 0) return s.tuples[0][at];
    }
    return '0';
  };
  const rows = new Set<string>();
  for (const s of specs) {
    for (const tuple of s.tuples) {
      rows.add(axes.map((axis) => (s.axes.includes(axis) ? tuple[s.axes.indexOf(axis)] : filler(axis))).join(','));
    }
  }
  const sorted = [...rows].sort((x, y) => {
    const [p, q] = [x.split(','), y.split(',')];
    for (let i = 0; i < p.length; i++) if (low(p[i]) !== low(q[i])) return low(p[i]) - low(q[i]);
    return 0;
  });
  return `${axes.join(',')}@${sorted.join(';')}`;
}

/** A face's Google entry: the family and the axes it wants, as `googleFontsUrl` reads them. */
export const loadEntry = (face: FaceRow): string => (face.weights ? `${face.family}:${face.weights}` : face.family);

/**
 * A set's faces as the `Fonts` object every renderer already takes.
 *
 * A face the book has lost — disabled, or deleted out from under a set —
 * leaves that part of the set unset rather than blank: a set whose body face
 * is gone falls back to its display face, which is a page that still reads,
 * and a set whose display face is gone is no set at all and returns nothing,
 * so the caller keeps whatever it had.
 */
export function fontsOf(set: SetRow, faces: Map<string, FaceRow>): Fonts | null {
  const face = (key: string): FaceRow | undefined => {
    const row = key ? faces.get(key) : undefined;
    return row?.enabled ? row : undefined;
  };
  const display = face(set.displayKey);
  if (!display) return null;
  const body = face(set.bodyKey) ?? display;
  const names = face(set.namesKey);
  const script = face(set.scriptKey);
  const used = [display, body, names, script, ...set.alsoKeys.map(face)].filter((f): f is FaceRow => !!f);
  const google = new Map<string, string>();
  const files: { family: string; url: string }[] = [];
  for (const f of used) {
    if (f.source === 'file') {
      if (f.url && !files.some((x) => x.family === f.family)) files.push({ family: f.family, url: f.url });
    } else if (!google.has(f.family)) google.set(f.family, loadEntry(f));
  }
  return {
    display: display.stack,
    body: body.stack,
    ...(names ? { names: names.stack } : {}),
    ...(script ? { script: script.stack } : {}),
    ...(set.scriptStyle === 'italic' ? { scriptStyle: 'italic' as const } : {}),
    load: [...google.values()],
    ...(files.length ? { files } : {}),
  };
}

/** Every set the book can draw, in its order, skipping any whose display face is gone. */
export function bookSets(book: FontBook): BookSet[] {
  const faces = new Map(book.faces.map((f) => [f.key, f]));
  return book.sets
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
    .flatMap((s) => {
      const fonts = fontsOf(s, faces);
      return fonts ? [{ key: s.key, name: s.name, fonts, voice: s.voice, minTier: s.minTier }] : [];
    });
}

/**
 * The two pairings whose key a look already had.
 *
 * The five looks and the thirty pairings were two lists with two key spaces,
 * and `modern` and `editorial` are in both. One table can hold one of each,
 * and the look's key is the one written on live invitations — a customer's
 * `lookKey` — so the look keeps it and the pairing is renamed after the face
 * that tells the two apart. A `fontsKey` saved before the rename still finds
 * its pairing through here.
 */
export const RENAMED_SETS: Record<string, string> = { modern: 'modern-inter', editorial: 'editorial-dm-sans' };

/**
 * Which look's wording each pairing speaks in, and nothing else about it.
 *
 * A pairing is faces; a look is faces *and* the lines under the headings. So
 * a pairing joining the table needs to be told whose lines to borrow, or the
 * invitation set in it has a heading and then a gap. Chosen by character:
 * the scripts speak in Romance, the Didones and the old-style serifs in
 * Editorial, the inscriptional capitals in Regal, the grotesques in Modern.
 */
export const PRESET_VOICE: Record<string, LookKey> = {
  serif: 'heritage',
  capiz: 'heritage',
  editorial: 'editorial',
  script: 'romance',
  modern: 'modern',
  playful: 'modern',
  'italiana-open-sans': 'editorial',
  'dm-serif-dm-sans': 'modern',
  'playfair-lato': 'editorial',
  'marcellus-jost': 'heritage',
  'josefin-abhaya': 'modern',
  'alata-poppins': 'modern',
  'bodoni-archivo': 'editorial',
  'dm-serif-allison': 'romance',
  'six-caps-poppins': 'modern',
  'fraunces-antonio': 'editorial',
  'abril-de-haviland': 'romance',
  'great-vibes-league-gothic': 'romance',
  'cinzel-delafield': 'regal',
  'prata-ovo': 'editorial',
  'cormorant-pinyon': 'heritage',
  'noto-outfit': 'modern',
  'oswald-muellerhoff': 'romance',
  'great-vibes-inter': 'romance',
  'montserrat-pinyon': 'romance',
  'allura-antonio': 'romance',
  'great-vibes-noto': 'romance',
  'poiret-dancing': 'romance',
  'pacifico-quicksand': 'modern',
  'marcellus-montserrat': 'heritage',
  'unbounded-quicksand': 'modern',
  'delafield-playfair': 'romance',
  'parisienne-roboto': 'romance',
  'cormorant-michroma': 'modern',
  'alex-brush-sanchez': 'romance',
  'bodoni-muellerhoff': 'editorial',
};

/** What the fallback chain says about a face, for the admin's own sample line. */
const GENERIC = /(serif|sans-serif|cursive|monospace|system-ui)\s*$/;

/**
 * The book the code itself is: the five looks and the thirty-odd pairings,
 * decomposed into faces and sets.
 *
 * This is what the seed writes and what every reader falls back to when the
 * tables have not been read — so a page rendered from the code and a page
 * rendered from the rows are the same page, by construction rather than by
 * hope. Two normalisations happen here and nowhere else:
 *
 * - **One row per family.** Eight families are written with two fallback
 *   chains across the lists (`'Cormorant Garamond', Georgia, serif` in some
 *   pairings, `…, 'Hoefler Text', Georgia, serif` in others). The fuller
 *   chain wins, which is the better of the two anyway and is only ever seen
 *   when Google does not answer.
 * - **One axis spec per family**, merged rather than picked, so no pairing
 *   loses a weight it asked for. See `mergeWeights`.
 */
export function builtInBook(): FontBook {
  const faces = new Map<string, FaceRow>();
  const sets: SetRow[] = [];

  const meet = (stack: string, weights: string) => {
    const family = familyOf(stack);
    const key = faceKey(family);
    const had = faces.get(key);
    if (!had) {
      faces.set(key, {
        key, name: family, family, stack,
        source: 'google', weights: weights || DEFAULT_WEIGHTS, url: '', licence: '',
        enabled: true, sortOrder: faces.size,
      });
      return key;
    }
    if (stack.length > had.stack.length) had.stack = stack;
    had.weights = mergeWeights(had.weights, weights || DEFAULT_WEIGHTS);
    return key;
  };

  const add = (key: string, name: string, fonts: Fonts, voice: LookKey, minTier: Tier, sortOrder: number) => {
    const spec = new Map(fonts.load.map((entry) => [entry.split(':')[0], entry.split(':').slice(1).join(':')]));
    const part = (stack: string | undefined) => (stack ? meet(stack, spec.get(familyOf(stack)) ?? '') : '');
    const displayKey = part(fonts.display);
    const bodyKey = part(fonts.body);
    const namesKey = part(fonts.names);
    const scriptKey = part(fonts.script);
    const named = new Set([displayKey, bodyKey, namesKey, scriptKey]);
    /*
     * A family the set loads but none of its four parts names. Only Capiz
     * does it, and only because its own stylesheet asks for Cinzel and
     * Pinyon Script directly. Such a family has no stack written anywhere,
     * so it takes the one another set already gave it and, failing that, the
     * generic its neighbours end in.
     */
    const generic = GENERIC.exec(fonts.body)?.[1] ?? 'serif';
    const alsoKeys: string[] = [];
    for (const [family, axes] of spec) {
      const key = faceKey(family);
      if (named.has(key)) continue;
      alsoKeys.push(faces.has(key) ? meet(faces.get(key)!.stack, axes) : meet(`'${family}', ${generic}`, axes));
    }
    sets.push({ key, name, displayKey, bodyKey, namesKey, scriptKey, scriptStyle: fonts.scriptStyle === 'italic' ? 'italic' : 'normal', alsoKeys, voice, minTier, enabled: true, sortOrder });
  };

  LOOKS.forEach((look, i) => add(look.key, look.name, look.fonts, look.key, LOOK_MIN_TIER[look.key], i));
  FONT_PRESETS.forEach((preset, i) => add(RENAMED_SETS[preset.key] ?? preset.key, preset.label, preset.fonts, PRESET_VOICE[preset.key] ?? 'modern', 'COMPLETE', 10 + i));

  return { faces: [...faces.values()], sets };
}
