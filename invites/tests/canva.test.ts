/**
 * The Canva connection.
 *
 * The handshake itself cannot be tested here — it needs real credentials and
 * a real account, and that proof is the pilot she runs once the integration
 * exists. What IS testable is everything that decides what the handshake is
 * allowed to do, and the slot bookkeeping underneath a design family. Both
 * are worth holding down, for different reasons:
 *
 *  - the scopes, because a write scope added carelessly later is a token that
 *    can alter the master designs every invitation in the catalogue is drawn
 *    from, and nothing in a code review shouts about one extra string;
 *  - the slots, because "which Canva design is this family's Save the Date"
 *    is stored as loose JSON, and loose JSON is where a typo lives quietly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.SESSION_SECRET ||= 'a-test-secret-at-least-32-characters-long';
import { pkce, SCOPES, CANVA_SLOTS, CANVA_SLOT_LABELS, canvaSources, withCanvaSource, configured } from '../src/lib/canva';

test('we ask Canva for reading and nothing more', () => {
  // A write scope here would be a token that can change the designs every
  // invitation is drawn from. This integration reads; it never writes.
  for (const scope of SCOPES) {
    assert.doesNotMatch(scope, /:write$/, `${scope} is a write scope`);
  }
  assert.deepEqual([...SCOPES], ['design:meta:read', 'design:content:read', 'brandtemplate:meta:read']);
});

test('nothing claims to be configured without credentials', () => {
  const before = { id: process.env.CANVA_CLIENT_ID, secret: process.env.CANVA_CLIENT_SECRET };
  delete process.env.CANVA_CLIENT_ID;
  delete process.env.CANVA_CLIENT_SECRET;
  assert.equal(configured(), false);
  process.env.CANVA_CLIENT_ID = 'x';
  assert.equal(configured(), false, 'half-set is not set');
  process.env.CANVA_CLIENT_SECRET = 'y';
  assert.equal(configured(), true);
  if (before.id === undefined) delete process.env.CANVA_CLIENT_ID; else process.env.CANVA_CLIENT_ID = before.id;
  if (before.secret === undefined) delete process.env.CANVA_CLIENT_SECRET; else process.env.CANVA_CLIENT_SECRET = before.secret;
});

test('the PKCE challenge is the hash of the verifier, and the verifier stays home', () => {
  const { verifier, challenge } = pkce();
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual(verifier, challenge);
  assert.ok(verifier.length >= 43, 'long enough to be worth guessing at');
  assert.doesNotMatch(verifier, /[^A-Za-z0-9_-]/, 'base64url, safe in a URL');
  assert.notEqual(pkce().verifier, pkce().verifier, 'fresh every handshake');
});

test('a family has three parts and each is named for a person', () => {
  assert.deepEqual([...CANVA_SLOTS], ['main', 'saveTheDate', 'demo']);
  for (const slot of CANVA_SLOTS) {
    assert.ok(CANVA_SLOT_LABELS[slot], `${slot} has a label`);
  }
});

test('reading the column keeps the known slots and ignores the rest', () => {
  assert.deepEqual(canvaSources({ main: 'DAG111', saveTheDate: 'DAG222' }), { main: 'DAG111', saveTheDate: 'DAG222' });
  // A stray key, a blank, a number, the wrong shape entirely — none of it
  // becomes a design id.
  assert.deepEqual(canvaSources({ main: 'DAG111', invitation: 'DAG999', demo: '   ', saveTheDate: 42 }), { main: 'DAG111' });
  for (const junk of [null, undefined, 'DAG111', 7, []]) {
    assert.deepEqual(canvaSources(junk), {}, `${JSON.stringify(junk)} is not a source list`);
  }
});

test('setting a slot leaves the others alone, and clearing removes it', () => {
  const one = withCanvaSource({}, 'main', 'DAG111');
  assert.deepEqual(one, { main: 'DAG111' });

  const two = withCanvaSource(one, 'saveTheDate', 'DAG222');
  assert.deepEqual(two, { main: 'DAG111', saveTheDate: 'DAG222' });

  // Re-pointing the Save the Date must not disturb the main invitation.
  const moved = withCanvaSource(two, 'saveTheDate', 'DAG333');
  assert.deepEqual(moved, { main: 'DAG111', saveTheDate: 'DAG333' });

  const cleared = withCanvaSource(moved, 'saveTheDate', null);
  assert.deepEqual(cleared, { main: 'DAG111' });
  assert.deepEqual(withCanvaSource(cleared, 'main', '  '), {}, 'blank clears it too');
});

test('an id is stored trimmed, so a pasted one with a stray space still matches', () => {
  assert.deepEqual(withCanvaSource({}, 'main', '  DAG111  '), { main: 'DAG111' });
  assert.deepEqual(canvaSources({ main: '  DAG111  ' }), { main: 'DAG111' });
});
