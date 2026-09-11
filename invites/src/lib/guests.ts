import 'server-only';
import { prisma } from './db';
import { HttpError } from './errors';
import { guestToken } from './codes';
import { seatsHeld, headsArrived, replySeats } from './seats';
import { parseCsv, toCsv } from './csv';
import { entitled, TIER_LABELS, type Entitled } from './tiers';
import { formatDateTime } from './datetime';
import { invitationUrl } from './app-url';
import { contentOf } from './invitations';
import { attendeesOf, attendeeLine, type Attendee } from './attendees';
import { guestGroups } from './sections';
import { replyIdentity } from './names';
import type { SessionUser } from './auth';

/**
 * The guest list. Every row gets a secret token, and the token is the only
 * thing a guest ever sees: a link with it in resolves to their name, their
 * reserved seats and their table, and to nobody else's.
 */

function requireGuestManager(invitation: Entitled) {
  if (!entitled(invitation, 'rsvp.personalLinks')) {
    throw new HttpError(403, `Per-guest links and the guest list manager are included in the ${TIER_LABELS.COMPLETE} package, and come with the check-in and seating add-ons.`);
  }
}

export type GuestInput = {
  name: string;
  groupName?: string;
  seatsAllotted?: number;
  plusOneAllowed?: boolean;
  phone?: string;
  email?: string;
  notes?: string;
  salutation?: string;
  tableId?: string | null;
};

function clean(input: GuestInput) {
  const name = (input.name ?? '').trim().slice(0, 120);
  if (!name) throw new HttpError(400, 'A guest needs a name.');
  return {
    name,
    groupName: (input.groupName ?? '').trim().slice(0, 60),
    seatsAllotted: Math.max(1, Math.min(20, Math.round(Number(input.seatsAllotted ?? 1) || 1))),
    plusOneAllowed: Boolean(input.plusOneAllowed),
    phone: (input.phone ?? '').trim().slice(0, 30),
    email: (input.email ?? '').trim().slice(0, 120),
    notes: (input.notes ?? '').trim().slice(0, 500),
    salutation: (input.salutation ?? '').trim().slice(0, 120),
    tableId: input.tableId || null,
  };
}

export async function addGuest(invitation: Entitled & { id: string }, input: GuestInput) {
  requireGuestManager(invitation);
  return prisma.guest.create({ data: { invitationId: invitation.id, token: guestToken(), ...clean(input) } });
}

export async function updateGuest(invitation: Entitled & { id: string }, guestId: string, input: GuestInput) {
  requireGuestManager(invitation);
  const guest = await prisma.guest.findFirst({ where: { id: guestId, invitationId: invitation.id } });
  if (!guest) throw new HttpError(404, 'That guest is not on this list.');
  return prisma.guest.update({ where: { id: guestId }, data: clean(input) });
}

export async function deleteGuest(invitation: { id: string }, guestId: string) {
  await prisma.guest.deleteMany({ where: { id: guestId, invitationId: invitation.id } });
}

/**
 * Import from a pasted spreadsheet or CSV. Columns are matched by header
 * name when there is a header row; otherwise the order is
 * name, group, seats, phone. Email is matched by header only — a file with no
 * header row is somebody's paste, and guessing a fifth column would be
 * guessing.
 */
export async function importGuests(invitation: Entitled & { id: string }, text: string): Promise<{ added: number; skipped: number }> {
  return importGuestRows(invitation, parseCsv(text));
}

/**
 * The same import, from rows already parsed — a pasted range, a CSV, or the
 * first sheet of a workbook. Everything that knows which column is which lives
 * here, so a new way in only has to produce rows.
 */
