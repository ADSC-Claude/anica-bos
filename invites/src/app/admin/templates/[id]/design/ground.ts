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

export type ReadPicture = { blob: Blob; width: number; height: number; ratio: number; top: string; bottom: string };

export async function readPicture(file: File): Promise<ReadPicture> {
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
  };
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
  const read = await readPicture(file);
  const fd = new FormData();
  fd.set('file', new File([read.blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' }));
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
