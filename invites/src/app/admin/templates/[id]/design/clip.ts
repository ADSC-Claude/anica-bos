/**
 * Reading a clip before it is uploaded, and taking its poster off it.
 *
 * Everything here happens in the browser, and has to: there is no ffmpeg on
 * the server and sharp does not do video, so the only machine in the chain
 * that can decode a clip is the one the file was picked on. It reads the
 * length and the proportions the document needs, refuses what a guest's
 * phone would not play, and draws a still frame to a canvas for the poster —
 * which is not a nicety, being what prints, what a guest sparing their data
 * sees, and what an iPhone in Low Power Mode shows instead of playing.
 *
 * The clip itself is never re-encoded. What is uploaded is exactly what
 * every guest downloads, whole, over whatever connection they are on.
 */

import { brightestCell, clipFault, codecFault, looksBlank, mp4VideoCodec, posterTimes, VIDEO_TYPES, VIDEO_MAX_BYTES } from '@/lib/clips';
import { fromCanvas, sendPicture, MAX_WIDTH, type ReadPicture } from './ground';

export type ReadClip = {
  file: File;
  durationMs: number;
  width: number;
  height: number;
  /** height over width, the way a drawn element states its shape */
  aspect: number;
  poster: ReadPicture;
  /**
   * The brightest area seen in any frame this decoded, 0 to 255. Taken
   * across all of them and not only the one kept as the poster, because the
   * frame that swallows a pale word may be seconds after the frame that
   * prints. The checklist warns on it; it is a sample, not a promise.
   */
  glare: number;
  /** something true she should know that is not a refusal — an unreadable codec, a poster that had to be taken off a dark frame */
  note?: string;
};

export type SentClip = { url: string; poster: string; width: number; height: number; durationMs: number; aspect: number; bytes: number; glare: number };

/**
 * What the browser can find out about a picked file, or a refusal saying why
 * it cannot go on a page.
 *
 * The order matters: the cheap rules first, so a fifty-megabyte file is
 * turned away before anything tries to decode it.
 */
