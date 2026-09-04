import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDatabaseUrl, describeDatabaseUrl } from '../src/lib/db-url';

const DIRECT = 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const POOLED = 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

test('no schema requested leaves the string alone', () => {
  assert.equal(resolveDatabaseUrl(DIRECT, undefined), DIRECT);
});

test('DATABASE_SCHEMA is applied to a string with no query parameters', () => {
  assert.equal(resolveDatabaseUrl(DIRECT, 'invites'), `${DIRECT}?schema=invites`);
});

test('DATABASE_SCHEMA overrides a schema already in the string', () => {
  const url = new URL(resolveDatabaseUrl(`${DIRECT}?schema=public`, 'invites')!);
  assert.equal(url.searchParams.get('schema'), 'invites');
});

test('DATABASE_SCHEMA survives a string that already carries other parameters', () => {
  const url = new URL(resolveDatabaseUrl(`${POOLED}?pgbouncer=true&connection_limit=1`, 'invites')!);
  assert.equal(url.searchParams.get('schema'), 'invites');
  assert.equal(url.searchParams.get('pgbouncer'), 'true');
});

// The failure this whole variable exists to prevent: `?schema=invites` glued
// onto a string that already had a query string. Postgres reads the second `?`
// as part of pgbouncer's value and the schema quietly stays `public`.
test('a hand-appended second question mark is corrected, not inherited', () => {
  const mangled = `${POOLED}?pgbouncer=true?schema=invites`;
  assert.equal(new URL(mangled).searchParams.get('schema'), null, 'precondition: the mangled form has no schema');
  assert.equal(new URL(resolveDatabaseUrl(mangled, 'invites')!).searchParams.get('schema'), 'invites');
});

test('a transaction pooler gets pgbouncer=true and a connection limit', () => {
  const url = new URL(resolveDatabaseUrl(POOLED, undefined)!);
  assert.equal(url.searchParams.get('pgbouncer'), 'true');
  assert.equal(url.searchParams.get('connection_limit'), '1');
});

test('a direct connection is left unpooled', () => {
  const url = new URL(resolveDatabaseUrl(DIRECT, 'invites')!);
  assert.equal(url.searchParams.get('pgbouncer'), null);
});

test('an explicit pgbouncer setting is not second-guessed', () => {
  const url = new URL(resolveDatabaseUrl(`${POOLED}?pgbouncer=false`, undefined)!);
  assert.equal(url.searchParams.get('pgbouncer'), 'false');
});

test('an unset url stays unset, an unparseable one is passed through', () => {
  assert.equal(resolveDatabaseUrl(undefined, 'invites'), undefined);
  assert.equal(resolveDatabaseUrl('not a url', 'invites'), 'not a url');
});

test('the description names the schema and never the password', () => {
  const described = describeDatabaseUrl(resolveDatabaseUrl(POOLED, 'invites')!);
  assert.ok(described.includes('schema=invites'), described);
  assert.ok(described.includes(':6543'), described);
  assert.ok(!described.includes('p@'), 'credentials must not appear in a log line');
});
