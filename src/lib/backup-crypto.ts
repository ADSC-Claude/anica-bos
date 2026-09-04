/**
 * Encrypting a backup, so the file holding every client health record is not
 * readable by whoever picks up the laptop.
 *
 * The full backup is the one export that contains health information, and until
 * now it was plain JSON: openable in Notepad, on a USB stick, in a Downloads
 * folder, in whatever cloud drive the folder happens to sync to. Every other
 * control in this system — the role checks, the audit log, the export that
 * leaves health data out — is undone by that one file.
 *
 * Deliberately no `server-only` import: the CLI backup and restore scripts run
 * outside Next and need exactly this code. A backup the scripts cannot read is
 * a backup nobody can restore.
 *
 * AES-256-GCM, with the key stretched from a passphrase by scrypt. GCM because
 * it authenticates as well as encrypts — a backup that has been altered should
 * fail loudly on restore rather than quietly load edited figures into the
 * books. scrypt because the input is a human passphrase, and a fast hash over a
 * human passphrase is a dictionary attack waiting to happen.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { passphraseProblem } from './passphrase';

export { MIN_PASSPHRASE_LENGTH, passphraseProblem } from './passphrase';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Marks a file as one of ours, and says how to read it. */
export const ENVELOPE_FORMAT = 'anica-encrypted-backup';
export const ENVELOPE_VERSION = 1;

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard
const SALT_BYTES = 16;

/**
 * The shape written to disk. Everything except the passphrase travels with the
 * file: a backup that can only be opened on the machine that made it is not a
 * backup, it is a second copy of a single point of failure.
 */
export type EncryptedEnvelope = {
  format: typeof ENVELOPE_FORMAT;
  version: number;
  algorithm: 'aes-256-gcm';
  kdf: 'scrypt';
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  encryptedAt: string;
};

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { format?: unknown }).format === ENVELOPE_FORMAT
  );
}

export async function encryptBackup(
  plaintext: string,
  passphrase: string,
  now: Date,
): Promise<EncryptedEnvelope> {
  const problem = passphraseProblem(passphrase);
  if (problem) throw new Error(problem);

  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await scrypt(passphrase, salt, KEY_BYTES);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    encryptedAt: now.toISOString(),
  };
}

/**
 * Returns the original JSON text, or throws with something a person can act on.
 *
 * A wrong passphrase and a corrupted file both surface as a GCM tag mismatch,
 * and the raw error for that is "Unsupported state or unable to authenticate
 * data" — which tells the owner of a spa nothing at all. Both possibilities are
 * named instead, because at 2am during a restore the difference between "try
 * the other passphrase" and "fetch yesterday's file" is the whole question.
 */
export async function decryptBackup(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<string> {
  if (envelope.version > ENVELOPE_VERSION) {
    throw new Error(
      `This backup was written by a newer version of the app (format ${envelope.version}). Update before restoring it.`,
    );
  }

  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const key = await scrypt(passphrase, salt, KEY_BYTES);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(
      'Could not open this backup. Either the passphrase is wrong, or the file has been altered since it was written.',
    );
  }
}

/**
 * Constant-time compare for the passphrase confirmation field.
 *
 * A mistyped passphrase on a backup nobody opens for a year is a backup that
 * was never taken, so the download asks for it twice. Compared this way out of
 * habit rather than need — it costs nothing, and habits are what survive a
 * copy-paste into somewhere it does matter.
 */
export function samePassphrase(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
