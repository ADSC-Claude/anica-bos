import { place, type FieldRef, type PhotoEl } from './design';

/**
 * Bringing a page in from wherever it was designed.
 *
 * Canva hands another system nothing about a design — no elements, no
 * positions, no idea which rectangle is a photo frame — so the way in is a
 * file the owner exports by hand. The hard part is then finding the photo
 * frames in a picture, and there is a trick for it that costs nothing and
 * needs no library:
 *
 *   Export the page twice. Once as designed, with the placeholder
 *   photographs sitting in their frames, and once with those photographs
 *   deleted. The version *without* them is the background; the difference
 *   between the two is exactly where the photographs belong.
 *
 * So this subtracts one from the other and returns the rectangles that
 * changed, in the same whole percents the document already places elements
 * in. Nothing here touches a browser API: it takes two flat arrays of
 * pixels, which is what a canvas hands over and what a test can make up, so
 * the arithmetic is provable without a screen.
 *
 * The picture *without* the placeholders is the one kept as the ground,
 * which is why the frames end up sitting on empty artwork rather than on a
 * printed photograph of somebody else's baby.
 */

/** What a canvas's `getImageData` hands over: RGBA, four bytes a pixel, row by row. */
export type Pixels = { data: ArrayLike<number>; width: number; height: number };

/** A proposed frame, in whole percents: left and width of the page's width, top and height of its height. */
export type Rect = { left: number; top: number; width: number; height: number };

/**
 * A pixel counts as changed when one of its channels differs by more than
 * this, out of 255. Twelve clears JPEG's ringing and the faint edge
 * softening an export adds, and is far under the difference between a
 * photograph and the empty frame it sat in.
 */
export const CHANGED = 12;
/**
 * The mask is a quarter of the picture in each direction, so a sixteenth of
 * the work. A frame is never smaller than a few dozen cells at that size,
 * and single stray pixels cannot make a cell.
 */
export const CELL = 4;
/** A group covering less than this share of the page is noise, not a frame. */
export const NOISE = 0.015;
/** Two boxes overlapping by more than this share of the smaller are one frame. */
export const MERGE = 0.75;

export type DiffOptions = { threshold?: number; cell?: number; floor?: number; merge?: number };

/**
 * The frames, read from the difference between the two exports.
 *
 * `plain` is the page with the placeholders deleted and `filled` the page as
 * designed. Both must already be the same size — the studio draws them into
 * canvases of one width before calling — because two pictures of different
 * shapes cannot be subtracted and guessing which one to stretch is how a
 * frame ends up a percent off everywhere.
 */
export function framesFromDifference(plain: Pixels, filled: Pixels, opts: DiffOptions = {}): Rect[] {
  const { threshold = CHANGED, cell = CELL, floor = NOISE, merge = MERGE } = opts;
  if (plain.width !== filled.width || plain.height !== filled.height) {
    throw new Error('The two pictures are different sizes. Export both at the same size, with only the photographs removed from one.');
  }
  const { width, height } = plain;
  if (width < cell || height < cell) throw new Error('Those pictures are too small to read.');

  // Which pixels changed, and how much of each cell did. A cell is a block
  // of `cell` x `cell` pixels; the ones along the right and bottom edges are
  // short, so each keeps its own count of how many pixels it actually holds.
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const hit = new Int32Array(cols * rows);
  const held = new Int32Array(cols * rows);
  const changed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = ((y / cell) | 0) * cols;
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      const i = at * 4;
      const c = row + ((x / cell) | 0);
      held[c]++;
      const d = Math.max(
        Math.abs(plain.data[i] - filled.data[i]),
        Math.abs(plain.data[i + 1] - filled.data[i + 1]),
        Math.abs(plain.data[i + 2] - filled.data[i + 2]),
      );
      if (d > threshold) { changed[at] = 1; hit[c]++; }
    }
  }
  // A quarter of a cell is enough to call it changed: the inside of a
  // photograph changes wholesale, while compression noise lands on one pixel
  // here and one there and never fills a corner of a cell.
  const mask = new Uint8Array(cols * rows);
  for (let c = 0; c < mask.length; c++) mask[c] = hit[c] * 4 >= held[c] ? 1 : 0;

  const rects: Rect[] = [];
  const seen = new Uint8Array(cols * rows);
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    // One group, by a flood fill with its own stack — a picture this size
    // would blow a recursive one over. Cells touching at a corner count as
    // joined, so a frame split by a one-cell seam is still one frame.
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    let x0 = cols, x1 = -1, y0 = rows, y1 = -1, area = 0;
    while (stack.length) {
      const c = stack.pop() as number;
      const cx = c % cols, cy = (c / cols) | 0;
      area++;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= cols) continue;
          const n = ny * cols + nx;
          if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
    }
    if (area / (cols * rows) < floor) continue;
    // The group was found on the coarse mask, so its box is a cell too big
    // on every side. Tightening it against the pixels themselves inside
    // that box costs one more pass over the frame and puts the edge where
    // the photograph's edge actually is, rather than within four pixels of
    // it. It can only ever shrink the box, never reach past it.
    rects.push(snap(tighten(changed, width, height, x0 * cell, y0 * cell, Math.min(width, (x1 + 1) * cell), Math.min(height, (y1 + 1) * cell))));
  }
  return mergeBoxes(rects, merge).sort((a, b) => a.top - b.top || a.left - b.left);
}

