/**
 * The accounts a guest may send a manual reservation fee to.
 *
 * Stored as one free-text setting with a line per account, because a spa's list
 * of banks is not a fixed shape: one has BDO only, another adds BPI and Metro-
 * bank next year, and a third writes "GCash of the owner" underneath. A line
 * per account holds all three without a schema for it.
 *
 * Kept separate from the places that render it so the booking page, the
 * confirmation email and the receptionist's screen cannot disagree about what
 * counts as an account — a blank line between two banks is spacing, not a third
 * bank the guest might try to pay into.
 */

/** One trimmed entry per non-empty line, in the order they were written. */
export function transferAccounts(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The same list on one line, for somewhere that cannot lay out a list — an
 * email body, a text message. Semicolons rather than commas: an account line
 * already contains commas and bullets of its own.
 */
export function transferAccountsSentence(raw: string): string {
  return transferAccounts(raw).join('; ');
}
