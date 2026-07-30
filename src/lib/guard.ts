import 'server-only';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from './auth';
import { can, type Permission } from './rbac';
import { prisma } from './db';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Page guard: redirects to the login screen instead of throwing. */
export async function requirePage(permission?: Permission): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/portal/change-password');
  if (permission && !can(user.role, permission)) redirect('/portal?denied=' + permission);
  return user;
}

/** Same as requirePage but without the forced password-change bounce. */
export async function requireSessionPage(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
}

/** API guard: throws HttpError, which `handle()` converts into a JSON response. */
export async function requireApi(permission?: Permission): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new HttpError(401, 'Not signed in.');
  if (permission && !can(user.role, permission)) {
    throw new HttpError(403, `Your role (${user.role}) cannot perform this action.`);
  }
  return user;
}

export function assert(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}

export function assertPermission(user: SessionUser, permission: Permission) {
  if (!can(user.role, permission)) {
    throw new HttpError(403, `Your role (${user.role}) cannot perform this action.`);
  }
}

/**
 * Resolves the branch a request operates on. Non-Owners are hard-pinned to
 * their assigned branch — a Receptionist cannot read another branch by
 * passing ?branchId=.
 */
export async function resolveBranchId(
  user: SessionUser,
  requested?: string | null,
): Promise<string> {
  if (user.role !== 'OWNER' && user.branchId) return user.branchId;
  if (requested) {
    const exists = await prisma.branch.findUnique({ where: { id: requested }, select: { id: true } });
    if (exists) return exists.id;
  }
  if (user.branchId) return user.branchId;
  const fallback = await prisma.branch.findFirst({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  assert(fallback, 500, 'No active branch configured.');
  return fallback.id;
}

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

/** Parses and validates a JSON body with a Zod schema. */
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
