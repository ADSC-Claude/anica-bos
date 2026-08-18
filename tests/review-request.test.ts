/**
 * When a guest is asked for a review, and — mostly — when she is not.
 *
 * This is the only message the system sends that nobody asked for, so the
 * interesting cases are all refusals. "It arrived twice" and "it arrived after
 * a no-show" are faults the customer notices before the spa does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequestReview } from '../src/lib/review-request';

const base = {
  status: 'COMPLETED',
  previousStatus: 'IN_SERVICE',
  enabled: true,
  googleUrl: 'https://g.page/anica',
  email: 'guest@example.com',
};

test('a finished visit earns the request', () => {
  assert.equal(shouldRequestReview(base), true);
});

test('nothing is sent until the Owner switches it on', () => {
  assert.equal(shouldRequestReview({ ...base, enabled: false }), false);
});

test('without a listing link there is nowhere to send them', () => {
  assert.equal(shouldRequestReview({ ...base, googleUrl: '' }), false);
  assert.equal(shouldRequestReview({ ...base, googleUrl: '   ' }), false);
});

test('a guest with no email on file is left alone', () => {
  assert.equal(shouldRequestReview({ ...base, email: null }), false);
  assert.equal(shouldRequestReview({ ...base, email: '' }), false);
  assert.equal(shouldRequestReview({ ...base, email: undefined }), false);
});

test('re-saving a completed appointment does not send a second one', () => {
  // Correcting a note an hour after the visit is an ordinary thing to do, and
  // it must not thank the guest again.
  assert.equal(shouldRequestReview({ ...base, previousStatus: 'COMPLETED' }), false);
});

test('a visit that did not happen is never asked about', () => {
  for (const status of ['NO_SHOW', 'CANCELLED', 'CHECKED_IN', 'IN_SERVICE', 'PENDING']) {
    assert.equal(
      shouldRequestReview({ ...base, status }),
      false,
      `${status} should not trigger a review request`,
    );
  }
});
