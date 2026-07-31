/**
 * Production build.
 *
 * Wraps `prisma generate → prisma migrate deploy → next build` so the things
 * that most often go wrong on a first deploy fail with an explanation instead
 * of a Prisma stack trace:
 *
 *   1. DIRECT_URL unset. Only Supabase-style hosts need it to differ from
 *      DATABASE_URL; everywhere else the two are identical, so we default it.
 *   2. A Supabase pooler URL without ?pgbouncer=true, which works during the
 *      build and then fails at runtime with "prepared statement already exists".
 *   3. Migrations aimed at Supabase's *direct* host, which resolves to IPv6
 *      only. Most build runners — Vercel's included — have no IPv6 route, so
 *      the connection times out somewhere unhelpful inside Prisma.
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

// Supabase offers three endpoints and the difference decides whether DDL works:
//
//   transaction pooler  ...pooler.supabase.com:6543  runtime only — multiplexes
//                                                    connections, so it cannot
//                                                    hold the session state DDL
//                                                    needs
//   session pooler      ...pooler.supabase.com:5432  migrations — one backend
//                                                    per client, and reachable
//                                                    over IPv4
//   direct              db.<ref>.supabase.co:5432    migrations, but IPv6 only
//                                                    unless the IPv4 add-on is
//                                                    bought
function describe(name, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Worth catching separately: a value that is not a URL at all reaches
    // Prisma as "Validation Error Count: 1 [Context: getConfig]", which says
    // nothing about which variable is wrong or what is wrong with it.
    fail(`${name} is not a valid connection string.`, [
      'It could not be parsed as a URL, so nothing downstream can use it.',
      '',
      'It should begin with postgresql:// and nothing else. The usual causes,',
      'all from copying the wrong part of a connection-string panel:',
      '  • A psql prefix — the value starts with `psql ` and the URL is in',
      '    quotes. Copy the URI tab, not the psql command.',
      '  • Surrounding " or \' quotes. Vercel stores the value literally, so',
      '    quotes become part of the string.',
      '  • A line break or trailing space pasted along with it.',
      '',
      'Supabase: Project Settings → Database → Connection string → URI,',
      `and replace [YOUR-PASSWORD] with the real password.`,
    ]);
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    fail(`${name} does not look like a Postgres connection string.`, [
      `Its scheme is "${parsed.protocol.replace(':', '')}"; Prisma requires`,
      'postgresql:// (postgres:// is also accepted).',
    ]);
  }
  const host = parsed.hostname;
  const port = parsed.port || '5432';
  return {
    host,
    port,
    // Anything on 6543 is the transaction pooler, whoever hosts it.
    transactionPooler: port === '6543',
    // Supabase's direct host has no A record on the free plan.
    ipv6Only: /^db\..+\.supabase\.co$/.test(host),
  };
}

const runtime = describe('DATABASE_URL', DATABASE_URL);

// The URL migrations run against.
const migrationUrl = DIRECT_URL || DATABASE_URL;
const migration = describe(DIRECT_URL ? 'DIRECT_URL' : 'DATABASE_URL', migrationUrl);

if (!DIRECT_URL && runtime.transactionPooler) {
  fail('DIRECT_URL is not set, but DATABASE_URL is the transaction pooler.', [
    'Migrations cannot run through a transaction pooler — it multiplexes',
    'connections and cannot hold the session state DDL needs.',
    '',
    'In Vercel: Settings → Environment Variables → add DIRECT_URL,',
    'tick all three environments, then redeploy. Variables added after a',
    'build has started are not picked up until the next deployment.',
    '',
    'Supabase: Project Settings → Database → Connection string →',
    'the SESSION POOLER string (port 5432 on ...pooler.supabase.com).',
    'Prefer it over the Direct connection — see the note below.',
  ]);
}

if (migration.transactionPooler) {
  fail('DIRECT_URL points at the transaction pooler (port 6543).', [
    'Migrations need a session-mode connection. Port 6543 is the',
    'transaction pooler and will fail partway through the first migration.',
    '',
    'Supabase: use the Session pooler string instead — same host,',
    'port 5432.',
  ]);
}

if (!DIRECT_URL) {
  warn('DIRECT_URL not set; using DATABASE_URL for migrations (no pooler detected).');
}

// Worth saying out loud before it fails: Supabase's direct host resolves to an
// AAAA record only, and build runners on Vercel, GitHub Actions and Fly have no
// IPv6 route out. The session pooler is the same database over IPv4.
if (migration.ipv6Only) {
  warn(`Migrating against ${migration.host}, which resolves over IPv6 only.`);
  warn('If this times out, switch DIRECT_URL to the Supabase Session pooler');
  warn('(port 5432 on ...pooler.supabase.com) — same database, reachable over IPv4.');
}

// Prisma needs ?pgbouncer=true against a transaction pooler, or queries fail at
// runtime once connections start being reused. Session mode gives each client
// its own backend, so prepared statements are safe there and the flag would
// only cost performance.
if (runtime.transactionPooler && !/[?&]pgbouncer=/.test(DATABASE_URL)) {
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

step(`Applying database migrations (${migration.host}:${migration.port})`);
// Swap in the migration connection for this step only; the app keeps the
// pooled URL at runtime.
const runtimeUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = migrationUrl;
run('npx prisma migrate deploy', () =>
  fail('Migrations could not be applied.', [
    `The build reached the database step but could not complete it against`,
    `${migration.host}:${migration.port}.`,
    '',
    'Most likely causes, in order:',
    ...(migration.ipv6Only
      ? [
          '  • That host resolves over IPv6 only, and this build runner has no',
          '    IPv6 route. Set DIRECT_URL to the Supabase SESSION POOLER string',
          '    instead: Project Settings → Database → Connection string →',
          '    Session pooler (port 5432 on ...pooler.supabase.com). It is the',
          '    same database, reachable over IPv4.',
        ]
      : []),
    '  • The password in the connection string is wrong or contains',
    '    characters that need URL-encoding (@ : / ? # [ ] are all special).',
    '  • The database is paused. Supabase pauses free projects when idle —',
    '    open the dashboard to wake it, then redeploy.',
  ]),
);
process.env.DATABASE_URL = runtimeUrl;

step('Building the application');
run('npx next build', () => fail('next build failed.', ['See the output above.']));

console.log('\n✓ Build complete.\n');
