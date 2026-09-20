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
 * The numbers below are read off `dresscode-foot.webp` (941×736, the bottom
 * 44% of her page): sampling every third pixel across each row against her
 * sky, nothing at all is drawn above 47.6cqw from the foot of the page, the
 * gypsophila at the right edge begins there, and the middle of the page —
 * where the words are — stays clear to 37cqw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHRISTENING_PAGES } from '../src/lib/christening';

/** where her artwork begins, as a share of the page's width up from its foot */
const ART = { anything: 47.6, inTheMiddle: 37.0 };

const dresscode = CHRISTENING_PAGES.find((p) => p.key === 'dresscode')!;

test('the dress code reserves the artwork at its foot and not a strip more', () => {
  // `footPad` is counted in elevenths of the page's width (--page-foot × 11cqw)
  const foot = dresscode.footPad! * 11;
  assert.ok(foot < ART.anything, `the reserve is ${foot}cqw and her artwork only reaches ${ART.anything}`);
  assert.ok(foot > ART.inTheMiddle, `but it clears the middle, where the words are: ${foot}cqw against ${ART.inTheMiddle}`);
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
