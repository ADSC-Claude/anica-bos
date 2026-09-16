import { SignJWT, jwtVerify } from 'jose';

/**
 * A link to a design that is not published yet.
 *
 * The studio's whole-invitation tab is `?design=draft`, and that is a
 * previewer's view: signed out it changes nothing, which CI checks on every
 * push. But a designer wants to show an unfinished design to the person who
 * asked for it, and that person has no account and should not need one.
 *
 * So a link carries a key. The key names one design and nothing else: it is
 * honoured only on that design's **own demo invitation** — the page the
 * studio itself previews — so a key can never be pointed at a real
 * customer's invitation to read their names, their address and their guest
 * list. A demo is the design's showcase; a customer's invitation is theirs.
 *
 * The key carries the design's `shareNonce` and is checked against the row,
 * so **Stop sharing** is one write: a new nonce, and every link handed out
 * so far stops working at once, without keeping a list of who has one.
 *
 * Thirty days on top of that, because a link nobody remembers giving out
 * should not outlive the design it was made for.
 */

const LIFE = '30d';

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters. Set it in .env.');
  }
  return new TextEncoder().encode(s);
}

/** A fresh secret for a design. Changing it is what Stop sharing does. */
export const freshNonce = (): string => crypto.randomUUID().replace(/-/g, '');

export async function signDraftLink(templateId: string, nonce: string): Promise<string> {
  return new SignJWT({ t: templateId, n: nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(LIFE)
    .sign(secret());
}

/** What a key says, or nothing at all: expired, tampered with, or not a key. */
export async function readDraftLink(token: string): Promise<{ templateId: string; nonce: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const t = payload.t;
    const n = payload.n;
    if (typeof t !== 'string' || !t || typeof n !== 'string' || !n) return null;
    return { templateId: t, nonce: n };
  } catch {
    return null;
  }
}

/**
 * Whether this key opens this design's draft on this page.
 *
 * Every one of these has to hold, and the demo check is the one that matters
 * most: without it a key to any design would open the draft view of any
 * invitation built on it, which is somebody's wedding.
 */
export function keyOpens(
  key: { templateId: string; nonce: string } | null,
  template: { id: string; shareNonce: string; demoSlug: string },
  slug: string,
): boolean {
  if (!key || !template.shareNonce) return false;
  return key.templateId === template.id && key.nonce === template.shareNonce && template.demoSlug === slug;
}
