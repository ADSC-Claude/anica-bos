import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, isOverlapError } from '../src/lib/db';
import { createReservation } from '../src/lib/reservations';
import { DatesTakenError } from '../src/lib/calendar';
import { secretToken } from '../src/lib/codes';
import { addDays, manilaDateKey, toStayDate } from '../src/lib/datetime';

/**
 * The acceptance criterion this file exists for:
 *
 *   "dates instantly unavailable to a second concurrent booking attempt
 *    (prove with a race test)"
 *
 * A check-then-write would pass a sequential test and fail this one. The whole
 * design rests on writing and catching SQLSTATE 23P01 instead.
 */

let branchId: string;
let propertyId: string;

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `Race test ${Date.now()}`, city: 'Test', active: false },
  });
  branchId = branch.id;

  const property = await prisma.property.create({
    data: {
      code: `RACE${Date.now() % 100000}`,
      slug: `race-test-${Date.now()}`,
      name: 'Race test unit',
      branchId,
      status: 'ACTIVE',
      maxGuests: 4,
      baseRateCents: 200000,
      cleaningFeeCents: 50000,
      minNights: 1,
      icalExportToken: secretToken(),
    },
  });
  propertyId = property.id;
});

after(async () => {
  await prisma.calendarSpan.deleteMany({ where: { propertyId } });
  await prisma.reservationLine.deleteMany({ where: { reservation: { propertyId } } });
  await prisma.securityDeposit.deleteMany({ where: { reservation: { propertyId } } });
  await prisma.scheduledMessage.deleteMany({ where: { reservation: { propertyId } } });
  await prisma.task.deleteMany({ where: { propertyId } });
  await prisma.notification.deleteMany({ where: { propertyId } });
  await prisma.reservation.deleteMany({ where: { propertyId } });
  await prisma.property.delete({ where: { id: propertyId } });
  await prisma.branch.delete({ where: { id: branchId } });
  await prisma.$disconnect();
});

test('eight simultaneous bookings for the same dates: exactly one survives', async () => {
  const today = manilaDateKey();
  // Far past the seeded data, but inside the 365-day booking window the
  // domain enforces — a test that ignores a real rule proves nothing.
  const checkIn = addDays(today, 200);
  const checkOut = addDays(today, 203);

  const attempts = Array.from({ length: 8 }, (_, i) =>
    createReservation({
      propertyId,
      checkIn,
      checkOut,
      adults: 2,
      guest: { firstName: `Racer${i}`, email: `racer${i}-${Date.now()}@example.com`, mobile: `+6391700000${i}${i}` },
      source: 'DIRECT',
      status: 'PENDING',
    }).then(
      (r) => ({ ok: true as const, id: r.id }),
      (e) => ({ ok: false as const, error: e }),
    ),
  );

  const results = await Promise.all(attempts);
  const winners = results.filter((r) => r.ok);
  const losers = results.filter((r) => !r.ok);

  assert.equal(winners.length, 1, 'exactly one booking should hold the dates');
  assert.equal(losers.length, 7);

  // Every loser must fail for the right reason — a 409 the guest can act on,
  // not a 500 that says "something went wrong".
  for (const loser of losers) {
    const err = (loser as { error: unknown }).error;
    assert.ok(
      err instanceof DatesTakenError || isOverlapError(err),
      `expected a dates-taken error, got: ${String((err as Error)?.message ?? err)}`,
    );
  }

  // And nothing half-written: a rolled-back attempt leaves no reservation.
  const stored = await prisma.reservation.count({
    where: { propertyId, checkIn: toStayDate(checkIn) },
  });
  assert.equal(stored, 1, 'a rolled-back attempt must not leave a reservation behind');

  const spans = await prisma.calendarSpan.count({ where: { propertyId, checkIn: toStayDate(checkIn) } });
  assert.equal(spans, 1);
});

test('same-day turnover is allowed — a checkout date is not a held night', async () => {
  const today = manilaDateKey();
  const first = await createReservation({
    propertyId,
    checkIn: addDays(today, 250),
    checkOut: addDays(today, 253),
    adults: 2,
    guest: { firstName: 'Leaving', email: `leaving-${Date.now()}@example.com`, mobile: '+639170000001' },
    status: 'CONFIRMED',
  });

  // Arrives the same day the first guest leaves. This MUST be accepted:
  // forbidding it would cost a night a month to nobody.
  const second = await createReservation({
    propertyId,
    checkIn: addDays(today, 253),
    checkOut: addDays(today, 256),
    adults: 2,
    guest: { firstName: 'Arriving', email: `arriving-${Date.now()}@example.com`, mobile: '+639170000002' },
    status: 'CONFIRMED',
  });

  assert.ok(first.id);
  assert.ok(second.id);
});

test('cancelling releases the dates in the same breath', async () => {
  const today = manilaDateKey();
  const checkIn = addDays(today, 300);
  const checkOut = addDays(today, 302);

  const first = await createReservation({
    propertyId,
    checkIn,
    checkOut,
    adults: 2,
    guest: { firstName: 'First', email: `first-${Date.now()}@example.com`, mobile: '+639170000003' },
    status: 'CONFIRMED',
  });

  await assert.rejects(
    createReservation({
      propertyId,
      checkIn,
      checkOut,
      adults: 2,
      guest: { firstName: 'Second', email: `second-${Date.now()}@example.com`, mobile: '+639170000004' },
      status: 'CONFIRMED',
    }),
    (e: unknown) => e instanceof DatesTakenError,
  );

  const { cancelReservation } = await import('../src/lib/reservations');
  await cancelReservation({ reservationId: first.id, reason: 'Testing', user: null });

  // The dates are back on sale immediately — not after a job runs.
  const third = await createReservation({
    propertyId,
    checkIn,
    checkOut,
    adults: 2,
    guest: { firstName: 'Third', email: `third-${Date.now()}@example.com`, mobile: '+639170000005' },
    status: 'CONFIRMED',
  });
  assert.ok(third.id);
});
