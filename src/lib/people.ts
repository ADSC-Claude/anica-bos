/**
 * Two names for one person, and knowing which to use where.
 *
 * A therapist has a legal name — the one on her SSS record, her payslip and any
 * BIR form — and the name everyone actually says, which at this spa is "Ms."
 * plus her nickname or her first name. Using the first where the second belongs
 * makes the booking page read like a summons; using the second where the first
 * belongs puts a nickname on a government return.
 *
 * So both are stored, and the rule is simple: payroll and government use
 * `legalName`, everything a person reads uses `displayName`.
 */

export type NameParts = {
  firstName: string;
  middleName?: string;
  lastName?: string;
};

export type DisplayParts = {
  title?: string;
  nickname?: string;
  firstName?: string;
  /** The assembled legal name, as a last resort for records with no parts. */
  name?: string;
};

/** Titles offered on the employee form. */
export const TITLES = ['Ms.', 'Mr.', 'Mx.'] as const;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * "Jenny Delos Santos Ramos" — first, middle, surname, in the order Filipino
 * records are usually written when spelled out in full.
 */
export function legalName(p: NameParts): string {
  return squash([p.firstName, p.middleName ?? '', p.lastName ?? ''].join(' '));
}

/**
 * "Ramos, Jenny Delos Santos" — surname first, for payslips and forms that sort
 * by it. Falls back to the plain order when there is no surname on file.
 */
export function fileAsName(p: NameParts): string {
  const rest = squash([p.firstName, p.middleName ?? ''].join(' '));
  const last = squash(p.lastName ?? '');
  if (!last) return rest;
  return rest ? `${last}, ${rest}` : last;
}

/**
 * "Ms. Jenny" — how she is addressed everywhere a person will read it.
 *
 * The nickname wins over the first name because it is the whole point of having
 * one: a therapist introduced to clients as Jen should not appear on the
 * booking page as Jennifer.
 */
export function displayName(p: DisplayParts): string {
  const title = squash(p.title ?? 'Ms.');
  const called = squash(p.nickname || p.firstName || '');
  if (!called) {
    // Nothing to work with — an old record with only a full name. Better her
    // whole name than a bare "Ms.".
    return squash(p.name ?? '');
  }
  return squash(`${title} ${called}`);
}

/**
 * Split a single typed-in name into parts, for records that predate the split.
 *
 * First word is the given name, the rest is the surname. Deliberately not
 * clever: "Grace Delos Reyes" might be a two-word surname or a middle name and
 * a surname, and a guess that lands wrong ends up on a payslip. The middle name
 * is left for a person to fill in.
 */
export function splitFullName(full: string): Required<NameParts> {
  const parts = squash(full).split(' ');
  return {
    firstName: parts[0] ?? '',
    middleName: '',
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * The name to put in front of a person, with a fallback.
 *
 * `displayName` is filled on save and backfilled by migration, so it is
 * normally just there — but a row created by a script or a seed that forgot it
 * should show her name rather than nothing at all.
 */
export function shownName(e: { displayName?: string | null; name: string }): string {
  return squash(e.displayName ?? '') || e.name;
}
