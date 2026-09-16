/**
 * The connection-string rule, for the scripts that run before anything is
 * compiled — the production build and the migration.
 *
 * This is a second implementation of src/lib/db-url.ts, which those scripts
 * cannot import: they run before `prisma generate`, when there is no build
 * output and no TypeScript loader. It exists as a file rather than as a copy
 * pasted into each script because the copies drifted, and the drift cost a
 * production deployment: build.mjs applied the `schema=` half of the rule and
 * not the `pgbouncer=true` half, so its own connection check dialled the
 * transaction pooler in precisely the configuration the rule exists to
 * prevent, and hung there until the platform killed the build.
 *
 * tests/db-url.test.ts asserts this file and src/lib/db-url.ts agree, so the
 * next divergence is a failed test rather than a wedged deployment.
 */

/** @type {(raw: string | undefined, schema?: string | undefined) => string | undefined} */
export function resolveDatabaseUrl(raw, schema = process.env.DATABASE_SCHEMA) {
  if (!raw) return undefined;

  let url;
  try {
    url = new URL(raw);
  } catch {
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
export function describeDatabaseUrl(raw) {
  let url;
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

/**
 * Whether a build is a preview pointed at the schema production serves.
 *
 * Vercel hands every environment the same variables unless someone scopes
 * them, so by default a preview build applies its branch's migrations to the
 * live database — which is how a column rename on a branch took the storefront
 * down while its own preview stayed green. scripts/build.mjs refuses to build
 * when this answers true; the fix is a DATABASE_SCHEMA scoped to Preview.
 *
 * It is here rather than inline in the build so a test can hold it: a rule
 * that only exists inside a script nobody imports is a rule until somebody
 * edits the script.
 */
/** @param {Record<string, string | undefined>} [env] */
export function previewOnProductionSchema(env = process.env) {
  if (env.VERCEL_ENV !== 'preview') return false;
  const production = env.PRODUCTION_DATABASE_SCHEMA || 'invites';
  return (env.DATABASE_SCHEMA || 'public') === production;
}

/**
 * Whether a production build is pointed at a schema production does not serve.
 *
 * The mirror of the rule above, and the half it was missing. An hour after the
 * preview guard was written, DATABASE_SCHEMA was scoped to Preview by editing
 * the one all-environments row rather than adding a second — which left
 * Production naming no schema at all. The next production build fell through
 * to `public` and ran the invitations' first migration there. It failed at
 * CREATE TYPE "Role" and rolled back, because `public` in this database holds
 * an abandoned copy of the spa's schema from a migration that was never
 * finished: the tables exist, and not one row. The live spa is a different
 * Supabase project in a different region and was never reachable from here.
 *
 * The near miss is not that schema. It is the invitations site itself. Had
 * that migration succeeded — as it would have against any empty schema — the
 * build would have gone green, and production would have come up serving a
 * catalogue with no packages, no invitations and no customers, while the real
 * rows sat untouched in `invites` where nothing was looking.
 *
 * So a production build states which schema it is for, or it does not build.
 * An empty DATABASE_SCHEMA is not a build with no opinion; it is a build that
 * has chosen `public`, and `public` is never this app's.
 */
/** @param {Record<string, string | undefined>} [env] */
export function productionOffProductionSchema(env = process.env) {
  if (env.VERCEL_ENV !== 'production') return false;
  const production = env.PRODUCTION_DATABASE_SCHEMA || 'invites';
  return (env.DATABASE_SCHEMA || 'public') !== production;
}
