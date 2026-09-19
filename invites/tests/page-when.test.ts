/**
 * A page that waits for one answer.
 *
 * Her idea, about the clip no frame on the Baby photos page can hold: "what
 * i can do next time is for the video if they will be inserting is create
 * another page that can be an extension for it if they opt to send, and if
 * not, it should be hidden."
 *
 * So a page may carry the same condition an element carries — one field on
 * the form, and what it has to say — read by the same rule, so a page and
 * what is drawn on it cannot disagree about what a blank means. The design
 * carries the page always; the invitation shows it only when the answer is
 * there, and the form asks for the film only where a design has that page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinDesign, pageShows, shows, designOf } from '../src/lib/design';
import { designBinds, designForm } from '../src/lib/asks';

test('the christening carries a page for the film, behind the photographs', () => {
  const doc = builtinDesign('christening')!;
  const keys = doc.pages.map((p) => p.key);
  assert.equal(keys[keys.indexOf('gallery') + 1], 'baby-film', 'it follows the frames');
  const film = doc.pages.find((p) => p.key === 'baby-film')!;
  assert.deepEqual(film.sections, ['gallery-video']);
  assert.equal(film.booklet, 'story', 'in the booklet the photographs are in');
  assert.deepEqual(film.when, { section: 'gallery', field: 'videoUrl', filled: true });
  // no ground of its own: the column's own pale sky, so a film does not play
  // over three drawn polaroids
  assert.equal(film.ground, undefined);
});

test('it is there when there is a film and gone when there is not', () => {
  const film = builtinDesign('christening')!.pages.find((p) => p.key === 'baby-film')!;
  assert.equal(pageShows(film, { gallery: { photos: [{ url: 'a.jpg' }] } }), false);
  assert.equal(pageShows(film, { gallery: { videoUrl: '' } }), false);
  assert.equal(pageShows(film, { gallery: { videoUrl: 'https://youtu.be/abc' } }), true);
  assert.equal(pageShows(film, undefined), false);
  // and every other page of the design is unconditional
  const waiting = builtinDesign('christening')!.pages.filter((p) => p.when);
  assert.deepEqual(waiting.map((p) => p.key), ['baby-film']);
});

test('a page and an element read one answer the same way', () => {
  const when = { section: 'gift', field: 'method', is: ['gcash'] };
  const content = { gift: { method: 'gcash' } };
  const other = { gift: { method: 'bank' } };
  const el = { id: 'x', kind: 'shape', x: 0, y: 0, w: 10, shape: 'rect', when } as never;
  assert.equal(shows(el, content), pageShows({ when }, content));
  assert.equal(shows(el, other), pageShows({ when }, other));
  assert.equal(pageShows({ when }, content), true);
  assert.equal(pageShows({ when }, other), false);
  assert.equal(pageShows({}, other), true, 'no condition is no question');
});

test('a saved design may carry a page condition, and a half-written one is dropped', () => {
  const when = { section: 'gallery', field: 'videoUrl', filled: true };
  const kept = designOf({ v: 1, pages: [{ key: 'film', sections: ['gallery-video'], when }] }, 'christening');
  assert.deepEqual(kept.dropped, []);
  assert.deepEqual(kept.doc!.pages[0].when, when, 'it survives the round trip the studio saves through');
  // a condition that names no field cannot be read, so the page goes rather
  // than quietly showing on every invitation
  const half = designOf({ v: 1, pages: [{ key: 'film', sections: [], when: { section: 'gallery' } }] }, 'christening');
  assert.deepEqual(half.dropped, ['page 1 (film)']);
});

test('the form asks for a film only where the design has a page for one', () => {
  assert.equal(designBinds(designForm(builtinDesign('christening'), 'CHRISTENING'), 'gallery', 'videoUrl'), true);
  // Baby Blue draws the same page, so it asks too
  assert.equal(designBinds(designForm(builtinDesign('babyblue'), 'CHRISTENING'), 'gallery', 'videoUrl'), true);
});
