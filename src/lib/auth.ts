import 'server-only';
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from './db';

const COOKIE = 'anica_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12h — a full spa day plus slack
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_THRESHOLD = 8;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 characters. Set it in .env.',
    );
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
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

async function requestMeta() {
  const h = await headers();
  return {
    ip:
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      'unknown',
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

/** Reads the session cookie. Returns null when absent, expired, or invalid. */
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
    };
  } catch {
    return null;
  }
}

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

/**
 * Rate-limited by (email, IP) over a rolling 15-minute window using the
 * persisted login history — no extra infrastructure needed.
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
    prisma.loginEvent.create({
      data: { email: normalized, userId: user.id, success: true, ...meta },
    }),
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

/**
 * Verifies an Owner approval PIN for voids, refunds and big discounts.
 *
 * The Owner alone: a void erases a sale and a manual discount gives money
 * away, so the approval is the one control a manager cannot exercise over
 * their own shift. A PIN held by anyone else is not accepted here even if one
 * is stored, and saveUserAction will not store one for a non-Owner account.
 */
export async function verifyApprovalPin(
  pin: string,
): Promise<{ id: string; name: string; role: Role } | null> {
  if (!pin || pin.length < 4) return null;
  const approvers = await prisma.user.findMany({
    where: { active: true, role: 'OWNER', approvalPinHash: { not: null } },
    select: { id: true, name: true, role: true, approvalPinHash: true },
  });
  for (const a of approvers) {
    if (a.approvalPinHash && (await bcrypt.compare(pin, a.approvalPinHash))) {
      return { id: a.id, name: a.name, role: a.role };
    }
  }
  return null;
}

export { requestMeta };
