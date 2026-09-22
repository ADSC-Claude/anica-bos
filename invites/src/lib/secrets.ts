import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Sealing a secret we hold on somebody else's behalf.
 *
 * Passwords are hashed, never sealed — nobody, us included, needs to read one
 * back. This is for the other kind: a third party's token that we have to be
 * able to present again. A Canva refresh token is a standing key to the
 * account every design in the catalogue was drawn in, and it sits in a row
 * that ends up in every database backup, every dump taken to debug something,
 * every export. Hashing it is impossible and storing it in the clear is a
 * decision nobody would defend out loud, so: AES-256-GCM, which also
 * authenticates, so a tampered row fails to open rather than opening wrong.
 *
 * The key is derived from SESSION_SECRET rather than asking for another
 * environment variable, with an `info` string of its own so it is not the
 * same key as anything else derived from that secret. The bargain: rotating
 * SESSION_SECRET means every sealed token stops opening and Canva has to be
 * reconnected. That is two presses, it is the same bargain the guest password
 * cookies already make, and it beats a second secret nobody remembers to set.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, all base64url. The version is there so
 * a later scheme can be told apart from this one without guessing.
 */

const VERSION = 'v1';

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters. Set it in .env.');
  }
  // A salt is not secret and a fixed one is correct here: the input is already
  // a high-entropy secret, so this is domain separation, not password
  // stretching.
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.from('invites:seal:v1'), Buffer.from('third-party-token'), 32));
}

const b64 = (b: Buffer) => b.toString('base64url');

/** Seals a value for storage. Never log the input or the output. */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(body)].join('.');
}

/**
 * Opens a sealed value.
 *
 * Throws if the row was written under a different SESSION_SECRET, tampered
 * with, or is not a sealed value at all. Callers treat a throw as "not
 * connected" and ask for a reconnect, rather than passing a broken token to
 * Canva and reading the failure back as an outage.
 */
export function unseal(sealed: string): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !body) throw new Error('Not a sealed value.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

/** Whether a value can be opened, without caring what it says. */
export function sealedOk(sealed: string): boolean {
  try {
    unseal(sealed);
    return true;
  } catch {
    return false;
  }
}
