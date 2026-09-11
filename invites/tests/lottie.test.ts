import test from 'node:test';
import assert from 'node:assert/strict';
import { readLottie, zipLike, LOTTIE_MAX_BYTES, LOTTIE_PLAYER_BYTES } from '../src/lib/lottie';

/**
 * A Lottie is JSON, which has no magic bytes: the only way to know whether a
 * file is an animation is to read it. So every refusal here is a sentence
 * somebody will see, and each one names the button to press instead — the
 * person reading it has an export dialog open in another window.
 */
const ANIM = {
  v: '5.7.4', fr: 30, ip: 0, op: 60, w: 100, h: 100, nm: 'probe', ddd: 0, assets: [],
  layers: [{ ddd: 0, ind: 1, ty: 4, nm: 'square', sr: 1, ip: 0, op: 60, st: 0, bm: 0, ao: 0, ks: {}, shapes: [] }],
};
const json = (o: unknown) => JSON.stringify(o);

test('a Lottie says its size, its frame rate and how long it runs', () => {
  const r = readLottie(json(ANIM));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.facts, { width: 100, height: 100, fps: 30, frames: 60, ms: 2000 });
});

test('what is refused, and what each refusal tells her to do', () => {
  const why = (o: unknown) => {
    const r = readLottie(typeof o === 'string' ? o : json(o));
    assert.equal(r.ok, false);
    return r.ok ? '' : r.why;
  };
  assert.match(why('not json at all'), /Lottie JSON/);
  assert.match(why([1, 2, 3]), /single object with layers/);
  assert.match(why({ ...ANIM, v: undefined }), /no Lottie version/);
  assert.match(why({ ...ANIM, fr: 0 }), /no frame rate/);
  assert.match(why({ ...ANIM, op: 0 }), /out point is zero/);
  assert.match(why({ ...ANIM, w: 0 }), /no size of its own/);
  assert.match(why({ ...ANIM, layers: [] }), /no layers/);
  // the one most people hit first: the export button that gives a bundle
  assert.match(why({ ...ANIM, layers: [] }), /\.lottie bundle/);
});

/**
 * A `.lottie` bundle is a zip, and so is an xlsx — which is what `sniff()`
 * reads it as. Without this check she would upload her animation and be told
 * it is not a spreadsheet.
 */
test('a zip is recognised before anything tries to parse it', () => {
  assert.equal(zipLike(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])), true);
  assert.equal(zipLike(new Uint8Array([0x7b, 0x22, 0x76, 0x22, 0, 0])), false, 'a JSON file is not a zip');
  assert.equal(zipLike(new Uint8Array([0x50, 0x4b])), false, 'and neither is two bytes');
});

test('the cap, and the player counted once', () => {
  assert.equal(LOTTIE_MAX_BYTES, 307200);
  assert.ok(LOTTIE_PLAYER_BYTES > LOTTIE_MAX_BYTES, 'the player weighs more than the animation it plays, which is why it is counted');
});
