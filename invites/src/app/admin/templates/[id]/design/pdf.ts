import { openPdf, readPdfPages, type Doc, type PdfSheet } from '@/lib/pdf-import';
import type { Fonts } from '@/lib/theme';
import { fromCanvas, MAX_WIDTH, type ReadPicture } from './ground';

/**
 * Reading a PDF in the browser: what it says, and what it looks like
 * without the parts being lifted off it.
 *
 * The reading itself is `@/lib/pdf-import`, which needs no screen. What
 * needs one is the ground: the page drawn as a picture, with the
 * placeholder photographs and the words left out, because those are
 * becoming frames and text boxes of their own and a design should not carry
 * them twice. `operationsFilter` does that in one pass — the same page,
 * minus the operations that put them down — which is what the two-picture
 * way achieves by hand, from one file.
 */

export type PdfRead = { sheet: PdfSheet; ground?: ReadPicture };

/** How far past a page's own size it is worth drawing, so a phone gets a crisp ground. */
const SHARPEN = 4;

/**
 * pdfjs reads a file on a worker of its own, and only the bundler knows
 * where that worker's file ended up. This is the recipe webpack understands:
 * it emits the worker beside the other chunks and hands back its address.
 */
const WORKER = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();

export async function readPdfFile(file: File, fonts?: Fonts): Promise<PdfRead[]> {
  const { doc, close } = await openPdf(await file.arrayBuffer(), WORKER);
  try {
    const sheets = await readPdfPages(doc, fonts);
    const out: PdfRead[] = [];
    for (const sheet of sheets) {
      if (sheet.trouble) { out.push({ sheet }); continue; }
      out.push({ sheet, ground: await draw(doc, sheet) });
    }
    return out;
  } finally {
    await close().catch(() => {});
  }
}

async function draw(doc: Doc, sheet: PdfSheet): Promise<ReadPicture> {
  const page = await doc.getPage(sheet.n);
  const one = page.getViewport({ scale: 1 });
  const scale = Math.min(SHARPEN, MAX_WIDTH / one.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot draw the page.');
  // a PDF page has no background of its own; paper is white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const leave = new Set(sheet.skip);
  await page.render({ canvas, canvasContext: ctx, viewport, operationsFilter: (i: number) => !leave.has(i) }).promise;
  return fromCanvas(canvas, ctx);
}
