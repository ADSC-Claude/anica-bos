/**
 * Opening the book: the rest of the wishes, for a guest who wants to read them.
 *
 * "Can it show there when theres a message atleast they can read the messages"
 *
 * The wall holds three so the page keeps moving, and said "and 2 more in the
 * book" underneath. True, and useless to the guest reading it: the other two
 * lived only in the couple's dashboard. So the line became a door.
 *
 * The thing that can go quietly wrong is not the door — it is the arithmetic
 * behind it. The wall is server-rendered; the book is fetched on the tap; and
 * a reception writes in bursts, so between those two moments the book gets
 * longer. Anything that works by position is wrong by one from then on, which
 * reads as somebody's lola's message repeated while somebody else's is gone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { restOfBook, SHOW_MESSAGES } from '../src/lib/showlist';
import { t } from '../src/lib/copy';

const wish = (id: string) => ({ id, name: `Ninang ${id}`, message: `wish ${id}` });

test('the rest of the book is everything not already on the wall', () => {
  const book = [wish('e'), wish('d'), wish('c'), wish('b'), wish('a')];
  const wall = ['e', 'd', 'c'];
  assert.deepEqual(
    restOfBook(book, wall).map((w) => w.id),
    ['b', 'a'],
  );
});

test('a wish written between the render and the tap does not shift anybody', () => {
  // The wall was drawn with e, d, c on it. Then 'f' arrives, so the book
  // comes back one longer and newest-first: f, e, d, c, b, a.
  const wall = ['e', 'd', 'c'];
  const book = [wish('f'), wish('e'), wish('d'), wish('c'), wish('b'), wish('a')];
  const rest = restOfBook(book, wall).map((w) => w.id);
  // The newcomer is offered, the three on the wall are not repeated, and
  // nothing has been skipped. Dropping the first three would have given
  // c, b, a — repeating c and losing f.
  assert.deepEqual(rest, ['f', 'b', 'a']);
  const shown = [...wall, ...rest];
  assert.equal(new Set(shown).size, shown.length, 'nobody appears twice');
  assert.equal(shown.length, book.length, 'nobody is missing');
});

test('a book no longer than the wall adds nothing', () => {
  const book = [wish('c'), wish('b'), wish('a')];
  assert.deepEqual(restOfBook(book, ['c', 'b', 'a']), []);
});

test('an empty wall takes the whole book', () => {
  const book = [wish('b'), wish('a')];
  assert.equal(restOfBook(book, []).length, 2);
});

test('the door only appears once the wall is full', () => {
  // The renderer asks for it on `more > 0`, and `more` can only exceed zero
  // once the fetch hit its cap — which is the same rule keptCounts uses to
  // decide whether counting is worth a query at all.
  assert.equal(SHOW_MESSAGES, 3);
});

test('every word of the door is written in both languages', () => {
  for (const key of ['guestbook.openBook', 'guestbook.closeBook', 'guestbook.opening', 'guestbook.bookFailed'] as const) {
    for (const lang of ['en', 'tl'] as const) {
      const line = t(lang, key, { n: 5 });
      assert.ok(line.length > 0, `${key} in ${lang}`);
      assert.ok(!line.includes('{n}'), `${key} in ${lang} filled its count in`);
    }
  }
  // The count is the whole book, not the remainder: a guest reading "Read all
  // 5" and finding five is right; "Read all 2" and finding five is not.
  assert.match(t('en', 'guestbook.openBook', { n: 5 }), /\b5\b/);
});
