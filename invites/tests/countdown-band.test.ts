/**
 * The counter sits in the sky she left clear for it.
 *
 * "make the countdown in the center not at the top. always make sure of
 * this."
 *
 * Her countdown band is 1080 × 350 of sky with clouds banked along the top
 * and gathered again at the foot. Down the middle column — the 52% the
 * counter is allowed (`.inv-page[data-drawn] .inv-count { max-width: 52cqw }`)
 * — the white runs out at 28% of the page's height and does not come back
 * until 80%. That gap is the only place four numbers can stand without DAYS
 * and SECONDS printing over a cloud, and it is what "the center" means on
 * this page: the middle of her band, not the middle of the box.
 *
 * `headPad` was 4, which started the counter at 12% — a third of it over the
 * cloud. Nine is 28% of the page height, so the counter begins on the first
 * clear row and her line, drawn near the foot, closes it at 81%.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHRISTENING_PAGES } from '../src/lib/christening';
import type { PictureGround, TextEl } from '../src/lib/design';

const page = CHRISTENING_PAGES.find((p) => p.key === 'countdown')!;
/** her band is this much of its own width tall, so a share of its height is this many cqw */
const TALL = 0.3241;
/** the clear window down the middle of her artwork, as shares of the page's height */
const CLEAR = { top: 0.28, foot: 0.80 };

test('her band is the shape the page is drawn for', () => {
  assert.equal((page.ground as PictureGround).ratio, TALL);
  assert.ok(page.live && page.grow, 'the counter is live, so the page grows with it');
});

test('the counter starts on the first clear row of her sky, not over the clouds', () => {
  const pad = page.headPad ?? 0;
  // `headPad` is `--live-top` in cqw; the clear window in cqw is CLEAR × TALL × 100
  assert.ok(pad >= CLEAR.top * TALL * 100 - 0.2, `the counter starts at ${(pad / TALL).toFixed(1)}% of the page, and her cloud ends at 28%`);
  // and not so far down that the numbers are pushed onto the clouds at the foot
  assert.ok(pad <= CLEAR.foot * TALL * 100 - 10, 'and it leaves room to stand in');
});

test('her line stays where she drew it, at the foot of the clear window', () => {
  const line = (page.elements ?? []).find((e): e is TextEl => e.id === 'countdown-line')!;
  // `y` is the head of the line's box as a share of the page's height, and a
  // size is a share of the page's *width* — on a band this wide one cqw is
  // three per cent of the height, which is why the conversion is TALL and
  // not the 1.7778 the tall pages use.
  assert.ok(line.y! > 60, 'the line is low on the band, as she drew it');
  const foot = line.y! + (line.lines[0]!.size * 1.25) / TALL;
  assert.ok(foot <= CLEAR.foot * 100 + 2, `the line ends at ${foot.toFixed(1)}%, inside her clear sky`);
  // the counter and the line are one block, and it is the block that is
  // centred: it runs from `headPad` to the line's foot, and that span sits
  // on the middle of her window, not on the middle of the page
  const middle = ((page.headPad ?? 0) / TALL / 100 + foot / 100) / 2;
  const window = (CLEAR.top + CLEAR.foot) / 2;
  assert.ok(Math.abs(middle - window) < 0.03, `the block is centred at ${(middle * 100).toFixed(1)}% and her window at ${(window * 100).toFixed(1)}%`);
  // and the old value is not quietly acceptable: four put its head at 12%
  assert.ok(Math.abs(4 / TALL / 100 / 2 + foot / 200 - window) > 0.03, 'the guard would have caught the value this replaced');
});
