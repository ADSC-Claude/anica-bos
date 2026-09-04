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
import { describeDatabaseUrl, resolveDatabaseUrl } from './db-url.mjs';

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function run(command, env = {}) {
  console.info(`\n▸ ${command}`);
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
}

/**
 * Runs `command` with a deadline, keeping its stderr for the failure message.
 *
 * The deadline is the whole point. A database that refuses a connection comes
 * back as an error in milliseconds, but one that accepts it and then never
 * answers comes back as nothing at all, and a check with no deadline waits for
 * it — so a step written to fail the build in a second instead holds the build
 * until the platform kills it at forty-five minutes. On Vercel that is not one
 * slow deployment: builds in a project are serialised, so every other
 * deployment queues behind the wedged one. Both outcomes have to arrive at the
 * same clear failure, which means this has to give up on its own.
 */
function attempt(command, seconds, env = {}) {
  try {
    execSync(command, {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: seconds * 1000,
      killSignal: 'SIGKILL',
      env: { ...process.env, ...env },
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      timedOut: error.signal === 'SIGKILL' || error.code === 'ETIMEDOUT',
      stderr: String(error.stderr ?? '').trim(),
    };
  }
}

/**
 * The connection string the app itself will use, and the same string with the
 * credentials taken out. Both come from scripts/db-url.mjs so that this script
 * checks what the server actually dials — an earlier local copy applied the
 * `schema=` half of the rule and not the `pgbouncer=true` half, which is how
 * the check below came to hang against a perfectly good pooler URL.
 */
function describeUrl(raw) {
  return describeDatabaseUrl(resolveDatabaseUrl(raw) ?? raw);
}

/**
 * A copy of the URL that cannot wait forever. `connect_timeout` bounds
 * reaching the server, `socket_timeout` bounds the answer once reached; the
 * process deadline in attempt() catches anything that hangs before either
 * applies. These belong to the check alone — the running app must not have a
 * twenty-second ceiling on its queries.
 */
function bounded(raw, connect = 10, socket = 20) {
  const resolved = resolveDatabaseUrl(raw);
  try {
    const url = new URL(resolved);
    url.searchParams.set('connect_timeout', String(connect));
    url.searchParams.set('socket_timeout', String(socket));
    return url.toString();
  } catch {
    return resolved;
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
/**
 * Asked through the generated client, because that is what the server uses.
 *
 * The obvious way to write this is `prisma db execute`, and it is wrong: that
 * command goes through Prisma's migration engine, which cannot speak to a
 * transaction pooler at all — it does not refuse, it waits. So the check hung
 * for forty-five minutes against a pooler the running app talks to perfectly
 * well, which is the worst kind of failing test: one that fails on healthy
 * infrastructure. The query engine below is the same client src/lib/db.ts
 * builds, given the same URL.
 *
 * The URL travels in the environment rather than on the command line: it
 * carries the database password, and a command line is quoted by a shell and
 * printed in error messages.
 */
const CHECK_SCRIPT = `
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasourceUrl: process.env.RUNTIME_CHECK_URL });
try {
  await prisma.$queryRaw\`SELECT 1\`;
  await prisma.$disconnect();
} catch (error) {
  console.error(error?.message ?? String(error));
  process.exit(1);
}
`;

const CHECK_SECONDS = 60;
console.info(`\n▸ checking the runtime connection (${CHECK_SECONDS}s limit)`);
writeFileSync('.runtime-connection-check.mjs', CHECK_SCRIPT);
const check = attempt('node .runtime-connection-check.mjs', CHECK_SECONDS, {
  RUNTIME_CHECK_URL: bounded(DATABASE_URL),
});
rmSync('.runtime-connection-check.mjs', { force: true });
if (!check.ok) {
  // Whatever Postgres said is worth more than anything guessed here, so print
  // it before the advice rather than swallowing it as the old check did.
  if (check.stderr) {
    console.error(`\n${check.stderr.split('\n').slice(-10).join('\n')}`);
  }
  fail(
    check.timedOut
      ? `DATABASE_URL accepted the connection but did not answer within ${CHECK_SECONDS}s: ${describeUrl(DATABASE_URL)}`
      : `DATABASE_URL is unreachable: ${describeUrl(DATABASE_URL)}`,
    check.timedOut
      ? 'This is the same client the server uses, so a silence here is a silence the site\n' +
        '  would hit on every page. A pooler that accepts a connection and never answers is\n' +
        '  usually out of server connections: Supabase → Database → Connection pooling.'
      : 'The migration connected over DIRECT_URL, so the database is up and this is DATABASE_URL\n' +
        '  itself — wrong host, wrong port, or a password that has since been rotated. Supabase\n' +
        '  publishes three connection strings and mixing the host of one with the port of another\n' +
        '  produces an address that does not exist; copy the whole string from Supabase → Connect.',
  );
}
console.info(`  ✓ ${describeUrl(DATABASE_URL)}`);

run('next build');

console.info('\n✓ Built.');
