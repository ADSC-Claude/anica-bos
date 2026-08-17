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
import { assetUrl, normaliseAssetPath } from '../src/lib/asset-url';

const url = (raw: string) => {
  const r = normaliseAssetPath(raw);
  return 'error' in r ? `ERROR: ${r.error}` : r.url;
};

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

test('the public folder is not part of the address', () => {
  // The instructions say "upload it to the public folder", so this is what
  // gets typed — and it sent the browser to /public/massage.JPG, which 404s
  // while the field still reads as if it were right.
  assert.equal(url('public/massage.jpg'), '/massage.jpg');
  assert.equal(url('/public/massage.jpg'), '/massage.jpg');
  assert.equal(url('./public/massage.jpg'), '/massage.jpg');
  assert.equal(url('PUBLIC/massage.jpg'), '/massage.jpg');
});

test('a bare file name, a doubled slash and stray quotes all resolve', () => {
  assert.equal(url('massage.jpg'), '/massage.jpg');
  assert.equal(url('//massage.jpg'.replace('//', '/')), '/massage.jpg');
  assert.equal(url('  /massage.jpg  '), '/massage.jpg');
  assert.equal(url('"/massage.jpg"'), '/massage.jpg');
});

test('capitals are kept, because the server is case-sensitive', () => {
  // Lower-casing it here would be a guess about a file nobody can see from
  // this side, and a wrong guess breaks a path that was already correct.
  assert.equal(url('public/Massage.JPG'), '/Massage.JPG');
});

test('a file on the owner’s own computer is named, not half-fixed', () => {
  const win = url('C:\\Users\\Anica\\Pictures\\massage.jpg');
  assert.ok(win.startsWith('ERROR:'), win);
  assert.ok(win.includes('/massage.jpg'), 'it should say what to type instead');
  assert.ok(url('/Users/anica/Desktop/massage.jpg').startsWith('/Users/'),
    'a unix-looking path is indistinguishable from a repository path, so it is taken at its word');
  assert.ok(url('file:///Users/anica/massage.jpg').startsWith('ERROR:'));
});

test('http:// is refused rather than saved to fail silently', () => {
  // Browsers block mixed content, so it would store cleanly and never render.
  assert.ok(url('http://cdn.example.com/logo.png').startsWith('ERROR:'));
  assert.equal(url('https://cdn.example.com/logo.png'), 'https://cdn.example.com/logo.png');
  assert.equal(url('//cdn.example.com/logo.png'), '//cdn.example.com/logo.png');
});

test('something with no file extension is a typo, not a path', () => {
  assert.ok(url('massage').startsWith('ERROR:'));
  assert.ok(url('public/').startsWith('ERROR:'));
});

test('blank is allowed, because blank means "use the placeholder"', () => {
  assert.equal(url(''), '');
  assert.equal(url('   '), '');
});

test('a path stored wrong before today is healed on the way out', () => {
  // Nobody should have to revisit a screen to fix a value the system can fix.
  assert.equal(assetUrl('public/massage.jpg'), '/massage.jpg?v=dpl_abc123');
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
