/**
 * A customer's own photograph, and where it sits inside the frame.
 *
 * Every frame shows the middle of the file, trimmed to the frame's shape,
 * which is right for a photograph taken with the frame in mind and wrong for
 * almost every photograph a family has: a square frame given a portrait keeps
 * the middle band and cuts the face off at the chin. "The photos are so zoom
 * in that it doesnt show the photo really well, atleast the customer could
 * have the chance to move the photo up and down, left to right, to fit it in
 * the frames, also allow that it can be zoom in and zoom out."
 *
 * Three things have to hold for that to work:
 *
 *  - the window survives a save, though nobody is asked for it as a question;
 *  - the page draws the customer's window where the design has none of its
 *    own, and never over one the designer set on her own artwork;
 *  - the form knows the real frame — its proportions and its cut — so it can
 *    show the cut rather than describe it.
 */
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { cropKeyOf, readCrop, cropBeside, placeCrop } from '../src/lib/photo-crop';
import { cleanSection, fieldsFor } from '../src/lib/sections';
import { builtinDesign, cropWindow, cropAt, cropFit, cropStyle, cropChosen } from '../src/lib/design';
import { CHRISTENING_PAGES } from '../src/lib/christening';
import type { PhotoEl } from '../src/lib/design';
import { designForm, framesFor } from '../src/lib/asks';

const WINDOW = { x: 0.1, y: 0.2, w: 0.5, h: 0.5 };

test('a window is read only when it is four numbers inside the picture', () => {
  assert.deepEqual(readCrop(WINDOW), WINDOW);
  for (const bad of [
    undefined, null, 'x', 42, [],
    { x: 0, y: 0, w: 0, h: 1 },            // nothing wide
    { x: 0.8, y: 0, w: 0.5, h: 0.5 },      // starts too far in to fit
    { x: -0.1, y: 0, w: 0.5, h: 0.5 },     // off the left edge
    { x: 0, y: 0, w: 0.5 },                // a number short
    { x: 0, y: 0, w: 0.5, h: Number.NaN }, // not a number
    { x: 0.1, y: 0, w: 1.4, h: 1 },        // wider than the file and slid off the front of it
    { x: -0.9, y: 0, w: 1.4, h: 1 },       // wider than the file and slid off the end of it
    { x: -1, y: 0, w: 40, h: 1 },          // so far out the picture is a speck
  ]) assert.equal(readCrop(bad), undefined, `${JSON.stringify(bad)} is not a window`);

  /*
   * A window wider than the file goes back to being rubbish, because
   * nothing makes one any more. It was allowed for a day and a half so a
   * frame could show the whole photograph with a band of frame either
   * side; that band is what she kept pointing at — "when i zoom it out
   * there will be spaces at the side" — so the slider stops at the square
   * and the window comes back inside the picture, where the rule is one
   * line again: a frame is never asked to draw what the file has not got.
   */
  for (const out of [
    { x: -0.25, y: 0, w: 1.5, h: 1 },   // a portrait shown whole in a square
    { x: 0, y: -0.25, w: 1, h: 1.5 },   // and a landscape in an upright frame
  ]) assert.equal(readCrop(out), undefined, `${JSON.stringify(out)} leaves the picture`);

  assert.deepEqual(placeCrop({ x: 0.123456, y: 0.2, w: 0.5, h: 0.5 }), { x: 0.1235, y: 0.2, w: 0.5, h: 0.5 });
});

test('a picture’s window travels with the picture through a save', () => {
  const fields = fieldsFor('story', 'CHRISTENING');
  const { data } = cleanSection(fields, {
    timeline: [{ date: 'June 2025', title: 'The Answer', text: 'Two lines.', photo: 'https://x/y.jpg', photoCrop: WINDOW }],
  });
  const row = (data.timeline as Record<string, unknown>[])[0];
  assert.equal(row.photo, 'https://x/y.jpg');
  assert.deepEqual(row[cropKeyOf('photo')], WINDOW, 'the window is kept although nobody asked for it as a question');

  // and it is still the content-cleaning it always was: junk is dropped
  const { data: junk } = cleanSection(fields, {
    timeline: [{ title: 'x', photo: 'https://x/y.jpg', photoCrop: { x: 9, y: 9, w: 9, h: 9 }, nonsense: 1 }],
  });
  const bad = (junk.timeline as Record<string, unknown>[])[0];
  assert.equal(bad.photoCrop, undefined, 'a window that is not a window is not stored');
  assert.equal('nonsense' in bad, false, 'and an unknown key is still dropped');

  // a picture of the section's own keeps its window the same way
  const cover = cleanSection(fieldsFor('gallery', 'CHRISTENING'), { familyPhoto: 'https://x/f.jpg', familyPhotoCrop: WINDOW }).data;
  assert.deepEqual(cover.familyPhotoCrop, WINDOW);
});

