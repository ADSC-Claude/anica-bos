import test from 'node:test';
import assert from 'node:assert/strict';
import { withDraft } from '../src/lib/studio-draft';

/**
 * The part being typed, laid over what the canvas already has: only for the
 * invitation the canvas is showing, only that part, and never written back.
 */
const base = { cover: { brideFirst: 'Maria', groomFirst: 'Juan' }, story: { line: 'A little prayer, answered' } };

test('no draft, or a draft of another invitation, is the content as it was', () => {
  assert.equal(withDraft(base, null, 'demo'), base);
  assert.equal(withDraft(base, { id: 'inv2', section: 'cover', data: { brideFirst: 'Ana' } }, 'demo'), base);
  // nothing shown at all — a made-up sample — takes no draft either
  assert.equal(withDraft(base, { id: 'demo', section: 'cover', data: { brideFirst: 'Ana' } }, ''), base);
});

test('the draft replaces its own part and leaves the rest alone', () => {
  const got = withDraft(base, { id: 'demo', section: 'cover', data: { brideFirst: 'Ana' } }, 'demo');
  assert.deepEqual(got, { cover: { brideFirst: 'Ana' }, story: base.story });
  assert.equal(got.story, base.story, 'the other parts are the same objects');
  // a whole replacement, not a merge: a box she has just emptied is empty on the page
  assert.equal((got.cover as Record<string, unknown>).groomFirst, undefined);
});

test('a part the content did not have yet is drawn from the draft, and the base is not touched', () => {
  const before = JSON.stringify(base);
  const got = withDraft(base, { id: 'demo', section: 'reception', data: { venue: 'The Manila Hotel' } }, 'demo');
  assert.deepEqual(got.reception, { venue: 'The Manila Hotel' });
  assert.equal(JSON.stringify(base), before);
});
