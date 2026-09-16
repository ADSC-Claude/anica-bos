import wardrobe from './wardrobe.json';
import { BABYBLUE_GROUNDS, CAPIZ_DEFAULT_ART } from './design';

/**
 * The library: the pieces a design can be built from.
 *
 * Two kinds, in one list. **Built-in** pieces are the artwork the app
 * already ships — the Baby Blue grounds, the Capiz backgrounds and strand,
 * and the wardrobe's hundred-odd garments — derived from the constants that
 * already name them rather than copied into a second list that would rot
 * within a month. **Hers** are `Media` rows with no template and no
 * invitation: uploaded once, usable in any design, named and tagged so she
 * can find them again.
 *
 * Placing a piece copies its *address* into the element, never a reference
 * to the row, so deleting a piece from the library can never break a page
 * that used it. The library is a way to find a picture, not a dependency.
 *
 * A whole-page background carries its proportions and its edge colours, so
 * choosing one as a page's ground is as complete as uploading a file — the
 * numbers were read from the picture once, when it was first shipped, and
 * are the same numbers the renderer has always drawn with.
 */

export type PieceGround = {
  ratio: number;
  top: string;
  bottom: string;
  /** the three cuts a flow page needs, for a ground that shipped with them */
  slices?: { top: string; foot: string; mid: string };
};

export type Piece = {
  /** what a page keeps; also the identity of a built-in */
  url: string;
  name: string;
  tags: string[];
  /** a built-in cannot be renamed, retagged or deleted */
  builtin?: true;
  /** the Media row, for the ones she uploaded */
  id?: string;
  /** set on a whole-page background: everything a ground needs */
  ground?: PieceGround;
  width?: number;
  height?: number;
  /**
   * A moving picture: a GIF, an animated WebP, an animated PNG. What it means
   * downstream is *never re-encode this*, so it travels with the piece: a
   * piece put on a page carries the flag onto the element, and the element is
   * what tells the renderer to serve the file as it is rather than through
   * the transform endpoint, which would keep one frame of it.
   */
  animated?: true;
};

/** Letters and digits only, so "Baby Blue" and "baby-blue" are one word. */
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Whether a piece answers a search.
 *
 * Every word typed has to appear, in the name or in a tag, at the start of
 * a word — so "bab blu" finds Baby Blue and "lue" finds nothing, which is
 * how a person searching a list of their own things expects it to behave.
 */
export function matchPiece(p: Piece, query: string): boolean {
  const terms = flat(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const words = flat([p.name, ...p.tags].join(' ')).split(' ');
  return terms.every((t) => words.some((w) => w.startsWith(t)));
}

export function searchPieces(pieces: Piece[], query: string): Piece[] {
  return pieces.filter((p) => matchPiece(p, query));
}

/** A word as a person would write it: `blouseSkirt` becomes `blouse skirt`. */
const words = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const titled = (s: string) => s.replace(/(^|[ -])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/**
 * The pages Baby Blue is drawn on, as backgrounds anybody can build on.
 *
 * Each comes with the ratio and the two edge colours the renderer already
 * uses, so choosing one is exactly as good as uploading it and rather more
 * accurate: those numbers were measured from the files themselves.
 */
function babyBluePieces(): Piece[] {
  return Object.entries(BABYBLUE_GROUNDS).map(([key, g]) => ({
    url: g.url,
    name: `Baby Blue — ${words(key)}`,
    tags: ['baby blue', 'background', 'christening', key],
    builtin: true as const,
    ground: { ratio: g.ratio, top: g.top, bottom: g.bottom, ...(g.slices ? { slices: g.slices } : {}) },
  }));
}

function capizPieces(): Piece[] {
  return [
    ...CAPIZ_DEFAULT_ART.backgrounds.map((url, i) => ({
      url,
      name: `Capiz — background ${i + 1}`,
      tags: ['capiz', 'background', 'wedding'],
      builtin: true as const,
    })),
    { url: CAPIZ_DEFAULT_ART.strand, name: 'Capiz strand', tags: ['capiz', 'piece', 'flowers', 'wedding'], builtin: true as const },
  ];
}

/**
 * The wardrobe's garments, one per drawing.
 *
 * Each is drawn in two layers — the shape and the shading over it — and the
 * dress-code page recolours the first and multiplies the second. A design
 * placing one as decoration gets the shape, which is the one that carries
 * the drawing.
 */
function wardrobePieces(): Piece[] {
  return (wardrobe as { id: string; group: string; kind: string; w: number; h: number }[]).map((g) => ({
    url: `/attire/${g.id}-fixed.webp`,
    name: titled(words(g.id)),
    tags: ['wardrobe', g.group, words(g.kind)],
    builtin: true as const,
    width: g.w,
    height: g.h,
  }));
}

/** Everything the app ships, in the order the drawer shows it. */
export function builtinPieces(): Piece[] {
  return [...babyBluePieces(), ...capizPieces(), ...wardrobePieces()];
}

/** A row she uploaded, as a piece. */
export function pieceOf(m: { id: string; url: string; name: string; tags: string[]; width: number | null; height: number | null; animated?: boolean }): Piece {
  return {
    id: m.id,
    url: m.url,
    name: m.name || 'Untitled',
    tags: m.tags,
    ...(m.width ? { width: m.width } : {}),
    ...(m.height ? { height: m.height } : {}),
    ...(m.animated ? { animated: true as const } : {}),
  };
}

/**
 * The drawer's own groups.
 *
 * The wardrobe is a hundred and nine drawings and everything else is
 * twenty-eight, so showing all of it at once would bury the rest. It gets a
 * group of its own that has to be asked for — and a search reaches it
 * wherever she is, because a search is a person saying what they want.
 */
export const PIECE_GROUPS = [
  { key: 'mine', label: 'Mine' },
  { key: 'backgrounds', label: 'Backgrounds' },
  { key: 'pieces', label: 'Pieces' },
  { key: 'wardrobe', label: 'Wardrobe' },
] as const;
export type PieceGroup = (typeof PIECE_GROUPS)[number]['key'];

export function groupOf(p: Piece): PieceGroup {
  if (!p.builtin) return 'mine';
  if (p.tags.includes('wardrobe')) return 'wardrobe';
  return p.tags.includes('background') ? 'backgrounds' : 'pieces';
}

/** What the drawer shows: hers first, and the wardrobe only when asked for. */
export function shownPieces(all: Piece[], query: string, group: PieceGroup | 'all'): Piece[] {
  const found = searchPieces(all, query);
  if (group !== 'all') return found.filter((p) => groupOf(p) === group);
  // a search reaches the whole library; browsing does not wade through the wardrobe
  const wide = query.trim().length > 0;
  return found.filter((p) => wide || groupOf(p) !== 'wardrobe');
}

/** How long a name may be, and what a blank one is worth. */
export const cleanName = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * The words she would look for it by, from whatever she typed.
 *
 * Commas or spaces, either way; folded to lower case because a tag is a
 * word and not a title, deduplicated, and capped so a paste of a paragraph
 * does not become forty tags.
 */
export function cleanTags(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split(/[,\n]+/)) {
    const tag = raw.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 24);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === 8) break;
  }
  return out;
}
