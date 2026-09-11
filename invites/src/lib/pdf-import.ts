import { place, type TextEl } from './design';
import type { Fonts } from './theme';
import { snapRect, type Rect } from './importing';

/**
 * Bringing a page in from a PDF.
 *
 * A PDF is not flat the way a picture is. Every photograph in it is a
 * separate object with its own rectangle, and the words are usually still
 * words, so a page exported as PDF can be read rather than guessed at: the
 * frames come back where the placeholders were, and the writings come back
 * with their position, their size and the face they were set in.
 *
 * Two things stop that, and both are detected rather than guessed at:
 *
 * - **A flattened export** is one full-page image and nothing else. There
 *   are no rectangles to read because there are no objects; the page is a
 *   photograph of itself.
 * - **Outlined words** are paint. Canva's "outline text" and some font
 *   licences turn every letter into a filled path, so the page has no text
 *   at all and a great many fills where the words were.
 *
 * Both are reported in plain words, with the two-picture way offered
 * instead, because guessing at a flattened page is how a design ends up
 * with frames nobody can move and words nobody can reword.
 *
 * `pdfjs-dist` is loaded here and only here, from inside the function, so
 * it lands in a chunk of its own that nothing but this import fetches.
 */

export type PdfLine = { words: string; size: number };

/** A writing read off the page, in the units the document places things in. */
export type PdfText = {
  left: number; top: number; width: number;
  /** in cqw: a hundredth of the page's width, which is what a size means here */
  size: number;
  face?: NonNullable<TextEl['face']>;
  align: 'left' | 'center' | 'right';
  lines: string[];
};

export type PdfSheet = {
  /** 1-based, the way a person counts pages */
  n: number;
  /** height over width, for the page the ground will be drawn at */
  ratio: number;
  frames: Rect[];
  texts: PdfText[];
  /**
   * The operations that put a placeholder photograph or a word down.
   *
   * The page is drawn as the ground with these left out, so the background
   * that comes through is the artwork alone: no printed photograph of
   * somebody else's baby under a frame, and no words printed under the
   * words. It is what the two-picture way achieves by hand, from one file.
   */
  skip: number[];
  /** why this page could not be read, if it could not */
  trouble?: 'flattened' | 'outlined';
};

/** What a reader that cannot read says, in the owner's words rather than a code. */
export const PDF_TROUBLE: Record<'flattened' | 'outlined', string> = {
  flattened: 'This page is one flat picture — Canva flattened it on export, so there are no frames to find and no words to reword. Export it again without flattening, or use the two-picture way.',
  outlined: 'The words on this page came in as outlines, so they are paint and cannot be reworded. The frames can still be found the two-picture way; the writings would have to be typed again.',
};

/** A PDF opened by pdfjs. Kept loose so this module never names pdfjs in its types. */
export type Doc = {
  numPages: number;
  getPage(n: number): Promise<Page>;
};
export type Page = {
  getViewport(o: { scale: number }): { width: number; height: number; convertToViewportPoint(x: number, y: number): number[] };
  /** drawing the page onto a canvas, which only a browser can do */
  render(o: Record<string, unknown>): { promise: Promise<void> };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  getTextContent(): Promise<{ items: Item[]; styles: Record<string, { ascent?: number }> }>;
  commonObjs: { get(name: string): { name?: string } | undefined; has?(name: string): boolean };
};
type Item = { str?: string; width?: number; height?: number; transform?: number[]; fontName?: string; hasEOL?: boolean };

/**
 * Open a PDF.
 *
 * `workerSrc` is where the browser fetches pdfjs's own worker from; it is
 * the caller's to give because only the caller's bundler knows where the
 * file landed. Left out — which is what a test does — pdfjs reads the file
 * on the thread it is on, which is slower and perfectly correct.
 */
export async function openPdf(data: ArrayBuffer | Uint8Array, workerSrc?: string): Promise<{ doc: Doc; close: () => Promise<void> }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  // pdfjs takes the buffer over and empties it, so it is handed a copy: the
  // same file is read twice when a page is imported and then rendered.
  const bytes = (data instanceof Uint8Array ? data : new Uint8Array(data)).slice();
  const task = pdfjs.getDocument({ data: bytes, useWorkerFetch: false, useSystemFonts: false });
  const doc = await task.promise;
  // the worker is the loading task's, not the document's, and it is the
  // thing that has to be let go of
  return { doc: doc as unknown as Doc, close: () => task.destroy() };
}

/**
 * How many letter-sized filled shapes it takes before a page with no words
 * at all is a page whose words were turned into outlines. A page of vector
 * artwork and no writing has paths too, which is why the count is of shapes
 * the size of letters rather than of paths.
 */
