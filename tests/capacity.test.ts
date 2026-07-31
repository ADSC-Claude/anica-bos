/**
 * Rooms hold as many people as they hold.
 *
 * `capacity` was stored on every resource, editable in Settings and shown in
 * the table, and consulted by nothing: one booking marked a whole room busy.
 * A couples room lost half its places, and a foot-spa area with two chairs
 * could not be expressed at all except as two separate rows.
 *
 * These cover both directions, because both cost money — a room turned away
 * while it still has a place, and a room handed out when it has none left.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { availableResources, assertNoConflicts } from '../src/lib/availability';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let singleId: string; // capacity 1
let doubleId: string; // capacity 2
let clientId: string;

const AT = new Date('2026-09-01T05:00:00Z');
const UNTIL = new Date('2026-09-01T06:00:00Z');

async function book(resourceId: string) {
  return prisma.appointment.create({
    data: {
      branchId,
      reference: `CAP-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      clientId,
      resourceId,
      startAt: AT,
      endAt: UNTIL,
      status: 'CONFIRMED',
    },
  });
}

const names = async (rs: { id: string }[]) => rs.map((r) => r.id);

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `cap-${stamp}`, code: `CAP${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  singleId = (
    await prisma.resource.create({
      data: { branchId, name: `Bed ${stamp}`, type: 'BED', capacity: 1, sortRank: 1 },
    })
  ).id;
  doubleId = (
    await prisma.resource.create({
      data: { branchId, name: `Couples ${stamp}`, type: 'ROOM', capacity: 2, sortRank: 2 },
    })
  ).id;

  clientId = (
    await prisma.client.create({
      data: {
        branchId,
        name: `Cap ${stamp}`,
        mobile: `09${String(Date.now()).slice(-9)}`,
        email: `cap${stamp}@x.test`,
        addressCity: 'QC',
      },
    })
  ).id;
});

after(async () => {
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.resource.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

test('everything is free before anything is booked', async () => {
  const free = await names(await availableResources({ branchId, startAt: AT, endAt: UNTIL }));
  assert.ok(free.includes(singleId));
  assert.ok(free.includes(doubleId));
});

test('one booking fills a single bed', async () => {
  await book(singleId);
  const free = await names(await availableResources({ branchId, startAt: AT, endAt: UNTIL }));
  assert.ok(!free.includes(singleId), 'a bed for one is taken after one booking');
});

test('a room for two still has a place after one booking', async () => {
  await book(doubleId);
  const free = await names(await availableResources({ branchId, startAt: AT, endAt: UNTIL }));
  assert.ok(free.includes(doubleId), 'the second place in a couples room is still bookable');
});

test('a room for two is full after two bookings', async () => {
  await book(doubleId); // second one
  const free = await names(await availableResources({ branchId, startAt: AT, endAt: UNTIL }));
  assert.ok(!free.includes(doubleId), 'both places are now taken');
});

test('the checkout guard refuses the third booking, and says why', async () => {
  await assert.rejects(
    () => assertNoConflicts({ branchId, startAt: AT, endAt: UNTIL, employeeIds: [], resourceId: doubleId }),
    (err: Error) => {
      // The message has to name the room and the number, or the receptionist
      // cannot tell "double-booked" from "genuinely full".
      assert.match(err.message, /full at that time/);
      assert.match(err.message, /all 2 places/);
      return true;
    },
  );
});

test('the guard still allows a place that is genuinely free', async () => {
  const spare = await prisma.resource.create({
    data: { branchId, name: `Spare ${stamp}`, type: 'BED', capacity: 1, sortRank: 3 },
  });
  await assert.doesNotReject(() =>
    assertNoConflicts({ branchId, startAt: AT, endAt: UNTIL, employeeIds: [], resourceId: spare.id }),
  );
});

test('an inactive resource is never offered', async () => {
  const off = await prisma.resource.create({
    data: { branchId, name: `Off ${stamp}`, type: 'BED', capacity: 1, active: false, sortRank: 4 },
  });
  const free = await names(await availableResources({ branchId, startAt: AT, endAt: UNTIL }));
  assert.ok(!free.includes(off.id), 'switching a bed off takes it out of booking entirely');
});
