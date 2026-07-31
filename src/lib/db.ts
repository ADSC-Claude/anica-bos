import { PrismaClient } from '@prisma/client';

/**
 * Prisma keeps prepared statements on the connection. A transaction pooler
 * hands the same backend to a different client between statements, so the
 * second request to reuse a name fails with `prepared statement "s0" already
 * exists` — a runtime-only fault, invisible during the build, which surfaces as
 * "a server-side exception has occurred" on the first page that touches the
 * database.
 *
 * `?pgbouncer=true` turns prepared statements off. It has to be applied where
 * the client is constructed rather than in the build script: a build mutating
 * its own process.env does nothing for the server that runs later.
 */
function connectionUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  let url;
  try {
    url = new URL(raw);
  } catch {
    // Let Prisma produce the error message for a malformed URL; scripts/build.mjs
    // already rejects one at build time with something more useful.
    return raw;
  }

  // Port 6543 is the transaction pooler, whoever hosts it. Session poolers and
  // direct connections give each client its own backend, where prepared
  // statements are safe and disabling them only costs performance.
  if (url.port === '6543' && !url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
    // One connection per serverless instance; the pooler does the pooling.
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1');
    }
  }
  return url.toString();
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: connectionUrl(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
