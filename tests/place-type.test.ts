/**
 * A treatment can only be booked somewhere it can actually be performed.
 *
 * Capacity alone is not enough. Once the foot spa area exists as a two-chair
 * resource, nothing stopped a 90-minute hot stone massage being assigned to a
 * chair, or a foot spa taking a bed that could have been sold — the same
 * phantom-capacity problem, relocated. So each service says what kind of place
 * it needs, and every path that hands out a place honours it.
 *
 * The owner's rule: reflexology and foot spa in the chair area, sauna in the
 * sauna, everything else on a bed.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  availableResources,
  assertNoConflicts,
  requiredPlaceFor,
  placesSatisfying,
} from '../src/lib/availability';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let roomId: string; // ROOM, holds 2 — a room full of beds
let bedId: string; // BED, holds 1
let chairAreaId: string; // CHAIR, holds 2
let saunaId: string; // SAUNA, holds 1
let clientId: string;

const AT = new Date('2026-10-01T05:00:00Z');
const UNTIL = new Date('2026-10-01T06:00:00Z');

const ids = async (rs: { id: string }[]) => rs.map((r) => r.id);

function book(resourceId: string) {
  return prisma.appointment.create({
    data: {
      branchId,
      reference: `PLC-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      clientId,
      resourceId,
      startAt: AT,
      endAt: UNTIL,
      status: 'CONFIRMED',
    },
  });
}

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `plc-${stamp}`, code: `PLC${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  const mk = async (name: string, type: 'ROOM' | 'BED' | 'CHAIR' | 'SAUNA', capacity: number, rank: number) =>
    (await prisma.resource.create({ data: { branchId, name: `${name} ${stamp}`, type, capacity, sortRank: rank } })).id;

  roomId = await mk('Room 1', 'ROOM', 2, 1);
  bedId = await mk('Bed 1', 'BED', 1, 2);
  chairAreaId = await mk('Foot Spa Area', 'CHAIR', 2, 3);
  saunaId = await mk('Sauna', 'SAUNA', 1, 4);

  clientId = (
    await prisma.client.create({
      data: {
        branchId,
        name: `Plc ${stamp}`,
        mobile: `09${String(Date.now()).slice(-9)}`,
        email: `plc${stamp}@x.test`,
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

// ------------------------------------------------------- picking the requirement

test('a booking of one service needs what that service needs', () => {
  assert.equal(requiredPlaceFor([{ durationMinutes: 45, requiredResourceType: 'CHAIR' }]), 'CHAIR');
});

test('a service that does not care imposes nothing', () => {
  assert.equal(requiredPlaceFor([{ durationMinutes: 60, requiredResourceType: null }]), null);
});

test('nothing booked yet needs nothing', () => {
  assert.equal(requiredPlaceFor([]), null);
});

test('when services disagree, the longest treatment decides', () => {
  // A 90-minute massage plus a 30-minute foot massage is a bed booking with a
  // foot massage in it — not a chair booking. Holding the chair for 2 hours to
  // do a hot stone massage on it would be the wrong way round.
  const place = requiredPlaceFor([
    { durationMinutes: 30, requiredResourceType: 'CHAIR' },
    { durationMinutes: 90, requiredResourceType: 'BED' },
  ]);
  assert.equal(place, 'BED');
});

test('a requirement is not lost behind a service that has none', () => {
  const place = requiredPlaceFor([
    { durationMinutes: 120, requiredResourceType: null },
    { durationMinutes: 45, requiredResourceType: 'CHAIR' },
  ]);
  assert.equal(place, 'CHAIR');
});

// ------------------------------------------------------------ what satisfies it

test('a bed treatment accepts a room as well as an open bed', () => {
  // Room 1 and Room 2 each hold two beds. Refusing them because they are filed
  // as ROOM would throw away half the beds in the spa.
  assert.deepEqual(placesSatisfying('BED').sort(), ['BED', 'ROOM']);
});

test('a chair treatment accepts only chairs', () => {
  assert.deepEqual(placesSatisfying('CHAIR'), ['CHAIR']);
});

// ----------------------------------------------------------------- in practice

test('a foot spa is offered the chair area and nothing else', async () => {
  const free = await ids(
    await availableResources({ branchId, startAt: AT, endAt: UNTIL, resourceType: 'CHAIR' }),
  );
  assert.deepEqual(free, [chairAreaId], 'a foot spa must not be offered a bed, a room or the sauna');
});

test('a massage is offered beds and rooms, but never the chair area', async () => {
  const free = await ids(
    await availableResources({ branchId, startAt: AT, endAt: UNTIL, resourceType: 'BED' }),
  );
  assert.ok(free.includes(roomId));
  assert.ok(free.includes(bedId));
  assert.ok(!free.includes(chairAreaId), 'a massage on a foot-spa chair blocks the foot spa');
  assert.ok(!free.includes(saunaId));
});

test('the chair area seats two, then it is full', async () => {
  const query = async () =>
    ids(await availableResources({ branchId, startAt: AT, endAt: UNTIL, resourceType: 'CHAIR' }));

  await book(chairAreaId);
  assert.ok((await query()).includes(chairAreaId), 'the second chair is still bookable');

  await book(chairAreaId);
  assert.ok(!(await query()).includes(chairAreaId), 'both chairs are now taken');
});

test('a third foot spa is refused, and the message says the area is full', async () => {
  await assert.rejects(
    () =>
      assertNoConflicts({
        branchId, startAt: AT, endAt: UNTIL,
        employeeIds: [], resourceId: chairAreaId, resourceType: 'CHAIR',
      }),
    (err: Error) => {
      assert.match(err.message, /full at that time/);
      assert.match(err.message, /all 2 places/);
      return true;
    },
  );
});

test('choosing the wrong kind of place by hand is refused, and says why', async () => {
  // The receptionist can override the suggested place in the appointment form,
  // which bypasses the filtered list — so the requirement is checked again at
  // save time rather than trusted from the form.
  await assert.rejects(
    () =>
      assertNoConflicts({
        branchId, startAt: AT, endAt: UNTIL,
        employeeIds: [], resourceId: bedId, resourceType: 'CHAIR',
      }),
    (err: Error) => {
      assert.match(err.message, /not the right kind of place/);
      assert.match(err.message, /chair/);
      return true;
    },
  );
});

test('a room is accepted for a treatment that asks for a bed', async () => {
  await assert.doesNotReject(() =>
    assertNoConflicts({
      branchId, startAt: AT, endAt: UNTIL,
      employeeIds: [], resourceId: roomId, resourceType: 'BED',
    }),
  );
});

test('a service with no requirement can still be put anywhere free', async () => {
  await assert.doesNotReject(() =>
    assertNoConflicts({
      branchId, startAt: AT, endAt: UNTIL,
      employeeIds: [], resourceId: saunaId, resourceType: null,
    }),
  );
});
