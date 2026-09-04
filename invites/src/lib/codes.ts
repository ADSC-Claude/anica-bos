import { randomInt, randomBytes } from 'node:crypto';

/**
 * Unambiguous alphabet — no I, O, 0 or 1 — because these codes get read aloud
 * over Messenger voice notes and copied off a screenshot.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Order reference shown to the customer, e.g. "INV-7K4H2M". */
export function orderReference(): string {
  return `INV-${randomCode(6)}`;
}

/** Payment reference, e.g. "PAY-4KP2-9TXM". */
export function paymentReference(): string {
  return `PAY-${randomCode(4)}-${randomCode(4)}`;
}

/**
 * Secret path segments: per-guest links, preview links, check-in QR payloads.
 * 18 bytes of urlsafe base64 — these appear in URLs that get forwarded through
 * group chats, so guessing one must be hopeless while the link stays short
 * enough to survive a Viber message without wrapping into two.
 */
export function guestToken(): string {
  return randomBytes(18).toString('base64url');
}

export function secretToken(): string {
  return randomBytes(24).toString('base64url');
}

/** "Juan & María" -> "juan-maria" */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
