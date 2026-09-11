/**
 * Reading a picture before it is uploaded.
 *
 * A drawn page's height is its ground's proportions, and the strips above and
 * below a picture take the colour of its top and bottom edges — so both have
 * to be known the moment a ground is chosen, not guessed at afterwards. The
 * browser has the picture in its hands already, so it reads them there and
 * re-encodes to something a phone can download while it is at it.
 */

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

export type Uploaded = { url: string; width: number; height: number; ratio: number; top: string; bottom: string };

/** Read it, shrink it, send it, and come back with everything the document needs. */
export async function uploadGround(file: File, templateId: string): Promise<Uploaded> {
  return sendPicture(await readPicture(file), file.name, templateId);
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
