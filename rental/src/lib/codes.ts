import { randomInt, randomBytes } from 'node:crypto';

/**
 * Unambiguous alphabet — no I, O, 0 or 1 — because these codes get read aloud
 * over the phone and copied off a screenshot.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Booking reference shown to the guest, e.g. "STAY-7K4H2M". */
export function bookingReference(): string {
  return `STAY-${randomCode(6)}`;
}

/** Payment reference, e.g. "PAY-4KP2-9TXM". */
export function paymentReference(): string {
  return `PAY-${randomCode(4)}-${randomCode(4)}`;
}

/** Maintenance ticket number, e.g. "MT-2026-4KP2". */
export function ticketNumber(year: number): string {
  return `MT-${year}-${randomCode(4)}`;
}

export function guestCode(): string {
  return `G-${randomCode(6)}`;
}

/** Door code a guest types on a keypad. Digits only — keypads have no letters. */
export function accessCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += randomInt(10);
  return out;
}

/**
 * Secret path segments: iCal feeds, review links, unsubscribe links, manage
 * links. 32 bytes of urlsafe base64 — these appear in URLs that get forwarded,
 * pasted and logged, so guessing one must be hopeless.
 */
export function secretToken(): string {
  return randomBytes(24).toString('base64url');
}

/** "Serenity Suite, BGC" -> "serenity-suite-bgc" */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
