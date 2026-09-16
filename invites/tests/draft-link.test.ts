import test from 'node:test';
import assert from 'node:assert/strict';

import { signDraftLink, readDraftLink, keyOpens, freshNonce } from '../src/lib/draft-link';

// the module reads the secret when it signs, not when it loads, so setting it
// here is in time for every call below
process.env.SESSION_SECRET ||= 'a-test-secret-at-least-thirty-two-characters-long';

const design = { id: 'tpl_1', shareNonce: 'nonce-one', demoSlug: 'lucas-andrei-christening' };

test('a key says one design and one secret, and survives the round trip', async () => {
  const key = await signDraftLink(design.id, design.shareNonce);
  assert.deepEqual(await readDraftLink(key), { templateId: design.id, nonce: design.shareNonce });
  // nothing else reads as a key
  assert.equal(await readDraftLink(''), null);
  assert.equal(await readDraftLink('not-a-key'), null);
  assert.equal(await readDraftLink(`${key}x`), null, 'a tampered key');
  const [h, p] = key.split('.');
  assert.equal(await readDraftLink(`${h}.${p}.`), null, 'a key with its signature cut off');
});

test('a key opens its own design on its own demo, and nothing else', async () => {
  const key = await readDraftLink(await signDraftLink(design.id, design.shareNonce));
  assert.equal(keyOpens(key, design, design.demoSlug), true);

  // somebody else's invitation on the same design: this is the one that matters
  assert.equal(keyOpens(key, design, 'juan-and-maria'), false);
  // another design
  assert.equal(keyOpens(key, { ...design, id: 'tpl_2' }, design.demoSlug), false);
  // Stop sharing, which is one new secret
  assert.equal(keyOpens(key, { ...design, shareNonce: freshNonce() }, design.demoSlug), false);
  // and never shared at all, so no key can be right
  assert.equal(keyOpens(key, { ...design, shareNonce: '' }, design.demoSlug), false);
  // no key
  assert.equal(keyOpens(null, design, design.demoSlug), false);
});

test('a key for one design does not read as a key for another', async () => {
  const mine = await readDraftLink(await signDraftLink('tpl_1', 'shared'));
  const theirs = await readDraftLink(await signDraftLink('tpl_2', 'shared'));
  assert.ok(mine && theirs);
  assert.equal(keyOpens(theirs, { id: 'tpl_1', shareNonce: 'shared', demoSlug: 'demo' }, 'demo'), false);
  assert.equal(keyOpens(mine, { id: 'tpl_1', shareNonce: 'shared', demoSlug: 'demo' }, 'demo'), true);
});

test('a fresh secret is a secret: long, and never the same twice', () => {
  const seen = new Set(Array.from({ length: 200 }, () => freshNonce()));
  assert.equal(seen.size, 200);
  for (const n of seen) assert.match(n, /^[0-9a-f]{32}$/);
});
