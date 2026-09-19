/**
 * The form asks for what this template can print, and nothing else.
 *
 * "why is the system did not detect that we dont have a space for video or
 * more photos in this area, since it only has 3 photos for it… also the
 * month by month is not possible aswell… it should detect only whats the
 * template is needing and it should vary per template right?"
 *
 * Right. Half of it was built — the design document already tells the form
 * how many frames a page has, which is where "up to 3 here" comes from — but
 * it only ever *narrowed*: it capped a list and hinted a shape, and never
 * took a box away. So a christening still asked for a video link, a second
 * video, a month-by-month year and two more photographs, on a design with
 * nowhere to put any of them, and a Caption on every baby photograph on a
 * page that prints no captions.
 *
 * Three rules make it work, and the third is what keeps it safe:
 *
 *  - a field marked `byDesign` is asked for only where the design binds it;
 *  - a line inside a list row is asked for the same way, which is the
 *    Caption;
 *  - **a page that is not drawn prints the whole part** — a flow page hands
 *    it to the part's own renderer, which draws every answer it has. Capiz's
 *    prenup page prints the video and the childhood pair without a single
 *    element pointing at either, so its form must keep them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinDesign } from '../src/lib/design';
import { designForm, designMedia, designBinds } from '../src/lib/asks';
import { fieldsFor, customerFields } from '../src/lib/sections';

const form = (slug: string, occasion: string) => designForm(builtinDesign(slug), occasion as never);
const asked = (slug: string, occasion: string, section: string) =>
  customerFields(designMedia(fieldsFor(section as never, occasion as never, 'LUXURY'), section, form(slug, occasion))).map((f) => f.key);

test('a christening is asked for the photographs its frames hold, and the film it has a page for', () => {
  /*
   * The film is here now, and it is here for a reason rather than by
   * accident: the design carries a page for it — one that appears only when
   * a family sends one, which was her own idea for the clip no frame can
   * hold. A month-by-month year, a second video and two more photographs
   * still have nowhere to go, so they are still not asked for.
   */
  const keys = asked('christening', 'CHRISTENING', 'gallery');
  assert.deepEqual(keys, ['photos', 'videoUrl', 'hide'], 'the photographs, the film that has a page of its own, and the switch that keeps the part off');
  for (const gone of ['messageVideoUrl', 'months', 'familyPhoto', 'parentsPhoto']) {
    assert.ok(!keys.includes(gone), `${gone} has nowhere to go on this design`);
  }
});

test('nor for a caption on a page that prints no captions', () => {
  const photos = customerFields(designMedia(fieldsFor('gallery', 'CHRISTENING', 'LUXURY'), 'gallery', form('christening', 'CHRISTENING')))
    .find((f) => f.key === 'photos')!;
  assert.deepEqual(photos.item!.map((f) => f.key), ['url'], 'a photograph, and no caption beside it');
  /*
   * The design does point at the caption — as the words read out to
   * somebody who cannot see the picture. That is not a place on the page,
   * and counting it as one is what kept the box there.
   */
  assert.equal(designBinds(form('christening', 'CHRISTENING'), 'gallery', 'photos', 'caption'), false);
  assert.equal(designBinds(form('christening', 'CHRISTENING'), 'gallery', 'photos', 'url'), true);
});

test('a flow page prints the whole part, so its form keeps everything', () => {
  // Capiz's prenup page is not drawn: the part's own renderer draws it, and
  // it draws the video, the childhood pair and both extra photographs
  const keys = asked('capiz', 'WEDDING', 'gallery');
  for (const kept of ['photos', 'little', 'familyPhoto', 'parentsPhoto', 'videoUrl', 'messageVideoUrl']) {
    assert.ok(keys.includes(kept), `${kept} is printed on a flow page, so it is still asked for`);
  }
  assert.equal(designBinds(form('capiz', 'WEDDING'), 'gallery', 'anything-at-all'), true, 'the whole part is bound');
  // and a drawn page is still only its elements: the christening's frames
  // hold photographs, so a month-by-month year is not asked for, although
  // the film is — that has a page of its own, further down the booklet
  assert.equal(designBinds(form('christening', 'CHRISTENING'), 'gallery', 'months'), false);
  assert.equal(designBinds(form('christening', 'CHRISTENING'), 'gallery', 'videoUrl'), true);
});

test('a design with no document of its own still asks for everything', () => {
  /*
   * The contract that made this safe to add. A design that binds nothing
   * has not been drawn yet, and a design that has drawn nothing cannot be
   * said to have no place for anything — so it takes nothing away, and
   * every template without a document of its own keeps the form it had.
   *
   * The picture every part can carry is the other way round and stays
   * hidden: it is a box nobody has ever been shown, which a design adds.
   */
  const none = designForm(null, 'CHRISTENING' as never);
  const was = fieldsFor('gallery', 'CHRISTENING', 'LUXURY').map((f) => f.key);
  const now = designMedia(fieldsFor('gallery', 'CHRISTENING', 'LUXURY'), 'gallery', none).map((f) => f.key);
  assert.deepEqual(now, was.filter((k) => k !== 'photo'));
  for (const kept of ['videoUrl', 'messageVideoUrl', 'months', 'familyPhoto', 'parentsPhoto']) {
    assert.ok(now.includes(kept), `${kept} is not taken away by a design that has drawn nothing`);
  }
  // and a part with neither hands back the very array it was given
  const plain = fieldsFor('ceremony', 'CHRISTENING', 'LUXURY').filter((f) => !f.byDesign && !f.ifDrawn);
  assert.equal(designMedia(plain, 'ceremony', none), plain);
});
