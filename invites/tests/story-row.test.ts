/**
 * A milestone is a date, a title, a few words and a picture — stacked.
 *
 * Two faults, one shape. The page has drawn a dated line above every
 * milestone since it was built and the christening form never asked for the
 * date, so the line came out empty on a page whose whole idea is a dated
 * timeline ("why does our story doesnt have dates"). And the photographs hung
 * opposite their own row, which put each one in the *neighbouring* row's
 * column and printed it over that row's sentence ("the photo on the upper
 * left is blocking the message, i think we can just put it on the top of the
 * date").
 *
 * Stacking the picture above its own date fixes the second and pays for the
 * first: the row owns a clean band of its own column instead of four per cent
 * of one, which is four lines of description rather than none. Measured in a
 * browser at every cap at once — an eighteen-letter date, a twenty-eight
 * letter title and the full description — and again one line longer, which is
 * where it breaks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldsFor, FIT, fitOf } from '../src/lib/sections';
import { CHRISTENING_PAGES } from '../src/lib/christening';
import type { PhotoEl, TextEl } from '../src/lib/design';

const page = CHRISTENING_PAGES.find((p) => p.key === 'our-story')!;
const elements = page.elements ?? [];
const photos = elements.filter((e): e is PhotoEl => e.kind === 'photo');
const text = elements.filter((e): e is TextEl => e.kind === 'text');
const when = (i: number) => text.find((e) => e.id === `story-${i + 1}-when`)!;
const what = (i: number) => text.find((e) => e.id === `story-${i + 1}-what`)!;

test('the christening asks when a milestone happened, in the order the page prints', () => {
  for (const occasion of ['CHRISTENING', 'BABY_SHOWER', 'COMMUNION'] as const) {
    const row = fieldsFor('story', occasion).find((f) => f.key === 'timeline')!.item!;
    const keys = row.map((f) => f.key);
    assert.deepEqual(keys, ['date', 'title', 'text', 'photo'], `${occasion}: when, what, a few words, a picture`);
    assert.equal(row.find((f) => f.key === 'text')!.type, 'textarea', `${occasion}: a few words is more than a line`);
  }
});

test('every milestone the page draws has a date bound to it', () => {
  assert.equal(photos.length, 4, 'four dots on her spine, four milestones');
  for (let i = 0; i < photos.length; i++) {
    assert.deepEqual(
      when(i).lines[0].sources[0],
      { bind: { section: 'story', field: 'timeline', index: i, sub: 'date' } },
      `milestone ${i + 1} draws its date`,
    );
  }
});

test('a picture sits above its own date, never across the row above', () => {
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    assert.equal(p.bind && 'section' in p.bind ? p.bind.index : undefined, i, `picture ${i + 1} belongs to milestone ${i + 1}`);
    assert.ok(p.y < when(i).y, `picture ${i + 1} is above its own date`);
    // and its foot clears the date's cap rather than landing on it
    const foot = p.y + (p.w ?? 0) / 2 / 1.7778;
    assert.ok(foot < when(i).y, `picture ${i + 1} ends before its date begins`);
  }
  // the two rows that share a column do not reach into one another: a row's
  // words start at its date and the next picture in that column is the wall
  for (const [row, next] of [[0, 2], [1, 3]] as const) {
    const wall = photos[next]!.y - (photos[next]!.w ?? 0) / 2 / 1.7778;
    assert.ok(wall > when(row).y, `milestone ${row + 1} has a band of its own before milestone ${next + 1}'s picture`);
    /*
     * Fifteen per cent of the page's height is what a two-line title and
     * four lines of description take, measured in a browser with every cap
     * filled; one line more overran it, which is where 130 letters comes
     * from. Asserting the band rather than re-deriving the typography here:
     * the number that matters is the room, and the room is what moves when
     * the picture's size or the air above the date is nudged.
     */
    assert.ok(wall - when(row).y > 15, `milestone ${row + 1} holds a two-line title and four lines of words (${(wall - when(row).y).toFixed(2)}% of the page)`);
  }
});

test('the form lets in exactly what the row holds', () => {
  assert.equal(FIT['story.timeline.text'], 130, 'four lines of the column');
  assert.equal(FIT['story.timeline.date'], 18, 'one line of the date, so it can never wrap onto the title');
  assert.equal(fitOf('story.timeline.text', 'textarea'), 130, 'and the form counts it down from there');
  // the design never lets in more than the form does, or the page would take
  // words the box refused
  const words = what(0).lines.find((l) => l.room && l.room > 50)!;
  assert.ok(words.room! >= FIT['story.timeline.text'], 'the drawn box holds at least what the form accepts');
  assert.ok(when(0).room! <= FIT['story.timeline.date'], 'and the date box is no more generous than the form');
});
