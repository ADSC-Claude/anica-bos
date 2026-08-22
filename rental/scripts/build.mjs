#!/usr/bin/env node
/**
 * The production build.
 *
 * It refuses to build rather than shipping something that will fail at
 * runtime: a missing SESSION_SECRET, a database URL that is not a URL, a
 * pooled connection with no direct URL for migrations. Each of those surfaces
 * as "a server-side exception has occurred" on a live page otherwise, which is
 * the worst possible place to find out.
 *
 * It opens by printing where it is and what it can see. A first deployment
 * fails for boring reasons — a variable saved to the wrong environment, a root
 * directory off by one folder — and the log is usually the only witness. The
 * banner costs a few lines and turns "cannot find module" into a sentence you
 * can act on without a second deploy.
 *
 * Nothing secret is ever printed. Connection strings appear with credentials
 * replaced and only their host, port and database intact — enough to see that
 * DIRECT_URL really is port 5432 and points where you think, and not enough to
 * be worth anything to whoever reads the build log later.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function run(command, env = {}) {
  console.info(`\n▸ ${command}`);
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
}

// ---------------------------------------------------------------------------
// What this build can see
// ---------------------------------------------------------------------------

/** Host, port and database only. Username and password never survive this. */
function describeUrl(raw) {
  try {
    const u = new URL(raw);
    const port = u.port || '(default)';
    const pooled = u.port === '6543' ? ' — transaction pooler' : u.port === '5432' ? ' — direct' : '';
    return `${u.hostname}:${port}${u.pathname}${pooled}`;
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
  'NEXT_PUBLIC_CONTACT_PHONE',
  'NEXT_PUBLIC_CONTACT_EMAIL',
];
const URLISH = new Set(['DATABASE_URL', 'DIRECT_URL']);

function report(name) {
  const value = process.env[name];
  if (!value) return `  ✗ ${name.padEnd(26)} not set`;
  if (URLISH.has(name)) return `  ✓ ${name.padEnd(26)} ${describeUrl(value)}`;
  if (
    name === 'NEXT_PUBLIC_APP_URL' ||
    name === 'SUPABASE_URL' ||
    name === 'EMAIL_FROM' ||
    name.startsWith('NEXT_PUBLIC_CONTACT_')
  ) {
    return `  ✓ ${name.padEnd(26)} ${value}`;
  }
  return `  ✓ ${name.padEnd(26)} set, ${value.length} characters`;
}

console.info(`\n── build environment ${'─'.repeat(46)}`);
console.info(`  node                       ${process.version}`);
console.info(`  working directory          ${process.cwd()}`);
console.info(`  vercel environment         ${process.env.VERCEL_ENV ?? '(not running on Vercel)'}`);
if (process.env.VERCEL_GIT_COMMIT_SHA) {
  console.info(`  commit                     ${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`);
}

// If the working directory is not the rental app, everything below is noise and
// the root directory setting is the thing to fix.
//
// The check is the package name, not the presence of package.json: this
// repository's root holds a different app with a package.json of its own, so
// "a package.json is here" is true in exactly the case being guarded against.
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

if (packageName !== 'anica-stays') {
  console.info(`\n  directory contains: ${readdirSync('.').slice(0, 20).join(', ')}`);
  fail(
    `This is not the rental app — the package here is "${packageName ?? 'unknown'}", expected "anica-stays".`,
    "On Vercel: Settings → Build and Deployment → Root Directory must be `rental`.",
  );
}

console.info(`\n── required variables ${'─'.repeat(45)}`);
for (const name of REQUIRED) console.info(report(name));
console.info(`\n── optional variables ${'─'.repeat(45)}`);
for (const name of OPTIONAL) console.info(report(name));
console.info('');

// ---------------------------------------------------------------------------
// The guards
// ---------------------------------------------------------------------------

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
  fail(
    'SESSION_SECRET is missing or shorter than 32 characters.',
    'Generate one with: openssl rand -base64 48',
  );
}

// Migrations cannot run over a transaction pooler — it multiplexes away the
// prepared statements and the advisory lock Prisma relies on.
const pooled = url.port === '6543';
if (pooled && !DIRECT_URL) {
  fail(
    'DATABASE_URL points at a transaction pooler (port 6543) but DIRECT_URL is not set.',
    'Add the direct or session-pooler connection string (port 5432) as DIRECT_URL.',
  );
}

if (production && (!CRON_SECRET || CRON_SECRET.length < 16)) {
  fail(
    'CRON_SECRET is missing or too short for a production build.',
    'The scheduled jobs endpoint is unusable without it: guest messages never send.',
  );
}

if (production && !process.env.NEXT_PUBLIC_APP_URL && !process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  console.warn(
    '\n! NEXT_PUBLIC_APP_URL is not set. Email links and PayMongo redirects will point at the deployment URL.',
  );
}

if (production && !process.env.PAYMONGO_SECRET_KEY) {
  console.warn(
    '\n! PAYMONGO_SECRET_KEY is not set — the booking flow will run in SIMULATED mode.\n' +
      '  Guests will not actually be charged. Set the key before taking real bookings.',
  );
}

if (production && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '\n! SUPABASE_SERVICE_ROLE_KEY is not set — uploads will be written to the container\n' +
      '  filesystem, which does not survive the request. Set it before anyone uploads a receipt.',
  );
}

run('prisma generate');
run('prisma migrate deploy', { DATABASE_URL: DIRECT_URL || DATABASE_URL });
run('next build');

console.info('\n✓ Built.');
