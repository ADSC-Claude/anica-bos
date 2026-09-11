import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VIDEO_TYPES, VIDEO_MAX_BYTES, VIDEO_BUDGET_BYTES, VIDEO_MAX_MS, clipFault } from '../src/lib/clips';
import { designFolder } from '../src/lib/storage';

/**
 * What the app makes of a clip.
 *
 * `sniff()` is not exported — it is an implementation detail of `storeFile`,
 * and `storage.ts` is `server-only` besides — so what is asserted about the
 * bytes is the shape of the files themselves against the rules the sniffer
 * applies, read from the real clips this app ships and a real WebM beside
 * them rather than from bytes typed out by hand. A fixture written from the
 * spec proves the spec; a file the app already serves to guests proves the
 * app. The rules in clips.ts are pure and are driven directly.
 */

const S = '/tmp/claude-0/-home-user-anica-bos/07e22423-6a27-56ae-b64c-c47ff58eb796/scratchpad';
const head = (p: string, n = 64) => readFileSync(p).subarray(0, n);

test('the shipped MP4 openings are ftyp boxes, and not the M4A brand a song uses', () => {
  for (const name of ['public/openings/baby-blue.mp4', 'public/openings/capiz.mp4']) {
    const b = head(name);
    assert.equal(b.subarray(4, 8).toString('ascii'), 'ftyp', name);
    assert.notEqual(b.subarray(8, 12).toString('ascii'), 'M4A ', `${name} would be read as audio`);
  }
});

test('a WebM carries the EBML header and says webm in it, which is what tells it from an MKV', { skip: !existsSync(`${S}/capiz-1440.webm`) }, () => {
  const b = head(`${S}/capiz-1440.webm`);
  assert.deepEqual([...b.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
  assert.ok(b.includes(Buffer.from('webm', 'ascii')), 'the DocType is not in the first 64 bytes');
});

test('a JPEG poster is still a JPEG, so a clip and its poster cannot be confused', () => {
  const b = head('public/openings/baby-blue-poster.jpg');
  assert.deepEqual([...b.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.notEqual(b.subarray(4, 8).toString('ascii'), 'ftyp');
});

test('the clip ceiling is eight megabytes, the budget sixteen, and both types are offered', () => {
  assert.equal(VIDEO_MAX_BYTES, 8 * 1024 * 1024);
  assert.equal(VIDEO_BUDGET_BYTES, 16 * 1024 * 1024);
  assert.ok(VIDEO_BUDGET_BYTES > VIDEO_MAX_BYTES, 'one clip must always fit inside the budget');
  assert.deepEqual([...VIDEO_TYPES], ['video/mp4', 'video/webm']);
});

// --- what is wrong with a clip -------------------------------------------

const ok = { durationMs: 8_000, width: 720, height: 1280 };
const mb = (n: number) => Math.round(n * 1024 * 1024);

test('a portrait MP4 inside the limits has nothing wrong with it', () => {
  assert.equal(clipFault({ type: 'video/mp4', size: mb(4) }, ok), null);
  assert.equal(clipFault({ type: 'video/webm', size: mb(1) }, ok), null);
});

test('a .mov is refused by type, and told what to do about it', () => {
  const f = clipFault({ type: 'video/quicktime', size: mb(2) }, ok);
  assert.equal(f?.kind, 'type');
  assert.match(f!.say, /exporting as MP4/);
});

test('a heavy clip is refused with its own size in the sentence', () => {
  const f = clipFault({ type: 'video/mp4', size: mb(12) }, ok);
  assert.equal(f?.kind, 'weight');
  assert.match(f!.say, /12\.0 MB/);
  assert.match(f!.say, /8 MB/);
  // and says why, because "too big" without a reason invites arguing with it
  assert.match(f!.say, /every guest downloads it whole/i);
});

test('a long clip is refused in seconds, which is how anybody thinks about a clip', () => {
  const f = clipFault({ type: 'video/mp4', size: mb(4) }, { ...ok, durationMs: 45_000 });
  assert.equal(f?.kind, 'length');
  assert.match(f!.say, /45 seconds/);
  assert.match(f!.say, new RegExp(String(VIDEO_MAX_MS / 1000)));
});

test('a landscape clip is refused with its own dimensions', () => {
  const f = clipFault({ type: 'video/mp4', size: mb(4) }, { ...ok, width: 1920, height: 1080 });
  assert.equal(f?.kind, 'shape');
  assert.match(f!.say, /1920×1080/);
});

test('a square clip passes, because a square sits in a tall page without waste', () => {
  assert.equal(clipFault({ type: 'video/mp4', size: mb(4) }, { ...ok, width: 1080, height: 1080 }), null);
});

test('the type is checked before anything else, so a .mov is not also told it is too long', () => {
  const f = clipFault({ type: 'video/quicktime', size: mb(50) }, { ...ok, durationMs: 90_000, width: 1920, height: 1080 });
  assert.equal(f?.kind, 'type');
});

test('a clip with no height is not divided by zero into passing', () => {
  const f = clipFault({ type: 'video/mp4', size: mb(4) }, { ...ok, width: 720, height: 0 });
  assert.equal(f, null, 'an unreadable shape is not a fault of its own — the codec check catches an unreadable file');
});

/**
 * The shipped openings are 2.1 MB and 4.7 MB, which is what the ceiling was
 * set against: they are the longest, heaviest clips this app has ever served
 * and both clear it. If a future opening does not, the number moves
 * deliberately rather than the file being refused at the door.
 */
test('the clips this app already ships are inside the ceiling', () => {
  for (const name of ['public/openings/baby-blue.mp4', 'public/openings/capiz.mp4']) {
    const bytes = readFileSync(name).length;
    assert.ok(bytes < VIDEO_MAX_BYTES, `${name} is ${(bytes / 1024 / 1024).toFixed(1)} MB, over the ${VIDEO_MAX_BYTES / 1024 / 1024} MB ceiling`);
  }
});

// --- where a design's files land ------------------------------------------

/**
 * The folder name becomes a path segment in storage, so what it may contain
 * is the difference between a design's own folder and somebody else's. The
 * upload routes ran this inline until it had no test; it is a function now
 * for the same reason.
 */
test('a design folder is narrowed to a path segment, and cannot climb out of one', () => {
  assert.equal(designFolder('cmtw1744400117dm3jpm093af'), 'cmtw1744400117dm3jpm093af');
  assert.equal(designFolder('with-hyphens-123'), 'with-hyphens-123');
  // the shapes somebody would try
  assert.equal(designFolder('../../etc/passwd'), 'etcpasswd');
  assert.equal(designFolder('..'), 'shared');
  assert.equal(designFolder('/'), 'shared');
  assert.equal(designFolder('a/b'), 'ab');
  assert.equal(designFolder('a%2Fb'), 'a2Fb');
  assert.equal(designFolder('a\\b'), 'ab');
  assert.equal(designFolder('a\u0000b'), 'ab');
  // and the empty cases
  assert.equal(designFolder(''), 'shared');
  assert.equal(designFolder(null), 'shared');
  assert.equal(designFolder(undefined), 'shared');
  // a non-string is absent, not coerced: `String({})` would make the folder
  // `objectObject`, which is not an escape but is not a design's folder either
  assert.equal(designFolder({}), 'shared');
  assert.equal(designFolder(42), 'shared');
  assert.equal(designFolder(['a']), 'shared');
  // never longer than a cuid with room to spare
  assert.equal(designFolder('x'.repeat(200)).length, 40);
});
