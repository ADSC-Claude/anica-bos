import 'server-only';
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from './db';

const COOKIE = 'stays_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // a full turnover day plus slack
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
  branchId: string | null;
  mustChangePassword: boolean;
  /**
   * When the token was signed, in seconds. Used only to tell a token issued
   * before an account was locked from one issued after.
   */
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
    branchId: user.branchId,
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
      branchId: (payload.branchId as string | null) ?? null,
      mustChangePassword: Boolean(payload.mcp),
      issuedAt: typeof payload.iat === 'number' ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Whether a cookie that still verifies belongs to an account that may still use
 * the system.
 *
 * The token is self-contained and lives twelve hours, so on its own it says
 * nothing about what has happened since it was signed. A cleaner dismissed at
 * ten in the morning would keep their access until evening — which is not what
 * the person clicking "Disable" believes they have done.
 *
 * Three ways an account stops standing: the row is gone, the row is disabled,
 * or its sessions were revoked after this token was signed.
 */
export async function accountStanding(session: SessionUser): Promise<'ok' | 'revoked'> {
  const row = await prisma.user.findUnique({
    where: { id: session.id },
    select: { active: true, sessionsRevoked: true },
  });
  if (!row || !row.active) return 'revoked';
  // Both sides in whole seconds, because `iat` is stamped in seconds: comparing
  // it against milliseconds reads a token minted at 10:00:00.2 as older than a
  // revocation at 10:00:00.7, and locks out the sign-in meant to restore access.
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
    // One message for all three cases: which of them it was is not the
    // stranger's business.
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
    branchId: user.branchId,
    mustChangePassword: user.mustChangePassword,
  };
  await createSession(sessionUser);
  return { ok: true, user: sessionUser };
}
