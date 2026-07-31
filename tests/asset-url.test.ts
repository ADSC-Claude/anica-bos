/**
 * A file whose name never changes, but whose contents do.
 *
 * `/logo.png` and `/hero.mp4` are fixed paths the owner overwrites. Browsers
 * and the CDN keep serving what they already hold, so a replaced logo appears
 * only to people who never saw the old one — which is exactly how it was
 * reported: right in the system, wrong on the website.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl } from '../src/lib/asset-url';

const saved = process.env.VERCEL_DEPLOYMENT_ID;
before(() => { process.env.VERCEL_DEPLOYMENT_ID = 'dpl_abc123'; });
after(() => {
  if (saved === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
  else process.env.VERCEL_DEPLOYMENT_ID = saved;
});

test('an uploaded file gets the deployment stamped on it', () => {
  assert.equal(assetUrl('/logo.png'), '/logo.png?v=dpl_abc123');
  assert.equal(assetUrl('/hero.mp4'), '/hero.mp4?v=dpl_abc123');
});

test('the video test still recognises a stamped file', () => {
  // The extension is no longer last, so a regex anchored on the end of the
  // string would quietly start rendering every video as a photo.
  const isVideo = (s: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(s);
  assert.ok(isVideo(assetUrl('/hero.mp4')));
  assert.ok(isVideo(assetUrl('/hero.MOV')));
  assert.ok(!isVideo(assetUrl('/hero.jpg')));
});

test('somebody else’s URL is left alone', () => {
  // A signed link can carry its own query, and appending to it breaks the
  // signature. Their server, their caching.
  const remote = 'https://cdn.example.com/logo.png';
  assert.equal(assetUrl(remote), remote);
  const signed = 'https://cdn.example.com/logo.png?token=abc';
  assert.equal(assetUrl(signed), signed);
});

test('a path that already carries a query is not double-stamped', () => {
  assert.equal(assetUrl('/logo.png?x=1'), '/logo.png?x=1');
});

test('blank stays blank, so the fallback mark still shows', () => {
  assert.equal(assetUrl(''), '');
  assert.equal(assetUrl('   '), '');
  assert.equal(assetUrl(undefined), '');
});

test('with no deployment id it degrades rather than breaking', () => {
  delete process.env.VERCEL_DEPLOYMENT_ID;
  const saved2 = process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    assert.equal(assetUrl('/logo.png'), '/logo.png?v=dev');
  } finally {
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_abc123';
    if (saved2 !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = saved2;
  }
});