const OUTLINE_FILLS = 40;
/** No letter on a phone is wider than this share of the page, or shorter than that. */
const LETTER = { maxW: 0.06, maxH: 0.08, minW: 0.0004, minH: 0.002 };
/** A picture covering this much of the page, alone, is the page itself. */
const WHOLE_PAGE = 0.9;

export async function readPdfPages(doc: Doc, fonts?: Fonts): Promise<PdfSheet[]> {
  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // every way a page can put a picture down
  const images = [OPS.paintImageXObject, OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObject, OPS.paintInlineImageXObjectGroup];
  // a path that is painted rather than merely drawn: what an outlined letter is
  const fills = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke];
  const out: PdfSheet[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 1 });
    const to = (x: number, y: number) => view.convertToViewportPoint(x, y);
    const list = await page.getOperatorList();

    // The current transformation matrix, tracked the way a PDF viewer tracks
    // it: `save` pushes it, `restore` pops it, `transform` multiplies. The
    // matrix in force at a painting operator is where its picture landed.
    let m: number[] = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    let letters = 0;
    const frames: Rect[] = [];
    const skip: number[] = [];
    for (const [i, fn] of list.fnArray.entries()) {
      if (fn === OPS.save) stack.push(m.slice());
      else if (fn === OPS.restore) m = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) m = multiply(m, (list.argsArray[i] as number[]).slice(0, 6));
      else if (images.includes(fn)) { frames.push(boxOf(m, to, view.width, view.height)); skip.push(i); }
      else if (fn === OPS.showText || fn === OPS.showSpacedText) skip.push(i);
      else if (fn === OPS.constructPath && letterSized(list.argsArray[i], fills, m, to, view)) letters++;
    }

    const content = await page.getTextContent();
    const texts = blocksOf(content, page, view, fonts);
    const whole = frames.length === 1 && (frames[0].width * frames[0].height) / 10000 >= WHOLE_PAGE;
    const trouble = whole && !content.items.length ? 'flattened'
      : !content.items.length && letters >= OUTLINE_FILLS ? 'outlined'
        : undefined;

    out.push({
      n,
      ratio: place(view.height / view.width),
      // a flattened page's one picture is the page, not a frame on it
      frames: trouble === 'flattened' ? [] : frames.filter((r) => r.width > 1 && r.height > 1),
      texts,
      skip: trouble ? [] : skip,
      ...(trouble ? { trouble } : {}),
    });
  }
  return out;
}

/**
 * Whether one `constructPath` is a painted shape the size of a letter.
 *
 * In this build a filled path arrives as a single `constructPath` whose
 * first argument is the paint operator and whose third is the box the path
 * covers, so both questions are answered without walking the path itself.
 */
function letterSized(args: unknown[], fills: number[], m: number[], to: (x: number, y: number) => number[], view: { width: number; height: number }): boolean {
  if (!fills.includes(args[0] as number)) return false;
  const box = args[2] as Record<number, number> | undefined;
  if (!box || typeof box[0] !== 'number') return false;
  const corners = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]]
    .map(([x, y]) => to(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]));
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const w = (Math.max(...xs) - Math.min(...xs)) / view.width;
  const h = (Math.max(...ys) - Math.min(...ys)) / view.height;
  return w >= LETTER.minW && w <= LETTER.maxW && h >= LETTER.minH && h <= LETTER.maxH;
}

/** a b c d e f, the PDF way: `next` applied first, then `m`. */
function multiply(m: number[], n: number[]): number[] {
  return [
    n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5],
  ];
}

/**
 * Where a placed picture landed, as a box on the page.
 *
 * A picture in a PDF is drawn into the unit square and put where its matrix
 * says, so the four corners of that square carry it — and taking all four
 * rather than two means a picture placed at an angle still comes back as
 * the box it covers rather than as nonsense.
 */
export function boxOf(m: number[], to: (x: number, y: number) => number[], w: number, h: number): Rect {
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => to(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]));
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  return snapRect({
    left: Math.max(0, Math.min(...xs)) / w, right: Math.min(w, Math.max(...xs)) / w,
    top: Math.max(0, Math.min(...ys)) / h, bottom: Math.min(h, Math.max(...ys)) / h,
  });
}

type Word = { str: string; left: number; right: number; base: number; size: number; ascent: number; font: string };

/**
 * The words, gathered into the boxes a person would have drawn.
 *
 * A PDF says nothing about paragraphs: it says "put these letters here",
 * once per run, and a line of a heading can be four runs. So runs sharing a
 * baseline become a line, and lines of the same size stacked within a line
 * and a half of one another become a block — which is exactly what a text
 * element is, one line per line, stacked in flow.
 */
