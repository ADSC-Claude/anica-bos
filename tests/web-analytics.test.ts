/**
 * Reading somebody else's API without trusting it.
 *
 * The network cannot be reached from development, so the live call is the one
 * thing these tests cannot cover. What they can cover is everything that
 * happens to the reply once it arrives — and that is where the risk actually
 * sits, because a shape this code guessed wrong must degrade to "unavailable"
 * on a dashboard rather than throw on the page that also shows today's takings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCount, readTopPages, dayKey } from '../src/lib/web-analytics-shape';

/** The shape Vercel's documentation shows for visits/count. */
const countReply = {
  version: 1,
  query: { filter: "requestPath eq '/'" },
  data: { pageviews: 1250, visitors: 980 },
};

test('a documented count reply is read', () => {
  assert.deepEqual(readCount(countReply), { visitors: 980, pageviews: 1250 });
});

test('anything unrecognised is null, never a guess', () => {
  // Each of these is a plausible way for the API to change under us, and all
  // of them must end at the card saying "unavailable".
  assert.equal(readCount(null), null);
  assert.equal(readCount('nope'), null);
  assert.equal(readCount({}), null, 'no data key');
  assert.equal(readCount({ data: null }), null);
  assert.equal(readCount({ data: {} }), null, 'no figures');
  assert.equal(readCount({ data: { visitors: '980', pageviews: 1250 } }), null, 'a string count');
  assert.equal(readCount({ data: { visitors: 980 } }), null, 'half a reply');
  assert.equal(readCount({ data: { visitors: NaN, pageviews: 1 } }), null);
});

test('a negative count is floored rather than shown', () => {
  // Not expected, but a dashboard reading "-3 visitors" would be worse than
  // one reading zero.
  assert.deepEqual(readCount({ data: { visitors: -3, pageviews: -1 } }), {
    visitors: 0,
    pageviews: 0,
  });
});

test('top pages are read, sorted and trimmed', () => {
  const reply = {
    data: [
      { requestPath: '/book', pageviews: 40 },
      { requestPath: '/', pageviews: 120 },
      { requestPath: '/book/confirmation/[reference]', pageviews: 12 },
    ],
  };
  assert.deepEqual(readTopPages(reply, 2), [
    { path: '/', pageviews: 120 },
    { path: '/book', pageviews: 40 },
  ]);
});

test('the row spelling is not assumed', () => {
  // The aggregate row shape is the least pinned-down part of this API, so
  // several plausible spellings of the same thing are accepted.
  assert.deepEqual(readTopPages({ data: [{ path: '/', views: 5 }] }), [{ path: '/', pageviews: 5 }]);
  assert.deepEqual(readTopPages({ data: [{ key: '/book', count: 7 }] }), [
    { path: '/book', pageviews: 7 },
  ]);
});

test('a row that makes no sense is dropped, not shown as zero', () => {
  const reply = {
    data: [
      { requestPath: '/', pageviews: 10 },
      { requestPath: '', pageviews: 99 },
      { requestPath: '/x' },
      { pageviews: 5 },
      'rubbish',
      null,
    ],
  };
  assert.deepEqual(readTopPages(reply), [{ path: '/', pageviews: 10 }]);
});

test('staff paths never appear, even if a stray row arrives', () => {
  // The tracker does not send these. A row from an older deployment must not
  // be presented as guests reading the appointment list.
  const reply = {
    data: [
      { requestPath: '/portal/appointments', pageviews: 500 },
      { requestPath: '/login', pageviews: 90 },
      { requestPath: '/', pageviews: 10 },
    ],
  };
  assert.deepEqual(readTopPages(reply), [{ path: '/', pageviews: 10 }]);
});

test('no rows is an empty list, not a failure', () => {
  // The card drops the section and still shows its totals.
  assert.deepEqual(readTopPages({ data: [] }), []);
  assert.deepEqual(readTopPages({}), []);
  assert.deepEqual(readTopPages(null), []);
});

test('the date format is the one the API asks for', () => {
  assert.equal(dayKey(new Date('2026-08-25T09:20:55Z')), '2026-08-25');
  assert.equal(dayKey(new Date('2026-01-05T23:59:59Z')), '2026-01-05');
});
