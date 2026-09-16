import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_PASSWORD,
  MIN_SEED_PASSWORD_LENGTH,
  databaseHost,
  isLocalDatabase,
  resolveSeedPassword,
} from '../prisma/seed-password';

/**
 * The seed creates an OWNER account, and its built-in password is committed to
 * a public repository. These tests are the guarantee that the two never meet on
 * a database a stranger can reach.
 */

const LOCAL = 'postgresql://stays:stays@127.0.0.1:5432/stays?schema=public';
// The exact string rental-ci.yml gives the seed. If this stops passing, CI breaks.
const CI = 'postgresql://stays:stays@localhost:5432/stays_test?schema=public';
const REMOTE = 'postgresql://postgres:hunter2@db.abcdefgh.supabase.co:5432/postgres';

test('a local database keeps the built-in demo password', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'postgres', 'db']) {
    const url = `postgresql://stays:stays@${host}:5432/stays`;
    const resolved = resolveSeedPassword(url, undefined);
    assert.equal(resolved.ok, true, `${host} should be treated as local`);
    assert.equal(resolved.ok && resolved.password, DEMO_PASSWORD);
  }

  assert.equal(resolveSeedPassword(LOCAL, undefined).ok, true);
  assert.equal(resolveSeedPassword(CI, undefined).ok, true, 'CI must keep working untouched');
  assert.equal(isLocalDatabase('postgresql://u:p@LOCALHOST:5432/db'), true, 'host match is case-insensitive');
});

test('a remote database without SEED_PASSWORD is refused', () => {
  const resolved = resolveSeedPassword(REMOTE, undefined);
  assert.equal(resolved.ok, false);
  assert.match(resolved.ok ? '' : resolved.message, /Refusing to seed/);
  assert.match(resolved.ok ? '' : resolved.message, /db\.abcdefgh\.supabase\.co/);
});

test('a remote database with too short a SEED_PASSWORD is refused', () => {
  const short = 'x'.repeat(MIN_SEED_PASSWORD_LENGTH - 1);
  const resolved = resolveSeedPassword(REMOTE, short);
  assert.equal(resolved.ok, false);
  assert.match(resolved.ok ? '' : resolved.message, new RegExp(`at least ${MIN_SEED_PASSWORD_LENGTH}`));
});

test('the demo password cannot be laundered through SEED_PASSWORD', () => {
  const resolved = resolveSeedPassword(REMOTE, DEMO_PASSWORD);
  assert.equal(resolved.ok, false, 'the demo password is public wherever it comes from');
});

test('a supplied password is used but never made printable', () => {
  const secret = 'correct-horse-battery-staple';
  const resolved = resolveSeedPassword(REMOTE, secret);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.ok && resolved.password, secret);
  assert.equal(resolved.ok && resolved.printable, 'as supplied in SEED_PASSWORD');
  assert.ok(resolved.ok && !resolved.printable.includes(secret), 'the log must not carry the password');

  // Same on a local database: if the operator supplied one, it stays out of the log.
  const local = resolveSeedPassword(LOCAL, secret);
  assert.equal(local.ok && local.password, secret);
  assert.ok(local.ok && !local.printable.includes(secret));
});

test('a refusal never quotes the password it rejected', () => {
  const short = 'sekrit';
  const resolved = resolveSeedPassword(REMOTE, short);
  assert.equal(resolved.ok, false);
  assert.ok(resolved.ok || !resolved.message.includes(short));
});

test('an unreadable DATABASE_URL is treated as remote, not waved through', () => {
  for (const url of [undefined, '', 'not-a-url', 'postgresql://', 'postgresql://user:pa@ss@db.example.com:5432/x']) {
    const resolved = resolveSeedPassword(url, undefined);
    assert.equal(resolved.ok, false, `${String(url)} must not get the demo password`);
  }
  assert.equal(databaseHost('not-a-url'), null);
  assert.equal(databaseHost(undefined), null);
  assert.equal(databaseHost('postgresql://u:p@[::1]:5432/db'), '::1', 'IPv6 brackets are stripped');
});
