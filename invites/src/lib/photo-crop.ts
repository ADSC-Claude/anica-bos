/**
 * Where a customer's own photograph sits inside the frame the design drew.
 *
 * Every frame on every page shows its picture the way `object-fit: cover`
 * does: the middle of it, trimmed to the frame's shape. That is right for a
 * photograph taken with the frame in mind and wrong for almost every
 * photograph a family actually has — "the photos are so zoom in that it
 * doesnt show the photo really well". A square frame given a portrait keeps
 * the middle band and cuts the face off at the chin.
 *
 * So a picture carries a window: which part of the file the frame shows.
 * It is the same `{x, y, w, h}` the studio already writes on a design's own
 * artwork (`PhotoEl.crop`), in fractions of the source, and the same
 * `cropStyle` draws it — the picture is blown up until the window is the
 * size of the frame and slid so the window lands on it. Nothing is
 * re-encoded and no image library runs.
 *
 * ## Where it lives
 *
 * Beside the picture, under the picture's own key plus `Crop`:
 *
 * - `cover.photo` → `cover.photoCrop`
 * - `story.timeline[2].photo` → `story.timeline[2].photoCrop`
 * - `gallery.photos[0].url` → `gallery.photos[0].urlCrop`
 *
 * Beside rather than inside, because a picture's answer is a string
 * everywhere in the app — in the form, in the importer, in the details
 * sheet, in every renderer — and turning it into an object to carry one
 * optional extra would touch all of them. A sibling key is invisible to
 * everything that only wants the link, and `cleanSection` keeps it for
 * every `image` field so it survives a save like any other answer.
 *
 * ## What "no crop" means
 *
 * Absent. A picture with no window is drawn exactly as it is drawn today,
 * which is what makes this safe to add: every invitation that exists keeps
 * the picture its owner has already seen until somebody moves it.
 */

/** A window on a picture, in fractions of the file: what the frame shows. */
export type Crop = { x: number; y: number; w: number; h: number };

/** The key a picture's window is kept under: the picture's own key plus `Crop`. */
export function cropKeyOf(key: string): string {
  return `${key}Crop`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Whether a window sits inside the picture: the one rule, shared.
 *
 * A customer's window comes through `readCrop`; a design's own comes
 * through the document's schema. Both ask this, so the two cannot drift
 * apart — and what they ask is the invariant the whole feature rests on:
 * **the window never leaves the picture**, so a frame never shows a strip
 * of nothing.
 *
 * It was widened for a day and a half, to let a window grow past the
 * picture and show the whole photograph inside the frame. That is what
 * made the gaps: "when i zoom it out there will be spaces at the side."
 * Zoom 1 is already the largest square inside the file — "you can form a
 * perfect square crop, even if it not super zooming it" — so there was
 * never anything out there worth reaching, and the width came back in.
 *
 * The tenth of a thousandth of slack is rounding: `placeCrop` writes four
 * decimal places, and a window clamped exactly to the right-hand edge can
 * land a hair over it.
 */
export function cropHolds(c: Crop): boolean {
  if (!(c.w > 0 && c.w <= 1) || !(c.h > 0 && c.h <= 1)) return false;
  return c.x >= -0.0001 && c.y >= -0.0001 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001;
}

/**
 * A window read off whatever was stored, or nothing.
 *
 * Nothing is the answer for anything that is not four numbers in a sane
 * arrangement: a zero-width window, one that has wandered off the picture,
 * a leftover from a shape that no longer exists. A bad window would draw a
 * strip of empty frame, and an uncropped picture never does — so the doubt
 * goes to the picture as it is.
 *
 * A window wider than the file is one of those. Nothing makes one any
 * more: the slider stops at zoom 1, which is the square, and the crop box
 * shows the whole photograph itself rather than asking the frame to.
 */
export function readCrop(v: unknown): Crop | undefined {
  if (!isRecord(v)) return undefined;
  const x = num(v.x), y = num(v.y), w = num(v.w), h = num(v.h);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
  return cropHolds({ x, y, w, h }) ? { x, y, w, h } : undefined;
}

/** A window rounded the way the document rounds one, so a save is stable. */
export function placeCrop(c: Crop): Crop {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { x: r(c.x), y: r(c.y), w: r(c.w), h: r(c.h) };
}

/** Where in the content a picture's window is kept, given where the picture is. */
type Ref = { section: string; field: string; index?: number; sub?: string };
export function cropRefOf(ref: Ref): Ref {
  return ref.sub ? { ...ref, sub: cropKeyOf(ref.sub) } : { ...ref, field: cropKeyOf(ref.field) };
}

/**
 * The window beside a picture, read straight off the content.
 *
 * A reader of its own rather than `valueAt`, which exists to turn an answer
 * into a line of type and returns a string: a window is four numbers and
 * has to come back as it went in.
 */
export function cropBeside(content: Record<string, unknown> | undefined, ref: Ref): Crop | undefined {
  const at = cropRefOf(ref);
  const section = content?.[at.section];
  if (!isRecord(section)) return undefined;
  const field = section[at.field];
  if (at.index === undefined) return readCrop(at.sub && isRecord(field) ? field[at.sub] : field);
  const row = Array.isArray(field) ? field[at.index] : undefined;
  if (!isRecord(row)) return undefined;
  return readCrop(at.sub ? row[at.sub] : row);
}

/**
 * Whether a window is worth writing down at all.
 *
 * "No crop" already means something: the middle of the picture, filling the
 * frame — `object-fit: cover`, which is what every frame draws when it has
 * been given nothing. So that one arrangement is stored as nothing, and an
 * invitation carries no window it does not need.
 *
 * The test is the *zoom and the centre*, not the window's size, and that
 * matters even now the window always sits inside the picture: at zoom 1 a
 * window she has dragged to one side is exactly as wide as the file and
 * exactly as tall, and asking "has w reached 1" would throw it away as
 * though she had never touched it. What she changed is where the square
 * sits, and where the square sits is the zoom and the centre.
 */
export function cropWorthKeeping(at: { zoom: number; cx: number; cy: number }): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
  return !(near(at.zoom, 1) && near(at.cx, 0.5) && near(at.cy, 0.5));
}
