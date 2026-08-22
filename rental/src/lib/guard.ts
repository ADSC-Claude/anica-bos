import 'server-only';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { accountStanding, getSession, type SessionUser } from './auth';
import { HttpError } from './errors';
import { can, isFieldRole, type Permission } from './rbac';
import { prisma } from './db';

// HttpError lives in errors.ts so the domain can throw a 409 without dragging
// next/navigation — and therefore React — in behind it. Re-exported here
// because every route already imports it from this module.
export { HttpError, assert } from './errors';

/** Page guard: redirects rather than throwing. */
export async function requirePage(permission?: Permission): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  if ((await accountStanding(user)) === 'revoked') redirect('/login?ended=1');
  if (user.mustChangePassword) redirect('/portal/change-password');
  if (permission && !can(user.role, permission)) redirect(home(user.role) + '?denied=' + permission);
  return user;
}

/** Same, without the forced password-change bounce (used by that page itself). */
export async function requireSessionPage(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  if ((await accountStanding(user)) === 'revoked') redirect('/login?ended=1');
  return user;
}

/** API guard: throws HttpError, which handle() turns into JSON. */
export async function requireApi(permission?: Permission): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new HttpError(401, 'Not signed in.');
  if ((await accountStanding(user)) === 'revoked') {
    throw new HttpError(401, 'This account no longer has access. Please sign in again.');
  }
  if (permission && !can(user.role, permission)) {
    throw new HttpError(403, `Your role (${user.role}) cannot perform this action.`);
  }
  return user;
}

/** Where a role lands after signing in. A cleaner's home is their task list. */
export function home(role: Role): string {
  return isFieldRole(role) ? '/portal/tasks' : '/portal';
}

export function assertPermission(user: SessionUser, permission: Permission) {
  if (!can(user.role, permission)) {
    throw new HttpError(403, `Your role (${user.role}) cannot perform this action.`);
  }
}

// ---------------------------------------------------------------------------
// The second gate: scope
// ---------------------------------------------------------------------------

/**
 * Which properties this user may see at all.
 *
 * `null` means "every property" — Owner and Accountant, and a Manager or
 * Reservations account with no explicit assignment. Anything else is the
 * assigned list, and a query that forgets to apply it is the classic
 * multi-tenant hole, which is why every list query goes through
 * `propertyFilter` below rather than writing its own `where`.
 */
export async function visibleProperties(user: SessionUser): Promise<string[] | null> {
  if (user.role === 'OWNER' || user.role === 'ACCOUNTANT') return null;

  if (isFieldRole(user.role)) {
    // A field role's scope comes from their work, not from an assignment list.
    const tasks = await prisma.task.findMany({
      where: { assigneeId: user.id },
      select: { propertyId: true },
      distinct: ['propertyId'],
    });
    return tasks.map((t) => t.propertyId);
  }

  const assigned = await prisma.userProperty.findMany({
    where: { userId: user.id },
    select: { propertyId: true },
  });
  return assigned.length ? assigned.map((a) => a.propertyId) : null;
}

/** Spread into a `where` clause: `{ ...(await propertyFilter(user)) }`. */
export async function propertyFilter(
  user: SessionUser,
  column = 'propertyId',
): Promise<Record<string, unknown>> {
  const ids = await visibleProperties(user);
  return ids === null ? {} : { [column]: { in: ids } };
}

/** Throws unless this user may touch this property. */
export async function assertProperty(user: SessionUser, propertyId: string): Promise<void> {
  const ids = await visibleProperties(user);
  if (ids === null) return;
  if (!ids.includes(propertyId)) {
    throw new HttpError(403, 'That property is not assigned to you.');
  }
}

/**
 * Narrows a task query to the caller's own assignments when they are a field
 * role. Holding `tasks.complete` is not permission to complete anyone's task.
 */
export function scopeToAssignee(
  user: SessionUser,
  where: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!isFieldRole(user.role)) return where;
  return { ...where, assigneeId: user.id };
}

/** Resolves the branch a request operates on. Non-owners cannot ask for another. */
export async function resolveBranchId(
  user: SessionUser,
  requested?: string | null,
): Promise<string | null> {
  if (requested === 'all') return null;
  if (user.role !== 'OWNER' && user.branchId) return user.branchId;
  if (requested) {
    const exists = await prisma.branch.findUnique({ where: { id: requested }, select: { id: true } });
    if (exists) return exists.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route plumbing
// ---------------------------------------------------------------------------

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<unknown>;

/** Wraps a route handler so thrown HttpErrors become clean JSON responses. */
export function handle(fn: Handler) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const result = await fn(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json((result ?? { ok: true }) as object);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error('[api]', err);
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Something went wrong. Please try again.'
          : String((err as Error)?.message ?? err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

/** Parses and validates a JSON body. The parsed value is what reaches the DB. */
export async function jsonBody<T>(
  req: Request,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = (parsed.error as { issues?: { path: (string | number)[]; message: string }[] })
      ?.issues;
    const first = issues?.[0];
    throw new HttpError(
      400,
      first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input.',
    );
  }
  return parsed.data as T;
}

/** Guard for the cron endpoints. */
export function requireCronSecret(req: Request): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new HttpError(500, 'CRON_SECRET is not configured.');
  const header = req.headers.get('authorization') ?? '';
  // Vercel Cron sends its own bearer; both forms are accepted.
  const provided = header.replace(/^Bearer\s+/i, '');
  if (provided !== expected) throw new HttpError(401, 'Bad or missing cron secret.');
}