export async function importGuestRows(invitation: Entitled & { id: string }, rows: string[][]): Promise<{ added: number; skipped: number }> {
  requireGuestManager(invitation);
  if (rows.length === 0) return { added: 0, skipped: 0 };

  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => ['name', 'guest', 'group', 'seats', 'pax', 'phone', 'mobile'].includes(h));
  const col = (names: string[], fallback: number) => {
    if (!hasHeader) return fallback;
    const idx = header.findIndex((h) => names.includes(h));
    return idx === -1 ? -1 : idx;
  };
  const cName = col(['name', 'guest', 'guest name', 'full name'], 0);
  const cGroup = col(['group', 'tag', 'side', 'family'], 1);
  const cSeats = col(['seats', 'pax', 'seats allotted', 'no. of seats'], 2);
  const cPhone = col(['phone', 'mobile', 'number', 'contact'], 3);
  // The couple's own list is the only place a number or an address exists
  // before anybody replies, which is the whole point of holding one: a
  // reminder goes to the guests who have *not* answered.
  const cEmail = col(['email', 'e-mail', 'email address'], -1);
  const cSalutation = col(['salutation', 'greeting', 'address as'], -1);

  const body = hasHeader ? rows.slice(1) : rows;
  const existing = await prisma.guest.count({ where: { invitationId: invitation.id } });
  if (existing + body.length > 2000) throw new HttpError(400, 'A guest list is limited to 2,000 rows.');

  let added = 0;
  let skipped = 0;
  const data = [];
  for (const r of body) {
    const name = (cName >= 0 ? r[cName] : '')?.trim();
    if (!name) {
      skipped++;
      continue;
    }
    data.push({
      invitationId: invitation.id,
      token: guestToken(),
      name: name.slice(0, 120),
      groupName: (cGroup >= 0 ? r[cGroup] ?? '' : '').slice(0, 60),
      seatsAllotted: Math.max(1, Math.min(20, parseInt(cSeats >= 0 ? r[cSeats] ?? '1' : '1', 10) || 1)),
      phone: (cPhone >= 0 ? r[cPhone] ?? '' : '').slice(0, 30),
      email: (cEmail >= 0 ? r[cEmail] ?? '' : '').slice(0, 120),
      salutation: (cSalutation >= 0 ? r[cSalutation] ?? '' : '').slice(0, 120),
    });
    added++;
  }
  if (data.length) await prisma.guest.createMany({ data });
  return { added, skipped };
}

/**
 * The blank a couple fills in.
 *
 * It is the importer's own column names in its own order, so a file that comes
 * back is a file that reads: the header row is what `importGuestRows` matches
 * on, and the example row shows the shape of each column rather than describing
 * it. Their own group names go underneath, because "Group" means nothing until
 * you know which words this invitation offers.
 *
 * CSV rather than a workbook, and deliberately: Excel and Google Sheets both
 * open it by double-click, and whichever of the two they save it back as, the
 * upload reads it.
 */
export function guestTemplateCsv(groups: string[]): string {
  const rows = [
    ['Mr. & Mrs. Dela Cruz', groups[0] ?? "Bride's family", '2', '0917 123 4567', 'delacruz@email.com', 'Tito Ben & Tita Let'],
    ['Ninong Fred', groups[1] ?? 'Principal sponsors', '1', '0918 765 4321', 'fred@email.com', 'Ninong Fred'],
  ];
  const notes = [
    [],
    ['Delete these two example rows before you send this back.'],
    ['Seats is how many places you are setting aside for that name — a couple is 2.'],
    ['Phone and Email are what a reminder is sent to. Fill in what you have; a blank one is simply skipped.'],
    ['Greeting is how the invitation addresses them: "Dear ___". Leave it blank to use the name.'],
    groups.length ? ['Group can be any of:', ...groups] : ['Group can be any word you like — it is how the headcount sheet is sorted.'],
  ];
  return toCsv(['Name', 'Group', 'Seats', 'Phone', 'Email', 'Greeting'], [...rows, ...notes]);
}

export async function listGuests(invitationId: string) {
  return prisma.guest.findMany({
    where: { invitationId },
    include: { rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 }, table: true },
    orderBy: [{ groupName: 'asc' }, { name: 'asc' }],
  });
}

export async function guestByToken(token: string) {
  if (!token || token.length < 10) return null;
  return prisma.guest.findUnique({
    where: { token },
    include: { table: true, rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 } },
  });
}

