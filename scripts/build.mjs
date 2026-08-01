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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const supabasePooler = /\.pooler\.supabase\.com$/.test(host);

  // Parses cleanly and still cannot work: the placeholder was never replaced.
  if (/^\[.*\]$/.test(password) || /YOUR[-_]PASSWORD/i.test(password)) {
    fail(`${name} still contains the password placeholder.`, [
      `Its password is literally "${password}".`,
      '',
      'Supabase shows [YOUR-PASSWORD] in the connection string rather than',
      'the real password. Replace that whole placeholder, square brackets',
      'included, with the database password.',
      '',
      'Forgotten it? Supabase → Connect → Database Settings → Reset database',
      'password. Reset means updating DATABASE_URL and DIRECT_URL together.',
    ]);
  }

  // The pooler routes by project ref in the username. Plain "postgres" reaches
  // the pooler and is rejected with "Tenant or user not found" — an error that
  // reads like the database is missing rather than the username being wrong.
  if (supabasePooler && !user.includes('.')) {
    fail(`${name} uses the pooler host with a non-pooler username.`, [
      `Its username is "${user}", but ${host}`,
      'routes by project reference and expects postgres.<project-ref>.',
      '',
      'This is what taking the Direct connection string and swapping only',
      'the host produces. Copy the pooler string whole instead:',
      'Supabase → Connect → Connection String → Transaction pooler (6543)',
      'for DATABASE_URL, Session pooler (5432) for DIRECT_URL.',
    ]);
  }

  return {
    host,
    port,
    user,
    // Anything on 6543 is the transaction pooler, whoever hosts it.
    transactionPooler: port === '6543',
    // Supabase's direct host has no A record on the free plan.
    ipv6Only: /^db\..+\.supabase\.co$/.test(host),
    // Password never included — this is printed to a build log.
    redacted: `${parsed.protocol}//${user}:••••@${host}:${port}${parsed.pathname}`,
  };
}

const runtime = describe('DATABASE_URL', DATABASE_URL);

// The URL migrations run against.
const migrationUrl = DIRECT_URL || DATABASE_URL;
const migration = describe(DIRECT_URL ? 'DIRECT_URL' : 'DATABASE_URL', migrationUrl);

// Echo both, passwords stripped. Every remaining failure below is diagnosed
// from the username, host and port, so printing them once up front means a
// failed build carries its own evidence.
step('Database configuration');
console.log(`  DATABASE_URL  ${runtime.redacted}`);
console.log(`  DIRECT_URL    ${DIRECT_URL ? migration.redacted : '(not set — using DATABASE_URL)'}`);

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

// A transaction pooler also needs ?pgbouncer=true, but adding it here would be
// theatre: mutating this process's env cannot reach the server that runs later.
// src/lib/db.ts applies it where the client is actually constructed.
if (runtime.transactionPooler) {
  warn('DATABASE_URL is a transaction pooler; src/lib/db.ts will add ?pgbouncer=true at runtime.');
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

// ------------------------------------------- destructive migrations on preview
//
// Every build runs `prisma migrate deploy`, and preview deployments share the
// production database. So a pull request's *preview* changes live data before
// anyone has reviewed the pull request. Adding a column that way is harmless.
// Dropping one is not: it is gone from real bookings, real staff and real
// receipts, and there is no undo and no separate copy to restore from.
//
// Additive migrations therefore keep running on previews — that is what makes a
// preview worth looking at, since it shows the spa's actual data. Anything that
// destroys data is refused there and waits for the production deploy, which
// happens only after the change has been merged deliberately.

/** Migration folders the database has not seen yet. Null when it cannot tell. */
function pendingMigrations() {
  let out = '';
  try {
    // Capped, and never inheriting stdio: a check that protects the build must
    // not be able to hang it. Anything unexpected lands in the catch and the
    // build carries on to the migration step, which reports properly.
    out = execSync('npx prisma migrate status', {
      env: process.env, encoding: 'utf8', stdio: 'pipe', timeout: 90_000,
    });
  } catch (err) {
    // A pending migration is itself a non-zero exit, so the output is on the
    // error rather than the return value. Genuine failures land here too and
    // fall through to the null below.
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  if (!/have not yet been applied/i.test(out)) {
    return /schema is up to date/i.test(out) ? [] : null;
  }
  const after = out.split(/have not yet been applied:?\s*\n/i)[1] ?? '';
  const names = [];
  for (const line of after.split('\n')) {
    const name = line.trim();
    if (!name) break;
    if (/^to apply/i.test(name)) break;
    names.push(name);
  }
  return names;
}

/**
 * Statements that lose data, ignoring anything inside a comment.
 *
 * The comment stripping is not fussiness: these migration files explain
 * themselves at length, and several of ours discuss dropping and deleting in
 * prose while doing nothing of the sort. Matching the prose would refuse every
 * build for a migration that only adds a column.
 */
function destructiveStatements(sql) {
  const code = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
  const patterns = [
    [/\bDROP\s+TABLE\b/i, 'drops a table'],
    [/\bDROP\s+COLUMN\b/i, 'drops a column'],
    [/\bDROP\s+SCHEMA\b/i, 'drops a schema'],
    [/\bDROP\s+DATABASE\b/i, 'drops the database'],
    [/\bTRUNCATE\b/i, 'empties a table'],
    [/\bDELETE\s+FROM\b/i, 'deletes rows'],
  ];
  return patterns.filter(([re]) => re.test(code)).map(([, what]) => what);
}

const isPreview = Boolean(process.env.VERCEL_ENV) && process.env.VERCEL_ENV !== 'production';
const pending = pendingMigrations();
const dangerous = [];
if (pending?.length) {
  for (const name of pending) {
    const file = join('prisma', 'migrations', name, 'migration.sql');
    if (!existsSync(file)) continue;
    const what = destructiveStatements(readFileSync(file, 'utf8'));
    if (what.length) dangerous.push({ name, what });
  }
}

if (dangerous.length && isPreview) {
  fail('This preview would destroy live data, so it was stopped.', [
    'Preview deployments share the production database. These migrations have',
    'not run yet, and each one removes something that cannot be brought back:',
    '',
    ...dangerous.map((d) => `  • ${d.name} — ${d.what.join(', ')}`),
    '',
    'Nothing has been changed. The build stopped before the migration step.',
    '',
    'This is deliberate. An additive migration is safe to try on a preview and',
    'genuinely useful, because the preview shows the real spa data. A migration',
    'that deletes is not: it would take effect on live bookings and staff before',
    'anyone had reviewed the pull request.',
    '',
    'What to do:',
    '  • Merge the pull request when you are happy with it. The production',
    '    deploy will apply the migration normally.',
    '  • To preview the rest of the change first, take the destructive migration',
    '    out of this branch and add it back once the rest is merged.',
    '  • Back up before merging: Portal → Settings → Backup.',
  ]);
}

if (dangerous.length) {
  warn('This deploy applies migrations that remove data:');
  for (const d of dangerous) warn(`    • ${d.name} — ${d.what.join(', ')}`);
  warn('  Merged and deliberate, so it is going ahead. There is no undo.');
} else if (pending === null) {
  // The check is a guard, not a gate: if the database could not be reached to
  // ask what is pending, the migration step below will fail with a far better
  // message than anything that could be said here.
  warn('Could not list pending migrations, so the destructive-change check was skipped.');
}

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
