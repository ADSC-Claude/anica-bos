import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import {
  createReservation,
  confirmReservation,
  checkIn,
  checkOut,
} from '../src/lib/reservations';
import {
  setChecklistItem,
  submitForInspection,
  recordInspection,
  isReady,
} from '../src/lib/operations';
import { seedTemplates } from '../src/lib/messaging';
import { secretToken } from '../src/lib/codes';
import { addDays, manilaDateKey } from '../src/lib/datetime';

/**
 * The §8 chain, end to end, on real rows:
 *
 *   check in → access issued → check out → cleaning task with the next arrival
 *   as its deadline → checklist that will not submit without its photos →
 *   restock that moves stock → inspection → READY
 *
 * The claim under test is "zero re-entry": each step derives what it needs from
 * the step before. Anything a person has to type twice is a defect, and the
 * assertions below are what stop one creeping back in.
 */

let branchId: string;
let propertyId: string;
let templateId: string;
let inventoryItemId: string;
const reservationIds: string[] = [];

before(async () => {
  // Templates are upserted by key, so this is safe whether or not the database
  // has been seeded — and it means the suite does not silently depend on
  // having been run after `db:seed`, which CI does not do.
  await prisma.$transaction((tx) => seedTemplates(tx));

  const stamp = Date.now();
  const branch = await prisma.branch.create({
    data: { name: `Turnover test ${stamp}`, city: 'Test', active: false },
  });
  branchId = branch.id;

  const property = await prisma.property.create({
    data: {
      code: `TURN${stamp % 100000}`,
      slug: `turnover-test-${stamp}`,
      name: 'Turnover test unit',
      branchId,
      status: 'ACTIVE',
      maxGuests: 4,
      baseRateCents: 200000,
      cleaningFeeCents: 50000,
      minNights: 1,
      accessNotes: 'Lift to the 9th floor, then the door on the left.',
      icalExportToken: secretToken(),
    },
  });
  propertyId = property.id;

  const item = await prisma.inventoryItem.create({
    data: { propertyId, name: 'Test towels', unit: 'pc', stockQty: 10, minLevel: 2 },
  });
  inventoryItemId = item.id;

  // A checklist with one photo-gated item, which is the gate under test.
  const template = await prisma.checklistTemplate.create({
    data: {
      propertyId,
      name: 'Turnover test checklist',
      items: {
        create: [
          { area: 'Bedroom', label: 'Strip and remake the bed', sortOrder: 1 },
          { area: 'Bathroom', label: 'Photograph the finished bathroom', requiresPhoto: true, sortOrder: 2 },
          { area: 'Kitchen', label: 'Restock the towels', inventoryItemId, sortOrder: 3 },
        ],
      },
    },
  });
  templateId = template.id;
});

after(async () => {
  await prisma.checklistResult.deleteMany({ where: { cleaning: { propertyId } } });
  await prisma.cleaningRestock.deleteMany({ where: { cleaning: { propertyId } } });
  await prisma.inspectionArea.deleteMany({ where: { inspection: { propertyId } } });
  await prisma.inspection.deleteMany({ where: { propertyId } });
  await prisma.cleaningTask.deleteMany({ where: { propertyId } });
  await prisma.checklistItem.deleteMany({ where: { templateId } });
  await prisma.checklistTemplate.deleteMany({ where: { propertyId } });
  await prisma.inventoryMovement.deleteMany({ where: { item: { propertyId } } });
  await prisma.inventoryItem.deleteMany({ where: { propertyId } });
  await prisma.accessRecord.deleteMany({ where: { propertyId } });
  await prisma.calendarSpan.deleteMany({ where: { propertyId } });
  await prisma.calendarBlock.deleteMany({ where: { propertyId } });
  await prisma.reservationLine.deleteMany({ where: { reservation: { propertyId } } });
  await prisma.securityDeposit.deleteMany({ where: { reservation: { propertyId } } });
  await prisma.scheduledMessage.deleteMany({ where: { reservation: { propertyId } } });
  await prisma.task.deleteMany({ where: { propertyId } });
  await prisma.notification.deleteMany({ where: { propertyId } });
  await prisma.reservation.deleteMany({ where: { propertyId } });
  await prisma.guest.deleteMany({ where: { reservations: { none: {} }, email: { contains: '@turnover.test' } } });
  await prisma.property.delete({ where: { id: propertyId } });
  await prisma.branch.delete({ where: { id: branchId } });
  await prisma.$disconnect();
});

