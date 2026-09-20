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
import assert from 'node:assert/strict';
import { cropKeyOf, readCrop, cropBeside, placeCrop } from '../src/lib/photo-crop';
import { cleanSection, fieldsFor } from '../src/lib/sections';
import { builtinDesign, cropWindow, cropAt, cropFit, cropStyle } from '../src/lib/design';
import { designForm, framesFor } from '../src/lib/asks';

const WINDOW = { x: 0.1, y: 0.2, w: 0.5, h: 0.5 };

test('a window is read only when it is four numbers inside the picture', () => {
  assert.deepEqual(readCrop(WINDOW), WINDOW);
  for (const bad of [
    undefined, null, 'x', 42, [],
    { x: 0, y: 0, w: 0, h: 1 },            // nothing wide
    { x: 0, y: 0, w: 1.4, h: 1 },          // wider than the file
    { x: 0.8, y: 0, w: 0.5, h: 0.5 },      // starts too far in to fit
    { x: -0.1, y: 0, w: 0.5, h: 0.5 },     // off the left edge
    { x: 0, y: 0, w: 0.5 },                // a number short
    { x: 0, y: 0, w: 0.5, h: Number.NaN }, // not a number
  ]) assert.equal(readCrop(bad), undefined, `${JSON.stringify(bad)} is not a window`);
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
 * The slider reaches out to the whole picture, as well as in.
 *
 * "always show the whole photo when uploaded, because there is zoom in and
 * out and draging of photo. let me handle it." A portrait handed to a
 * square window arrives with its top and bottom gone, and there was no way
 * to get them back: the slider started at one, which is `object-fit:
 * cover`, and only went in.
 *
 * Making *fit* the resting state was the wrong answer to that, and she said
 * so as soon as she saw it — "it can be squared but it needs more zoom in
 * to fill the spaces." A window cut into her artwork is drawn around a
 * picture that fills it. So the frame still rests filled, and the slider is
 * what reaches out: down to `cropFit`, where the whole picture sits inside
 * the frame with a band of frame on two sides.
 */
test('the slider reaches out to the whole picture, and stops there', () => {
  // a 2:3 portrait in a square frame: two thirds of the frame wide, all of it tall
  assert.equal(Number(cropFit(1, 800, 1200).toFixed(4)), 0.6667);
  // a 3:2 landscape in the same frame, the other way about
  assert.equal(Number(cropFit(1, 1200, 800).toFixed(4)), 0.6667);
  // a photograph the frame's own shape is already whole at one
  assert.equal(cropFit(1, 900, 900), 1);
  assert.equal(Number(cropFit(1.5, 800, 1200).toFixed(4)), 1);

  const frame = { aspect: 1, nw: 800, nh: 1200 };
  const whole = cropWindow({ ...frame, zoom: cropFit(1, 800, 1200) });
  // the window is wider than the picture and centred on it, so the picture
  // sits in the middle of the frame with a band of frame either side
  assert.equal(whole.h, 1, 'all of the picture, top to bottom');
  assert.equal(Number(whole.w.toFixed(3)), 1.5, 'and a window half as wide again as the picture');
  assert.equal(Number(whole.x.toFixed(3)), -0.25, 'centred: a quarter of the picture of frame on each side');
  assert.equal(whole.y, 0);
  // and it draws as such: the picture two thirds of the frame, a sixth in
  const css = cropStyle(whole);
  assert.ok(css.width.startsWith('66.66'), `two thirds of the frame wide, not ${css.width}`);
  assert.equal(css.height, '100%');
  assert.ok(css.left.startsWith('16.66'), `a sixth in, not ${css.left}`);
  assert.equal(css.top, '0%');

  // no further out than that, however hard the slider is pushed
  assert.deepEqual(cropWindow({ ...frame, zoom: 0.1 }), whole);
  // and zoom one still means exactly what object-fit: cover means, so
  // nothing already positioned moves
  const cover = cropWindow({ ...frame, zoom: 1 });
  assert.equal(cover.x, 0);
  assert.equal(cover.w, 1);
  assert.equal(Number(cover.y.toFixed(4)), 0.1667);
  assert.equal(Number(cover.h.toFixed(4)), 0.6667);
  assert.equal(Number(cropAt(whole, 1, 800, 1200).zoom.toFixed(4)), 0.6667, 'and the slider reads its own number back');
});