export async function guestsCsv(invitation: { id: string; slug: string }): Promise<string> {
  const guests = await listGuests(invitation.id);
  return toCsv(
    ['Name', 'Salutation', 'Group', 'Seats allotted', 'Table', 'Phone', 'Email', 'Response', 'Seats confirmed', 'Attendees', 'Meal', 'Dietary', 'Message', 'Responded at', 'Checked in', 'Arrived', 'Personal link'],
    guests.map((g) => {
      const r = g.rsvps[0];
      return [
        g.name,
        g.salutation,
        g.groupName,
        g.seatsAllotted,
        g.table?.name ?? '',
        g.phone,
        g.email,
        r ? (r.response === 'ACCEPT' ? 'Accepted' : 'Declined') : 'No response',
        replySeats(r),
        r ? attendeesOf(r.attendees).map((a) => attendeeLine(a)).join('; ') : '',
        r?.mealChoice ?? '',
        r?.dietary ?? '',
        r?.message ?? '',
        r ? formatDateTime(r.updatedAt) : '',
        g.checkedInAt ? formatDateTime(g.checkedInAt) : '',
        // Heads through the door, which is not the same as seats confirmed and
        // is the column a caterer settles the bill against.
        headsArrived(seatsHeld(g.seatsAllotted, g.rsvps[0]), { checkedIn: Boolean(g.checkedInAt), arrivedCount: g.arrivedCount }),
        invitationUrl(invitation.slug, g.token),
      ];
    }),
  );
}

export async function rsvpsCsv(invitationId: string): Promise<string> {
  const rsvps = await prisma.rsvp.findMany({ where: { invitationId }, include: { guest: true }, orderBy: { createdAt: 'desc' } });
  return toCsv(
    ['Name', 'Replied as', 'Group', 'Department', 'Response', 'Seats', 'Attendees', 'Meal', 'Dietary', 'Message', 'Phone', 'Email', 'Via personal link', 'Responded at'],
    rsvps.map((r) => [
      replyIdentity(r.name, r.guest?.name).name,
      replyIdentity(r.name, r.guest?.name).alias,
      r.groupName,
      r.department,
      r.response === 'ACCEPT' ? 'Accepted' : 'Declined',
      replySeats(r),
      attendeesOf(r.attendees).map((a) => attendeeLine(a)).join('; '),
      r.mealChoice,
      r.dietary,
      r.message,
      r.phone,
      r.email,
      r.guest ? 'Yes' : 'No',
      formatDateTime(r.updatedAt),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Tables and check-in
// ---------------------------------------------------------------------------

/**
 * What a customer who cannot do this is told. Both features are Signature's
 * and both are sold on their own, so the sentence names the add-on: telling a
 * Basic customer to buy the top package to scan a door is losing a sale they
 * were ready to make.
 */
const seatingLocked = `Seating charts are included in the ${TIER_LABELS.COMPLETE} package, or can be added to yours.`;
const checkinLocked = `QR check-in is included in the ${TIER_LABELS.COMPLETE} package, or can be added to yours.`;

export async function saveTable(invitation: Entitled & { id: string }, input: { id?: string; name: string; capacity: number }) {
  if (!entitled(invitation, 'seating')) throw new HttpError(403, seatingLocked);
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new HttpError(400, 'A table needs a name.');
  const capacity = Math.max(1, Math.min(50, Math.round(input.capacity) || 10));
  if (input.id) {
    const t = await prisma.seatingTable.findFirst({ where: { id: input.id, invitationId: invitation.id } });
    if (!t) throw new HttpError(404, 'That table does not exist.');
    return prisma.seatingTable.update({ where: { id: input.id }, data: { name, capacity } });
  }
  const count = await prisma.seatingTable.count({ where: { invitationId: invitation.id } });
  return prisma.seatingTable.create({ data: { invitationId: invitation.id, name, capacity, sortOrder: count } });
}

export async function deleteTable(invitation: { id: string }, tableId: string) {
  await prisma.seatingTable.deleteMany({ where: { id: tableId, invitationId: invitation.id } });
}

export async function assignTable(invitation: Entitled & { id: string }, guestId: string, tableId: string | null) {
  if (!entitled(invitation, 'seating')) throw new HttpError(403, seatingLocked);
  const guest = await prisma.guest.findFirst({ where: { id: guestId, invitationId: invitation.id } });
  if (!guest) throw new HttpError(404, 'That guest is not on this list.');
  if (tableId) {
    const t = await prisma.seatingTable.findFirst({ where: { id: tableId, invitationId: invitation.id } });
    if (!t) throw new HttpError(404, 'That table does not exist.');
  }
  return prisma.guest.update({ where: { id: guestId }, data: { tableId } });
}

/** Event-day check-in by scanning the guest's QR (their token) or tapping a row. */
export async function checkIn(user: SessionUser, invitation: Entitled & { id: string }, tokenOrId: string, undo = false) {
  if (!entitled(invitation, 'checkin')) throw new HttpError(403, checkinLocked);
  // The reply comes back with them: what the desk announces is the seats they
  // confirmed, not the seats set aside, and it says whether they declined.
  const guest = await prisma.guest.findFirst({
    where: { invitationId: invitation.id, OR: [{ token: tokenOrId }, { id: tokenOrId }] },
    include: { table: true, rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 } },
  });
  if (!guest) throw new HttpError(404, 'No guest matches that code.');
  // A scan means the whole party, until somebody at the door says otherwise.
  // Most parties do arrive whole, so the common case stays one tap and the
  // stepper is only touched for the ones that did not — which is the only way
  // a headcount at a door survives contact with a queue of two hundred people.
  //
  // An arrival that already has a number keeps it, so scanning somebody twice
  // does not quietly undo the count the desk just corrected.
  const held = seatsHeld(guest.seatsAllotted, guest.rsvps[0]);
  const updated = await prisma.guest.update({
    where: { id: guest.id },
    data: undo
      ? { checkedInAt: null, checkedInBy: '', arrivedCount: null }
      : { checkedInAt: guest.checkedInAt ?? new Date(), checkedInBy: user.name, arrivedCount: guest.arrivedCount ?? held },
    include: { table: true, rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 } },
  });
  return { guest: updated, alreadyIn: Boolean(guest.checkedInAt) && !undo };
}

/**
 * How many of a party walked in, set at the door.
 *
 * Only for somebody already checked in: the number answers "how many of them
 * came", and a party nobody has let in yet has no answer to that. Zero is
 * allowed anyway — a desk that scanned the wrong code wants to say so without
 * hunting for Undo, and the count it leaves behind is the truth either way.
 *
 * Not capped at what they confirmed. A hundred is a typo guard, not a rule
 * about party sizes.
 */
export async function setArrived(invitation: Entitled & { id: string }, guestId: string, count: number) {
  if (!entitled(invitation, 'checkin')) throw new HttpError(403, checkinLocked);
  const guest = await prisma.guest.findFirst({
    where: { id: guestId, invitationId: invitation.id },
    include: { table: true, rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 } },
  });
  if (!guest) throw new HttpError(404, 'That guest is not on this list.');
  if (!guest.checkedInAt) throw new HttpError(400, 'Check this guest in before counting the party.');
  const arrivedCount = Math.min(99, Math.max(0, Math.trunc(Number(count) || 0)));
  return prisma.guest.update({
    where: { id: guest.id },
    data: { arrivedCount },
    include: { table: true, rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 } },
  });
}

