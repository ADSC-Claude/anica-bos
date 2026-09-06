import 'server-only';
import { prisma } from './db';
import { HttpError } from './errors';
import { guestToken } from './codes';
import { parseCsv, toCsv } from './csv';
import { hasFeature } from './tiers';
import { formatDateTime } from './datetime';
import { invitationUrl } from './app-url';
import type { SessionUser } from './auth';
import type { Tier } from '@prisma/client';

/**
 * The guest list. Every row gets a secret token, and the token is the only
 * thing a guest ever sees: a link with it in resolves to their name, their
 * reserved seats and their table, and to nobody else's.
 */

function requireGuestManager(tier: Tier) {
  if (!hasFeature(tier, 'rsvp.personalLinks')) {
    throw new HttpError(403, 'Per-guest links and the guest list manager are included in the Complete tier.');
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

export async function addGuest(invitation: { id: string; tier: Tier }, input: GuestInput) {
  requireGuestManager(invitation.tier);
  return prisma.guest.create({ data: { invitationId: invitation.id, token: guestToken(), ...clean(input) } });
}

export async function updateGuest(invitation: { id: string; tier: Tier }, guestId: string, input: GuestInput) {
  requireGuestManager(invitation.tier);
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
 * name, group, seats, phone.
 */
export async function importGuests(invitation: { id: string; tier: Tier }, text: string): Promise<{ added: number; skipped: number }> {
  requireGuestManager(invitation.tier);
  const rows = parseCsv(text);
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
      salutation: (cSalutation >= 0 ? r[cSalutation] ?? '' : '').slice(0, 120),
    });
    added++;
  }
  if (data.length) await prisma.guest.createMany({ data });
  return { added, skipped };
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
    ['Name', 'Salutation', 'Group', 'Seats allotted', 'Table', 'Phone', 'Email', 'Response', 'Seats confirmed', 'Attendees', 'Meal', 'Dietary', 'Message', 'Responded at', 'Checked in', 'Personal link'],
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
        r?.response === 'ACCEPT' ? r.seats : 0,
        r ? (Array.isArray(r.attendees) ? (r.attendees as string[]).join('; ') : '') : '',
        r?.mealChoice ?? '',
        r?.dietary ?? '',
        r?.message ?? '',
        r ? formatDateTime(r.updatedAt) : '',
        g.checkedInAt ? formatDateTime(g.checkedInAt) : '',
        invitationUrl(invitation.slug, g.token),
      ];
    }),
  );
}

export async function rsvpsCsv(invitationId: string): Promise<string> {
  const rsvps = await prisma.rsvp.findMany({ where: { invitationId }, include: { guest: true }, orderBy: { createdAt: 'desc' } });
  return toCsv(
    ['Name', 'Response', 'Seats', 'Attendees', 'Meal', 'Dietary', 'Message', 'Phone', 'Email', 'Via personal link', 'Responded at'],
    rsvps.map((r) => [
      r.name,
      r.response === 'ACCEPT' ? 'Accepted' : 'Declined',
      r.seats,
      Array.isArray(r.attendees) ? (r.attendees as string[]).join('; ') : '',
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

export async function saveTable(invitation: { id: string; tier: Tier }, input: { id?: string; name: string; capacity: number }) {
  if (!hasFeature(invitation.tier, 'seating')) throw new HttpError(403, 'Seating charts are included in the Complete tier.');
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

export async function assignTable(invitation: { id: string; tier: Tier }, guestId: string, tableId: string | null) {
  if (!hasFeature(invitation.tier, 'seating')) throw new HttpError(403, 'Seating charts are included in the Complete tier.');
  const guest = await prisma.guest.findFirst({ where: { id: guestId, invitationId: invitation.id } });
  if (!guest) throw new HttpError(404, 'That guest is not on this list.');
  if (tableId) {
    const t = await prisma.seatingTable.findFirst({ where: { id: tableId, invitationId: invitation.id } });
    if (!t) throw new HttpError(404, 'That table does not exist.');
  }
  return prisma.guest.update({ where: { id: guestId }, data: { tableId } });
}

/** Event-day check-in by scanning the guest's QR (their token) or tapping a row. */
export async function checkIn(user: SessionUser, invitation: { id: string; tier: Tier }, tokenOrId: string, undo = false) {
  if (!hasFeature(invitation.tier, 'checkin')) throw new HttpError(403, 'QR check-in is included in the Complete tier.');
  const guest = await prisma.guest.findFirst({ where: { invitationId: invitation.id, OR: [{ token: tokenOrId }, { id: tokenOrId }] }, include: { table: true } });
  if (!guest) throw new HttpError(404, 'No guest matches that code.');
  const updated = await prisma.guest.update({
    where: { id: guest.id },
    data: undo ? { checkedInAt: null, checkedInBy: '' } : { checkedInAt: guest.checkedInAt ?? new Date(), checkedInBy: user.name },
    include: { table: true },
  });
  return { guest: updated, alreadyIn: Boolean(guest.checkedInAt) && !undo };
}

export async function rsvpSummary(invitationId: string) {
  const [accepted, declined, seats, guests, responded, checkedIn] = await Promise.all([
    prisma.rsvp.count({ where: { invitationId, response: 'ACCEPT' } }),
    prisma.rsvp.count({ where: { invitationId, response: 'DECLINE' } }),
    prisma.rsvp.aggregate({ where: { invitationId, response: 'ACCEPT' }, _sum: { seats: true } }),
    prisma.guest.count({ where: { invitationId } }),
    prisma.guest.count({ where: { invitationId, rsvps: { some: {} } } }),
    prisma.guest.count({ where: { invitationId, checkedInAt: { not: null } } }),
  ]);
  return { accepted, declined, seats: seats._sum.seats ?? 0, guests, responded, pending: Math.max(0, guests - responded), checkedIn };
}