type Edges = { left: number; top: number; right: number; bottom: number };

/** The tightest box around the changed pixels inside a box already found. */
function tighten(changed: Uint8Array, width: number, height: number, px0: number, py0: number, px1: number, py1: number): Edges {
  let left = px1, top = py1, right = px0, bottom = py0;
  for (let y = py0; y < py1; y++) {
    const row = y * width;
    for (let x = px0; x < px1; x++) {
      if (!changed[row + x]) continue;
      if (x < left) left = x;
      if (x >= right) right = x + 1;
      if (y < top) top = y;
      if (y >= bottom) bottom = y + 1;
    }
  }
  // a group always holds at least one changed pixel, so these always moved
  return { left: left / width, top: top / height, right: right / width, bottom: bottom / height };
}

/** A box in fractions of the page, snapped to the whole percents elements are placed in. */
function snap({ left, top, right, bottom }: Edges): Rect {
  const l = Math.round(left * 100), t = Math.round(top * 100);
  return {
    left: l, top: t,
    width: Math.max(1, Math.round(right * 100) - l),
    height: Math.max(1, Math.round(bottom * 100) - t),
  };
}

const area = (r: Rect) => r.width * r.height;

/** How much of the smaller of two boxes the other one covers. */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(area(a), area(b));
}

/**
 * Boxes that are mostly the same box become one.
 *
 * A photograph with a caption printed into it, or one whose frame has a
 * border the export softened, can come back as a big rectangle and a sliver
 * lying inside it. One frame is the right answer, and it is the union: the
 * owner can always drag it in, and cannot invent the part that was dropped.
 */
export function mergeBoxes(rects: Rect[], threshold = MERGE): Rect[] {
  const out = rects.slice();
  for (let again = true; again; ) {
    again = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (overlap(out[i], out[j]) <= threshold) continue;
        const a = out[i], b = out[j];
        const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
        out[i] = {
          left, top,
          width: Math.max(a.left + a.width, b.left + b.width) - left,
          height: Math.max(a.top + a.height, b.top + b.height) - top,
        };
        out.splice(j, 1);
        again = true;
        break outer;
      }
    }
  }
  return out;
}

/**
 * A proposed rectangle as the element it will become.
 *
 * `ratio` is the page's own height over its width, because a frame's aspect
 * is measured in pixels while its place is measured in percents of two
 * different edges. It comes in marked Ask the customer: a frame the studio
 * found is by definition an empty one waiting for somebody's photograph.
 */
export function photoFromRect(id: string, rect: Rect, ratio: number, bind: FieldRef | { asset: string }): PhotoEl {
  return {
    id, kind: 'photo', bind, ask: true, anchor: 'centre',
    x: place(rect.left + rect.width / 2),
    y: place(rect.top + rect.height / 2),
    w: place(rect.width),
    aspect: place((rect.height / rect.width) * ratio),
  };
}
