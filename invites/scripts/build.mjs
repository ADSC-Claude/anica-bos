#!/usr/bin/env node
/**
 * The production build.
 *
 * It refuses to build rather than shipping something that will fail at
 * runtime: a missing SESSION_SECRET, a database URL that is not a URL, a
 * pooled connection with no direct URL for migrations. It opens by printing
 * where it is and what it can see, with credentials stripped, because a first
 * deployment fails for boring reasons and the log is the only witness.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function run(command, env = {}) {
  console.info(`\n▸ ${command}`);
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
}

/** Runs `command`, swallowing its output, and reports only whether it worked. */
function succeeds(command) {
  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * DATABASE_SCHEMA wins over any `schema=` in the connection string. This
 * repeats src/lib/db-url.ts, which this script cannot import: it runs before
 * `prisma generate`, when nothing is compiled yet. Change both together.
 *
 * The variable exists separately from the URL because the URL is a secret
 * pasted into a dashboard, and appending `?schema=…` to a string that already
 * carries a query string produces a second `?` — read as part of the previous
 * parameter's value, leaving the schema silently `public`.
 */
function withSchema(raw) {
  const schema = process.env.DATABASE_SCHEMA;
  if (!raw || !schema) return raw;
  try {
    const u = new URL(raw);
    u.searchParams.set('schema', schema);
    return u.toString();
  } catch {
    return raw;
  }
}

function describeUrl(raw) {
  try {
    const u = new URL(withSchema(raw));
    const port = u.port || '(default)';
    const pooled = u.port === '6543' ? ' — transaction pooler' : u.port === '5432' ? ' — direct' : '';
    return `${u.hostname}:${port}${u.pathname} schema=${u.searchParams.get('schema') ?? 'public'}${pooled}`;
  } catch {
    return '!! not a valid connection string';
  }
}

const REQUIRED = ['DATABASE_URL', 'DIRECT_URL', 'SESSION_SECRET', 'CRON_SECRET', 'NEXT_PUBLIC_APP_URL'];
const OPTIONAL = [
  'PAYMONGO_SECRET_KEY',
  'PAYMONGO_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SEMAPHORE_API_KEY',
  'NEXT_PUBLIC_CONTACT_MESSENGER',
  'NEXT_PUBLIC_CONTACT_EMAIL',
  'DATABASE_SCHEMA',
  'SUPABASE_IMAGE_TRANSFORM',
];
const URLISH = new Set(['DATABASE_URL', 'DIRECT_URL']);

function report(name) {
  const value = process.env[name];
  if (!value) return `  ✗ ${name.padEnd(30)} not set`;
  if (URLISH.has(name)) return `  ✓ ${name.padEnd(30)} ${describeUrl(value)}`;
  if (name.startsWith('NEXT_PUBLIC_') || name === 'SUPABASE_URL' || name === 'EMAIL_FROM' || name === 'DATABASE_SCHEMA' || name === 'SUPABASE_IMAGE_TRANSFORM') {
    return `  ✓ ${name.padEnd(30)} ${value}`;
  }
  return `  ✓ ${name.padEnd(30)} set, ${value.length} characters`;
}

console.info(`\n── build environment ${'─'.repeat(46)}`);
console.info(`  node                       ${process.version}`);
console.info(`  working directory          ${process.cwd()}`);
console.info(`  vercel environment         ${process.env.VERCEL_ENV ?? '(not running on Vercel)'}`);
if (process.env.VERCEL_GIT_COMMIT_SHA) {
  console.info(`  commit                     ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`);
}

console.info(`\n── files here ${'─'.repeat(53)}`);
const EXPECTED = ['package.json', 'next.config.ts', 'prisma/schema.prisma', 'scripts/build.mjs', 'src'];
for (const path of EXPECTED) {
  console.info(`  ${existsSync(path) ? '✓' : '✗'} ${path}`);
}

let packageName = null;
if (existsSync('package.json')) {
  try {
    packageName = JSON.parse(readFileSync('package.json', 'utf8')).name ?? null;
  } catch {
    packageName = null;
  }
}
console.info(`  package name               ${packageName ?? '(unreadable)'}`);

// This repository's root holds a different app with a package.json of its
// own, so "a package.json is here" is true in exactly the case being guarded
// against. The package name is the check.
if (packageName !== 'anica-invites') {
  console.info(`\n  directory contains: ${readdirSync('.').slice(0, 20).join(', ')}`);
  fail(
    `This is not the invitations app — the package here is "${packageName ?? 'unknown'}", expected "anica-invites".`,
    'On Vercel: Settings → Build and Deployment → Root Directory must be `invites`.',
  );
}

console.info(`\n── required variables ${'─'.repeat(45)}`);
for (const name of REQUIRED) console.info(report(name));
console.info(`\n── optional variables ${'─'.repeat(45)}`);
for (const name of OPTIONAL) console.info(report(name));
console.info('');

const { DATABASE_URL, DIRECT_URL, SESSION_SECRET, CRON_SECRET, NODE_ENV } = process.env;
const production = process.env.VERCEL_ENV === 'production' || NODE_ENV === 'production';

if (!DATABASE_URL) {
  fail(
    'DATABASE_URL is not set.',
    'On Vercel, check the variable is saved to the environment this build is running in — see "vercel environment" above.',
  );
}

let url;
try {
  url = new URL(DATABASE_URL);
} catch {
  fail(
    'DATABASE_URL is not a valid connection string.',
    'A password containing @ : / # or ? breaks the URL unless percent-encoded.',
  );
}

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  fail('SESSION_SECRET is missing or shorter than 32 characters.', 'Generate one with: openssl rand -base64 48');
}