/**
 * Everything the printed headcount sheet needs, in one pass.
 *
 * The sheet is handed to a caterer or a coordinator, so it answers their
 * questions rather than the couple's: how many are coming, how many of each
 * meal, which group each name belongs to, and who has still not replied.
 *
 * The table each name is seated at is one of those questions, so the reply is
 * read through Rsvp.guestId to the guest and their table. That link exists
 * only for a reply that arrived on a personal link: somebody who answered
 * through the invitation's public link is a name with no seat, and so is a
 * guest the couple never assigned. Both read "—" rather than a blank, so the
 * column says "not seated" instead of looking like a printing fault.
 *
 * `seated` says whether to print the column at all. It is false until at least
 * one name on this sheet actually has a table — not merely when a table
 * exists — because an empty column promises a coordinator a seating plan that
 * nobody has drawn. It is the same rule the sheet already applies to seats and
 * meals: a question the couple was never asked gets no column.
 */
export async function rsvpSheet(invitationId: string) {
  const [rsvps, guests, summary, invitation] = await Promise.all([
    prisma.rsvp.findMany({
      where: { invitationId },
      include: { guest: { select: { name: true, table: { select: { name: true } } } } },
      orderBy: [{ response: 'asc' }, { name: 'asc' }],
    }),
    // Only ever populated on an invitation that came through the guest list
    // manager. Kept so the sheet can still say who has not replied — and where
    // they would have sat, which is what a coordinator chasing them wants.
    prisma.guest.findMany({
      where: { invitationId },
      include: { rsvps: { select: { id: true }, take: 1 }, table: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    rsvpSummary(invitationId),
    prisma.invitation.findUnique({ where: { id: invitationId }, select: { content: true, occasion: true } }),
  ]);

  // The couple's own order — principal sponsors before the office, if that is
  // how they wrote it. Alphabetical would put their ninongs behind everyone.
  const order = invitation ? guestGroups(invitation.occasion, contentOf(invitation.content).rsvp) : [];

  type Row = { name: string; alias: string; group: string; table: string; seats: number; meal: string; dietary: string; note: string; state: 'ACCEPT' | 'DECLINE'; attendees: Attendee[] };
  const rows: Row[] = rsvps.map((r) => ({
    // The couple's name for them, not whatever they typed over it — see
    // src/lib/names.ts. A coordinator holding this beside the seating plan has
    // to be able to find the same person on both.
    ...replyIdentity(r.name, r.guest?.name),
    group: r.groupName,
    table: r.guest?.table?.name ?? '',
    seats: replySeats(r),
    meal: r.mealChoice,
    dietary: r.dietary,
    note: r.message,
    state: r.response === 'ACCEPT' ? 'ACCEPT' : 'DECLINE',
    attendees: attendeesOf(r.attendees),
  }));

  // Grouped only if the couple asked the question. Everyone who skipped it, and
  // every reply from before they added the question, falls to the end under one
  // heading rather than into a group of one.
  const groups: { name: string; rows: Row[]; replies: number; seats: number }[] = [];
  for (const r of rows) {
    const name = r.group || 'Ungrouped';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, rows: [], replies: 0, seats: 0 }));
    g.rows.push(r);
    g.replies++;
    g.seats += r.seats;
  }
  const rank = (name: string) => {
    if (name === 'Ungrouped') return Number.MAX_SAFE_INTEGER;
    const i = order.indexOf(name);
    // A group the couple has since renamed or dropped still has its replies:
    // they sit after the current list rather than vanishing off the sheet.
    return i === -1 ? order.length : i;
  };
  groups.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  // The query ordered by the typed name; the sheet prints the couple's. Sort by
  // what a reader's eye will follow down the page.
  for (const g of groups) g.rows.sort((x, y) => x.name.localeCompare(y.name));
  const grouped = groups.length > 1 || groups[0]?.name !== 'Ungrouped';

  const meals = new Map<string, number>();
  for (const r of rows) if (r.state === 'ACCEPT' && r.meal) meals.set(r.meal, (meals.get(r.meal) ?? 0) + Math.max(1, r.seats));

  return {
    groups,
    /** Whether the group question was asked — a flat list reads better if not. */
    grouped,
    meals: [...meals.entries()].map(([meal, seats]) => ({ meal, seats })).sort((a, b) => b.seats - a.seats),
    /** Invited but silent. Empty unless the invitation has a guest list. */
    pending: guests.filter((g) => g.rsvps.length === 0).map((g) => ({ name: g.name, table: g.table?.name ?? '' })),
    /** Whether any name on this sheet has a table — see the note above. */
    seated: rows.some((r) => r.table) || guests.some((g) => g.rsvps.length === 0 && g.table),
    summary,
    replies: rows.length,
  };
}