function blocksOf(content: { items: Item[]; styles: Record<string, { ascent?: number }> }, page: Page, view: { width: number; height: number; convertToViewportPoint(x: number, y: number): number[] }, fonts?: Fonts): PdfText[] {
  const words: Word[] = [];
  for (const it of content.items) {
    const str = (it.str ?? '').replace(/\s+/g, ' ');
    const t = it.transform;
    if (!str.trim() || !t || !it.width) continue;
    const size = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 0;
    if (!size) continue;
    const [x0, y0] = view.convertToViewportPoint(t[4], t[5]);
    const [x1] = view.convertToViewportPoint(t[4] + it.width, t[5]);
    words.push({
      str, left: Math.min(x0, x1), right: Math.max(x0, x1), base: y0, size,
      ascent: size * (content.styles[it.fontName ?? '']?.ascent ?? 0.8),
      font: nameOf(page, it.fontName),
    });
  }
  if (!words.length) return [];

  // one line: the runs sharing a baseline, left to right
  words.sort((a, b) => a.base - b.base || a.left - b.left);
  const lines: Word[][] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].base - w.base) <= last[0].size * 0.4) last.push(w);
    else lines.push([w]);
  }
  for (const l of lines) l.sort((a, b) => a.left - b.left);

  // one block: the lines of the same size, stacked, that overlap across
  const blocks: Word[][][] = [];
  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    const prev = last?.[last.length - 1];
    const near = prev
      && Math.abs(prev[0].size - line[0].size) <= prev[0].size * 0.12
      && line[0].base - prev[0].base <= prev[0].size * 2.2
      && Math.min(...line.map((w) => w.right)) >= Math.max(...prev.map((p) => p.left)) - prev[0].size
      && Math.max(...line.map((w) => w.left)) <= Math.max(...prev.map((p) => p.right)) + prev[0].size;
    if (near) last.push(line);
    else blocks.push([line]);
  }

  return blocks.map((block) => {
    const all = block.flat();
    const left = Math.min(...all.map((w) => w.left));
    const right = Math.max(...all.map((w) => w.right));
    const top = block[0][0].base - block[0][0].ascent;
    const size = block[0][0].size;
    const pct = (v: number, of: number) => place((v / of) * 100);
    // which edge the lines line up on, which is what alignment means here
    const starts = block.map((l) => Math.min(...l.map((w) => w.left)));
    const ends = block.map((l) => Math.max(...l.map((w) => w.right)));
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const align: PdfText['align'] = block.length < 2 ? 'left'
      : spread(starts) <= size * 0.3 ? 'left'
        : spread(ends) <= size * 0.3 ? 'right'
          : 'center';
    return {
      left: pct(left, view.width),
      top: pct(top, view.height),
      width: pct(right - left, view.width),
      size: pct(size, view.width),
      ...(faceFor(all[0].font, fonts) ? { face: faceFor(all[0].font, fonts) } : {}),
      align,
      lines: block.map((l) => joined(l)),
    };
  });
}

/** The runs of one line, with a space where the page left one. */
function joined(line: Word[]): string {
  let out = '';
  for (const [i, w] of line.entries()) {
    if (i && line[i - 1].right + w.size * 0.2 < w.left && !/\s$/.test(out) && !/^\s/.test(w.str)) out += ' ';
    out += w.str;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** The face a run was actually set in, or an empty string when the PDF will not say. */
function nameOf(page: Page, loaded: string | undefined): string {
  if (!loaded) return '';
  try { return page.commonObjs.get(loaded)?.name ?? ''; } catch { return ''; }
}

/** Letters and digits only, so 'Playfair Display' and 'PlayfairDisplay-Bold' are one face. */
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Which of the design's four faces a PDF's font is, or none of them.
 *
 * Canva licenses faces for use inside Canva; most of them are not web fonts
 * and this design does not carry them. So a name that matches nothing comes
 * back unset rather than guessed at, and the box arrives in the design's own
 * face — which is the honest answer, and the one she would have chosen.
 */
export function faceFor(name: string, fonts?: Fonts): NonNullable<TextEl['face']> | undefined {
  if (!name || !fonts) return undefined;
  // 'ABCDEF+PlayfairDisplay-Bold' is one subset of one face
  const want = flat(name.replace(/^[A-Z]{6}\+/, '').replace(/[-,](bold|italic|regular|medium|light|semibold|black|oblique|\d+)$/i, ''));
  if (!want) return undefined;
  for (const face of ['names', 'script', 'display', 'body'] as const) {
    const stack = fonts[face];
    if (!stack) continue;
    const first = flat(stack.split(',')[0] ?? '');
    if (first && (first === want || want.startsWith(first) || first.startsWith(want))) return face;
  }
  return undefined;
}
