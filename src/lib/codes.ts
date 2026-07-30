import { randomInt } from 'node:crypto';

/** Unambiguous alphabet — no I/O/0/1, so codes read correctly off a receipt. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Booking reference shown to the public, e.g. "ANC-7K4H2M". */
export function bookingReference(): string {
  return `ANC-${randomCode(6)}`;
}

/** Gift certificate code, e.g. "GC-4KP2-9TXM". */
export function giftCertificateCode(): string {
  return `GC-${randomCode(4)}-${randomCode(4)}`;
}

/** Voucher code with a campaign prefix, e.g. "BDAY-9F2K4H". */
export function voucherCode(prefix = 'VC'): string {
  return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-${randomCode(6)}`;
}
