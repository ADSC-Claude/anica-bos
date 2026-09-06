import test from 'node:test';
import assert from 'node:assert/strict';
import { imageUrl, IMAGE } from '../src/lib/images';

const PUBLIC = 'https://zcfthckulddkolhufstm.supabase.co/storage/v1/object/public/invites-public/guest/abc/photo.jpg';

function withSwitch<T>(value: string | undefined, fn: () => T): T {
  const before = process.env.SUPABASE_IMAGE_TRANSFORM;
  try {
    if (value === undefined) delete process.env.SUPABASE_IMAGE_TRANSFORM;
    else process.env.SUPABASE_IMAGE_TRANSFORM = value;
    return fn();
  } finally {
    if (before === undefined) delete process.env.SUPABASE_IMAGE_TRANSFORM;
    else process.env.SUPABASE_IMAGE_TRANSFORM = before;
  }
}

test('a Supabase public object is served through the transformation endpoint', () => {
  const url = new URL(withSwitch(undefined, () => imageUrl(PUBLIC, { width: 800 })));
  assert.ok(url.pathname.startsWith('/storage/v1/render/image/public/'), url.pathname);
  assert.ok(!url.pathname.includes('/object/public/'), 'the object path is replaced, not appended');
  assert.equal(url.searchParams.get('width'), '800');
  assert.equal(url.searchParams.get('quality'), '75');
  assert.ok(url.pathname.endsWith('/invites-public/guest/abc/photo.jpg'), 'the object path survives');
});

// Getting any of these wrong shows up as a broken image, not a slow one.
test('anything that is not a Supabase public object is handed back untouched', () => {
  for (const src of [
    '/uploads/inv/abc/photo.jpg',                      // the development fallback
    'https://picsum.photos/seed/x/900/900',            // seeded placeholders
    'https://example.com/someone-elses-photo.jpg',     // pasted by a customer
    'data:image/png;base64,iVBORw0KGgo=',              // inline
    'not a url at all',
    '',
  ]) {
    assert.equal(withSwitch(undefined, () => imageUrl(src, { width: 800 })), src, src);
  }
  assert.equal(imageUrl(null, { width: 800 }), '');
  assert.equal(imageUrl(undefined, { width: 800 }), '');
});

test('a signed private URL is left alone — its transform would have to be signed too', () => {
  const signed = 'https://zcfthckulddkolhufstm.supabase.co/storage/v1/object/sign/invites-private/proof.jpg?token=abc';
  assert.equal(withSwitch(undefined, () => imageUrl(signed, { width: 400 })), signed);
});

test('the kill switch returns the original, so losing the feature is not broken images', () => {
  assert.equal(withSwitch('off', () => imageUrl(PUBLIC, { width: 800 })), PUBLIC);
  assert.equal(withSwitch('OFF', () => imageUrl(PUBLIC, { width: 800 })), PUBLIC);
  assert.notEqual(withSwitch('on', () => imageUrl(PUBLIC, { width: 800 })), PUBLIC);
});

test('dimensions are clamped to what the endpoint accepts', () => {
  const big = new URL(withSwitch(undefined, () => imageUrl(PUBLIC, { width: 99999 })));
  assert.equal(big.searchParams.get('width'), '2500');
  const small = new URL(withSwitch(undefined, () => imageUrl(PUBLIC, { width: 0 })));
  assert.equal(small.searchParams.get('width'), '1');
  const q = new URL(withSwitch(undefined, () => imageUrl(PUBLIC, { width: 800, quality: 5 })));
  assert.equal(q.searchParams.get('quality'), '20');
});

test('every named size is within the endpoint bounds', () => {
  for (const [name, opts] of Object.entries(IMAGE)) {
    assert.ok(opts.width >= 1 && opts.width <= 2500, `${name} width ${opts.width}`);
    const url = new URL(withSwitch(undefined, () => imageUrl(PUBLIC, opts)));
    assert.equal(url.searchParams.get('width'), String(opts.width), name);
  }
});

test('calling twice does not double-rewrite', () => {
  const once = withSwitch(undefined, () => imageUrl(PUBLIC, { width: 800 }));
  const twice = withSwitch(undefined, () => imageUrl(once, { width: 800 }));
  assert.equal(twice, once, 'already-transformed URLs pass through');
});
