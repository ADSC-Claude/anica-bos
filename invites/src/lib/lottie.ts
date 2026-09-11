/**
 * Vector animations: a Lottie file, which is JSON.
 *
 * Every other file the studio takes has magic bytes — a JPEG says JPEG in
 * its first three — and a Lottie says nothing at all: it is a JSON object,
 * and the only way to know whether it is an animation or somebody's export
 * of a spreadsheet is to read it. So this is where it is read, and it is
 * pure: no browser, no player, no decoding. What it looks for is what
 * `lottie-web` itself needs to play anything — a version, a frame rate, an
 * out point and some layers — which is also what makes a poster possible and
 * what tells the checklist how long the thing runs.
 *
 * The one refusal worth its own message is a `.lottie` bundle. It is a zip
 * with the JSON and its images inside, it is what the export button offers
 * first, and `sniff()` reads it as an Excel file — so without a word here
 * she would be told her animation is not a spreadsheet.
 */

/**
 * The most a vector animation may weigh.
 *
 * Three hundred kilobytes of JSON is a lot of vector animation — the ones
 * that go past it are usually a raster image somebody embedded as a data
 * URI, which is a picture wearing an animation's clothes and belongs in a
 * frame. The number is the plan's.
 */
export const LOTTIE_MAX_BYTES = 300 * 1024;
export const LOTTIE_MAX_LABEL = '300 kB';

export type LottieFacts = {
  /** its own canvas, which is the shape the element takes */
  width: number;
  height: number;
  /** frames per second, and the out point in frames */
  fps: number;
  frames: number;
  /** how long one play lasts */
  ms: number;
};

/** A zip: `PK\x03\x04`. A `.lottie` bundle is one, and so is an xlsx. */
export const zipLike = (bytes: Uint8Array): boolean =>
  bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * What a Lottie file says about itself, or why it is refused.
 *
 * Refusals say what to do rather than what happened, because the person
 * reading them has an export dialog open in another window and the useful
 * sentence is the one that names the button.
 */
export function readLottie(text: string): { ok: true; facts: LottieFacts } | { ok: false; why: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, why: 'That file is not JSON. A Lottie animation is a .json file — in After Effects it is Bodymovin’s JSON export, and on LottieFiles it is the “Lottie JSON” download rather than the “dotLottie” one.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, why: 'That JSON is not a Lottie animation: a Lottie is a single object with layers in it.' };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.v !== 'string' || !o.v) return { ok: false, why: 'That JSON has no Lottie version in it, so it is not an animation this can play.' };
  const fps = num(o.fr);
  const out = num(o.op);
  const width = num(o.w);
  const height = num(o.h);
  if (!fps || fps <= 0) return { ok: false, why: 'That animation has no frame rate, so there is no telling how fast to play it.' };
  if (!out || out <= 0) return { ok: false, why: 'That animation has no length: its out point is zero, so there would be nothing to see.' };
  if (!width || !height || width <= 0 || height <= 0) return { ok: false, why: 'That animation has no size of its own, so there is no shape to draw it in.' };
  if (!Array.isArray(o.layers) || o.layers.length === 0) {
    return { ok: false, why: 'That animation has no layers, so it is empty. If it was exported as a .lottie bundle, export the JSON instead.' };
  }
  return {
    ok: true,
    facts: {
      width: Math.round(width),
      height: Math.round(height),
      fps,
      frames: out,
      ms: Math.round((out / fps) * 1000),
    },
  };
}

/** How long an animation runs, said the way the checklist says a clip's length. */
export const LONG_ANIM_MS = 12_000;

/**
 * What the player itself weighs, which the checklist counts once.
 *
 * `lottie-web`'s light ESM build is about 360 kB before compression, and it
 * is fetched by the first animation a guest scrolls to and by no other. So
 * it belongs in the download total exactly once, and a design with one
 * animation is really carrying the animation plus this.
 */
export const LOTTIE_PLAYER_BYTES = 360 * 1024;
