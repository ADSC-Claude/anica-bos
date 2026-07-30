/**
 * Production build.
 *
 * Wraps `prisma generate → prisma migrate deploy → next build` so the two
 * things that most often go wrong on a first deploy fail with an explanation
 * instead of a Prisma stack trace:
 *
 *   1. DIRECT_URL unset. Only Supabase-style hosts need it to differ from
 *      DATABASE_URL; everywhere else the two are identical, so we default it.
 *   2. A Supabase pooler URL without ?pgbouncer=true, which works during the
 *      build and then fails at runtime with "prepared statement already exists".
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// Vercel injects env vars directly; locally they live in .env, which nothing has
// loaded yet at this point in the build.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue; // real env wins
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  }
}

const step = (msg) => console.log(`\n▸ ${msg}`);
const warn = (msg) => console.warn(`  ! ${msg}`);

function fail(title, lines) {
  console.error(`\n✗ ${title}\n`);
  for (const line of lines) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

// ---------------------------------------------------------------- env checks

const { DATABASE_URL, DIRECT_URL } = process.env;

if (!DATABASE_URL) {
  fail('DATABASE_URL is not set.', [
    'The app cannot build without a database connection string.',
    '',
    'In Vercel: Settings → Environment Variables → add DATABASE_URL,',
    'then redeploy. Environment variables added after a build started are',
    'not picked up until the next deployment.',
    '',
    'Supabase: Project Settings → Database → Connection string →',
    'use the Transaction pooler string (port 6543).',
  ]);
}

const isPooler = /pooler\.supabase\.com|:6543/.test(DATABASE_URL);

if (!DIRECT_URL) {
  if (isPooler) {
    fail('DIRECT_URL is not set, but DATABASE_URL points at a connection pooler.', [
      'Migrations cannot run through a transaction pooler, so a direct',
      'connection is required.',
      '',
      'In Vercel: Settings → Environment Variables → add DIRECT_URL.',
      'Supabase: Project Settings → Database → Connection string →',
      'the Direct connection string (port 5432, db.<ref>.supabase.co).',
    ]);
  }
  warn('DIRECT_URL not set; defaulting it to DATABASE_URL (no pooler detected).');
  process.env.DIRECT_URL = DATABASE_URL;
}

// Prisma needs ?pgbouncer=true against a transaction pooler, or queries fail at
// runtime once connections start being reused.
if (isPooler && !/[?&]pgbouncer=/.test(DATABASE_URL)) {
  const joiner = DATABASE_URL.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${DATABASE_URL}${joiner}pgbouncer=true&connection_limit=1`;
  warn('Added ?pgbouncer=true to DATABASE_URL — required by Prisma behind a pooler.');
}

// ------------------------------------------------------------------- build

const run = (cmd, onError) => {
  try {
    execSync(cmd, { stdio: 'inherit', env: process.env });
  } catch {
    onError();
    process.exit(1);
  }
};

step('Generating the Prisma client');
run('npx prisma generate', () => fail('prisma generate failed.', ['See the output above.']));

step('Applying database migrations');
run('npx prisma migrate deploy', () =>
  fail('Migrations could not be applied.', [
    'The build reached the database step but could not complete it.',
    '',
    'Most likely causes, in order:',
    '  • DIRECT_URL points at the pooler (port 6543) rather than the',
    '    direct connection (port 5432). Migrations need the direct one.',
    '  • The password in the connection string is wrong or contains',
    '    characters that need URL-encoding (@ : / ? # [ ] are all special).',
    '  • The database is paused. Supabase pauses free projects when idle —',
    '    open the dashboard to wake it, then redeploy.',
  ]),
);

step('Building the application');
run('npx next build', () => fail('next build failed.', ['See the output above.']));

console.log('\n✓ Build complete.\n');
