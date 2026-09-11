import { toCsv } from './csv';

/**
 * The two spreadsheets a couple works their guest list in, and the rules for
 * reading one back.
 *
 * Free of `server-only` and of Prisma on purpose: everything here is text in
 * and text out, and a rule about a file ought to be testable without standing
 * a database up. `guests.ts` does the reading and writing around it.
 */

/**
 * A line the file uses to explain itself, rather than a guest.
 *
 * Both downloads carry their instructions inside them, which only works if the
 * instructions cannot become people: a couple who fills in the blank list and
 * sends it back without tidying up would otherwise acquire a guest called
 * "Seats is how many places you are setting aside". One character in the first
 * column settles it, and it is a character Excel shows plainly rather than
 * hiding, so nobody has to be told the rule to obey it.
 *
 * It also means the honest answer to "what do I have to change?" is nothing.
 * They type their guests in and leave everything else exactly where it sits.
 */
export const NOTE = '#';

export function isNote(row: string[]): boolean {
  return (row[0] ?? '').trim().startsWith(NOTE);
}

/** A note row, keeping its later columns so the shape of a row still reads. */
export function note(text: string, rest: string[] = []): string[] {
  return [`${NOTE} ${text}`, ...rest];
}

export function seatsFrom(cell: string): number {
  return Math.max(1, Math.min(20, parseInt(cell, 10) || 1));
}

/**
 * The guest a row belongs to, read out of the Personal link column.
 *
 * The token is the join and the name is not, deliberately. Two Dela Cruz
 * households, and a Tita Baby spelled Tita Bhaby the second time round, are
 * both ordinary — and both of them match wrongly on a name. The token is ours,
 * it is unique, and it travels in the file we handed them.
 *
 * The whole link or the token alone both work: somebody will copy one column
 * of a spreadsheet into another and lose the prefix.
 */
export function tokenFromLink(value: string): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const last = raw.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? '';
  return /^[A-Za-z0-9_-]{10,64}$/.test(last) ? last : '';
}

export const GUEST_COLUMNS = ['Name', 'Group', 'Seats', 'Phone', 'Email', 'Greeting'] as const;
export const SEAT_SHEET_COLUMNS = [...GUEST_COLUMNS, 'Personal link'] as const;

/**
 * The blank a couple fills in.
 *
 * It is the importer's own column names in its own order, so a file that comes
 * back is a file that reads: the header row is what the importer matches on,
 * and the examples show the shape of each column rather than describing it.
 *
 * The instructions are in the file rather than on the page that offers it,
 * because the page is not what they have open three days later — Excel is.
 *
 * CSV rather than a workbook, and deliberately: Excel and Google Sheets both
 * open it by double-click, and whichever of the two they save it back as, the
 * upload reads it.
 */
export function guestTemplateCsv(groups: string[]): string {
  const shape = (name: string, group: string, seats: string, phone: string, email: string, greeting: string) =>
    note(name, [group, seats, phone, email, greeting]);
  return toCsv([...GUEST_COLUMNS], [
    note('Type your guests here, one per row, starting on this line.'),
    note('Everything below begins with # — those are notes to you, and we ignore them. Leave them exactly where they are.'),
    note('Do not rename or move the headings in the top row. That row is how we read the file.'),
    note(''),
    note('Name — one row per invitation, not per person. "Mr. & Mrs. Dela Cruz" is one row.'),
    note('Seats — how many places you are setting aside for that name. One person is 1, a couple is 2, a family of five is 5.'),
    note('Phone and Email — where their reminder goes. Fill in what you have; a blank one is simply skipped.'),
    note('Greeting — how the invitation says hello: "Dear ___". Leave it blank and we use the name.'),
    groups.length
      ? note(`Group — any of: ${groups.join(', ')}. Or a word of your own.`)
      : note('Group — any word you like. It is how the headcount sheet is sorted.'),
    note(''),
    note('Then save the file and upload it on the same page you got it from.'),
    note(''),
    note('The two rows underneath are examples of the shape. They are notes too, so they never become guests —'),
    note('delete the # at the front of one to turn it into a real name, or just type your own rows above.'),
    shape('Mr. & Mrs. Dela Cruz', groups[0] ?? "Bride's family", '2', '0917 123 4567', 'delacruz@email.com', 'Tito Ben & Tita Let'),
    shape('Ninong Fred', groups[1] ?? 'Principal sponsors', '1', '0918 765 4321', 'fred@email.com', 'Ninong Fred'),
  ]);
}

/**
 * What the seat sheet says at the bottom of itself.
 *
 * The Personal link column is what makes the sheet a round trip rather than a
 * second copy of the wedding, and it is the one column that must not be
 * touched — so that is said in those words, next to the reason.
 */
export const SEAT_SHEET_NOTES: string[][] = [
  [],
  note('Everything starting with # is a note to you. We ignore these lines, so leave them where they are.'),
  note(''),
  note('Change the Seats column to however many places you are setting aside for that name.'),
  note('One person is 1, a couple is 2, a family of five is 5. That number is what their invitation will let them confirm,'),
  note('so settling it here means no guest is ever offered a seat you do not have, and nobody has to be told otherwise later.'),
  note(''),
  note('Leave the Personal link column alone. That is how we find the guest a row belongs to — without it we cannot tell'),
  note('one Dela Cruz from another, and the row would come back as a new guest instead of an edit.'),
  note(''),
  note('You can change the name, group, phone, email and greeting here too. Clearing a cell clears it on the guest;'),
  note('clearing Seats leaves the number as it is.'),
  note(''),
  note('To add somebody new, type them on an empty row and leave their Personal link blank — we make the link for them.'),
  note('To remove somebody, delete them on the guest list page. Deleting the row here does nothing.'),
  note(''),
  note('Then save the file and upload it on the same page you got it from.'),
];

/** What an import did, in the four ways a row can land. */
export type ImportResult = {
  /** Rows with no link: somebody new. */
  added: number;
  /** Rows whose link found a guest on this list. */
  updated: number;
  /** Rows with no name at all. */
  skipped: number;
  /** Rows carrying a link that belongs to no guest here. */
  unmatched: number;
};
