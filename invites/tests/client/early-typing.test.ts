/**
 * The seconds before the form is listening.
 *
 * The boxes arrive from the server ready to use. The script that hears them
 * arrives later — measured at nearly four seconds on a throttled phone — and
 * anything typed in between went into the box and nowhere else: never
 * dirty, never saved, and the line under the form still promising
 * "Auto-save on". "when im trying to fill up form, it doesnt work now."
 *
 * So the form reads the boxes back the moment it starts. These are the
 * rules it reads them by.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { typedBeforeReady, TYPED_IN } from '../../src/lib/early-typing';

/** A page of boxes: id to what is in it. */
const page = (boxes: Record<string, string>) => (id: string) => (id in boxes ? { value: boxes[id]! } : null);

const COVER = [
  { key: 'childFull', type: 'text' },
  { key: 'childLast', type: 'text' },
  { key: 'intro', type: 'textarea' },
  { key: 'age', type: 'number' },
  { key: 'photoStyle', type: 'select' },
];

test('a box holding what the server wrote was not typed in', () => {
  const initial = { childFull: 'Amara Sofia', childLast: 'Reyes', intro: '', age: null, photoStyle: 'veil' };
  const typed = typedBeforeReady(COVER, initial, page({ 'f-childFull': 'Amara Sofia', 'f-childLast': 'Reyes', 'f-intro': '', 'f-age': '', 'f-photoStyle': 'veil' }));
  assert.deepEqual(typed, {}, 'nothing to recover, so nothing is saved and no phantom change is made');
});

test('what was typed in the gap is picked up', () => {
  const initial = { childFull: '', childLast: '', intro: '' };
  const typed = typedBeforeReady(COVER, initial, page({ 'f-childFull': 'Amara Sofia', 'f-childLast': 'Reyes', 'f-intro': '' }));
  assert.deepEqual(typed, { childFull: 'Amara Sofia', childLast: 'Reyes' }, 'both boxes, and not the one left alone');
});

test('a number comes back a number, and an emptied box comes back empty', () => {
  assert.deepEqual(typedBeforeReady(COVER, { age: null }, page({ 'f-age': '7' })), { age: 7 });
  assert.deepEqual(typedBeforeReady(COVER, { age: 7 }, page({ 'f-age': '' })), { age: null });
  assert.deepEqual(typedBeforeReady(COVER, { age: 7 }, page({ 'f-age': '7' })), {}, 'the same number said twice is not a change');
});

test('a box wiped out in the gap is a change like any other', () => {
  assert.deepEqual(
    typedBeforeReady(COVER, { childFull: 'Amara Sofia' }, page({ 'f-childFull': '' })),
    { childFull: '' },
    'clearing a name before the form was listening must not be undone by the form starting',
  );
});

test('a box that is not on the page is not invented', () => {
  assert.deepEqual(typedBeforeReady(COVER, { childFull: 'Amara Sofia' }, page({})), {});
});

test('only the boxes whose answer is simply what is in them are read', () => {
  // a list of rows, an upload, a set of ticks, the pull-up date and time:
  // none of them takes a stray keystroke, and none keeps its answer in a
  // single `value`, so reading one back would be guessing
  for (const type of ['list', 'image', 'audio', 'checks', 'date', 'time', 'toggle', 'swatches', 'offset']) {
    assert.ok(!TYPED_IN.has(type), `${type} is not read back off the page`);
  }
  const fields = [{ key: 'gallery', type: 'list' }, { key: 'coverPhoto', type: 'image' }];
  assert.deepEqual(
    typedBeforeReady(fields, { gallery: [], coverPhoto: '' }, page({ 'f-gallery': 'something', 'f-coverPhoto': 'else' })),
    {},
  );
});
