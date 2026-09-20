/**
 * The picture painted from the markup must never be stretched.
 *
 * "The page becomes distorted ... the pages inside is distorted."
 *
 * A drawn page's artwork used to be laid by a measuring pass that runs
 * after hydration; #206 gave the simple pages a head start by naming the
 * picture in the markup and letting CSS paint it with the first frame.
 * That shortcut is only sound while the page is exactly one picture tall,
 * because a background handed both a width and a height has to fill them.
 *
 * `godparents` is not. It grows with however many ninongs and ninangs are
 * typed into it, and it is the one growing page in her design that carries
 * no `slices` — so it was the only page in the catalogue that fell through
 * the guard, and her artwork was stretched down it. Every other growing
 * page (countdown, faq, guestbook, post-event, dresscode, rsvp) was
 * already excluded by its slices and was never affected.
 *
 * Two rules, so this cannot come back: the guard excludes a growing page,
 * and the rule that paints it gives the picture only its width, so that
 * even a page that somehow reaches it keeps the shape it was drawn in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinDesign, isPicture, runOf, type DesignDoc, type PageSpec } from '../src/lib/design';

/** a drawn page carrying one whole picture: the shape the shortcut was written for */
const whole = (doc: DesignDoc, p: PageSpec): boolean => {
  const g = p.ground;
  if (!g || !isPicture(g) || !g.url || !p.drawn) return false;
  // `run` is the picture that carries on down the pages after it; the
  // renderer reads it off `runOf`, so the test reads it from there too
  const run = runOf(doc).get(p.key) ?? (g.runsOn ? p.key : undefined);
  return !(g.slices || run || p.pin || p.bleed || p.seam);
};
/** the pages the markup actually paints: `paper()` in renderer.tsx, guard and all */
const painted = (doc: DesignDoc): PageSpec[] => doc.pages.filter((p) => whole(doc, p) && !p.grow);

const DESIGNS = ['christening', 'capiz', 'babyblue'] as const;

test('every page painted from the markup is one picture tall', () => {
  /*
   * The assertion that matters is the pair: a page is painted only if its
   * height is its picture's, and the catalogue really does contain a page
   * that is otherwise eligible and grows. Without the second half the
   * first is satisfied by a guard that excludes everything.
   */
  let growing = 0;
  for (const layout of DESIGNS) {
    const doc = builtinDesign(layout);
    assert.ok(doc, `${layout} has a built-in`);
    for (const p of painted(doc!)) {
      assert.ok(!p.grow,
        `${layout}/${p.key} grows, so its height is not its picture's — it must be left to the measuring pass`);
      assert.ok(p.ground && isPicture(p.ground) && p.ground.ratio,
        `${layout}/${p.key} is painted, so it must state the ratio the page is cut to`);
    }
    growing += doc!.pages.filter((p) => whole(doc!, p) && p.grow).length;
  }
  assert.ok(growing > 0, 'the guard is load-bearing: the catalogue has a whole-picture page that grows');
});

test('the page that was stretched is not painted from the markup', () => {
  const doc = builtinDesign('christening')!;
  assert.ok(!painted(doc).some((p) => p.key === 'godparents'),
    'godparents is left to the measuring pass, which keeps her artwork’s shape');
});

test('godparents is the page this was found on, and it grows', () => {
  // the guard is general, but the page that proved it is worth naming: if
  // this ever stops growing the rule above still holds, and if it starts
  // being painted again the rule above fails loudly
  const doc = builtinDesign('christening')!;
  const gp = doc.pages.find((p) => p.key === 'godparents')!;
  assert.ok(gp.grow, 'the godparents page grows with the names');
  assert.ok(gp.drawn && gp.ground && isPicture(gp.ground) && !gp.ground.slices,
    'and it is a drawn page with a whole picture, which is how it slipped past');
});

test('the guard names grow, and the rule gives the picture only its width', () => {
  const renderer = readFileSync('src/components/invite/renderer.tsx', 'utf8');
  assert.match(renderer, /if \(g\.slices \|\| o\.run \|\| o\.pin \|\| o\.bleed \|\| o\.seam \|\| o\.grow\) return \{\};/,
    'paper() hands a growing page back to the measuring pass');

  const css = readFileSync('src/app/globals.css', 'utf8');
  const rule = css.slice(css.indexOf('.inv[data-paged] .inv-page[data-paper] {'));
  const block = rule.slice(0, rule.indexOf('}'));
  assert.match(block, /background-size: 100% auto,/,
    'the picture is given its width and keeps its own height');
  assert.doesNotMatch(block, /background-size: 100% 100%/,
    'never both, which is what stretched it');
});
