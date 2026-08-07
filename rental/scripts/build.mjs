#!/usr/bin/env node
/**
 * The production build.
 *
 * It refuses to build rather than shipping something that will fail at
 * runtime: a missing SESSION_SECRET, a database URL that is not a URL, a
 * pooled connection with no direct URL for migrations. Each of those surfaces
 * as "a server-side exception has occurred" on a live page otherwise, which is
 * the worst possible place to find out.
 */
import { execSync } from 'node:child_process';

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function run(command, env = {}) {
  console.info(`\n▸ ${command}`);
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
}

const { DATABASE_URL, DIRECT_URL, SESSION_SECRET, CRON_SECRET, NODE_ENV } = process.env;
const production = process.env.VERCEL_ENV === 'production' || NODE_ENV === 'production';

if (!DATABASE_URL) fail('DATABASE_URL is not set.', 'Set it in the Vercel project or your .env.');

let url;
try {
  url = new URL(DATABASE_URL);
} catch {
  fail('DATABASE_URL is not a valid connection string.');
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

run('prisma generate');
run('prisma migrate deploy', { DATABASE_URL: DIRECT_URL || DATABASE_URL });
run('next build');

console.info('\n✓ Built.');
