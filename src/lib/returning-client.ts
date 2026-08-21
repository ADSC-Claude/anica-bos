/**
 * Recognising a guest who has been here before, without telling a stranger
 * anything.
 *
 * The obvious design — type a name, pick yourself from the matches — hands
 * anybody who guesses "Maria Santos" a list of real people with their mobile
 * numbers. For a spa that also holds health answers, that is not a convenience
 * feature, it is a breach waiting for a slow afternoon.
 *
 * So the mobile number is the key, as it already is everywhere else in this
 * system, and the name is the check. Both must agree before anything is
 * skipped. Someone dialling numbers at random learns nothing: without the name
 * the answer is always no, and the answer is only ever yes or no — never a
 * name, an address, or a booking history.
 *
 * A typo in the mobile is caught by the same rule. Entering a digit wrong and
 * landing on another real client used to attach the booking to them silently;
 * now the names disagree and the guest fills the form in as new.
 */

/** Digits only, so 0917 123 4567 and +63 917 123 4567 are one number. */
export function normaliseMobile(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  // A Philippine mobile written internationally is the same number as the one
  // written locally: 639171234567 and 09171234567 both mean 9171234567.
  if (digits.startsWith('63') && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('9') && digits.length === 10) return `0${digits}`;
  return digits;
}

/** Lower-case, unaccented, punctuation-free words. */
function words(name: string): string[] {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Apostrophes vanish rather than splitting: O'Brien and OBrien are one
    // surname, and half of it is not. Hyphens become spaces, because they
    // usually join two given names that are elsewhere written apart.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Whether two names plausibly belong to the same person.
 *
 * First and last must agree; anything between them is ignored, because a woman
 * who booked as "Maria Santos" in March and "Maria Cruz Santos" in August is
 * one guest, and being told otherwise at the counter is a small humiliation.
 * It is a check on a number somebody has already proved they know, not an
 * identity test, so leaning generous is right.
 */
export function namesMatch(typed: string, stored: string): boolean {
  const a = words(typed);
  const b = words(stored);
  if (a.length === 0 || b.length === 0) return false;
  if (a[0] !== b[0]) return false;
  return a[a.length - 1] === b[b.length - 1];
}
