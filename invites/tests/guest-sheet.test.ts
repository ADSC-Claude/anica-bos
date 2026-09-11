import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/lib/csv';
import { isNote, tokenFromLink, seatsFrom, guestTemplateCsv, SEAT_SHEET_NOTES, SEAT_SHEET_COLUMNS } from '../src/lib/guest-sheet';

const guests = readFileSync(new URL('../src/lib/guests.ts', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../src/app/account/invitations/[id]/guests/manager.tsx', import.meta.url), 'utf8');

function body(src: string, decl: string): string {
  const i = src.indexOf(decl);
  assert.notEqual(i, -1, `${decl} is gone`);
  const rest = src.slice(i);
  return rest.slice(0, rest.indexOf('\n}\n'));
}

const GROUPS = ["Bride's family", 'Principal sponsors', 'Work friends'];

test('a downloaded blank, sent back untouched, adds nobody at all', () => {
  // The whole reason the instructions can live inside the file. Every line we
  // write into it is a note, examples included, so a couple who fills in their
  // guests and leaves the rest exactly where it sits gets their guests — not
  // their guests plus eleven people named after sentences.
  const rows = parseCsv(guestTemplateCsv(GROUPS));
  const afterHeader = rows.slice(1);
  assert.ok(afterHeader.length > 8, 'the template lost its instructions');
  for (const r of afterHeader) {
    assert.ok(isNote(r), `"${r[0]}" would be imported as a guest`);
  }
});

test('the blank says what must not be changed, and what each column means', () => {
  const text = guestTemplateCsv(GROUPS);
  assert.match(text, /Do not rename or move the headings/i, 'nothing warns them off the header row');
  assert.match(text, /one row per invitation, not per person/i, 'nothing says a couple is one row');
  assert.match(text, /a couple is 2/i, 'Seats is not explained in their own terms');
  assert.match(text, /upload it on the same page you got it from/i, 'it never says what to do with the file');
  // Their own group words, so "Group" means something before it is filled in.
  assert.match(text, /Principal sponsors/);
});

test('the header is the first row, because that is what the importer reads', () => {
  // A note above it would move the header to row two and the whole file would
  // import as headerless, positional guesswork.
  const rows = parseCsv(guestTemplateCsv([]));
  assert.deepEqual(rows[0], ['Name', 'Group', 'Seats', 'Phone', 'Email', 'Greeting']);
  assert.equal(isNote(rows[0]), false);
});

test('the examples keep their columns, so the shape of a row is visible', () => {
  const rows = parseCsv(guestTemplateCsv(GROUPS));
  // By the address, not the name: one of the notes explains that a couple is
  // a single row and quotes the same name to do it.
  const example = rows.find((r) => r[4] === 'delacruz@email.com');
  assert.ok(example, 'the example row is gone');
  assert.equal(example[2], '2', 'the example no longer shows what Seats looks like');
  assert.match(example[0], /Dela Cruz$/, 'the example row lost its name');
  assert.ok(isNote(example), 'the example would import as a guest');
});

test('the seat sheet tells them to leave the link column alone, and why', () => {
  const text = SEAT_SHEET_NOTES.map((r) => r.join(' ')).join('\n');
  assert.match(text, /Leave the Personal link column alone/i, 'nothing protects the join column');
  assert.match(text, /new guest instead of an edit/i, 'it never says what happens if they clear it');
  assert.match(text, /leave their Personal link blank/i, 'there is no way to add somebody new');
  assert.match(text, /clearing Seats leaves the number as it is/i, 'the one asymmetric column is undocumented');
  for (const r of SEAT_SHEET_NOTES) assert.ok(r.length === 0 || isNote(r), `"${r[0]}" would import as a guest`);
});

test('the seat sheet carries the link, and the importer matches that heading', () => {
  assert.equal(SEAT_SHEET_COLUMNS[SEAT_SHEET_COLUMNS.length - 1], 'Personal link');
  const fn = body(guests, 'export async function importGuestRows(');
  assert.match(fn, /col\(\['personal link', 'link', 'invitation link'\], -1\)/, 'the sheet it writes is not the sheet it reads');
  // -1, never a column index: a headerless paste is somebody's own spreadsheet
  // and reading one of its columns as identity is a guess with a guest record
  // on the other end.
  assert.doesNotMatch(fn, /col\(\['personal link'[^)]*\], [0-9]/, 'the link column is matched positionally');
});

test('a personal link resolves to its token, however much of it survives', () => {
  const token = 'K7tq2XbNp3Wm9ZaLc8vR';
  assert.equal(tokenFromLink(`https://youreinvitedto.com/liza-and-mark/${token}`), token);
  assert.equal(tokenFromLink(`https://youreinvitedto.com/liza-and-mark/${token}/`), token, 'a trailing slash loses the guest');
  assert.equal(tokenFromLink(`https://youreinvitedto.com/liza-and-mark/${token}?utm=x`), token, 'a tracking tag loses the guest');
  assert.equal(tokenFromLink(token), token, 'the token pasted on its own is not accepted');
  assert.equal(tokenFromLink('  ' + token + '  '), token, 'a spreadsheet cell keeps its spaces');
});

test('anything that is not a token reads as blank, so the row becomes a new guest', () => {
  assert.equal(tokenFromLink(''), '');
  assert.equal(tokenFromLink('   '), '');
  assert.equal(tokenFromLink('n/a'), '', 'a short scribble is read as a token');
  assert.equal(tokenFromLink('https://youreinvitedto.com/'), '', 'a bare host is read as a token');
  assert.equal(tokenFromLink('Tita Baby Ramos'), '', 'a name with spaces is read as a token');
});

test('seats stay inside what a table can hold', () => {
  assert.equal(seatsFrom('5'), 5);
  assert.equal(seatsFrom(''), 1, 'a blank must still have a floor when a row is new');
  assert.equal(seatsFrom('0'), 1, 'nought seats is not a guest');
  assert.equal(seatsFrom('-3'), 1);
  assert.equal(seatsFrom('900'), 20);
  assert.equal(seatsFrom('two'), 1);
});

test('a row with a link edits that guest; a row without one is somebody new', () => {
  // The bug this closes: every upload used to end in createMany, so a couple
  // who sent back the list we gave them got a second copy of all eighty-six
  // names — new links, no replies against them, and the headcount doubled.
  const fn = body(guests, 'export async function importGuestRows(');
  assert.match(fn, /const token = tokenFromLink\(cell\(r, cLink\)\)/, 'the link column is not read');
  assert.match(fn, /prisma\.guest\.updateMany\(\{ where: \{ invitationId: invitation\.id, token: e\.token \}/, 'an edit is not scoped to this invitation');
  assert.match(fn, /if \(creates\.length\) await prisma\.guest\.createMany/, 'a list with nothing new still writes');
});

test('a sheet trimmed to three columns does not wipe the other three', () => {
  // Somebody will delete the columns they are not editing. Writing a blank for
  // a column that is not in the file would clear every phone number on the
  // list, and there is no undo for that.
  const fn = body(guests, 'export async function importGuestRows(');
  for (const [c, field] of [['cGroup', 'groupName'], ['cPhone', 'phone'], ['cEmail', 'email'], ['cSalutation', 'salutation']]) {
    assert.match(fn, new RegExp(`if \\(${c} >= 0\\) data\\.${field} =`), `${field} is written whether or not the file carries it`);
  }
  // Seats is the one that also refuses a blank cell, because nought has no
  // reading and a family of five quietly becoming one is unrecoverable.
  assert.match(fn, /if \(cSeats >= 0 && cell\(r, cSeats\)\) data\.seatsAllotted =/, 'an emptied Seats cell resets the guest');
});

test('the notes in an uploaded file never become guests', () => {
  const fn = body(guests, 'export async function importGuestRows(');
  assert.match(fn, /\.filter\(\(r\) => !isNote\(r\)\)/, 'the instructions we wrote would import as people');
});

test('the row cap counts what is being added, not what is being edited', () => {
  // Counting edits would leave the biggest weddings — the ones with the most
  // seats to settle — unable to edit their list at all.
  const fn = body(guests, 'export async function importGuestRows(');
  assert.match(fn, /existing \+ creates\.length > 2000/, 'editing a full list is refused as if it were growing');
});

test('the couple is told whether their list just doubled', () => {
  // "86 rows processed" is the sentence that hides the only thing worth
  // knowing. Updated is said first, because on a seat sheet that is every row.
  assert.match(manager, /function importedLine\(/, 'the result is summarised somewhere else again');
  assert.match(manager, /Updated \$\{r\.updated\}/);
  assert.match(manager, /personal link that is not on this list/, 'an unmatched row is silently dropped');
  assert.equal((manager.match(/importedLine\(d as Imported\)/g) ?? []).length, 2, 'the two upload paths word it differently');
});

test('both sheets are offered, and each says which one it is for', () => {
  assert.match(manager, /seat-sheet\.csv/, 'there is no way to download the seat sheet');
  assert.match(manager, /guest-template\.csv/, 'the blank list is gone');
  assert.match(manager, /it updates them — it does not add them again/, 'nothing says the seat sheet is safe to send back');
  assert.match(manager, /The instructions are inside the file/, 'the page does not say to read the file');
});
