/**
 * The foot of the dress code page, which had a hand's width of nothing in it.
 *
 * "can you arrange this awkward space that doesnt have anything on it, i know
 * its a space for extension, but when it doesnt needed, lets not let the
 * space be that empty."
 *
 * Two things were stacked under the last words. The design reserves room at
 * the foot for the artwork drawn there (`footPad`), and `.inv-section`
 * carries its own 3.25rem bottom padding — which on a live page sat on top
 * of that reserve rather than instead of it. Measured in the browser at 497
 * wide, the two came to 66.9cqw of tail after THANK YOU; the guestbook and
 * the post-event page had each had their section foot cut by hand, and this
 * page had not.
 *
 * The numbers below are read off `christening/dresscode-foot.webp`
 * (1080×845, the bottom 44% of her page). It is the white card: sampling
 * the middle 70% of each row, the card's inside is unbroken white down to
 * row 709 of 845, which is 12.6cqw up from the foot of the page, and her
 * clouds are below that.
 *
 * The first attempt at this read `babyblue/dresscode.webp` instead — the
 * Baby Blue ground, a plain blue page with gypsophila in two corners, and
 * nothing to do with her design. It gave 47.6cqw, so the reserve came out
 * at four and left thirty-one of blank card under the last words. The file
 * a page actually draws is the one named by its own `ground`, which for
 * this design is under `/christening/`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHRISTENING_PAGES } from '../src/lib/christening';

/** the foot of her white card, as a share of the page's width up from the page's foot */
const CARD_FOOT = 12.6;
/** how much of the card is left clear under the last words: a line and a half */
const MARGIN = { least: 4, most: 16 };

const dresscode = CHRISTENING_PAGES.find((p) => p.key === 'dresscode')!;

test('the dress code stops its words inside the card, near its foot', () => {
  // `footPad` is counted in elevenths of the page's width (--page-foot × 11cqw)
  const foot = dresscode.footPad! * 11;
  const margin = foot - CARD_FOOT;
  assert.ok(margin > MARGIN.least, `the words stop ${margin.toFixed(1)}cqw above the card's edge, which is too tight`);
  assert.ok(margin < MARGIN.most, `and ${margin.toFixed(1)}cqw is a hole, not a margin`);
});

test('a live page with a foot of its own does not also carry the section’s', () => {
  /*
   * The rule is the stylesheet's, and it is general rather than one page at
   * a time: every live drawn page whose design states a foot. `data-foot` is
   * the guard — a live page that states none is relying on the section's own
   * 3.25rem, and taking that away would run the last line into the bottom of
   * the page.
   */
  const css = readFileSync('src/app/globals.css', 'utf8');
  const rule = /\.inv\[data-paged\] \.inv-page\[data-drawn\]\[data-live\]\[data-foot\] > \.inv-section:not\(\.inv-bb-art\) \{ padding-bottom: 0\.5rem; \}/;
  assert.match(css, rule, 'the section’s own foot gives way to the design’s');

  // and the pages it now covers are the live ones that state a foot
  const covered = CHRISTENING_PAGES.filter((p) => p.drawn && p.live && p.footPad).map((p) => p.key);
  assert.ok(covered.includes('dresscode'), 'the page she was looking at');
  assert.ok(covered.includes('guestbook') && covered.includes('post-event'),
    'and the two that had been cut by hand, which now come from the one rule');
});
