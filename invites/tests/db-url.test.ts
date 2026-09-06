import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDatabaseUrl, describeDatabaseUrl } from '../src/lib/db-url';

const DIRECT = 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const POOLED = 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

// The schema argument defaults to process.env.DATABASE_SCHEMA, so passing
// `undefined` reads the ambient environment rather than meaning "no schema".
// These tests would otherwise pass or fail depending on the shell they run in.
const NONE = '';

test('no schema requested leaves the string alone', () => {
  assert.equal(resolveDatabaseUrl(DIRECT, NONE), DIRECT);
});

test('the schema defaults to DATABASE_SCHEMA when the caller passes nothing', () => {
  const before = process.env.DATABASE_SCHEMA;
  try {
    process.env.DATABASE_SCHEMA = 'invites';
    assert.equal(new URL(resolveDatabaseUrl(DIRECT)!).searchParams.get('schema'), 'invites');
    delete process.env.DATABASE_SCHEMA;
    assert.equal(resolveDatabaseUrl(DIRECT), DIRECT);
  } finally {
    if (before === undefined) delete process.env.DATABASE_SCHEMA;
    else process.env.DATABASE_SCHEMA = before;
  }
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
  const url = new URL(resolveDatabaseUrl(POOLED, NONE)!);
  assert.equal(url.searchParams.get('pgbouncer'), 'true');
  assert.equal(url.searchParams.get('connection_limit'), '1');
});

test('a direct connection is left unpooled', () => {
  const url = new URL(resolveDatabaseUrl(DIRECT, 'invites')!);
  assert.equal(url.searchParams.get('pgbouncer'), null);
});

test('an explicit pgbouncer setting is not second-guessed', () => {
  const url = new URL(resolveDatabaseUrl(`${POOLED}?pgbouncer=false`, NONE)!);
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

// The build and the migration run before anything is compiled, so they carry
// their own copy of the rule in scripts/db-url.mjs. A copy that drifts is not
// a style problem: the copy in the build script once applied `schema=` without
// `pgbouncer=true`, so the build's own connection check dialled the
// transaction pooler in the one configuration this rule exists to prevent,
// and hung there until the platform killed it — taking every other deployment
// queued behind it. These two must agree, and this is where that is enforced.
test('the script copy of the rule agrees with this one', async () => {
  const script = await import('../scripts/db-url.mjs');

  const cases: [string | undefined, string | undefined][] = [
    [POOLED, 'invites'],
    [POOLED, NONE],
    [DIRECT, 'invites'],
    [DIRECT, NONE],
    [`${POOLED}?pgbouncer=false`, 'invites'],
    [`${POOLED}?connection_limit=5`, 'invites'],
    [`${DIRECT}?schema=public`, 'invites'],
    ['postgresql://u:p@localhost/postgres', 'invites'],
    ['not a url', 'invites'],
    [undefined, 'invites'],
  ];

  for (const [raw, schema] of cases) {
    assert.equal(
      script.resolveDatabaseUrl(raw, schema),
      resolveDatabaseUrl(raw, schema),
      `resolveDatabaseUrl disagrees for ${raw} / schema=${schema}`,
    );
  }

  for (const [raw] of cases) {
    if (typeof raw !== 'string') continue;
    assert.equal(script.describeDatabaseUrl(raw), describeDatabaseUrl(raw), `describeDatabaseUrl disagrees for ${raw}`);
  }
});

// The specific regression: on a transaction pooler the build must connect the
// way the running server does, or it is not checking the thing it claims to.
test('the script rule adds pgbouncer=true on the transaction pooler', async () => {
  const { resolveDatabaseUrl: fromScript } = await import('../scripts/db-url.mjs');
  const url = new URL(fromScript(POOLED, 'invites')!);
  assert.equal(url.searchParams.get('pgbouncer'), 'true');
  assert.equal(url.searchParams.get('connection_limit'), '1');
  assert.equal(url.searchParams.get('schema'), 'invites');
});
