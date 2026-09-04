/**
 * The Data Privacy Act promises, checked against a real database.
 *
 * This cannot be a unit test — the whole point is which rows survive a
 * transaction — so it builds its own throwaway customer, complete with an
 * order, an invitation and a guest list, erases them, and asserts on what is
 * left. It touches nothing that was already there.
 */
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { eraseCustomer, exportPersonalData } from '../src/lib/privacy';
import { guestToken } from '../src/lib/codes';

const PREFIX = 'erasure-check-';
const MARK = `${PREFIX}${Date.now()}`;

/**
 * Removes anything this check left behind, before and after a run. A crashed
 * run leaves an order with no items and a published invitation with no expiry,
 * both of which the integrity check then reports as faults in the seed.
 *
 * The handle is the order reference, not the email: erasure replaces the email
 * — that is the thing being tested — so an account erased by a run that then
 * crashed is no longer findable by it. A reference survives, because a receipt
 * has to.
 */
async function sweep() {
  const [byOrder, byEmail] = await Promise.all([
    prisma.order.findMany({ where: { reference: { startsWith: PREFIX } }, select: { userId: true } }),
    prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } }),
  ]);
  const ids = [...new Set([...byOrder.map((o) => o.userId), ...byEmail.map((u) => u.id)])];
  if (!ids.length) return;

  await prisma.invitation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { order: { userId: { in: ids } } } });
  await prisma.order.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function build() {
  const user = await prisma.user.create({
    data: { email: `${MARK}@example.test`, name: 'Erasure Check', passwordHash: 'x', phone: '09171234567', role: 'CUSTOMER' },
  });
  const pkg = await prisma.package.findFirstOrThrow({ where: { tier: 'COMPLETE' } });
  const template = await prisma.template.findFirstOrThrow();

  const invitation = await prisma.invitation.create({
    data: {
      userId: user.id, templateId: template.id, occasion: 'WEDDING', tier: 'COMPLETE',
      title: MARK, slug: MARK, status: 'PUBLISHED', content: {}, language: 'en',
    },
  });
  await prisma.guest.createMany({
    data: [
      { invitationId: invitation.id, name: 'Guest One', phone: '09181234567', token: guestToken() },
      { invitationId: invitation.id, name: 'Guest Two', phone: '09191234567', token: guestToken() },
    ],
  });
  const guest = await prisma.guest.findFirstOrThrow({ where: { invitationId: invitation.id } });
  await prisma.rsvp.create({ data: { invitationId: invitation.id, guestId: guest.id, name: 'Guest One', response: 'ACCEPT', seats: 2, attendees: [] } });
  await prisma.guestbookEntry.create({ data: { invitationId: invitation.id, name: 'Guest Two', message: 'Congrats!', approved: true } });
  await prisma.media.create({ data: { invitationId: invitation.id, kind: 'GUEST_PHOTO', url: '/uploads/x.jpg', storagePath: 'guest/x.jpg', contentType: 'image/jpeg', uploadedBy: 'Guest Two' } });
  await prisma.supportMessage.create({ data: { userId: user.id, body: 'Any update po?' } });
  await prisma.notification.create({ data: { userId: user.id, title: 'Welcome' } });

  const order = await prisma.order.create({
    data: {
      reference: `${PREFIX}${Date.now()}`, userId: user.id, packageId: pkg.id, invitationId: invitation.id,
      occasion: 'WEDDING', tier: 'COMPLETE', serviceMode: 'DIY',
      subtotalCents: 349900, totalCents: 349900, status: 'ACTIVE', notes: 'Bride is Ana, groom is Ben',
    },
  });
  await prisma.payment.create({
    data: { reference: `PAY-${MARK}`, orderId: order.id, provider: 'MANUAL', status: 'PAID', amountCents: 349900, payerName: 'Ana Reyes' },
  });

  return { user, invitation, order };
}

async function main() {
  await sweep();
  const { user, invitation, order } = await build();

  const dump = await exportPersonalData(user.id);
  assert.equal(dump.account.email, `${MARK}@example.test`, 'the export carries the account');
  assert.equal(dump.invitations.length, 1, 'the export carries the invitation');
  assert.equal(dump.invitations[0].guests.length, 2, 'the export carries the guest list — the part people actually want back');
  assert.equal(dump.orders.length, 1, 'the export carries the orders');
  console.info('  ✓ the export contains the account, its invitations, its guest lists and its orders');

  const report = await eraseCustomer(null, user.id, 'Automated check');
  assert.deepEqual(
    { invitations: report.invitations, guests: report.guests, rsvps: report.rsvps, guestbookEntries: report.guestbookEntries, photos: report.photos, ordersKept: report.ordersKept },
    { invitations: 1, guests: 2, rsvps: 1, guestbookEntries: 1, photos: 1, ordersKept: 1 },
    'the report counts what it removed',
  );
  console.info('  ✓ the report accounts for everything it removed');

  // Gone.
  assert.equal(await prisma.invitation.count({ where: { id: invitation.id } }), 0, 'the invitation is gone');
  assert.equal(await prisma.guest.count({ where: { invitationId: invitation.id } }), 0, 'the guest list is gone');
  assert.equal(await prisma.rsvp.count({ where: { invitationId: invitation.id } }), 0, 'the RSVPs are gone');
  assert.equal(await prisma.guestbookEntry.count({ where: { invitationId: invitation.id } }), 0, 'the guestbook is gone');
  assert.equal(await prisma.media.count({ where: { invitationId: invitation.id } }), 0, 'the photos are gone');
  assert.equal(await prisma.supportMessage.count({ where: { userId: user.id } }), 0, 'the support thread is gone');
  assert.equal(await prisma.notification.count({ where: { userId: user.id } }), 0, 'the notifications are gone');
  console.info('  ✓ every invitation, guest, RSVP, message and photo is gone');

  // Kept — because the BIR requires it.
  const kept = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
  assert.equal(kept.totalCents, 349900, 'the receipt still says what was charged');
  assert.equal(kept.payments.length, 1, 'the payment is still there');
  assert.equal(kept.invitationId, null, 'the receipt no longer points at an invitation');
  assert.equal(kept.notes, '', 'the free-text note, which named people, is cleared');
  console.info('  ✓ the order and its payment survive, with the personal details stripped');

  // Anonymised, and unable to sign in.
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.notEqual(row.email, `${MARK}@example.test`, 'the email is replaced');
  assert.ok(!row.email.includes('example.test'), 'no trace of the original address');
  assert.equal(row.phone, '', 'the phone number is gone');
  assert.equal(row.passwordHash, '', 'the password hash is gone, so no credential survives');
  assert.equal(row.active, false, 'the account is disabled');
  assert.ok(row.sessionsRevoked, 'any signed session is revoked');
  assert.ok(row.erasedAt, 'the erasure is dated');
  console.info('  ✓ the account is anonymised, disabled and cannot be signed into');

  const log = await prisma.auditLog.findFirst({ where: { module: 'privacy', entityId: user.id } });
  assert.ok(log, 'the erasure is audited');
  assert.equal(log.sensitive, true, 'and marked sensitive');
  console.info('  ✓ the erasure is recorded in the audit log');

  await assert.rejects(() => eraseCustomer(null, user.id, 'again'), /already been erased/, 'a second erasure is refused');
  console.info('  ✓ a second erasure is refused rather than half-applied');

  console.info('\nData Privacy Act checks passed.');
}

main()
  .then(() => sweep())
  .catch(async (err) => {
    console.error(err);
    await sweep().catch(() => {});
    await prisma.$disconnect();
    process.exit(1);
  })
  .then(() => prisma.$disconnect());
