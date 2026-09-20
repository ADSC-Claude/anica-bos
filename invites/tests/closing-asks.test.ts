/**
 * The closing part asks only what the closing page can print.
 *
 * "where does the 'A dedication to the child' goes in the closing?"
 *
 * Nowhere. She had written one, and no page, no print view and no design
 * read it back: `closing.dedication` was asked for, given examples and a
 * character cap, and bound to nothing anywhere in the app. Three of its
 * neighbours were in the same state — the closing photo, the parents'
 * message and the debutante's note.
 *
 * Her closing page is drawn: a heading, the message, the signature, the
 * child's name, the date and the hashtag, on a page not much taller than
 * half its width. There is no room on it for a paragraph, and inventing
 * some is a design change, not a form change. So the question goes, by the
 * rule she had already asked for and which had not reached these fields:
 * "it should detect only whats the template is needing and it should vary
 * per template right?"
 *
 * `ifDrawn` is that rule. It only ever takes a box away, and only from a
 * design that has drawn its pages and bound no element to that box — so a
 * design that prints its closing part whole, and a design nobody has drawn
 * yet, keep every one of these exactly as they were.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldsFor } from '../src/lib/sections';
import { designForm, designMedia } from '../src/lib/asks';
import { builtinDesign } from '../src/lib/design';

/** the four that had no place on a drawn closing page */
const HOMELESS = ['photo', 'parentsMessage', 'dedication', 'debutNote'];

const keys = (occasion: Parameters<typeof fieldsFor>[1], design?: string) => {
  const fields = fieldsFor('closing', occasion);
  const form = designForm(design ? builtinDesign(design) : null, occasion);
  return designMedia(fields, 'closing', form).map((f) => f.key);
};

test('the christening does not ask for words its closing page cannot print', () => {
  const asked = keys('CHRISTENING', 'christening');
  for (const key of HOMELESS) {
    assert.equal(asked.includes(key), false, `closing.${key} has nowhere to go on this design`);
  }
  // and the two it does print are still asked for, or the page goes blank
  assert.ok(asked.includes('message'), 'the closing message is drawn, so it is still asked');
  assert.ok(asked.includes('signature'), 'and the signature');
});

test('a design nobody has drawn yet keeps the form it always had', () => {
  /*
   * The contract that makes this safe: `ifDrawn` reads a design's own
   * bindings, and a design with none has not been drawn rather than been
   * found to have no room. Taking boxes away from those would empty the
   * form of every template that has no document.
   */
  const asked = keys('CHRISTENING');
  for (const key of HOMELESS.filter((k) => k !== 'debutNote')) {
    assert.ok(asked.includes(key), `closing.${key} is still asked where no design has spoken`);
  }
});

test('the question is still put where the occasion has always put it', () => {
  // the dedication belongs to the occasions that celebrate one child, and
  // the debutante's note to a debut; that has not changed, only where a
  // drawn design can take it away
  assert.ok(keys('CHRISTENING').includes('dedication'));
  assert.ok(keys('COMMUNION').includes('dedication'));
  assert.equal(keys('WEDDING').includes('dedication'), false, 'a wedding never had one');
  assert.ok(keys('DEBUT').includes('debutNote'));
  assert.equal(keys('DEBUT').includes('dedication'), false);
});
