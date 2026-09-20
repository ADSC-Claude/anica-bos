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
