import 'server-only';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { accountStanding, getSession, type SessionUser } from './auth';
import { HttpError } from './errors';
import { can, isStaff, type Permission } from './rbac';
import { prisma } from './db';

export { HttpError, assert } from './errors';

/** Where a role lands after signing in. */
export function home(role: Role): string {
  return isStaff(role) ? '/admin' : '/account';
}

/** Any signed-in account, customer or staff. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  if ((await accountStanding(user)) === 'revoked') redirect('/login?ended=1');
  return user;
}

/** Page guard for the admin: redirects rather than throwing. */
export async function requireStaffPage(permission?: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect('/account');
  if (user.mustChangePassword) redirect('/admin/change-password');
  if (permission && !can(user.role, permission)) redirect('/admin?denied=' + permission);
  return user;
}

/** Same, without the forced password-change bounce (used by that page). */
export async function requireStaffSession(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect('/account');
  return user;
}

/** Page guard for the customer dashboard. Staff may look too, for support. */
export async function requireCustomerPage(next?: string): Promise<SessionUser> {
  return requireUser(next);
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

export function assertPermission(user: SessionUser, permission: Permission) {
  if (!can(user.role, permission)) {
    throw new HttpError(403, `Your role (${user.role}) cannot perform this action.`);
  }
}

// ---------------------------------------------------------------------------
// The second gate: ownership
// ---------------------------------------------------------------------------

/**
 * Loads an invitation the caller may work on: their own, or any if they are
 * staff holding invitations.edit. A customer asking for someone else's gets a
 * 404 rather than a 403 — the existence of the record is not their business.
 */
export async function ownInvitation(user: SessionUser, invitationId: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { template: true, order: { select: { id: true, status: true, serviceMode: true, reference: true } } },
  });
  if (!invitation) throw new HttpError(404, 'That invitation does not exist.');
  const staff = isStaff(user.role) && can(user.role, 'invitations.edit');
  if (invitation.userId !== user.id && !staff) throw new HttpError(404, 'That invitation does not exist.');
  return invitation;
}

export async function ownOrder(user: SessionUser, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { createdAt: 'desc' } }, package: true, invitation: true, dfyJob: true },
  });
  if (!order) throw new HttpError(404, 'That order does not exist.');
  const staff = isStaff(user.role) && can(user.role, 'orders.view');
  if (order.userId !== user.id && !staff) throw new HttpError(404, 'That order does not exist.');
  return order;
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
  return parseWith(schema, raw);
}

export function parseWith<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  raw: unknown,
): T {
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

/** Guard for the cron endpoint. */
export function requireCronSecret(req: Request): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new HttpError(500, 'CRON_SECRET is not configured.');
  const header = req.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  if (provided !== expected) throw new HttpError(401, 'Bad or missing cron secret.');
}

/**
 * Server actions cannot throw HttpError at the browser usefully, so they
 * return `{ error }` instead. This turns one into the other.
 */
export async function action<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof HttpError) return { ok: false, error: err.message };
    // Next.js redirect() and notFound() throw; let them through.
    if (typeof (err as { digest?: string })?.digest === 'string') throw err;
    console.error('[action]', err);
    return { ok: false, error: process.env.NODE_ENV === 'production' ? 'Something went wrong. Please try again.' : String((err as Error)?.message ?? err) };
  }
}
