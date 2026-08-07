import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Prisma keeps prepared statements on the connection. A transaction pooler
 * hands the same backend to a different client between statements, so the
 * second request to reuse a name fails with `prepared statement "s0" already
 * exists` — a runtime-only fault, invisible during the build, which surfaces as
 * "a server-side exception has occurred" on the first page that touches the
 * database.
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

  // Port 6543 is the transaction pooler, whoever hosts it. Session poolers and
  // direct connections give each client its own backend.
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

/**
 * SQLSTATE 23P01 — exclusion_violation. Raised by `CalendarSpan_no_overlap`
 * when someone tries to hold dates another span already holds.
 *
 * This is the happy path of a race, not an error to be surprised by: two guests
 * pressing Book at the same instant is exactly what the constraint is for. The
 * loser gets a 409 and a message; nobody gets a double booking.
 *
 * Prisma surfaces a constraint it does not model as P2010 (raw query) or P2034
 * (transaction conflict), and passes the driver's `code` through in `meta`, so
 * checking the message as well as the meta is the reliable test here.
 */
export function isOverlapError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta as { code?: string; constraint?: string } | undefined;
    if (meta?.code === '23P01') return true;
    if (meta?.constraint === 'CalendarSpan_no_overlap') return true;
  }
  const message = String((err as { message?: string })?.message ?? '');
  return message.includes('23P01') || message.includes('CalendarSpan_no_overlap');
}

export { Prisma };
