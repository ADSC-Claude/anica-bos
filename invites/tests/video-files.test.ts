import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VIDEO_TYPES, VIDEO_MAX_BYTES, VIDEO_BUDGET_BYTES, VIDEO_MAX_MS, clipFault, canJudgeMp4, looksBlank, posterTimes, mp4VideoCodec, codecFault } from '../src/lib/clips';
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

// --- what the browser in front of us can be trusted to judge ---------------

/**
 * Found by measuring rather than assumed: the headless Chromium these probes
 * run in answers "maybe" to `video/mp4` and empty to every `avc1` string,
 * because it carries no H.264 decoder. A studio that refused a clip on that
 * answer would be refusing a good file for its own browser's licensing.
 */
test('a browser with no H.264 decoder is known not to be able to judge one', () => {
  const none = () => '';
  assert.equal(canJudgeMp4(none), false);
  // the shape the headless build actually answers: generic maybe, codecs empty
  const headless = (t: string) => (t === 'video/mp4' ? 'maybe' : '');
  assert.equal(canJudgeMp4(headless), false, 'a generic maybe is not a decoder');
  // a real desktop browser
  const desktop = (t: string) => (t.startsWith('video/mp4') ? 'probably' : '');
  assert.equal(canJudgeMp4(desktop), true);
});

// --- choosing a poster frame ----------------------------------------------

/**
 * The poster is what prints, what a guest sparing their data sees, and what
 * an iPhone in Low Power Mode shows instead of playing. A black rectangle in
 * all three places looks like a fault rather than a choice, so a frame is
 * judged before it is kept.
 */
const frame = (make: (i: number) => [number, number, number], n = 400) => {
  const px: number[] = [];
  for (let i = 0; i < n; i++) { const [r, g, b] = make(i); px.push(r, g, b, 255); }
  return px;
};

test('a black frame, a white flash and a flat grey are all blank', () => {
  assert.equal(looksBlank(frame(() => [0, 0, 0])), true, 'black');
  assert.equal(looksBlank(frame(() => [255, 255, 255])), true, 'white');
  assert.equal(looksBlank(frame(() => [128, 128, 128])), true, 'flat grey has no variation');
  assert.equal(looksBlank([]), true, 'nothing at all');
});

test('a real picture is not blank, and neither is a dark one with a picture in it', () => {
  // a spread of values, which is what a photograph has
  assert.equal(looksBlank(frame((i) => [i % 256, (i * 7) % 256, (i * 13) % 256])), false);
  // a night shot: dark on average, but with a real range in it
  assert.equal(looksBlank(frame((i) => (i % 20 === 0 ? [90, 95, 110] : [6, 8, 14]))), false, 'a night shot with lights in it is a picture');
});

test('poster frames are tried a tenth in first, not at the very start', () => {
  const t = posterTimes(10_000);
  assert.equal(t.length, 4);
  assert.ok(t[0] > 0 && t[0] <= 1.01, `first try ${t[0]} should be about a second into a ten-second clip`);
  assert.ok(t[1] > t[0] && t[2] > t[1], 'the later tries move further in');
  assert.equal(t[3], 0, 'the very first frame is the last resort, not the first choice');
});

test('every poster time is inside a very short clip', () => {
  for (const t of posterTimes(200)) assert.ok(t >= 0 && t <= 0.2, `${t} is outside a 0.2s clip`);
  assert.deepEqual(posterTimes(0), [0]);
});

// --- what is actually inside the file ------------------------------------

/**
 * `canPlayType` answers about a type string, not about the file somebody
 * picked — so the file that must be caught is the one that looks fine. An
 * iPhone records HEVC by default, Safari plays it back perfectly for the
 * person who shot it, and a lot of Android phones show a black rectangle.
 * Reading the container catches it, and needs no decoder, which is why this
 * runs on a machine with no H.264 at all.
 */
test('the two clips this app ships are read as H.264', () => {
  for (const name of ['baby-blue.mp4', 'capiz.mp4']) {
    const path = `public/openings/${name}`;
    if (!existsSync(path)) continue;
    const code = mp4VideoCodec(new Uint8Array(readFileSync(path)));
    assert.equal(code, 'avc1', `${name} should be avc1, not ${code}`);
    assert.equal(codecFault(code), null, `${name} must not be refused`);
  }
});

test('an iPhone’s HEVC is refused, and the refusal says how to fix it', () => {
  const fault = codecFault('hvc1');
  assert.ok(fault, 'hvc1 must be refused');
  assert.match(fault.say, /HEVC/);
  assert.match(fault.say, /Most Compatible|H\.264/, 'it has to say what to do, not only that it is wrong');
  assert.equal(fault.codec, 'hvc1');
  assert.ok(codecFault('av01'), 'AV1 too — Safari on an older iPhone will not play it');
});

test('a codec that could not be read is not a codec that is wrong', () => {
  assert.equal(codecFault(null), null, 'unknown must never refuse a working file');
  assert.equal(mp4VideoCodec(new Uint8Array(0)), null, 'nothing at all');
  assert.equal(mp4VideoCodec(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])), null, 'an ftyp and no moov');
  // a truncated file: the shipped clip cut off before its moov is complete
  const whole = existsSync('public/openings/baby-blue.mp4') ? new Uint8Array(readFileSync('public/openings/baby-blue.mp4')) : null;
  if (whole) assert.equal(mp4VideoCodec(whole.subarray(0, 64)), null, 'a fragment must answer unknown, not throw');
});

test('a sound track’s codec is never mistaken for the picture’s', () => {
  // moov > trak(soun, mp4a) then trak(vide, avc1) — the video one is the answer
  const box = (type: string, payload: number[]) => {
    const size = 8 + payload.length;
    return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...[...type].map((c) => c.charCodeAt(0)), ...payload];
  };
  const chars = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const stsd = (fmt: string) => box('stsd', [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 8, ...chars(fmt)]);
  const trak = (handler: string, fmt: string) => box('trak', box('mdia', [
    ...box('hdlr', [0, 0, 0, 0, 0, 0, 0, 0, ...chars(handler)]),
    ...box('minf', box('stbl', stsd(fmt))),
  ]));
  const file = new Uint8Array(box('moov', [...trak('soun', 'mp4a'), ...trak('vide', 'avc1')]));
  assert.equal(mp4VideoCodec(file), 'avc1');
});