// Supabase publishes three connection strings and it is easy to take the host
// from one and the port from another. `db.<ref>.supabase.co` is the direct
// database: it serves 5432, not 6543, and it resolves to an IPv6 address only,
// which a Vercel function cannot reach at all. The poolers live on a different
// host entirely.
const supabaseDirectHost = /^db\..*\.supabase\.co$/.test(url.hostname);
if (supabaseDirectHost && url.port !== '5432') {
  console.warn(
    `\n! DATABASE_URL is ${url.hostname}:${url.port}. That host is the direct database, which\n` +
      '  serves 5432, not 6543, and resolves to an IPv6 address a Vercel function cannot reach.\n' +
      '  The poolers are on a different host: aws-0-<region>.pooler.supabase.com, 6543 for the\n' +
      '  transaction pooler and 5432 for the session pooler. The check below will say for certain.',
  );
}

const pooled = url.port === '6543';
if (pooled && !DIRECT_URL) {
  fail(
    'DATABASE_URL points at a transaction pooler (port 6543) but DIRECT_URL is not set.',
    'Add the session-pooler connection string (port 5432) as DIRECT_URL.',
  );
}

if (production && (!CRON_SECRET || CRON_SECRET.length < 16)) {
  fail(
    'CRON_SECRET is missing or too short for a production build.',
    'The scheduled jobs endpoint is unusable without it: expired links never close and DFY deadlines never alert.',
  );
}

if (production && !process.env.NEXT_PUBLIC_APP_URL && !process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  console.warn('\n! NEXT_PUBLIC_APP_URL is not set. Share links, QR codes and PayMongo redirects will use the deployment URL.');
}

if (production && !process.env.PAYMONGO_SECRET_KEY) {
  console.warn(
    '\n! PAYMONGO_SECRET_KEY is not set — GCash/Maya/card checkout will run in SIMULATED mode.\n' +
      '  Customers will not actually be charged. Manual proof-of-payment still works.',
  );
}

if (production && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '\n! SUPABASE_SERVICE_ROLE_KEY is not set — uploads will be written to the container\n' +
      '  filesystem, which does not survive the request. Set it before anyone uploads a photo.',
  );
}

run('prisma generate');
// scripts/migrate.mjs, not `prisma migrate deploy`: it is the one place that
// knows which schema the migration belongs in, and the seed workflow uses it
// too. See the comment at the top of that file.
run('node scripts/migrate.mjs');

// The migration proves DIRECT_URL works. It proves nothing about DATABASE_URL,
// which is a different host, and every page depends on it — so ask it a
// question here, where one line of build log is the answer, rather than
// discovering it as a 500 on the landing page.
console.info('\n▸ checking the runtime connection');
writeFileSync('.runtime-connection-check.sql', 'SELECT 1;');
const reachable = succeeds(
  `prisma db execute --url "${withSchema(DATABASE_URL)}" --file .runtime-connection-check.sql`,
);
rmSync('.runtime-connection-check.sql', { force: true });
if (!reachable) {
  fail(
    `DATABASE_URL is unreachable: ${describeUrl(DATABASE_URL)}`,
    'The migration connected over DIRECT_URL, so the database is up and this is DATABASE_URL\n' +
      '  itself — wrong host, wrong port, or a password that has since been rotated. Supabase\n' +
      '  publishes three connection strings and mixing the host of one with the port of another\n' +
      '  produces an address that does not exist; copy the whole string from Supabase → Connect.',
  );
}
console.info(`  ✓ ${describeUrl(DATABASE_URL)}`);

run('next build');

console.info('\n✓ Built.');
