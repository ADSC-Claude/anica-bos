import 'server-only';
import { prisma } from './db';
import { HttpError } from './errors';
import { audit } from './audit';
import { deleteFile } from './storage';
import type { SessionUser } from './auth';

/**
 * The two rights the landing page and the privacy policy promise out loud:
 * access (§16(c) — a copy of everything held about you) and erasure (§16(e)).
 *
 * Erasure is not `DELETE FROM "User"`. A sale generates a receipt, and the BIR
 * requires receipts to be kept for ten years, so an order row and its payments
 * survive — with nothing on them that names anybody. The account row survives
 * with them, emptied of every identifying field and unable to sign in. What
 * genuinely belongs to the person goes: invitations and everything hanging off
 * them, which is also where somebody else's personal data lives, because a
 * guest list is a hundred names and mobile numbers that were never ours.
 */

const ERASED = 'Erased at the account holder’s request';

/** Everything we hold about one customer, as a plain object ready to be JSON. */
export async function exportPersonalData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      orders: { include: { items: true, payments: { select: { reference: true, provider: true, channel: true, amountCents: true, status: true, createdAt: true } }, package: { select: { name: true } } } },
      invitations: {
        include: {
          guests: { include: { rsvps: true } },
          guestbook: true,
          media: true,
          tables: true,
          dfyJob: { include: { revisions: true } },
        },
      },
      supportMessages: true,
      notifications: true,
      loginEvents: { orderBy: { createdAt: 'desc' }, take: 200 },
    },
  });
  if (!user) throw new HttpError(404, 'No such account.');

  return {
    exportedAt: new Date().toISOString(),
    note:
      'This file contains everything we hold about your account, including the ' +
      'guest lists you uploaded. Those contain other people’s personal data — ' +
      'please look after it accordingly.',
    account: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      messenger: user.messenger,
      viber: user.viber,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      erasedAt: user.erasedAt,
    },
    orders: user.orders.map((o) => ({
      reference: o.reference,
      package: o.package.name,
      occasion: o.occasion,
      tier: o.tier,
      serviceMode: o.serviceMode,
      totalCents: o.totalCents,
      status: o.status,
      notes: o.notes,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({ name: i.name, kind: i.kind, amountCents: i.amountCents })),
      payments: o.payments,
    })),
    invitations: user.invitations.map((inv) => ({
      title: inv.title,
      slug: inv.slug,
      occasion: inv.occasion,
      tier: inv.tier,
      status: inv.status,
      eventAt: inv.eventAt,
      content: inv.content,
      guests: inv.guests.map((g) => ({
        name: g.name,
        salutation: g.salutation,
        groupName: g.groupName,
        phone: g.phone,
        email: g.email,
        seatsAllotted: g.seatsAllotted,
        notes: g.notes,
        rsvps: g.rsvps.map((r) => ({ response: r.response, seats: r.seats, message: r.message, createdAt: r.createdAt })),
      })),
      guestbook: inv.guestbook.map((g) => ({ name: g.name, message: g.message, approved: g.approved, createdAt: g.createdAt })),
      photos: inv.media.map((m) => ({ kind: m.kind, url: m.url, caption: m.caption, uploadedBy: m.uploadedBy, createdAt: m.createdAt })),
      tables: inv.tables.map((t) => ({ name: t.name, capacity: t.capacity })),
      doneForYou: inv.dfyJob
        ? { status: inv.dfyJob.status, intakeMethod: inv.dfyJob.intakeMethod, revisions: inv.dfyJob.revisions.map((r) => ({ round: r.round, body: r.body, byStaff: r.byStaff, createdAt: r.createdAt })) }
        : null,
    })),
    supportMessages: user.supportMessages.map((m) => ({ body: m.body, fromStaff: m.fromStaff, createdAt: m.createdAt })),
    notifications: user.notifications.map((n) => ({ title: n.title, body: n.body, createdAt: n.createdAt })),
    signIns: user.loginEvents.map((e) => ({ at: e.createdAt, ip: e.ip, success: e.success })),
  };
}

export type ErasureReport = {
  invitations: number;
  guests: number;
  rsvps: number;
  guestbookEntries: number;
  photos: number;
  supportMessages: number;
  ordersKept: number;
};

/**
 * Erases a customer. `actor` is whoever is carrying out the request — the
 * customer themselves, or the staff member acting on a written one.
 */
export async function eraseCustomer(actor: SessionUser | null, userId: string, reason: string): Promise<ErasureReport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { invitations: { select: { id: true } }, orders: { select: { id: true } } },
  });
  if (!user) throw new HttpError(404, 'No such account.');
  if (user.role !== 'CUSTOMER') throw new HttpError(400, 'Only customer accounts can be erased here.');
  if (user.erasedAt) throw new HttpError(400, 'That account has already been erased.');

  const invitationIds = user.invitations.map((i) => i.id);

  // Stored objects first, while the rows that name them still exist. A file
  // left in a bucket after an erasure request is the one kind of leftover that
  // actually matters.
  const files = await prisma.media.findMany({
    where: { OR: [{ userId }, { invitationId: { in: invitationIds } }] },
    select: { storagePath: true },
  });

  const report = await prisma.$transaction(async (tx) => {
    const counts: ErasureReport = {
      invitations: invitationIds.length,
      guests: await tx.guest.count({ where: { invitationId: { in: invitationIds } } }),
      rsvps: await tx.rsvp.count({ where: { invitationId: { in: invitationIds } } }),
      guestbookEntries: await tx.guestbookEntry.count({ where: { invitationId: { in: invitationIds } } }),
      photos: files.length,
      supportMessages: await tx.supportMessage.count({ where: { userId } }),
      ordersKept: user.orders.length,
    };

    // An order points at its invitation; the invitation is going, so the
    // pointer must go first or the delete is refused.
    await tx.order.updateMany({ where: { userId }, data: { invitationId: null, notes: '' } });
    // Guest lists, RSVPs, guestbook, media, tables, views and DFY jobs all
    // cascade from the invitation.
    await tx.invitation.deleteMany({ where: { userId } });
    await tx.media.deleteMany({ where: { userId } });
    await tx.supportMessage.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.loginEvent.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        // The email must stay unique and must not be a person's, so the id —
        // which is not derived from anything about them — becomes the address.
        email: `erased+${userId}@invites.invalid`,
        name: ERASED,
        phone: '',
        messenger: '',
        viber: '',
        notes: '',
        passwordHash: '',
        active: false,
        mustChangePassword: false,
        sessionsRevoked: new Date(),
        erasedAt: new Date(),
      },
    });

    return counts;
  });

  for (const file of files) await deleteFile(file.storagePath);

  // The audit row records that an erasure happened and who asked for it. It
  // deliberately does not record what was erased.
  await audit(actor, {
    module: 'privacy',
    action: 'erase',
    entityType: 'User',
    entityId: userId,
    summary: reason.slice(0, 200),
    sensitive: true,
  });

  return report;
}
