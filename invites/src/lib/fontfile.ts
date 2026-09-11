/**
 * A font file she uploaded: woff2, woff, ttf or otf.
 *
 * Pure bytes, so the question can be asked in the browser before the upload
 * and on the server after it, and tested without either. Every one of the
 * four says what it is in its first four bytes, which is just as well: a
 * font has no content type a browser will volunteer reliably — Windows
 * hands over `application/x-font-ttf`, macOS `font/ttf`, and plenty of
 * browsers send nothing at all.
 *
 * What is *not* read here is the family name. It sits in the `name` table,
 * which in a woff2 — the format anybody exporting for the web will upload —
 * is behind Brotli, and reading it would buy nothing: the family name on
 * the row is a label the `@font-face` rule declares and the CSS then asks
 * for, so the two agree because they are the same string, whatever the file
 * calls itself inside.
 */

export type FontFile = 'woff2' | 'woff' | 'ttf' | 'otf';

/**
 * The most a face may weigh.
 *
 * A woff2 of a Latin text face is 20–40 kB and a display face less; a
 * webfont over a megabyte is almost always a full Unicode ttf that wanted
 * subsetting first. Every guest downloads it before the words are readable,
 * so this is stricter than a picture's cap on purpose.
 */
export const FONT_MAX_BYTES = 1024 * 1024;
export const FONT_MAX_LABEL = '1 MB';

export const FONT_TYPES = ['font/woff2', 'font/woff', 'font/ttf', 'font/otf'] as const;

const TYPES: Record<FontFile, string> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

const tag = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));

/** Which of the four this is, or null for something else. */
export function fontFile(bytes: Uint8Array): FontFile | null {
  if (bytes.length < 8) return null;
  const first = tag(bytes, 0, 4);
  if (first === 'wOF2') return 'woff2';
  if (first === 'wOFF') return 'woff';
  if (first === 'OTTO') return 'otf';
  // TrueType: a version of 1.0 as a fixed-point number, or Apple's old 'true'
  if (first === 'true' || (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00)) return 'ttf';
  return null;
}

/** The content type for a font file, or null. */
export const fontType = (bytes: Uint8Array): string | null => {
  const kind = fontFile(bytes);
  return kind ? TYPES[kind] : null;
};

/**
 * Why this file is not a face, in words that name the fix.
 *
 * The two near misses are worth their own sentences: a collection (`ttcf`)
 * holds several faces and a browser will not load one, and a zip is what
 * every foundry delivers, so "it is not a font" would be unhelpful when the
 * font is plainly inside it.
 */
export function whyNotAFace(bytes: Uint8Array): string {
  if (bytes.length < 8) return 'That file is too short to be a font.';
  const first = tag(bytes, 0, 4);
  if (first === 'ttcf') return 'That is a font collection (.ttc), which holds several faces in one file. A browser cannot load one face out of a collection — upload the single face, as a .woff2 if you have it.';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'That is a zip. Unpack it and upload the face itself — the .woff2 if the foundry gave you one, otherwise the .ttf or .otf.';
  if (first === '%PDF') return 'That is a PDF. A font embedded in a PDF cannot be taken out and served; upload the font file the foundry gave you.';
  return 'A font file must be a .woff2, .woff, .ttf or .otf. A .woff2 is the one to prefer: it is the smallest, and every browser this site supports reads it.';
}
