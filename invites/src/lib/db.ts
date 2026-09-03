import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Prisma keeps prepared statements on the connection. A transaction pooler
 * hands the same backend to a different client between statements, so the
 * second request to reuse a name fails with `prepared statement "s0" already
 * exists` — a runtime-only fault, invisible during the build.
 *
 * `?pgbouncer=true` turns prepared statements off. It has to be applied where
 * the client is constructed: a build mutating its own process.env does nothing
 * for the server that runs later.
 */
function connectionUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  if (url.port === '6543' && !url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
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

/** Unique-constraint violation (P2002) — a slug or email already taken. */
export function isUniqueError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export { Prisma };
