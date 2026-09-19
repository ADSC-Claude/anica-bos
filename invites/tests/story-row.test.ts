/**
 * A milestone is a date, a title, a few words and a picture.
 *
 * Three faults and then a new drawing, in that order.
 *
 * The page had drawn a dated line above every milestone since it was built
 * and the christening form never asked for the date, so the line came out
 * empty on a page whose whole idea is a dated timeline ("why does our story
 * doesnt have dates"). The photographs hung opposite their own row, which
 * put each one in the *neighbouring* row's column and printed it over that
 * row's sentence ("the photo on the upper left is blocking the message").
 * And the words were too big for the clouds they were written on ("The fonts
 * for date and title is too big that the text doesnt fit the cloud").
 *
 * Then she redrew the page. "i removed the line in the middle for the our
 * story and replace it where the photos should go" — the spine and its four
 * dots are gone and a cream filmstrip with four portrait windows runs down
 * the middle instead, with her clouds alternating either side of it. "so now
 * the writings should fit perfectly in the clouds."
 *
 * So a milestone is no longer a stack: the photograph is in its window on
 * the strip, and the date, the title and the words are in the cloud beside
 * it. Every number below is measured off her own file — the windows, the
 * bands where the white actually runs, and the block's own height worked out
 * the way the page works it out.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldsFor, FIT, fitOf } from '../src/lib/sections';
import { CHRISTENING_PAGES, STORY_CLOUDS, STORY_BLOCK } from '../src/lib/christening';
import type { PhotoEl, TextEl } from '../src/lib/design';

const page = CHRISTENING_PAGES.find((p) => p.key === 'our-story')!;
const elements = page.elements ?? [];
const photos = elements.filter((e): e is PhotoEl => e.kind === 'photo');
const text = elements.filter((e): e is TextEl => e.kind === 'text');
/** a milestone is one box of three lines: the date, the title, the words */
const block = (i: number) => text.find((e) => e.id === `story-${i + 1}`)!;

test('the christening asks when a milestone happened, in the order the page prints', () => {
  for (const occasion of ['CHRISTENING', 'BABY_SHOWER', 'COMMUNION'] as const) {
    const row = fieldsFor('story', occasion).find((f) => f.key === 'timeline')!.item!;
    const keys = row.map((f) => f.key);
    assert.deepEqual(keys, ['date', 'title', 'text', 'photo'], `${occasion}: when, what, a few words, a picture`);
    assert.equal(row.find((f) => f.key === 'text')!.type, 'textarea', `${occasion}: a few words is more than a line`);
  }
});

test('every milestone the page draws has a date bound to it', () => {
  assert.equal(photos.length, 4, 'four windows on her filmstrip, four milestones');
  for (let i = 0; i < photos.length; i++) {
    assert.deepEqual(
      block(i).lines[0].sources[0],
      { bind: { section: 'story', field: 'timeline', index: i, sub: 'date' } },
      `milestone ${i + 1} draws its date`,
    );
  }
});

/**
 * The windows, measured off her file: every one x 40.93 – 59.44 and 14.11 of
 * the page tall, at four evenly spaced centres. They are all the same, which
 * is the point — one strip, four frames.
 */
test('each photograph sits in its own window on her filmstrip', () => {
  const centres = [35.76, 50.86, 65.96, 81.07];
  for (const [i, p] of photos.entries()) {
    assert.equal(p.bind && 'section' in p.bind ? p.bind.index : undefined, i, `picture ${i + 1} belongs to milestone ${i + 1}`);
    assert.equal(p.x, 50.19, `picture ${i + 1} is on the strip, which runs down the middle`);
    assert.equal(p.w, 18.52, `picture ${i + 1} is the width of her window`);
    assert.equal(p.y, centres[i], `picture ${i + 1} is in window ${i + 1}`);
    assert.equal(p.aspect, 1.355, `picture ${i + 1} is portrait, as she drew it`);
    // her cream strip is the frame; a frame of ours would sit a card inside hers
    assert.equal(p.frame, 'none', `picture ${i + 1} adds no frame of its own`);
  }
  // and no two share a window
  assert.equal(new Set(photos.map((p) => p.y)).size, 4);
});

/**
 * And the words are on the cloud beside that photograph — left, right, left,
 * right, so the page reads down in a zigzag.
 *
 * The block's height is worked out the way the page works it out, at every
 * cap at once: one line of date, two of title and five of description. A
 * shorter title simply leaves more cloud under it.
 */
test('a milestone is one block, left-aligned, in her script and her body face', () => {
  for (let i = 0; i < 4; i++) {
    const el = block(i);
    assert.equal(el.lines.length, 3, `milestone ${i + 1} is the date, the title and the words in one box`);
    for (const l of el.lines) assert.equal(l.align, 'left', `milestone ${i + 1} starts every line at the same left edge`);
    assert.equal(el.lines[0].face, 'script', 'the date is her script');
    assert.equal(el.lines[1].face, undefined, 'and the title takes the box’s own face');
    assert.equal(el.lines[1].caps, true, 'the title is set in capitals, as she drew it');
  }
});