export async function readClip(file: File): Promise<ReadClip> {
  if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Only MP4 and WebM clips are accepted. An .mov from an iPhone needs exporting as MP4 first.');
  }
  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error(clipFault(file, { durationMs: 0, width: 1, height: 1 })!.say);
  }

  // The codec before the decode: an HEVC file decodes perfectly on a Mac and
  // is exactly the one that must not be uploaded, so the container is read
  // rather than the browser asked. Unknown is not bad — it is said, not used.
  let note: string | undefined;
  if (file.type === 'video/mp4') {
    const code = mp4VideoCodec(new Uint8Array(await file.arrayBuffer()));
    const bad = codecFault(code);
    if (bad) throw new Error(bad.say);
    if (!code) note = 'The clip’s format could not be read out of the file, so it was taken as it is. If it turns out not to play on a phone, export it again as H.264.';
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  try {
    // 'auto', not 'metadata': a frame has to be decoded, not only measured
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await settled(video);
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error('This browser could not read that clip. If it came off a camera, exporting it as MP4 (H.264) usually fixes it.');
    const fault = clipFault(file, { durationMs, width, height });
    if (fault) throw new Error(fault.say);
    const shot = await grabPoster(video, durationMs, width, height);
    return {
      file, durationMs, width, height,
      aspect: Math.round((height / width) * 1e4) / 1e4,
      poster: shot.poster,
      glare: shot.glare,
      note: [note, shot.note].filter(Boolean).join(' ') || undefined,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * A still frame worth showing, found by trying a few places in the clip.
 *
 * Not the very first frame: clips fade in from black, flash white, or open
 * on a title card that has not drawn yet, and a poster is the one still
 * three different kinds of guest see. `posterTimes` says where to look and
 * `looksBlank` judges what comes back. If every place tried is blank the
 * clip really is dark all the way through, and the first of them is kept
 * anyway with a word about it — a dark poster she can replace beats no
 * poster at all, which the page cannot draw.
 *
 * Every place is visited even once a good frame is in hand, because the
 * glare is taken across all of them: the frame that swallows a pale word is
 * often seconds after the frame worth printing, and four seeks is nothing
 * against uploading the file afterwards.
 */
async function grabPoster(video: HTMLVideoElement, durationMs: number, width: number, height: number): Promise<{ poster: ReadPicture; glare: number; note?: string }> {
  const scale = Math.min(1, MAX_WIDTH / width);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot draw the clip’s poster.');
  const times = posterTimes(durationMs);
  let glare = 0;
  let kept: ReadPicture | undefined;
  for (const at of times) {
    await seek(video, at);
    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    // every frame decoded counts towards the glare, kept or not
    glare = Math.max(glare, brightestCell(frame.data, w, h));
    if (!kept && !looksBlank(frame.data)) kept = await fromCanvas(canvas, ctx);
  }
  if (kept) return { poster: kept, glare };
  await seek(video, times[0]);
  ctx.drawImage(video, 0, 0, w, h);
  return {
    poster: await fromCanvas(canvas, ctx),
    glare,
    note: 'Every frame this looked at was nearly black or nearly white, so the poster is one of them. The poster is what prints and what a guest sparing their data sees, so it is worth replacing with a still of your own.',
  };
}

/**
 * Send the poster, then the clip, and come back with everything a drawn
 * element needs.
 *
 * The poster goes the ordinary way — it is a WebP of a couple of hundred
 * kilobytes, and the design-upload route records it against the design so
 * the asset drawer lists it. The clip is up to eight megabytes, which is
 * past what a request to a serverless function may carry, so it asks for a
 * signed address and goes straight to storage.
 */
export async function sendClip(read: ReadClip, templateId: string, onProgress?: (pct: number) => void): Promise<SentClip> {
  const stem = read.file.name.replace(/\.[^.]+$/, '') || 'clip';
  const poster = await sendPicture(read.poster, `${stem}-poster`, templateId);
  const url = await putClip(read, templateId, onProgress);
  return {
    url, poster: poster.url,
    width: read.width, height: read.height,
    durationMs: read.durationMs, aspect: read.aspect,
    bytes: read.file.size,
    glare: read.glare,
  };
}

/**
 * The clip into storage, by whichever of the two roads is open.
 *
 * With a bucket: a signed address, a PUT straight to it, then a commit that
 * records the row the checklist reads. Without one — development, CI — the
 * sign route says `direct` and the file goes through the server, which is
 * bounded by the function's own body limit and is the honest answer for a
 * machine with no bucket rather than a promise it cannot keep.
 */
async function putClip(read: ReadClip, templateId: string, onProgress?: (pct: number) => void): Promise<string> {
  const contentType = read.file.type;
  const signRes = await fetch('/api/admin/upload/sign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, contentType, size: read.file.size }),
  });
  const sign = await signRes.json();
  if (!signRes.ok) throw new Error(sign.error ?? 'The clip could not be uploaded.');
  if (sign.direct) {
    const fd = new FormData();
    fd.set('file', read.file);
    fd.set('templateId', templateId);
    fd.set('kind', 'video');
    // the same three numbers the commit road records, so the checklist reads
    // a clip's length and weight whichever way it arrived
    fd.set('width', String(read.width));
    fd.set('height', String(read.height));
    fd.set('durationMs', String(read.durationMs));
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'The clip could not be uploaded.');
    onProgress?.(100);
    return json.url as string;
  }
  await put(sign.uploadUrl, read.file, contentType, onProgress);
  const res = await fetch('/api/admin/upload/commit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId, storagePath: sign.storagePath, contentType,
      width: read.width, height: read.height, durationMs: read.durationMs, bytes: read.file.size,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'The clip arrived but could not be recorded.');
  return json.url as string;
}

/** PUT with a progress readout — fetch cannot report upload progress, XHR can, and eight megabytes is long enough to want one. */
function put(url: string, file: File, contentType: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The clip could not be sent to storage. Please try again.')));
    xhr.onerror = () => reject(new Error('The clip could not be sent to storage. Please check your connection and try again.'));
    xhr.send(file);
  });
}

/** Metadata read, or a plain refusal. A file the browser cannot open fires `error` and never `loadedmetadata`, so both are waited on. */
function settled(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { off(); resolve(); };
    const failed = () => { off(); reject(new Error('This browser could not open that clip. If it came off a camera, exporting it as MP4 (H.264) usually fixes it.')); };
    const off = () => {
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('error', failed);
      clearTimeout(timer);
    };
    // a file that is not really a clip can sit in 'loading' forever
    const timer = setTimeout(() => { off(); reject(new Error('That clip took too long to open, so it was not used. A shorter or smaller export usually works.')); }, 20_000);
    video.addEventListener('loadedmetadata', done, { once: true });
    video.addEventListener('error', failed, { once: true });
  });
}

/** A frame at a given second, waited for properly: `currentTime` is a request and the frame is not there until `seeked`. */
function seek(video: HTMLVideoElement, to: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', failed); clearTimeout(timer); };
    const done = () => { off(); resolve(); };
    const failed = () => { off(); reject(new Error('This browser could not read a frame out of that clip.')); };
    const timer = setTimeout(() => { off(); resolve(); }, 5_000);
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', failed, { once: true });
    video.currentTime = to;
  });
}
