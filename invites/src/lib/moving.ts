/**
 * Moving pictures: a GIF, an animated WebP, an animated PNG.
 *
 * The point of reading the bytes rather than trusting the type is that two of
 * the three formats are the same type as their still versions. An animated
 * WebP is `image/webp` and a still one is too; an APNG is `image/png` and so
 * is every other PNG. So "is this a moving picture?" cannot be answered by
 * the browser's `file.type`, by the extension, or by `sniff()` on the server —
 * it is a question about a chunk inside the file, and this is where it is
 * asked.
 *
 * Why it has to be asked at all: the studio re-encodes every picture it
 * uploads, through a canvas, to a WebP no wider than 1536 (`readPicture`).
 * A canvas holds one frame. So a moving picture put through that path arrives
 * as its own first frame and the encoder is left wondering why her falling
 * petals do not fall. A moving picture is therefore sent **untouched**, and
 * everything downstream that would resize or re-encode it has to know to
 * leave it alone — which is what `animated` on the element and on the Media
 * row is for.
 *
 * No frames are decoded here and none need to be: every one of the three
 * formats says so in a header, and this file is pure bytes so it can be
 * tested without a browser.
 */

export type Moving = 'gif' | 'webp' | 'png';

/**
 * The most a moving picture may weigh.
 *
 * Lower than a photograph's ten megabytes, and not because of storage: a
 * moving picture is never re-encoded, so what she uploads is what every
 * guest downloads, whole, before it plays. A megabyte and a half is about
 * two seconds of a full-width loop at a sensible frame rate, and it is the
 * number the plan set.
 */
export const MOVING_MAX_BYTES = Math.round(1.5 * 1024 * 1024);
export const MOVING_MAX_LABEL = '1.5 MB';
/**
 * Where the checklist starts saying so. Two thirds of the cap: under it a
 * guest on mobile data has it before they have scrolled to it, over it they
 * are waiting on a decoration.
 */
export const HEAVY_MOVING_BYTES = Math.round(MOVING_MAX_BYTES * 0.66);

/** The types a moving picture can arrive as. A GIF is only ever one. */
export const MOVING_TYPES = ['image/gif', 'image/webp', 'image/png'] as const;

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, to));

const u32 = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

/**
 * Which kind of moving picture this is, or null for a still one.
 *
 * Each of the three is a different question:
 *
 * - **WebP** — an extended file (`VP8X`) whose flags byte has the animation
 *   bit set. A still WebP either has no `VP8X` chunk at all or has one with
 *   that bit clear, so this is exact.
 * - **PNG** — an `acTL` chunk, which APNG puts before the first `IDAT`. The
 *   walk stops at `IDAT` rather than reading the whole file: a chunk after
 *   the image data is not an animation control and a ten-megabyte PNG should
 *   not be walked to the end to learn that.
 * - **GIF** — two image descriptors. Not merely the header: a single-frame
 *   GIF is a still picture that happens to be in a moving format, and saying
 *   otherwise would make every screenshot somebody exported as a GIF
 *   un-resizable for no reason. So the blocks are walked properly, counting
 *   `0x2C` descriptors, and it stops at the second one.
 */
export function movingPicture(bytes: Uint8Array): Moving | null {
  if (bytes.length < 16) return null;
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return webpMoves(bytes) ? 'webp' : null;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return pngMoves(bytes) ? 'png' : null;
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return gifMoves(bytes) ? 'gif' : null;
  return null;
}

/** The animation bit of the VP8X flags. */
function webpMoves(bytes: Uint8Array): boolean {
  // RIFF header is 12 bytes; VP8X, when there is one, is the first chunk
  if (ascii(bytes, 12, 16) !== 'VP8X' || bytes.length < 21) return false;
  return (bytes[20] & 0x02) !== 0;
}

/** An acTL chunk, before the image data. */
function pngMoves(bytes: Uint8Array): boolean {
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = u32(bytes, at);
    const type = ascii(bytes, at + 4, at + 8);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    // length + the four-byte type + the four-byte checksum
    const next = at + 12 + length;
    if (next <= at) return false;
    at = next;
  }
  return false;
}

/**
 * Two image descriptors in the block stream.
 *
 * A GIF is a header, an optional global colour table, and then a stream of
 * blocks: `0x2C` an image, `0x21` an extension, `0x3B` the end. The tricky
 * part is that both an image and an extension are followed by sub-blocks —
 * each a length byte then that many bytes, ending with a zero — so they can
 * only be skipped by walking them, not by a fixed offset.
 */
function gifMoves(bytes: Uint8Array): boolean {
  let at = 13;
  // the global colour table, when the packed field's high bit says there is one
  if (bytes[10] & 0x80) at += 3 * (1 << ((bytes[10] & 0x07) + 1));
  let frames = 0;
  while (at < bytes.length) {
    const block = bytes[at];
    if (block === 0x3b) return false;
    if (block === 0x21) {
      // an extension: a label, then sub-blocks
      at += 2;
      at = pastSubBlocks(bytes, at);
      continue;
    }
    if (block === 0x2c) {
      if (++frames > 1) return true;
      // the descriptor is ten bytes, then this frame's own colour table
      const packed = bytes[at + 9];
      at += 10;
      if (packed & 0x80) at += 3 * (1 << ((packed & 0x07) + 1));
      // the LZW minimum code size, then the image's sub-blocks
      at += 1;
      at = pastSubBlocks(bytes, at);
      continue;
    }
    // anything else is a file we cannot walk; a picture we cannot read the
    // frames of is treated as still, which is the safe way round: it is
    // re-encoded and shows its first frame rather than being passed through
    // whole and possibly enormous
    return false;
  }
  return false;
}

/** Walk a chain of sub-blocks and return the offset just past its terminator. */
function pastSubBlocks(bytes: Uint8Array, from: number): number {
  let at = from;
  while (at < bytes.length) {
    const size = bytes[at];
    if (size === 0) return at + 1;
    at += size + 1;
  }
  return bytes.length;
}