test('the window is found beside the picture, wherever the picture is', () => {
  const content = {
    story: { timeline: [{ photo: 'a.jpg' }, { photo: 'b.jpg', photoCrop: WINDOW }] },
    gallery: { family: 'c.jpg', familyCrop: WINDOW, photos: [{ url: 'd.jpg', urlCrop: WINDOW }] },
  };
  assert.deepEqual(cropBeside(content, { section: 'story', field: 'timeline', index: 1, sub: 'photo' }), WINDOW);
  assert.equal(cropBeside(content, { section: 'story', field: 'timeline', index: 0, sub: 'photo' }), undefined);
  assert.deepEqual(cropBeside(content, { section: 'gallery', field: 'family' }), WINDOW);
  assert.deepEqual(cropBeside(content, { section: 'gallery', field: 'photos', index: 0, sub: 'url' }), WINDOW);
  // nothing anywhere near it is a crash
  assert.equal(cropBeside(undefined, { section: 'story', field: 'timeline', index: 0, sub: 'photo' }), undefined);
  assert.equal(cropBeside(content, { section: 'nope', field: 'photo' }), undefined);
  assert.equal(cropBeside(content, { section: 'story', field: 'timeline', index: 9, sub: 'photo' }), undefined);
});

test('the form is handed the real frame for every picture the design draws', () => {
  const form = designForm(builtinDesign('christening'), 'CHRISTENING');
  /*
   * Portrait since she redrew the page: "i removed the line in the middle
   * for the our story and replace it where the photos should go", and the
   * four windows on the filmstrip she put there are 14.11 of the page tall
   * over 18.52 wide. The form is handed that, so the crop box she drags in
   * shows the shape the page will actually print.
   */
  assert.deepEqual(framesFor('story', form), { 'timeline.photo': { aspect: 1.355 } }, 'a milestone’s window is portrait');
  /*
   * The three polaroids on the Baby photos page are 0.9563, 0.9590 and
   * 0.9563 — measured off her artwork, so no two are the same number and
   * all three are the same frame. This is the page whose photographs she
   * said were too zoomed in, so offering a window on it is the point.
   */
  assert.deepEqual(framesFor('gallery', form), { 'photos.url': { aspect: 0.959 } });
});

test('zoom 1 in the middle is the picture as the frame has always shown it', () => {
  // a portrait in a square frame: the widest square of it, centred
  const at1 = cropWindow({ aspect: 1, nw: 3, nh: 4 });
  assert.deepEqual(at1, { x: 0, y: 0.125, w: 1, h: 0.75 });
  // pulled closer, the window shrinks about the same middle
  const at2 = cropWindow({ aspect: 1, nw: 3, nh: 4, zoom: 2 });
  assert.equal(at2.w, 0.5);
  assert.ok(Math.abs(cropAt(at2, 1, 3, 4).zoom - 2) < 1e-9, 'and reads back as the zoom it was');
  // panned to the corner, it is held inside the picture rather than past it
  const corner = cropWindow({ aspect: 1, nw: 3, nh: 4, zoom: 2, cx: 5, cy: 5 });
  assert.equal(corner.x + corner.w, 1);
  assert.ok(corner.y + corner.h <= 1.0001);
});

/**
 * The window never leaves the picture, and zoom 1 is the whole square.
 *
 * "always show the whole photo when uploaded, because there is zoom in and
 * out and draging of photo. let me handle it."
 *
 * Read twice as *the frame shows the whole photograph*, and twice it left
 * bands of empty frame she did not want: "it can be squared but it needs
 * more zoom in to fill the spaces", then "when i zoom it out there will be
 * spaces at the side", then, plainly, "you can form a perfect square crop,
 * even if it not super zooming it."
 *
 * She is right on the arithmetic. Zoom 1 is the largest square that fits
 * inside the photograph: the least zoom there is *and* the most of the
 * picture that can be shown without a hole. So the floor is one, no window
 * ever spills, and no frame on any page can show a gap. Seeing the whole
 * photograph while she chooses is the crop box's job, and it does it by
 * drawing the file whole with the square laid over it.
 */