async function book(offset: number, nights: number, email: string) {
  const checkInKey = addDays(manilaDateKey(), offset);
  const result = await createReservation({
    propertyId,
    checkIn: checkInKey,
    checkOut: addDays(checkInKey, nights),
    adults: 2,
    children: 0,
    source: 'DIRECT',
    guest: { firstName: 'Turn', lastName: 'Over', email, mobile: '09170000000' },
  });
  reservationIds.push(result.id);
  // confirmReservation runs inside the payment transaction in production; here
  // it is the whole transaction, which is the same code either way.
  await prisma.$transaction((tx) => confirmReservation(tx, result.id));
  return result.id;
}

test('checking in issues the access record itself, whoever called it', async () => {
  const id = await book(10, 2, 'access@turnover.test');

  const beforeCheckIn = await prisma.accessRecord.count({ where: { reservationId: id } });
  assert.equal(beforeCheckIn, 0, 'no code exists before arrival — an early code is an open door');

  await checkIn(id);

  const record = await prisma.accessRecord.findFirst({ where: { reservationId: id } });
  assert.ok(record, 'check-in must issue access without a particular screen being involved');
  assert.match(record.code, /^\d{6}$/, 'a keypad code is digits — keypads have no letters');
  assert.ok(record.instructions.includes('9th floor'), "the property's own instructions are used");
  assert.ok(record.expiresAt, 'access lapses');
  assert.equal(
    record.expiresAt.getTime(),
    (await prisma.reservation.findUniqueOrThrow({ where: { id } })).checkOut.getTime(),
    'it lapses at checkout, not later',
  );

  // Twice must not mint a second code.
  await prisma.reservation.update({ where: { id }, data: { status: 'CONFIRMED', checkedInAt: null } });
  await checkIn(id);
  assert.equal(await prisma.accessRecord.count({ where: { reservationId: id } }), 1);
});

test('checkout opens a turnover whose deadline is the next arrival', async () => {
  const staying = await book(20, 2, 'stay@turnover.test');
  // Somebody arrives the day the first guest leaves.
  const arriving = await book(22, 2, 'next@turnover.test');
  assert.ok(arriving);

  await checkIn(staying);
  await checkOut(staying);

  const cleaning = await prisma.cleaningTask.findFirstOrThrow({
    where: { reservationId: staying },
    include: { task: true, results: true },
  });

  assert.ok(cleaning.nextCheckInAt, 'the deadline is derived, not typed');
  const nextArrival = await prisma.reservation.findUniqueOrThrow({ where: { id: arriving } });
  assert.equal(
    cleaning.nextCheckInAt.toISOString().slice(0, 10),
    nextArrival.checkIn.toISOString().slice(0, 10),
    "the deadline is the next guest's arrival",
  );
  assert.equal(cleaning.results.length, 3, 'the checklist came from the property template');
  assert.equal(cleaning.task.dueAt?.getTime(), cleaning.nextCheckInAt.getTime());

  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
  assert.equal(property.readyState, 'CLEANING');
  assert.equal(await isReady(propertyId), false, 'a dirty unit is not ready');
});

test('the checklist will not go to inspection without its required photos', async () => {
  const cleaning = await prisma.cleaningTask.findFirstOrThrow({
    where: { propertyId, status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } },
    include: { results: { include: { item: true } } },
  });

  // Tick everything except the photo item.
  for (const r of cleaning.results.filter((x) => !x.item.requiresPhoto)) {
    await setChecklistItem({ cleaningTaskId: cleaning.id, itemId: r.itemId, done: true });
  }

  await assert.rejects(
    () => submitForInspection({ cleaningTaskId: cleaning.id, restocks: [] }),
    /Photograph the finished bathroom/,
    'the outstanding item is named, not just refused',
  );

  // And the tick itself is refused, which is the stronger of the two gates:
  // the item never reaches a "done" state that submit would then have to
  // catch, so there is no window in which the board says the work is finished.
  const photoItem = cleaning.results.find((x) => x.item.requiresPhoto)!;
  await assert.rejects(
    () => setChecklistItem({ cleaningTaskId: cleaning.id, itemId: photoItem.itemId, done: true }),
    /needs a photo/,
    'a tick without the photo is not the photo',
  );

  const stored = await prisma.checklistResult.findFirstOrThrow({
    where: { cleaningTaskId: cleaning.id, itemId: photoItem.itemId },
  });
  assert.equal(stored.done, false, 'and the refused tick left nothing behind');
});

