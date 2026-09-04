#!/usr/bin/env node
/**
 * `prisma migrate deploy`, pointed at the right schema.
 *
 * It exists because the bare CLI cannot be trusted to find it. Prisma takes
 * the migration connection from the schema's `directUrl = env("DIRECT_URL")`
 * in preference to DATABASE_URL, and it knows nothing about DATABASE_SCHEMA —
 * so `npx prisma migrate deploy` on a shared database quietly migrates into
 * `public`, on top of whatever else lives there. Every caller goes through
 * here instead: the production build, and the seed workflow.
 *
 * Standalone by necessity. It runs before anything is compiled, so it cannot
 * import src/lib/db-url.ts; the rule below is that file's, repeated.
 */
import { execSync } from 'node:child_process';

function withSchema(raw) {
  const schema = process.env.DATABASE_SCHEMA;
  if (!raw || !schema) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.set('schema', schema);
    return url.toString();
  } catch {
    return raw;
  }
}

const { DATABASE_URL, DIRECT_URL } = process.env;
if (!DATABASE_URL && !DIRECT_URL) {
  console.error('\n✗ Neither DATABASE_URL nor DIRECT_URL is set — nothing to migrate.');
  process.exit(1);
}

// DDL cannot run through a transaction pooler, so the direct connection wins.
const url = withSchema(DIRECT_URL || DATABASE_URL);

execSync('prisma migrate deploy', {
  stdio: 'inherit',
  // Both, because Prisma reads DIRECT_URL for the migration and DATABASE_URL
  // for everything else, and a mismatch between them is the whole bug.
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
});
