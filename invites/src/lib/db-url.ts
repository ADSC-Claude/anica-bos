/**
 * The one place that decides which connection string the app actually uses.
 *
 * Two corrections are applied here, and both of them exist because of a
 * failure that only ever appears in production:
 *
 *   • `pgbouncer=true` on a transaction pooler. Prisma keeps prepared
 *     statements on the connection; a transaction pooler hands the same
 *     backend to a different client between statements, so the second request
 *     to reuse a name fails with `prepared statement "s0" already exists`.
 *     A build that mutates its own process.env does nothing for the server
 *     that runs later, so it has to happen where the client is constructed.
 *
 *   • `schema=`, for when this app shares a Postgres database with another
 *     one. DATABASE_SCHEMA is a separate variable rather than something you
 *     append to the URL because the URL is a secret pasted into a dashboard:
 *     if it already ends in a query string, appending `?schema=…` produces a
 *     second `?`, which Postgres and Prisma both read as part of the previous
 *     parameter's *value*. The schema silently stays `public`, the migration
 *     runs against the other app's tables, and the first thing you learn
 *     about it is `type "Role" already exists`. So when DATABASE_SCHEMA is
 *     set it wins over whatever the string says.
 *
 * scripts/db-url.mjs is this rule again in plain JavaScript, for the build and
 * the migration: they run before `prisma generate`, so they cannot import this
 * file. Change both together — tests/db-url.test.ts fails if they disagree,
 * because the last time they did, the build's copy dialled the pooler without
 * `pgbouncer=true` and hung until Vercel killed it.
 */

export function resolveDatabaseUrl(
  raw: string | undefined,
  schema: string | undefined = process.env.DATABASE_SCHEMA,
): string | undefined {
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not parseable — hand it back untouched and let Prisma produce the error,
    // which names the problem better than anything invented here.
    return raw;
  }

  if (schema) url.searchParams.set('schema', schema);

  if (url.port === '6543' && !url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1');
    }
  }

  return url.toString();
}

/** Host, port, database and schema — everything except the credentials. */
export function describeDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return '!! not a valid connection string';
  }
  const port = url.port || '(default)';
  const role = url.port === '6543' ? ' — transaction pooler' : url.port === '5432' ? ' — direct' : '';
  const schema = url.searchParams.get('schema') ?? 'public';
  return `${url.hostname}:${port}${url.pathname} schema=${schema}${role}`;
}