test('submitting moves stock and hands over to an inspection', async () => {
  const cleaning = await prisma.cleaningTask.findFirstOrThrow({
    where: { propertyId, status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } },
    include: { results: { include: { item: true } } },
  });

  const photoItem = cleaning.results.find((x) => x.item.requiresPhoto)!;
  await setChecklistItem({
    cleaningTaskId: cleaning.id,
    itemId: photoItem.itemId,
    done: true,
    photoUrl: '/uploads/test/bathroom.jpg',
  });

  const before = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
  await submitForInspection({
    cleaningTaskId: cleaning.id,
    restocks: [{ itemId: inventoryItemId, quantity: 4 }],
  });

  const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
  assert.equal(after.stockQty, before.stockQty - 4, 'restocking deducts stock with no second entry');

  // The invariant verify-integrity.ts checks nightly: stock is the opening
  // count plus the signed sum of its ledger, and never anything else.
  const ledger = await prisma.inventoryMovement.aggregate({
    where: { itemId: inventoryItemId },
    _sum: { quantity: true },
  });
  const OPENING = 10;
  assert.equal(
    after.stockQty,
    OPENING + (ledger._sum.quantity ?? 0),
    'stock must stay the running sum of its movements',
  );
  assert.equal(ledger._sum.quantity, -4, 'and the movement is the restock, signed negative');

  const inspection = await prisma.inspection.findFirstOrThrow({ where: { cleaningTaskId: cleaning.id } });
  assert.equal(inspection.status, 'PENDING');
  assert.equal(
    (await prisma.property.findUniqueOrThrow({ where: { id: propertyId } })).readyState,
    'INSPECTION',
  );
});

test('a failed inspection sends the clean back and keeps the unit off READY', async () => {
  const inspection = await prisma.inspection.findFirstOrThrow({
    where: { propertyId, status: 'PENDING' },
    include: { cleaning: true },
  });

  const result = await recordInspection({
    inspectionId: inspection.id,
    areas: [
      { area: 'Bathroom', verdict: 'NEEDS_ATTENTION', note: 'Mirror streaked' },
      { area: 'Bedroom', verdict: 'PASS' },
    ],
  });
  assert.equal(result.status, 'NEEDS_ATTENTION', 'the whole is the worst of its parts');

  const cleaning = await prisma.cleaningTask.findUniqueOrThrow({ where: { id: inspection.cleaningTaskId! } });
  assert.equal(cleaning.status, 'IN_PROGRESS', 'it goes back to the cleaner');
  assert.equal(cleaning.completedAt, null);
  assert.equal(await isReady(propertyId), false);

  const alert = await prisma.notification.findFirst({
    where: { dedupeKey: `inspection-failed:${inspection.id}`, resolvedAt: null },
  });
  assert.ok(alert, 'somebody is told');
  assert.ok(alert.body.includes('Mirror streaked'), 'and told what is wrong');
});

test('a passed inspection returns the unit to READY and resolves the alert', async () => {
  const inspection = await prisma.inspection.findFirstOrThrow({
    where: { propertyId, status: 'NEEDS_ATTENTION' },
  });

  const result = await recordInspection({
    inspectionId: inspection.id,
    areas: [
      { area: 'Bathroom', verdict: 'PASS' },
      { area: 'Bedroom', verdict: 'PASS' },
    ],
  });
  assert.equal(result.status, 'PASSED');

  assert.equal(await isReady(propertyId), true);
  assert.equal(
    (await prisma.property.findUniqueOrThrow({ where: { id: propertyId } })).readyState,
    'READY',
  );

  const alert = await prisma.notification.findFirst({
    where: { dedupeKey: `inspection-failed:${inspection.id}` },
  });
  assert.ok(alert?.resolvedAt, 'the alert resolves itself — nobody dismisses it by hand');
});

test('the review request is queued by the chain, not by a person', async () => {
  const reservationId = reservationIds[1];
  const review = await prisma.scheduledMessage.findFirst({
    where: { reservationId, templateKey: 'review_request' },
  });
  assert.ok(review, 'scheduled at confirmation, still queued after checkout');
  assert.equal(review.status, 'SCHEDULED');

  const reservation = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  assert.ok(reservation.reviewToken, 'and it has a token to point at');
  assert.ok(reservation.reviewToken.length >= 30, 'long enough that guessing one is hopeless');
});
