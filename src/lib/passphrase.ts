/**
 * What makes a backup passphrase acceptable.
 *
 * No imports on purpose, exactly as in intake.ts: the download form is a client
 * component and the encryption runs on the server, and both have to agree on
 * the rule. Left in backup-crypto.ts, this pulled `node:crypto` into the
 * browser bundle through one shared constant and broke the build.
 */

/**
 * Twelve characters rather than eight.
 *
 * This one passphrase stands between an attacker and every client health record
 * the spa holds; it is typed a handful of times a year; and there is no lockout
 * in front of a file sitting on a disk, so an attacker gets unlimited guesses at
 * their own pace. The only cost of a long one is the owner writing it down
 * somewhere safe, which they need to be doing regardless.
 */
export const MIN_PASSPHRASE_LENGTH = 12;

/** The problem with this passphrase, or null when there is none. */
export function passphraseProblem(passphrase: string): string | null {
  if (!passphrase) return 'Enter a passphrase.';
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters — this one file holds every client health record.`;
  }
  return null;
}