test('zoom 1 is the largest square inside the picture, and nothing goes below it', () => {
  const frame = { aspect: 1, nw: 800, nh: 1200 };
  const cover = cropWindow({ ...frame, zoom: 1 });
  // the full width of a 2:3 portrait, and two thirds of its height: a square
  assert.equal(cover.x, 0);
  assert.equal(cover.w, 1);
  assert.equal(Number(cover.y.toFixed(4)), 0.1667);
  assert.equal(Number(cover.h.toFixed(4)), 0.6667);
  // which is a square of the file, to the pixel
  assert.ok(Math.abs(cover.w * frame.nw - cover.h * frame.nh) < 0.5, 'as wide as it is tall');

  // pushed below one, it does not move: there is nothing under the square
  for (const zoom of [0.99, 0.6667, 0.1, 0]) {
    assert.deepEqual(cropWindow({ ...frame, zoom }), cover, `zoom ${zoom} is held at the square`);
  }
  // and a landscape in the same frame, the other way about
  const wide = cropWindow({ aspect: 1, nw: 1200, nh: 800, zoom: 0.5 });
  assert.equal(wide.h, 1);
  assert.equal(Number(wide.w.toFixed(4)), 0.6667);

  // it draws as the frame filled, which is what `cover` has always drawn
  const css = cropStyle(cover);
  assert.equal(css.width, '100%');
  assert.ok(css.height.startsWith('149.9') || css.height.startsWith('150'), `the picture is ${css.height} of the frame, so the frame is full`);
  assert.equal(css.left, '0%');
  assert.ok(parseFloat(css.top) < 0, 'and slid up, not inset');
  assert.equal(Number(cropAt(cover, 1, 800, 1200).zoom.toFixed(4)), 1, 'the slider reads its own number back');
});

/**
 * A square she has moved is a square worth keeping, though it is as wide as
 * the file.
 *
 * At zoom 1 in a square frame a portrait's window *is* the full width of
 * the file — w of exactly 1 — and the old rule for "is there anything to
 * store" asked precisely that: w or h reaching 1 meant "the picture as it
 * is drawn anyway, store nothing." So dragging a face up into the square
 * and saving threw the drag away, silently, every time: "the photo isnt
 * fixed yet... its still the same."
 *
 * What she changed is where the square sits. So that is what is asked.
 */
test('a square dragged off centre survives a save and a read', () => {
  const frame = { aspect: 1, nw: 800, nh: 1200 };
  // her face is near the top, so the square goes up
  const chosen = cropChosen({ ...frame, zoom: 1, cx: 0.5, cy: 0.34 });
  assert.ok(chosen, 'a drag at zoom 1 is a choice, not the absence of one');
  assert.equal(chosen!.w, 1, 'and its window is exactly as wide as the file, which is why it used to be dropped');
  assert.ok(chosen!.y < 0.1667, 'the square has moved up');

  // it sits inside the picture, so the frame is full
  assert.ok(chosen!.x >= 0 && chosen!.y >= 0 && chosen!.x + chosen!.w <= 1.0001 && chosen!.y + chosen!.h <= 1.0001);
  const css = cropStyle(chosen!);
  assert.equal(css.width, '100%', 'no band of frame beside it');

  // the save keeps it
  const fields = fieldsFor('story', 'CHRISTENING');
  const { data } = cleanSection(fields, {
    timeline: [{ date: 'June 2026', title: 'The day we met', text: 'You came into our world.', photo: 'https://x/y.jpg', photoCrop: chosen }],
  });
  const row = (data.timeline as Record<string, unknown>[])[0];
  assert.deepEqual(row[cropKeyOf('photo')], chosen, 'the save no longer throws her drag away');
  // and the page reads the same window back
  assert.deepEqual(cropBeside({ story: data }, { section: 'story', field: 'timeline', index: 0, sub: 'photo' }), chosen);
});

/**
 * One rule for what is worth storing, in one place, called by the form.
 *
 * The form used to keep its own — and its own was the wrong one, so every
 * test passed while the thing she was using dropped her choice. The form is
 * not allowed a copy: it calls `cropChosen` and does no arithmetic of its
 * own about what is worth keeping.
 */
