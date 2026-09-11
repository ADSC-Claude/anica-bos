import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { movingPicture, MOVING_MAX_BYTES, HEAVY_MOVING_BYTES } from '../src/lib/moving';

/**
 * Three real moving pictures, and the reason they can be trusted.
 *
 * Two of the three formats are indistinguishable from their still versions by
 * type or by extension — an animated WebP is `image/webp` and an APNG is
 * `image/png` — so the detector reads a chunk inside the file, and a test
 * that fed it bytes I had invented would prove only that I can invent bytes.
 *
 * So each of these was built and then handed to Chromium: shown at 96px and
 * photographed six times over a second and a half. All three drew two
 * different pictures, which is a browser saying they move. The WebP's frames
 * are VP8 data Chromium itself encoded, so they are real frames and not a
 * guess at the format. (The first version of that probe sampled the pixels
 * from inside the page and got the first frame six times over, whether the
 * file moved or not — a paint is what advances an animation, and a
 * screenshot is what forces a paint.)
 *
 * A real animated GIF from the wild was read too: pdf.js's loading spinner,
 * 2,545 bytes, in node_modules — `gif`. It is not committed here, being
 * somebody else's file, but it is why the block walk below is believed.
 */
const bytes = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));

/** two frames, 1×1, red then blue, half a second each */
const GIF = bytes('R0lGODlhAQABAPAAAP8AAAAA/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAAQABAAACAkQBACH5BAAyAAAALAAAAAABAAEAAAICTAEAOw==');
/** an acTL, an fcTL, an IDAT and an fdAT: two frames, 1×1 */
const APNG = bytes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAAAEAAgAAVGxhaAAAAA9JREFUeAEBBAD7/wD/AAADAQEAjR3lggAAABpmY1RMAAAAAQAAAAEAAAABAAAAAAAAAAAAAQACAADPH4u8AAAAE2ZkQVQAAAACeAEBBAD7/wAAAP8BAwEAs1ErhwAAAABJRU5ErkJggg==');
/** VP8X with the animation bit, ANIM, and two ANMF frames of real VP8 data */
const AWEBP = bytes('UklGRsoAAABXRUJQVlA4WAoAAAACAAAAAwAAAwAAQU5JTQYAAAD/////AABBTk1GTAAAAAAAAAAAAAMAAAMAAGQAAABWUDggNAAAADACAJ0BKgQABAAAwBIloAJ0ugH4AfgABGgAAP76IZf/d5qw03f1rf/1o5+uif60c/9ZWABBTk1GSgAAAAAAAAAAAAMAAAMAAGQAAABWUDggMgAAAPABAJ0BKgQABAAAwBIloAJ0ugH4AARMAAD+/mah//rRz9dE/1o5/60c/+Uqi1TbigAA');

test('the three moving formats are each read from their own header', () => {
  assert.equal(movingPicture(GIF), 'gif');
  assert.equal(movingPicture(APNG), 'png');
  assert.equal(movingPicture(AWEBP), 'webp');
});

/**
 * The still cases, which matter as much: a picture wrongly called moving is
 * passed through untouched, at whatever size and weight it came in at, and
 * every phone downloads it whole.
 */
test('the app’s own still pictures are not moving pictures', () => {
  const webp = new Uint8Array(readFileSync(new URL('../public/babyblue/babyphotos.webp', import.meta.url)));
  const png = new Uint8Array(readFileSync(new URL('../public/demo/addon-album.png', import.meta.url)));
  assert.equal(movingPicture(webp), null, 'a still WebP has no animation bit');
  assert.equal(movingPicture(png), null, 'a still PNG has no acTL');
});

/**
 * A single-frame GIF, which is a still picture in a moving format — the file
 * somebody exported from a screenshot tool. Calling it moving would pass it
 * through untouched for no reason at all, so the blocks are walked and the
 * descriptors counted rather than the header trusted.
 *
 * Built by cutting exactly the second frame out of the file above: its
 * graphic control extension (8 bytes), its image descriptor (10) and its
 * image data (5), keeping the original trailer. Chromium decodes the result
 * and photographs identically six times over a second and a half, which is
 * what a still picture does.
 */
const ONE_FRAME = (() => {
  const cut = GIF.length - 24;
  const still = new Uint8Array(cut + 1);
  still.set(GIF.subarray(0, cut));
  still[cut] = 0x3b;
  return still;
})();

test('a GIF of one frame is a still picture in a moving format', () => {
  assert.equal(movingPicture(ONE_FRAME), null, 'one image descriptor is not an animation');
  assert.equal(movingPicture(GIF), 'gif', 'and the two-frame original still is');
  assert.equal(Buffer.from(ONE_FRAME.subarray(0, 6)).toString('ascii'), 'GIF89a', 'and it is still a GIF');
});

test('anything that is not one of the three is not a moving picture', () => {
  assert.equal(movingPicture(new Uint8Array(0)), null);
  assert.equal(movingPicture(new Uint8Array(8)), null, 'too short to have a header');
  assert.equal(movingPicture(bytes('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg=')), null, 'a JPEG cannot move');
  // a WebP with a VP8X whose animation bit is clear: an extended still file
  const still = new Uint8Array(AWEBP);
  still[20] = 0x10; // the alpha bit only
  assert.equal(movingPicture(still), null);
});

test('the cap and the line the checklist draws are a megabyte and a half, and two thirds of it', () => {
  assert.equal(MOVING_MAX_BYTES, 1572864);
  assert.ok(HEAVY_MOVING_BYTES < MOVING_MAX_BYTES);
  assert.equal(HEAVY_MOVING_BYTES, Math.round(MOVING_MAX_BYTES * 0.66));
});
