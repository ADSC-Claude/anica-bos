/**
 * Reading a picture before it is uploaded.
 *
 * A drawn page's height is its ground's proportions, and the strips above and
 * below a picture take the colour of its top and bottom edges — so both have
 * to be known the moment a ground is chosen, not guessed at afterwards. The
 * browser has the picture in its hands already, so it reads them there and
 * re-encodes to something a phone can download while it is at it.
 */

import { sliceHeights } from '@/lib/design';

/** No page is ever drawn wider than this, so nothing needs to be. */
export const MAX_WIDTH = 1536;

export type ReadPicture = { blob: Blob; width: number; height: number; ratio: number; top: string; bottom: string; pixels?: ImageData };

/**
 * `keepPixels` is for the two-picture import, which needs the picture itself
 * and not only its measurements. It is off by default because a page at full
 * width is some tens of megabytes of pixels and an ordinary upload has no use
 * for them.
 */
export async function readPicture(file: File, keepPixels = false): Promise<ReadPicture> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot read the picture.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return fromCanvas(canvas, ctx, keepPixels);
}

/** Everything the document needs about a picture already drawn on a canvas. */
export async function fromCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, keepPixels = false): Promise<ReadPicture> {
  const { width, height } = canvas;
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.9));
  if (!blob) throw new Error('The picture could not be re-encoded.');
  return {
    blob, width, height,
    ratio: Math.round((height / width) * 1e4) / 1e4,
    top: edge(ctx, width, 0),
    bottom: edge(ctx, width, height - 1),
    ...(keepPixels ? { pixels: ctx.getImageData(0, 0, width, height) } : {}),
  };
}

/**
 * A second picture drawn at the size the first one came out at.
 *
 * The two exports of one page are meant to be identical but for the
 * photographs, and they are the same page, so a difference in proportion of
 * more than a hair means they are not a pair. Anything closer than that is
 * the export rounding a half pixel and is simply drawn to fit.
 */
export async function drawAt(file: File, width: number, height: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const off = Math.abs(bitmap.width / bitmap.height - width / height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot read the picture.');
  if (off > 0.01) {
    bitmap.close?.();
    throw new Error('Those two pictures are different shapes, so they are not two exports of one page.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return ctx.getImageData(0, 0, width, height);
}

/** The average colour of one row of pixels, as a hex the CSS can use. */
function edge(ctx: CanvasRenderingContext2D, width: number, y: number): string {
  const { data } = ctx.getImageData(0, y, width, 1);
  let r = 0, g = 0, b = 0, n = 0;
  // every eighth pixel is plenty for an average and much cheaper on a wide picture
  for (let i = 0; i < data.length; i += 32) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  if (!n) return '#ffffff';
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export type Slices = { top: string; foot: string; mid: string };
export type Uploaded = { url: string; width: number; height: number; ratio: number; top: string; bottom: string; slices?: Slices };

/**
 * A page taller than its ground, cut so it can be.
 *
 * A flow page's height comes from its words, so it can run past the picture
 * behind it. Stretching the whole picture pulls the artwork out of shape —
 * a bow at the top of the page becomes a wide flat bow. So the ground is
 * cut in three: the head and the foot are kept whole at the page's head and
 * foot, and only the band between them is stretched.
 *
 * Forty-four percent each and the twelve percent between them, which is the
 * proportion the ten shipped Baby Blue grounds were cut at by hand — 953,
 * 261 and 953 of the cover's 2167 pixels — so a ground cut here and one cut
 * then behave identically. The three tile the picture exactly: no overlap,
 * nothing lost.
 */
export async function cutSlices(source: CanvasImageSource, width: number, height: number): Promise<{ top: Blob; mid: Blob; foot: Blob }> {
  const { head, band } = sliceHeights(height);
  if (band < 1) throw new Error('That picture is not tall enough to cut: a page-high background is at least twice a phone screen.');
  const cut = async (y: number, h: number): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot cut the picture.');
    ctx.drawImage(source, 0, y, width, h, 0, 0, width, h);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.9));
    if (!blob) throw new Error('The picture could not be re-encoded.');
    return blob;
  };
  return { top: await cut(0, head), mid: await cut(head, band), foot: await cut(head + band, head) };
}

/** Send the three cuts and come back with their addresses. */
export async function sendSlices(cuts: { top: Blob; mid: Blob; foot: Blob }, name: string, templateId: string): Promise<Slices> {
  const one = async (part: 'top' | 'mid' | 'foot') => {
    const fd = new FormData();
    fd.set('file', new File([cuts[part]], `${name.replace(/\.[^.]+$/, '')}-${part}.webp`, { type: 'image/webp' }));
    fd.set('templateId', templateId);
    fd.set('caption', `the ${part} of ${name}`);
    const res = await fetch('/api/admin/design-upload', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'The upload failed.');
    return json.url as string;
  };
  return { top: await one('top'), mid: await one('mid'), foot: await one('foot') };
}

/** Read it, shrink it, send it, and come back with everything the document needs. */
export async function uploadGround(file: File, templateId: string, cut = false): Promise<Uploaded> {
  const read = await readPicture(file);
  const sent = await sendPicture(read, file.name, templateId);
  if (!cut) return sent;
  // cut from the picture as it was sent — capped to MAX_WIDTH — so the three
  // cuts and the whole are the same picture at the same size
  const whole = await createImageBitmap(read.blob);
  try {
    const cuts = await cutSlices(whole, read.width, read.height);
    return { ...sent, slices: await sendSlices(cuts, file.name, templateId) };
  } finally {
    whole.close?.();
  }
}

/**
 * The three cuts of a picture already on the server.
 *
 * A background chosen from the library was uploaded once and is not being
 * uploaded again, but a flow page still needs it cut. The file is ours and
 * same-origin, so the browser reads it back and cuts it there.
 */
export async function cutFromUrl(url: string, templateId: string): Promise<Slices> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const cuts = await cutSlices(img, Math.max(1, img.naturalWidth), Math.max(1, img.naturalHeight));
  return sendSlices(cuts, url.split('/').pop() ?? 'ground.webp', templateId);
}

/** Send a picture already read, for a caller that needed its pixels first. */
export async function sendPicture(read: ReadPicture, name: string, templateId: string): Promise<Uploaded> {
  const fd = new FormData();
  fd.set('file', new File([read.blob], `${name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' }));
  fd.set('templateId', templateId);
  fd.set('width', String(read.width));
  fd.set('height', String(read.height));
  fd.set('top', read.top);
  fd.set('bottom', read.bottom);
  const res = await fetch('/api/admin/design-upload', { method: 'POST', body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'The upload failed.');
  return { url: json.url as string, width: read.width, height: read.height, ratio: read.ratio, top: read.top, bottom: read.bottom };
}

/**
 * Everything a ground needs about a picture already on the server.
 *
 * A piece from the library has been uploaded once and is not being
 * uploaded again, but a page's background has to know its proportions and
 * the colour of its top and bottom edges — the strips beyond the picture
 * take those. The file is ours and same-origin, so the browser can read it
 * back off a canvas rather than the server measuring it a second time.
 */
export async function groundFromUrl(url: string): Promise<{ ratio: number; top: string; bottom: string; slices?: Slices }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const width = Math.max(1, img.naturalWidth);
  const height = Math.max(1, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot read the picture.');
  ctx.drawImage(img, 0, 0);
  return {
    ratio: Math.round((height / width) * 1e4) / 1e4,
    top: edge(ctx, width, 0),
    bottom: edge(ctx, width, height - 1),
  };
}
