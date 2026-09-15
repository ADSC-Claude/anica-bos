/**
 * The duplicate check on a guest import.
 *
 * A couple keeps their list in a spreadsheet long before it comes here, and
 * sends it more than once: a first pass, then the same workbook again with
 * ten more names on it. Without this the second upload doubled the list, and
 * every doubled name was a guest with two links, two reminders and two seats
 * on the count. So a row is left out when it is the same person as somebody
 * already on the list, or as an earlier row of the same file.
 *
 * "Same person" is judged three ways, and any one is enough: the same name,
 * the same mobile number, or the same e-mail address. Each is compared with
 * the noise taken out — case, spacing, accents and punctuation in a name; the
 * spaces, dashes and the +63 or 0 in front of a number; case around an
 * address — because "MA. TERESA" and "Ma Teresa" are one tita, and 0917 and
 * +63 917 are one phone. A blank number or address matches nothing: half the
 * rows on a real list have no contact yet, and they are not all one guest.
 *
 * Pure, and kept apart from guests.ts so it can be tested without a database.
 */

export type GuestLike = { name: string; phone?: string | null; email?: string | null };

/** The three keys a guest is known by, each empty when there is nothing to compare. */
export type GuestKeys = { name: string; phone: string; email: string };

/** What an import came to: rows added, blank rows left out, rows already on the list. */
export type ImportResult = { added: number; skipped: number; duplicates: number; examples: number };

/**
 * The blank guest list's own lines: two made-up guests to show the shape,
 * and the notes under them. A file sent back with the examples still in it —
 * which happens — must not seat Ninong Fred at the wedding, so the importer
 * knows them by sight. An example is known by its name and its number
 * together: a real Ninong Fred with a number of his own is kept.
 */
export const TEMPLATE_EXAMPLES = [
  { name: 'Mr. & Mrs. Dela Cruz', group: "Bride's family", seats: '2', phone: '0917 123 4567', email: 'delacruz@email.com', greeting: 'Tito Ben & Tita Let' },
  { name: 'Ninong Fred', group: 'Principal sponsors', seats: '1', phone: '0918 765 4321', email: 'fred@email.com', greeting: 'Ninong Fred' },
];
export const TEMPLATE_NOTES = [
  'Delete these two example rows before you send this back.',
  'Seats is how many places you are setting aside for that name — a couple is 2.',
  'Phone and Email are what a reminder is sent to. Fill in what you have; a blank one is simply skipped.',
  'Greeting is how the invitation addresses them: "Dear ___". Leave it blank to use the name.',
  'Group can be any of:',
  'Group can be any word you like — it is how the headcount sheet is sorted.',
];
const digits = (s: string) => s.replace(/\D/g, '');
export function isTemplateLine(name: string, phone = ''): boolean {
  const n = name.trim();
  return TEMPLATE_NOTES.includes(n) || TEMPLATE_EXAMPLES.some((e) => e.name === n && digits(e.phone) === digits(phone));
}

export function guestKeys(g: GuestLike): GuestKeys {
  return { name: nameKey(g.name), phone: phoneKey(g.phone), email: emailKey(g.email) };
}

/**
 * The same noise-stripping as sameName in names.ts, so "the same name" means
 * one thing everywhere a name is compared.
 */
function nameKey(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Digits only, with the three ways a Philippine mobile is written brought to
 * one — the same three phMobile in sms.ts accepts, repeated here rather than
 * imported because sms.ts is server-only and this is not. Anything else is
 * compared as its digits: a foreign number typed the same way twice still
 * matches.
 */
function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  return digits;
}

function emailKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

/**
 * The indexes of `rows` that repeat somebody: a guest in `existing`, or an
 * earlier row of the same import. Of two identical rows in one file the first
 * is kept and the second refused, which is what a customer who pasted the same
 * range twice meant.
 */
export function duplicateRows(existing: GuestLike[], rows: GuestLike[]): Set<number> {
  const seen = { name: new Set<string>(), phone: new Set<string>(), email: new Set<string>() };
  const remember = (k: GuestKeys) => {
    if (k.name) seen.name.add(k.name);
    if (k.phone) seen.phone.add(k.phone);
    if (k.email) seen.email.add(k.email);
  };
  for (const g of existing) remember(guestKeys(g));

  const dupes = new Set<number>();
  rows.forEach((row, i) => {
    const k = guestKeys(row);
    if ((k.name && seen.name.has(k.name)) || (k.phone && seen.phone.has(k.phone)) || (k.email && seen.email.has(k.email))) dupes.add(i);
    remember(k);
  });
  return dupes;
}

/**
 * The sentence the list shows when an import lands. The repeats get a
 * sentence of their own: a customer who sent the same file twice should read
 * that nothing doubled, not wonder why the count came out low.
 */
export function importNotice({ added, skipped, duplicates, examples }: ImportResult): string {
  const parts = [`Imported ${added} ${added === 1 ? 'guest' : 'guests'}.`];
  if (duplicates) parts.push(`${duplicates} already on the list ${duplicates === 1 ? 'was' : 'were'} skipped.`);
  if (skipped) parts.push(`${skipped} blank ${skipped === 1 ? 'row was' : 'rows were'} left out.`);
  if (examples) parts.push("The template's example rows and notes were left out.");
  return parts.join(' ');
}