test('each milestone is written on the cloud beside its own photograph', () => {
  const sides = STORY_CLOUDS.map((c) => (c.left < 50 ? 'left' : 'right'));
  assert.deepEqual(sides, ['left', 'right', 'left', 'right'], 'the clouds alternate, as she drew them');

  for (const [i, cloud] of STORY_CLOUDS.entries()) {
    const height = cloud.foot - cloud.top;
    assert.ok(STORY_BLOCK <= height,
      `milestone ${i + 1} is ${STORY_BLOCK.toFixed(2)}% of the page and its cloud holds ${height.toFixed(2)}`);

    // written down the middle of its own cloud, and inside its white
    const cx = (cloud.left + cloud.right) / 2;
    const el = block(i);
    assert.equal(el.x, Math.round(cx * 100) / 100, `${el.id} sits on the middle of its cloud`);
    assert.ok(el.x! - el.w! / 2 >= cloud.left, `${el.id} keeps its left edge on the white`);
    assert.ok(el.x! + el.w! / 2 <= cloud.right, `${el.id} keeps its right edge on the white`);

    /*
     * And it is hung by its middle on the cloud's middle, so it is centred
     * there whether it holds four words or a hundred and seventy letters —
     * "even if they are short or long". A box hung by a baseline could not
     * be: it would start where it was put and grow downwards.
     */
    assert.equal(el.anchor, 'centre', `milestone ${i + 1} is hung by its middle`);
    assert.equal(el.y, Math.round(((cloud.top + cloud.foot) / 2) * 100) / 100,
      `milestone ${i + 1} is centred on its cloud`);
  }
});

/**
 * The form lets in exactly what the cloud holds.
 *
 * Up from 130: the old clouds were sixteen per cent of the page tall and
 * thirty wide, and these are eighteen to twenty by thirty-nine. That is five
 * lines of this column instead of four, and a line takes about thirty-four
 * letters — which is what finally fits the hundred-and-fifty to
 * hundred-and-seventy letter paragraphs her client writes.
 */
test('the form lets in exactly what the cloud holds', () => {
  assert.equal(FIT['story.timeline.text'], 170, 'five lines of this column');
  assert.equal(FIT['story.timeline.date'], 18, 'one line of the date, so it can never wrap onto the title');
  assert.equal(fitOf('story.timeline.text', 'textarea'), 170, 'and the form counts it down from there');
  // the design never lets in more than the form does, or the page would take
  // words the box refused
  const lines = block(0).lines;
  const words = lines.find((l) => l.room && l.room > 50)!;
  assert.ok(words.room! >= FIT['story.timeline.text'], 'the drawn box holds at least what the form accepts');
  assert.ok(lines[0].room! <= FIT['story.timeline.date'], 'and the date line is no more generous than the form');
});

/**
 * The title and the line under it, on the plate she drew.
 *
 * "Our Story should be there, the writings below it should be place there,
 * then the Our story is white font at the top of it. check our previous
 * look." The previous look set both in white, because the artwork behind
 * them then was a blue banner. The page she redrew has a tan plate — a flat
 * #E7B181 from 16.15% to 19.27% of the page, centred on x 50.19 — and the
 * title goes on it in white, the way she asked, with her line brought up to
 * the plate's foot instead of floating three per cent below it in open sky.
 */
test('the title is white on her plate and the line sits under it', () => {
  const head = text.find((e) => e.id === 'story-head')!;
  const line = text.find((e) => e.id === 'story-line')!;
  const PLATE = { top: 16.15, foot: 19.27, cx: 50.19 };

  assert.equal(head.lines[0].color, 'surface', 'the title is white, as she asked');
  assert.equal(head.x, PLATE.cx, 'and centred on the plate, which is not centred on the page');
  // the box the capitals are set in, head to foot, against the plate's own.
  // Both boxes set a size of their own rather than taking the role's.
  const capsSize = head.lines[0].size!;
  const lineSize = line.lines[0].size!;
  assert.ok(capsSize > 0 && lineSize > 0, 'both are set at a size of their own');
  const foot = head.y! + (capsSize * 1.25) / 1.7778;
  assert.ok(head.y! >= PLATE.top - 0.6 && foot <= PLATE.foot + 0.6,
    `the title runs ${head.y!.toFixed(2)}–${foot.toFixed(2)} and the plate ${PLATE.top}–${PLATE.foot}`);

  // and the line is up against the plate, not adrift under it
  assert.equal(line.x, PLATE.cx, 'the line hangs from the same centre as the title');
  const gap = line.y! - PLATE.foot;
  assert.ok(gap > 0.4, 'the line clears the plate');
  assert.ok(gap < 1.8, `the line is ${gap.toFixed(2)}% below the plate, so the two read as one title`);
  // it must still clear the first milestone's cloud
  assert.ok(line.y! + (lineSize * 1.25 * 2) / 1.7778 < STORY_CLOUDS[0]!.top,
    'even wrapped to two lines it stays off the first cloud');
});
