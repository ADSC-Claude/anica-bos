/**
 * The instax on her cover is a photo frame, so it holds a photograph.
 *
 * "i need to know where can i upload the polaroid, it should have a photo
 * inserter for that. thats a photo frame."
 *
 * It is one, and it had no slot: the print she cut out of her Canva page
 * carries the placeholder landscape she drew it around, so every guest of
 * every invitation saw the same green hill slide out of the camera. The
 * cover photo — the one photograph this design asks a customer for, and
 * which it printed nowhere — goes in the window.
 *
 * The window, measured off `instax-print.webp` (256×291): 7.42%–90.62%
 * across it and 4.47%–74.91% down. The print sits at cx 51.39, cy 79.40,
 * w 23.70 with aspect 1.1367, so in the page's own units the window is
 * where the numbers below put it. A photograph a hair out of place shows
 * her white border on one side and covers it on the other, so this is
 * checked against the file rather than eyeballed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHRISTENING_PAGES } from '../src/lib/christening';
import { ridesOf } from '../src/components/invite/drawn';
import type { PhotoEl, ShapeEl } from '../src/lib/design';

const cover = CHRISTENING_PAGES.find((p) => p.key === 'cover')!;
const el = (id: string) => (cover.elements ?? []).find((e) => e.id === id)!;
const print = el('cover-print') as PhotoEl;
const photo = el('cover-photo') as PhotoEl;
/** the window inside her print, as shares of the print's own box */
const WINDOW = { left: 0.0742, right: 0.9062, top: 0.0447, foot: 0.7491 };
const RATIO = 1.7778;

test('the cover asks for a photograph and the instax is where it is printed', () => {
  assert.deepEqual(photo.bind, { section: 'cover', field: 'coverPhoto' });
  // nothing else on this page prints it, which is why the frame looked empty
  const others = (cover.elements ?? []).filter((e) => e.kind === 'photo' && e.id !== 'cover-photo');
  assert.ok(others.every((e) => 'asset' in (e as PhotoEl).bind!), 'every other picture on the cover is her own artwork');
});

test('the photograph lands in the window of the print, not over its border', () => {
  // the print's box, in page units: x as a share of the width, y of the height
  const pw = print.w!;                       // 23.70 of the page's width
  const ph = pw * print.aspect!;             // its height, still in page-width units
  const left = print.x! - pw / 2;
  const top = print.y! * RATIO - ph / 2;     // cy is a share of the height; work in width units

  const wantLeft = left + WINDOW.left * pw;
  const wantRight = left + WINDOW.right * pw;
  const wantTop = top + WINDOW.top * ph;
  const wantFoot = top + WINDOW.foot * ph;

  const gotLeft = photo.x! - photo.w! / 2;
  const gotRight = photo.x! + photo.w! / 2;
  const gotTop = photo.y! * RATIO - (photo.w! * photo.aspect!) / 2;
  const gotFoot = photo.y! * RATIO + (photo.w! * photo.aspect!) / 2;

  for (const [name, want, got] of [
    ['left', wantLeft, gotLeft], ['right', wantRight, gotRight],
    ['top', wantTop, gotTop], ['foot', wantFoot, gotFoot],
  ] as const) {
    assert.ok(Math.abs(want - got) < 0.25, `${name}: the window is at ${want.toFixed(2)} and the photograph at ${got.toFixed(2)}`);
  }
  // her white border is the frame; a frame of ours would sit a card inside hers
  assert.equal(photo.frame, 'none');
});

test('the photograph comes out of the camera with the print, on the one tap', () => {
  const tap = el('cover-tap') as ShapeEl;
  assert.equal(tap.taps, 'cover-print', 'the guest aims at the camera and the print is what moves');
  /*
   * `taps` names one thing, and here two have to move. The photograph
   * answers to the print's name as well as carrying its own id, so the tap
   * reaches both; without it the frame slides out empty and the picture is
   * left behind the camera for good, because a held element never arrives
   * on its own.
   */
  assert.equal(photo.tapAs, 'cover-print');
  assert.deepEqual(photo.motion, print.motion, 'and it travels the same way, or the two come apart');
  /*
   * The same way is not yet the same speed. `slide` moves a frame's picture
   * by 100% — the frame's own height — so the print travelled 26.9cqw and
   * the photograph 19.0cqw over the same 1250ms, and the picture lagged the
   * print it lives in: "it is still delayed, the photo and polaroid dont
   * pulled out the same time." The renderer reads the leader's height off
   * the document and hands it to the rider; this is the number it hands.
   */
  const ride = Number((print.w! * print.aspect!).toFixed(3));
  assert.equal(ridesOf(cover)?.get('cover-print'), ride);
  assert.ok(Math.abs(ride - photo.w! * photo.aspect!) > 5, 'and the two heights really are far enough apart to see');
  // over her print, because her picture area is not cut out of the file
  assert.ok((photo.z ?? 0) > (print.z ?? 0), 'the photograph covers the placeholder she drew');
});
