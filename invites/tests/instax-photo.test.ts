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
  /*
   * The element is the print — same box, to the number — and the window is
   * given inside it. That is what puts the two under one clip; see the
   * third test.
   */
  for (const k of ['x', 'y', 'w', 'aspect'] as const) {
    assert.equal(photo[k], print[k], `the photograph takes the print's ${k}`);
  }
  const inset = photo.inset!;
  assert.ok(Math.abs(inset.x - WINDOW.left) < 0.001, `the window starts at ${WINDOW.left} across the print`);
  assert.ok(Math.abs(inset.y - WINDOW.top) < 0.001, `and at ${WINDOW.top} down it`);
  assert.ok(Math.abs(inset.x + inset.w - WINDOW.right) < 0.001, `and ends at ${WINDOW.right}`);
  assert.ok(Math.abs(inset.y + inset.h - WINDOW.foot) < 0.001, `and at ${WINDOW.foot}`);
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
  /*
   * Travelling together was still not arriving together. A frame clips at
   * its own box, and the photograph's box was the window — 18.98cqw of the
   * print's 26.94 — so the picture stayed out of sight for the first 7.96
   * of the 26.94, thirty percent of the slide, while her white border was
   * already showing above it: "it is still delayed, the photo is still
   * delayed."
   *
   * Sharing the print's box is what fixes it, and the arithmetic of the
   * fix is this: the window's own height is what the rider would have
   * travelled on its own, the print's is what it travels now, and the two
   * differ by enough to see.
   */
  const window = ride * photo.inset!.h;
  assert.ok(ride - window > 5, `the old clip cut ${(ride - window).toFixed(2)}cqw off the start of the travel`);
  // and the box it clips by is the print's, to the number
  assert.equal(photo.w! * photo.aspect!, print.w! * print.aspect!);
  // over her print, because her picture area is not cut out of the file
  assert.ok((photo.z ?? 0) > (print.z ?? 0), 'the photograph covers the placeholder she drew');
});

test('the print is fed out from behind the camera, and her words stay on top of it', () => {
  /*
   * "could you still arrange the polaroid to be pulling out at the back of
   * the instax not at the front."
   *
   * The camera was painted into her cover, and a ground sits under every
   * element there is, so the print could only ever rise in front of it —
   * covering the slot it was supposed to be coming out of. So the camera
   * is an element now, cut out of the cover at the rectangle it occupies
   * and laid back at those coordinates, where it is invisible against the
   * ground it came from. The only thing it changes is what may pass in
   * front of it.
   */
  const camera = el('cover-camera') as PhotoEl;
  assert.equal((camera.bind as { asset?: string }).asset, '/christening/parts/instax-camera.webp');
  assert.ok((camera.z ?? 0) > (photo.z ?? 0) && (camera.z ?? 0) > (print.z ?? 0),
    'the print and the photograph in it both travel underneath');

  // laid back where it already is: the print's foot ends inside the top plate
  const printFoot = print.y! + (print.w! * print.aspect!) / RATIO / 2;
  const cameraTop = camera.y! - (camera.w! * camera.aspect!) / RATIO / 2;
  assert.ok(printFoot > cameraTop, 'at rest the foot of the print is already behind the plate');

  /*
   * And the words that ask for the tap are printed on the camera's lower
   * body. They needed no height of their own while the camera was paint;
   * over a cut-out they would vanish behind it, which is a fault a guest
   * meets before anything else on the page.
   */
  const click = (cover.elements ?? []).find((e) => e.id === 'cover-click')!;
  assert.ok((click.z ?? 0) > (camera.z ?? 0), 'CLICK HERE reads over the camera');
  const tap = el('cover-tap') as ShapeEl;
  assert.ok((click.z ?? 0) > (tap.z ?? 0), 'and over the rectangle laid across it');
});
