import 'server-only';
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';
import { audit } from './audit';

const COOKIE = 'invites_session';
/** Customers build an invitation over evenings; a week keeps them signed in. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_THRESHOLD = 8;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters. Set it in .env.');
  }
  return new TextEncoder().encode(s);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  issuedAt?: number;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown',
    userAgent: h.get('user-agent') ?? '',
  };
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mcp: user.mustChangePassword,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Reads the session cookie. Null when absent, expired or tampered with. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
      mustChangePassword: Boolean(payload.mcp),
      issuedAt: typeof payload.iat === 'number' ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Whether a cookie that still verifies belongs to an account that may still
 * use the system: the row exists, is active, and no revocation happened after
 * the token was signed. Both sides compared in whole seconds because `iat` is
 * stamped in seconds.
 */
export async function accountStanding(session: SessionUser): Promise<'ok' | 'revoked'> {
  const row = await prisma.user.findUnique({
    where: { id: session.id },
    select: { active: true, sessionsRevoked: true, role: true },
  });
  if (!row || !row.active) return 'revoked';
  if (row.role !== session.role) return 'revoked';
  if (row.sessionsRevoked && session.issuedAt !== undefined) {
    const revokedAt = Math.floor(row.sessionsRevoked.getTime() / 1000);
    if (session.issuedAt < revokedAt) return 'revoked';
  }
  return 'ok';
}

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; error: string };

/**
 * Rate limited by email over a rolling 15-minute window using the persisted
 * login history — no extra infrastructure, and the attempts stay auditable.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const meta = await requestMeta();
  const normalized = email.trim().toLowerCase();

  const recentFailures = await prisma.loginEvent.count({
    where: {
      email: normalized,
      success: false,
      createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
    },
  });

  if (recentFailures >= LOCKOUT_THRESHOLD) {
    await prisma.loginEvent.create({
      data: { email: normalized, success: false, reason: 'rate_limited', ...meta },
    });
    return { ok: false, error: 'Too many attempts. Please wait 15 minutes and try again.' };
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !passwordOk || !user.active) {
    await prisma.loginEvent.create({
      data: {
        email: normalized,
        userId: user?.id ?? null,
        success: false,
        reason: !user ? 'unknown_email' : !passwordOk ? 'bad_password' : 'inactive',
        ...meta,
      },
    });
    return { ok: false, error: 'Incorrect email or password.' };
  }

  await prisma.$transaction([
    prisma.loginEvent.create({ data: { email: normalized, userId: user.id, success: true, ...meta } }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
  await createSession(sessionUser);
  return { ok: true, user: sessionUser };
}

/**
 * Customer sign-up. Staff accounts are never created here — an admin makes
 * them in Settings, so a stranger cannot register their way onto the queue.
 */
export async function signup(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Please tell us your name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'That email does not look right.' };
  if (input.password.length < 8) return { ok: false, error: 'Use at least 8 characters for your password.' };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: 'That email already has an account. Sign in instead.' };

  const user = await prisma.user.create({
    data: {
      email,
      name,
      phone: (input.phone ?? '').trim(),
      passwordHash: await hashPassword(input.password),
      role: 'CUSTOMER',
    },
  });

  const meta = await requestMeta();
  await prisma.loginEvent.create({ data: { email, userId: user.id, success: true, reason: 'signup', ...meta } });

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: false,
  };
  await createSession(sessionUser);
  return { ok: true, user: sessionUser };
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const actor: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };

  if (!(await verifyPassword(current, user.passwordHash))) {
    // Recorded, and sensitive: somebody holding a stolen session trying to
    // take the account outright looks exactly like this, and the attempt is
    // the only warning there is.
    await audit(actor, {
      module: 'auth',
      action: 'password.change_refused',
      entityType: 'user',
      entityId: user.id,
      summary: 'Current password did not match.',
      sensitive: true,
    });
    throw new HttpError(400, 'Your current password is incorrect.');
  }
  if (next.length < 8) throw new HttpError(400, 'Use at least 8 characters.');
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await audit(actor, {
    module: 'auth',
    action: 'password.changed',
    entityType: 'user',
    entityId: user.id,
    summary: `${user.email} changed their own password.`,
    sensitive: true,
  });
  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: false,
  });
}
