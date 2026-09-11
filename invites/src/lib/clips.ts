/**
 * What a clip on a design's page may be, in one place.
 *
 * The same numbers are needed in four places that cannot share a module
 * otherwise: the storage layer enforces them on the way in, the studio checks
 * a file in the browser *before* uploading it (which is the only place the
 * codec inside the container can be read at all), the checklist counts a
 * design's clips as a set, and the words under the file chooser say the limit
 * to whoever is picking one. Written out separately they drift, and a limit
 * that has drifted from the limit is how somebody is told a clip is fine and
 * then refused.
 *
 * Deliberately client-safe: `storage.ts` is `server-only`, so nothing in it
 * can reach the browser, and it is the browser that has to do the reading.
 *
 * **There is no transcoding on this side.** No ffmpeg, and sharp does not do
 * video. So what is uploaded is exactly what every guest downloads, whole,
 * over whatever connection they are on — which is why the rules below are
 * about weight and codec rather than about what could be converted.
 */

/** MP4, and WebM as the second file for browsers that prefer it. MP4 is the one that must be there: it is what an iPhone plays. */
export const VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;

/**
 * The most one clip may weigh. About fifteen seconds of decent 720p portrait,
 * which is as much as a page should ever ask a guest to wait for. The two
 * openings this app already ships are 2.1 MB and 4.7 MB, so the ceiling was
 * set against real files rather than picked.
 */
export const VIDEO_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The most a whole design's clips may weigh together, per invitation.
 *
 * One clip inside the ceiling is fine; six of them is 48 MB before a guest
 * has read a word, and the per-clip rule cannot see that. The checklist adds
 * them up across every page and blocks a publish over this.
 */
export const VIDEO_BUDGET_BYTES = 16 * 1024 * 1024;

/** The longest a clip on a page should run. Past this it is a film, and a film wants a page of its own with a play button. */
export const VIDEO_MAX_MS = 30_000;

/** "8 MB" and "16 MB", for the places that say them to somebody. */
export const VIDEO_MAX_LABEL = `${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)} MB`;
export const VIDEO_BUDGET_LABEL = `${Math.round(VIDEO_BUDGET_BYTES / 1024 / 1024)} MB`;

/**
 * The codecs a clip may carry, as the strings `canPlayType` answers about.
 *
 * H.264 Baseline (42E0) and Main (4D40) with AAC-LC, or no audio at all. Not
 * a preference: HEVC is what an iPhone records by default and it will not
 * play on a large share of the Android phones a guest opens an invitation
 * with, and a clip that plays for the designer and not for the guest is the
 * worst kind of fault because nobody sees it happen. VP9 in WebM is fine as
 * the second file, since it is only ever offered to a browser that asked.
 */
export const VIDEO_CODECS = {
  mp4: ['video/mp4; codecs="avc1.42E01E, mp4a.40.2"', 'video/mp4; codecs="avc1.4D401E, mp4a.40.2"', 'video/mp4; codecs="avc1.42E01E"'],
  webm: ['video/webm; codecs="vp9"', 'video/webm; codecs="vp8, vorbis"'],
} as const;

/**
 * Whether the browser doing the asking can decode H.264 at all.
 *
 * This matters because `canPlayType` answers about *this* browser, not about
 * the file — and some builds cannot decode H.264 for licensing reasons
 * rather than because anything is wrong with the clip. A headless Chromium
 * is one: it answers "maybe" to `video/mp4` and empty to every `avc1` string,
 * which is how this was found.
 *
 * So a studio that refuses a clip because the browser in front of it said no
 * would be refusing a perfectly good file. Where this returns false the
 * codec check must *say* it could not be made — "this browser cannot check
 * MP4 clips; the file was accepted unchecked" — and never refuse on it. The
 * weight, length and shape rules do not need a decoder and still hold.
 */
export function canJudgeMp4(canPlayType: (type: string) => string): boolean {
  return VIDEO_CODECS.mp4.some((c) => canPlayType(c) !== '');
}

/** A clip on a page is portrait, because an invitation is. A landscape clip is letterboxed into a tall page and wastes half of what the guest downloaded. */
export const VIDEO_MAX_ASPECT = 1;

export type ClipFault =
  | { kind: 'type'; say: string }
  | { kind: 'weight'; say: string; bytes: number }
  | { kind: 'length'; say: string; ms: number }
  | { kind: 'shape'; say: string; aspect: number };

/**
 * What is wrong with a clip, read from what the browser already knows about
 * it. Null when nothing is.
 *
 * Weight, length and shape only — the codec is `canPlayType`'s to answer and
 * belongs beside the element that asks it. Kept pure so it can be tested
 * without a browser.
 */
export function clipFault(file: { type: string; size: number }, meta: { durationMs: number; width: number; height: number }): ClipFault | null {
  if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) {
    return { kind: 'type', say: 'Only MP4 and WebM clips are accepted. An .mov from an iPhone needs exporting as MP4 first.' };
  }
  if (file.size > VIDEO_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { kind: 'weight', say: `That clip is ${mb} MB and the limit is ${VIDEO_MAX_LABEL}. Every guest downloads it whole, so a shorter cut or a smaller export is worth it.`, bytes: file.size };
  }
  if (meta.durationMs > VIDEO_MAX_MS) {
    return { kind: 'length', say: `That clip runs ${Math.round(meta.durationMs / 1000)} seconds. Up to ${VIDEO_MAX_MS / 1000} works on a page; longer than that wants a page of its own.`, ms: meta.durationMs };
  }
  const aspect = meta.height > 0 ? meta.width / meta.height : 0;
  if (aspect > VIDEO_MAX_ASPECT) {
    return { kind: 'shape', say: `That clip is wider than it is tall (${meta.width}×${meta.height}). An invitation is a tall page, so a landscape clip sits in a band with empty space above and below it.`, aspect };
  }
  return null;
}

/**
 * Whether a captured frame is too blank to use as a poster.
 *
 * The first frame of a clip is very often useless: a fade from black, a
 * white flash, a title card that has not drawn yet. And the poster is not a
 * nicety here — it is what prints, what a guest sparing their data sees, and
 * what an iPhone in Low Power Mode shows instead of playing. A black
 * rectangle in all three places is worse than the clip having no poster at
 * all, because it looks like a fault rather than a choice.
 *
 * So a frame is judged before it is kept: mean brightness near either end,
 * or almost no variation across the picture, and it is blank. Variation is
 * what separates a real dark frame — a night shot, which is fine — from an
 * empty one: a night shot still has a spread of values in it.
 *
 * `pixels` is RGBA from a canvas, as `getImageData().data` gives it.
 */
export function looksBlank(pixels: Uint8ClampedArray | number[]): boolean {
  const n = Math.floor(pixels.length / 4);
  if (n === 0) return true;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    // Rec. 601 luma is close enough to judge emptiness by, and it is cheap
    const y = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    sum += y;
    sumSq += y * y;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  // near-black or near-white, or flat: a real picture is none of these
  return mean < 12 || mean > 243 || sd < 6;
}

/**
 * Where to look for a poster frame, in order.
 *
 * Not the very first frame — see `looksBlank`. A tenth of the way in is past
 * most fades and still early enough to be the clip's own subject; the later
 * tries are for a long slow open. Seconds, not fractions, because that is
 * what `currentTime` takes.
 */
export function posterTimes(durationMs: number): number[] {
  const s = Math.max(0, durationMs / 1000);
  if (!s) return [0];
  return [s * 0.1, s * 0.3, s * 0.5, 0].map((t) => Math.min(t, Math.max(0, s - 0.05)));
}
