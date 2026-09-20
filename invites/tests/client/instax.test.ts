import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { DrawnPage } from '../../src/components/invite/drawn';
import { CHRISTENING_PAGES } from '../../src/lib/christening';
import type { PhotoEl } from '../../src/lib/design';

/**
 * The print and the photograph in it leave the camera as one object.
 *
 * "the photo and the polaroid are still delayed, the photo is still
 * delayed." Three things had to be true and only the first two were:
 *
 *  1. the photograph is fetched before the tap, not on it (`data-hold`
 *     holds an element out of sight, and a lazy picture inside one is not
 *     fetched while it is hidden);
 *  2. it travels the print's distance, not its own — `slide` moves a
 *     frame's picture by 100% of *that frame's* height, and the two frames
 *     are different heights (`--inv-ride`);
 *  3. it is clipped by the print's box, not its own.
 *
 * The third is this file. Given a box of its own — the window, 18.98cqw of
 * the print's 26.94 — the photograph was hidden by its own clip for the
 * first 7.96cqw of the travel, thirty percent of the slide, while her white
 * border was already showing above it. The element now takes the print's
 * box and names the window as an `inset` inside it, so one edge reveals
 * both.
 *
 * This renders the real cover and reads the markup, because every part of
 * that lives in a different file: the box in the design document, the
 * wrapper in the renderer, the travel in the stylesheet.
 */
const cover = CHRISTENING_PAGES.find((p) => p.key === 'cover')!;
const el = (id: string) => (cover.elements ?? []).find((e) => e.id === id)! as PhotoEl;

const markup = renderToStaticMarkup(DrawnPage({
  page: cover,
  content: { cover: { coverPhoto: 'https://example.test/baby.jpg', childFull: 'Azriel Cayden Reyes' } },
  look: undefined,
  lang: 'en',
}) as ReactElement);

/** the one `<figure>` that holds the family's photograph */
const slot = markup.match(/<figure[^>]*data-tap-id="cover-print"[^>]*data-win[^>]*>[\s\S]*?<\/figure>/)
  ?? markup.match(/<figure(?![^>]*data-own)[^>]*data-win[^>]*>[\s\S]*?<\/figure>/);

test('the photograph is drawn inside the print, in the window she left for it', () => {
  assert.ok(slot, 'the cover renders a frame with a window in it');
  const html = slot![0];
  // the wrapper carries the window's rectangle, in shares of the print's box
  const win = html.match(/<span class="inv-bb-win" style="([^"]*)"/);
  assert.ok(win, 'the picture sits in a window element, not straight in the frame');
  const style = Object.fromEntries(win![1].split(';').filter(Boolean).map((d) => {
    const at = d.indexOf(':');
    return [d.slice(0, at).trim(), d.slice(at + 1).trim()];
  }));
  const inset = el('cover-photo').inset!;
  assert.equal(style.left, `${inset.x * 100}%`);
  assert.equal(style.top, `${inset.y * 100}%`);
  assert.equal(style.width, `${inset.w * 100}%`);
  assert.equal(style.height, `${inset.h * 100}%`);
  // and the picture is in it
  assert.match(html, /<img[^>]*src="[^"]*baby\.jpg/, 'the family’s photograph, not a placeholder');
});

test('it waits for the tap, decoded, and then travels the print’s own distance', () => {
  const html = slot![0];
  // held: it does not arrive on scroll, it arrives when the camera is tapped
  assert.match(html, /data-tap-id="cover-print"/);
  assert.match(html, /data-hold/);
  // fetched with the page rather than when the tap reveals it
  assert.match(html, /loading="eager"/);
  assert.match(html, /fetchpriority="high"/i);
  // and told how far to go: the print's height, not the window's
  const print = el('cover-print');
  const ride = Number((print.w! * print.aspect!).toFixed(3));
  assert.match(html, /data-ride/);
  assert.ok(html.includes(`--inv-ride:${ride}cqw`) || html.includes(`--inv-ride: ${ride}cqw`),
    `the window is told to travel ${ride}cqw; the markup says ${html.match(/--inv-ride:[^;"]*/)?.[0]}`);
});

test('the frame it is clipped by is the print’s, to the number', () => {
  const photo = el('cover-photo');
  const print = el('cover-print');
  for (const k of ['x', 'y', 'w', 'aspect'] as const) assert.equal(photo[k], print[k]);
  // which is the whole point: the clip they share is 26.94cqw tall, and the
  // window on its own would have been 18.98 — the difference is what used
  // to be spent with an empty frame coming out of the camera
  const clip = print.w! * print.aspect!;
  const own = clip * photo.inset!.h;
  assert.ok(clip - own > 5, `${(clip - own).toFixed(2)}cqw of the travel is no longer blank`);
});
