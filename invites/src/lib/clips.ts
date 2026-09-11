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

/**
 * What is actually inside an MP4, read from the file's own boxes.
 *
 * `canPlayType` cannot answer this. It is asked about a *type string*, not
 * about a file, so it says what the browser could decode in principle and
 * nothing at all about the thing that was picked. And the file that must be
 * caught is exactly the one that looks fine: an iPhone records HEVC by
 * default, Safari plays it back perfectly for the person who shot it, and a
 * large share of the Android phones a guest opens the invitation with show
 * a black rectangle. Nobody sees that happen. It is the worst kind of fault.
 *
 * So the container is read instead. An MP4 is a tree of boxes, each
 * `[4-byte big-endian size][4-byte ASCII type][payload]`, and the video
 * track's codec is a four-character code sitting at
 * `moov > trak > mdia > minf > stbl > stsd`. No decoder is involved, which
 * is also why this can be tested on a machine with no H.264 at all.
 *
 * Returns the code ('avc1', 'hvc1', 'av01'…), or null when the file is not
 * shaped like an MP4 or the boxes it needs are not there — a file whose
 * `moov` sits past what was read, for instance. Null means *unknown*, and
 * unknown must never be treated as bad: see `codecFault`.
 */
export function mp4VideoCodec(bytes: Uint8Array): string | null {
  const moov = child(bytes, boxes(bytes, 0, bytes.length), 'moov');
  if (!moov) return null;
  for (const trak of boxes(bytes, moov.from, moov.to).filter((b) => b.type === 'trak')) {
    const mdia = child(bytes, boxes(bytes, trak.from, trak.to), 'mdia');
    if (!mdia) continue;
    const kids = boxes(bytes, mdia.from, mdia.to);
    // hdlr payload: 4 version+flags, 4 pre_defined, then the handler type.
    // A file has a sound track too, and its codec is not the one in question.
    const hdlr = child(bytes, kids, 'hdlr');
    if (hdlr && ascii(bytes, hdlr.from + 8, 4) !== 'vide') continue;
    const minf = child(bytes, kids, 'minf');
    const stbl = minf && child(bytes, boxes(bytes, minf.from, minf.to), 'stbl');
    const stsd = stbl && child(bytes, boxes(bytes, stbl.from, stbl.to), 'stsd');
    // stsd payload: 4 version+flags, 4 entry count, then [4 size][4 format]…
    if (!stsd || stsd.from + 16 > stsd.to) continue;
    return ascii(bytes, stsd.from + 12, 4);
  }
  return null;
}

/** H.264, under either of the two codes it is filed as. Everything else is a refusal or an unknown. */
const MP4_PLAYS_ANYWHERE = new Set(['avc1', 'avc3']);

/** The codes worth naming by name, because the person who picked the file will recognise them. */
const MP4_CODEC_NAMES: Record<string, string> = {
  hvc1: 'HEVC (H.265)', hev1: 'HEVC (H.265)', dvh1: 'Dolby Vision', dvhe: 'Dolby Vision',
  av01: 'AV1', vp09: 'VP9', vp08: 'VP8', mp4v: 'MPEG-4 Part 2', s263: 'H.263',
};

/**
 * Whether an MP4's video codec is one every guest's phone can play.
 *
 * Null in, null out, deliberately: a codec that could not be read is not a
 * codec that is wrong, and refusing a file on a box this could not find
 * would be refusing a file that works. The caller says so instead — "the
 * codec could not be read, so the clip was taken as it is" — and the weight,
 * length and shape rules, which need no decoder, still hold.
 */
export function codecFault(code: string | null): { say: string; codec: string } | null {
  if (!code || MP4_PLAYS_ANYWHERE.has(code)) return null;
  const name = MP4_CODEC_NAMES[code];
  return {
    codec: code,
    say: name === 'HEVC (H.265)'
      ? 'That clip is HEVC, which is what an iPhone records unless it is told otherwise. It plays on the phone that shot it and shows a black rectangle on a lot of Android phones, so it cannot go on an invitation. In Settings → Camera → Formats choose “Most Compatible”, or export the clip as H.264.'
      : `That clip is ${name ?? `in ${code}`}, and an invitation needs H.264 — it is the one format every phone a guest opens the page with can play. Export it again as H.264 (sometimes called AVC).`,
  };
}

type Box = { type: string; from: number; to: number };

/** The boxes laid out one after another between two offsets. Stops at the first one that does not fit rather than guessing. */
function boxes(b: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    const size = u32(b, at);
    const type = ascii(b, at + 4, 4);
    let from = at + 8;
    let to = size === 0 ? end : at + size;
    if (size === 1) {
      // a 64-bit size follows the type; the high word is zero for any file
      // that fits the weight limit, so the low word is the whole of it
      if (at + 16 > end) break;
      to = at + u32(b, at + 12);
      from = at + 16;
    }
    if (to <= from || to > end) break;
    out.push({ type, from, to });
    at = to;
  }
  return out;
}

function child(b: Uint8Array, list: Box[], type: string): Box | undefined {
  return list.find((x) => x.type === type);
}

function u32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[at + i]);
  return s;
}
