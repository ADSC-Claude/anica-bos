/**
 * The words a guest reads are the words a guest can tap.
 *
 * "can you move the clickable area where it is near the CLICK HERE?"
 *
 * Each CLICK HERE on the hub sat at the very bottom edge of the invisible
 * rectangle that opens its booklet — The Details had 0.2 of a unit of
 * margin below it, RSVP 1.5, Our Story 2.3. The word itself was inside;
 * its underline, and the place a thumb actually lands, were not. It read
 * as a button and behaved like one only if you hit it exactly.
 *
 * The fix is not a bigger rectangle — a rectangle grown far enough to be
 * comfortable would reach into its neighbours — but the caption carrying
 * `opens` itself. Nothing moves, which is what made it safe to do to an
 * invitation already sent out.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinDesign, type PageSpec } from '../src/lib/design';

const hub = (): PageSpec => builtinDesign('christening')!.pages.find((p) => p.key === 'highlights')!;
const byId = (id: string) => (hub().elements ?? []).find((e) => e.id === id);

const PAIRS = [
  { caption: 'hl-details-click', rect: 'hl-open-details', booklet: 'details' },
  { caption: 'hl-rsvp-click', rect: 'hl-open-rsvp', booklet: 'rsvp' },
  { caption: 'hl-story-click', rect: 'hl-open-story', booklet: 'story' },
] as const;

for (const { caption, rect, booklet } of PAIRS) {
  test(`${caption} opens ${booklet} itself`, () => {
    const c = byId(caption);
    assert.ok(c, `${caption} is on the hub`);
    assert.equal(c!.opens, booklet, 'the words carry the tap, not only the artwork above them');
    // and the artwork keeps its own, so both answer
    assert.equal(byId(rect)?.opens, booklet, `${rect} still opens ${booklet}`);
  });
}

test('every booklet the hub reaches is opened by its own caption', () => {
  const opens = (hub().elements ?? []).filter((e) => e.opens).map((e) => e.opens);
  for (const { booklet } of PAIRS) {
    assert.equal(opens.filter((o) => o === booklet).length, 2,
      `${booklet} is opened by both the artwork and the words`);
  }
});

test('nothing was moved to achieve it', () => {
  // the whole reason this was safe on a distributed invitation: the
  // captions sit exactly where she drew them
  // the compiled y, which is the box's own top rather than her baseline
  const where = { 'hl-details-click': 36.36, 'hl-rsvp-click': 59.03, 'hl-story-click': 69.93 };
  for (const [id, y] of Object.entries(where)) {
    assert.equal(byId(id)?.y, y, `${id} is still at ${y}`);
  }
  const boxes = { 'hl-open-details': { x: 39, y: 23, w: 62, h: 30 }, 'hl-open-rsvp': { x: 70, y: 52, w: 36, h: 20 }, 'hl-open-story': { x: 36, y: 59, w: 44, h: 30 } };
  for (const [id, b] of Object.entries(boxes)) {
    const e = byId(id)!;
    assert.deepEqual({ x: e.x, y: e.y, w: e.w, h: (e as { h?: number }).h }, b, `${id} is the same rectangle`);
  }
});

/**
 * The record, and the words that ride it.
 *
 * "the click for music, we will just move the writings so its near the
 * play button" — then, of the two she was shown, "Closest to the button.
 * Go for B."
 *
 * The words are an arc cut out of her page, and the centre that arc was
 * struck from is the play button. Fitted against the cut-out's own alpha
 * it falls at 26.0% across and 84.5% down the piece; measured against the
 * render, the orange button's centre is (284, 228) in a 390-wide page,
 * and the arc's is (283.6, 230.9). Three pixels apart. So the piece is
 * shrunk about *that* point, not about its own middle, and the words come
 * in along the same circle instead of sliding off it.
 *
 * Shrinking a button makes a smaller button, so `hl-music-tap` puts the
 * record back under a thumb. These numbers are the ones a regression
 * would quietly undo.
 */
test('CLICK FOR MUSIC rides in on the circle the play button is the centre of', () => {
  const m = byId('hl-music')!;
  assert.ok(m, 'the cut-out is on the hub');
  assert.equal(m.w, 13.66, 'option B: 68% of the 20.09 she had');

  // where the arc's centre lands, before and after — it must not move,
  // or the words stop being concentric with the record
  const ARC_X = 0.2599, ARC_Y = 0.8454;   // fitted to click-for-music.webp
  const RATIO = 1.7778;                    // the hub page is this much taller than wide
  const ASPECT = 0.8525;                   // the cut-out's own
  const centre = (cx: number, cy: number, w: number) => ({
    x: cx - w / 2 + ARC_X * w,
    y: cy - (w * ASPECT) / (2 * RATIO) + ARC_Y * (w * ASPECT) / RATIO,
  });
  const was = centre(77.55, 29.97, 20.09);
  const now = centre(m.x!, m.y!, m.w!);
  assert.ok(Math.abs(now.x - was.x) < 0.05, `the arc's centre stays put across: ${was.x} -> ${now.x}`);
  assert.ok(Math.abs(now.y - was.y) < 0.05, `the arc's centre stays put down: ${was.y} -> ${now.y}`);
});

test('the whole record answers a tap, and it takes nothing from its neighbours', () => {
  const tap = byId('hl-music-tap') as { x: number; y: number; w: number; h: number; song?: true; fill?: string } | undefined;
  assert.ok(tap, 'the record carries its own tap');
  assert.equal(tap!.song, true, 'it starts the song');
  assert.equal(tap!.fill, 'transparent', 'and it is never seen');

  // it stops where the details envelope's rectangle ends
  const details = byId('hl-open-details') as { x: number; w: number };
  assert.ok(tap!.x - tap!.w / 2 >= details.x + details.w / 2 - 0.01,
    'the record does not reach into The Details');

  // and it stays off the RSVP envelope, which is measured down the page
  const rsvp = byId('hl-open-rsvp') as { y: number; h: number };
  const RATIO = 1.7778;                    // `h` is a share of the width, `y` of the height
  const foot = tap!.y + (tap!.h / 2) / RATIO;
  const rsvpTop = rsvp.y - (rsvp.h / 2) / RATIO;
  assert.ok(foot <= rsvpTop, `the record ends at ${foot.toFixed(2)} and RSVP starts at ${rsvpTop.toFixed(2)}`);
});
