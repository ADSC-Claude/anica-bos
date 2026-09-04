import 'server-only';
import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Password-protected invitations. A correct password sets a cookie holding
 * an HMAC of the invitation id and its password hash, so changing the
 * password logs every guest out and the cookie itself reveals nothing.
 */
export function accessCookieName(invitationId: string): string {
  return `inv_${invitationId}`;
}

export function accessToken(invitationId: string, passwordHash: string): string {
  return createHmac('sha256', process.env.SESSION_SECRET ?? 'dev').update(`${invitationId}:${passwordHash}`).digest('hex').slice(0, 40);
}

export async function hasGuestAccess(invitation: { id: string; privacy: string; passwordHash: string | null }): Promise<boolean> {
  if (invitation.privacy !== 'PASSWORD' || !invitation.passwordHash) return true;
  const store = await cookies();
  return store.get(accessCookieName(invitation.id))?.value === accessToken(invitation.id, invitation.passwordHash);
}

export async function grantGuestAccess(invitation: { id: string; passwordHash: string | null }): Promise<void> {
  if (!invitation.passwordHash) return;
  const store = await cookies();
  store.set(accessCookieName(invitation.id), accessToken(invitation.id, invitation.passwordHash), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
}