export async function rsvpSummary(invitationId: string) {
  const [accepted, declined, claimed, settled, guests, responded, checkedIn] = await Promise.all([
    prisma.rsvp.count({ where: { invitationId, response: 'ACCEPT' } }),
    prisma.rsvp.count({ where: { invitationId, response: 'DECLINE' } }),
    // Two sums rather than one, because there is no COALESCE in a Prisma
    // aggregate: what the couple settled on where they have settled it, the
    // guest's own number where they have not. A reply still waiting on them
    // counts its claim — the "Waiting on you" figure beside this one is what
    // says the total is provisional, and leaving them out would hand a caterer
    // a number that is too low instead of one that is merely unagreed.
    prisma.rsvp.aggregate({ where: { invitationId, response: 'ACCEPT', seatsApproved: null }, _sum: { seats: true } }),
    prisma.rsvp.aggregate({ where: { invitationId, response: 'ACCEPT', seatsApproved: { not: null } }, _sum: { seatsApproved: true } }),
    prisma.guest.count({ where: { invitationId } }),
    prisma.guest.count({ where: { invitationId, rsvps: { some: {} } } }),
    prisma.guest.count({ where: { invitationId, checkedInAt: { not: null } } }),
  ]);
  const seats = (claimed._sum.seats ?? 0) + (settled._sum.seatsApproved ?? 0);
  return { accepted, declined, seats, guests, responded, pending: Math.max(0, guests - responded), checkedIn };
}
