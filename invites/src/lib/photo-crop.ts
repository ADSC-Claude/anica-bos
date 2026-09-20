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

/** As far out as a window may be pushed: past this the picture is a speck. */
const SPAN_MAX = 20;

/**
 * Where a window of this width may start, so it holds the picture or sits
 * inside it.
 *
 * Narrower than the file, it has to be *within* the file: 0 to 1 − w, which
 * is what it always was. Wider than the file — which is what "show me the
 * whole photograph" makes — the file is inside *it* instead, so the range
 * runs the other way, 1 − w to 0. One expression covers both, and it is the
 * same clamp `cropWindow` applies when the window is made.
 */
const holds = (at: number, span: number) =>
  at >= Math.min(0, 1 - span) - 0.0001 && at <= Math.max(0, 1 - span) + 0.0001;

/**
 * Whether four numbers make a window at all: the one rule, shared.
 *
 * A customer's window comes through `readCrop`; a design's own comes
 * through the document's schema, which used to lean on its bounds (`w` at
 * most 1) to catch a window off the edge of the picture. Widening those
 * bounds for "show the whole photograph" took that away, so the schema
 * asks this instead and the two paths cannot drift apart.
 */
export function cropHolds(c: Crop): boolean {
  if (!(c.w > 0 && c.w <= SPAN_MAX) || !(c.h > 0 && c.h <= SPAN_MAX)) return false;
  return holds(c.x, c.w) && holds(c.y, c.h);
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
 * A window *wider than the file* is not a bad window, and reading it as one
 * is the bug this guards against now. The slider reaches out to `cropFit`,
 * where the whole photograph sits inside the frame; that window is wider
 * than the file (`w` of 1.5 for a 2:3 portrait in a square) and starts
 * before its left edge (`x` of −0.25). The old test threw both away. So the
 * form drew what she had chosen — it computes the window itself — and the
 * page, the save and the form on its next load all read it back, rejected
 * it, and fell to `cover`: "why its fine when in the form, then in the
 * preview it looks like this."
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