test('the form stores the square she chose, and stores nothing when she chose nothing', () => {
  const frame = { aspect: 1, nw: 800, nh: 1200 };

  // untouched: the middle of the picture filling the frame, which is what a
  // frame with no window draws, so there is nothing to write down
  assert.equal(cropChosen({ ...frame, zoom: 1, cx: 0.5, cy: 0.5 }), undefined);

  // moved, or pulled closer, or both — all kept
  assert.ok(cropChosen({ ...frame, zoom: 2, cx: 0.5, cy: 0.5 }), 'zoomed in');
  assert.ok(cropChosen({ ...frame, zoom: 1, cx: 0.5, cy: 0.3 }), 'dragged up');
  assert.ok(cropChosen({ ...frame, zoom: 1.2, cx: 0.4, cy: 0.6 }), 'both');

  // and whatever she does, the square stays inside the picture
  for (const at of [{ zoom: 0.2, cx: 0.5, cy: 0.5 }, { zoom: 1, cx: -3, cy: 4 }, { zoom: 3, cx: 9, cy: -9 }]) {
    const win = cropChosen({ ...frame, ...at }) ?? cropWindow({ ...frame, ...at });
    assert.ok(readCrop(win), `${JSON.stringify(win)} sits inside the file`);
  }

  // a photograph already the frame's shape has nothing to crop at all
  const square = { aspect: 1, nw: 900, nh: 900 };
  assert.deepEqual(cropWindow({ ...square, zoom: 1 }), { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(cropChosen({ ...square, zoom: 1, cx: 0.5, cy: 0.5 }), undefined);
});

/**
 * The crop box shows the whole photograph; the frame shows the square.
 *
 * That split is the answer to "always show the whole photo when uploaded...
 * let me handle it", and getting it wrong twice cost four rounds. It is
 * held here because it lives in three places that cannot see each other:
 * the floor of the slider, the shape of the stage, and the clamp in
 * `cropWindow`.
 */
test('the crop box draws the file whole and the slider stops at the square', () => {
  const box = readFileSync('src/components/builder/fields.tsx', 'utf8');
  assert.match(box, /onCrop\(cropChosen\(/, 'the box hands the decision over whole');
  assert.equal(/0\.9999/.test(box), false, 'and keeps no rule of its own about the window\u2019s size');
  assert.match(box, /min=\{1\}/, 'the slider floor is the square');
  assert.equal(/min=\{fit\}/.test(box), false, 'not the zoom that fits the picture inside the frame');
  // the stage takes the file's own proportions, which is what makes the
  // window's numbers read straight off it
  assert.match(box, /aspectRatio: size \? `\$\{size\.nw\} \/ \$\{size\.nh\}`/);
  assert.match(box, /object-contain/, 'and the picture is drawn whole inside it');
});

/**
 * The crop box is shown the shape the page will actually clip by.
 *
 * "i drag and perfectly zoom the way i wanted to see it, yet it doesnt
 * show up right in the previews."
 *
 * The instax on her cover is one picture out of Canva — white border and
 * all — so the photograph was given the print's whole box and a window
 * inside it, which is what puts the two under one clip and brings them out
 * of the camera together. The element is 1.1367 tall, a portrait; the
 * window inside it is 0.832 across by 0.7044 down, which comes out very
 * nearly square.
 *
 * The form was handed the element's 1.1367 and never heard about the
 * window. So the crop box drew her a tall frame, she set her photograph in
 * it, and the page clipped that to a square — a different picture, every
 * time, however carefully she placed it.
 */
test('a photograph in a window is framed by the window, not by the frame around it', () => {
  const form = designForm(builtinDesign('christening'), 'CHRISTENING');
  const cover = CHRISTENING_PAGES.find((p) => p.key === 'cover')!;
  const photo = (cover.elements ?? []).find((e) => e.id === 'cover-photo') as PhotoEl;
  const win = photo.inset!;

  // what the page clips by: the window's own box, in the page's units
  const wide = photo.w! * win.w;
  const tall = photo.w! * photo.aspect! * win.h;
  const clips = Math.round((tall / wide) * 10000) / 10000;
  assert.ok(Math.abs(clips - 0.9624) < 0.0002, `the window is ${clips}, near enough square`);
  assert.ok(Math.abs(photo.aspect! - clips) > 0.15, 'and nothing like the print it sits in');

  // and that is the number the form hands the crop box
  assert.deepEqual(framesFor('cover', form)['coverPhoto'], { aspect: clips });

  // every other picture has no window, so nothing moves for them
  assert.deepEqual(framesFor('gallery', form), { 'photos.url': { aspect: 0.959 } });
  assert.deepEqual(framesFor('story', form), { 'timeline.photo': { aspect: 1.355 } });
});
