/**
 * Sealing third-party tokens.
 *
 * The one that matters is the last test: a row written under a different
 * SESSION_SECRET, or edited in the database by hand, must fail to open rather
 * than open to something wrong. GCM's tag is what makes that true, and it is
 * worth a test because the failure it prevents is silent — a token that opens
 * to rubbish looks to the caller exactly like a token Canva rejected.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// The key is derived lazily, inside seal/unseal, so setting this before the
// first call is enough — no top-level await, which the runner cannot take.
process.env.SESSION_SECRET ||= 'a-test-secret-at-least-32-characters-long';
import { seal, unseal, sealedOk } from '../src/lib/secrets';

test('what goes in comes back', () => {
  const token = 'refresh-token-abc123';
  assert.equal(unseal(seal(token)), token);
});

test('the same value seals differently every time', () => {
  // A fresh iv per seal, so two rows holding the same token do not look alike.
  assert.notEqual(seal('same'), seal('same'));
});

test('a sealed value carries nothing readable', () => {
  const sealed = seal('refresh-token-abc123');
  assert.doesNotMatch(sealed, /refresh-token/);
  assert.match(sealed, /^v1\./, 'and says which scheme sealed it');
});

test('tampering fails to open rather than opening wrong', () => {
  const sealed = seal('refresh-token-abc123');
  const [v, iv, tag, body] = sealed.split('.');
  // Flip a byte of the ciphertext, the way a careless UPDATE would.
  const edited = Buffer.from(body, 'base64url');
  edited[0] ^= 0xff;
  const tampered = [v, iv, tag, edited.toString('base64url')].join('.');
  assert.throws(() => unseal(tampered));
  assert.equal(sealedOk(tampered), false);
  assert.equal(sealedOk(sealed), true);
});

test('nonsense is refused, not guessed at', () => {
  for (const bad of ['', 'plain-text-token', 'v1.only.three', 'v2.a.b.c']) {
    assert.throws(() => unseal(bad), `rejects ${JSON.stringify(bad)}`);
  }
});
