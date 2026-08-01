/**
 * A visit holds each place only while it is in it.
 *
 * The old model held one place for the whole visit. For a guest booked in for a
 * sauna at 1:30 and a massage at 2:20 that is wrong twice over: the bed sits
 * reserved and empty through the sauna, and the sauna is not held at all. Both
 * mistakes cost the spa a sale, and the second oversells a place that is
 * genuinely occupied.
 *
 * These tests run against the database because that is where the question is
 * answered — the query has to be right, not just the arithmetic.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { assertNoConflicts, availableResources, floorPlan } from '../src/lib/availability';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let clientId: string;
let saunaId: string;
let bedId: string;
let saunaSvcId: string;
let bedSvcId: string;

/** 1:30pm–2:00pm Manila for the sauna; 2:20pm–3:20pm for the massage. */
const T = (hhmm: string) => new Date(`2027-04-10T${hhmm}:00Z`);
const SAUNA_FROM = T('05:30');
const SAUNA_TO = T('06:00');
const BED_FROM = T('06:20');
const BED_TO = T('07:20');

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `seg-${stamp}`, code: `SEG${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  saunaId = (
    await prisma.resource.create({
      data: {
        branchId, name: `Sauna ${stamp}`, type: 'SAUNA', capacity: 4,
        exclusiveUse: true, fillWhole: false, sortRank: 1,
      },
    })
  ).id;
  bedId = (
    await prisma.resource.create({
      data: { branchId, name: `Bed ${stamp}`, type: 'BED', capacity: 1, sortRank: 2 },
    })
  ).id;

  const cat = await prisma.serviceCategory.create({ data: { name: `seg-cat-${stamp}` } });
  saunaSvcId = (
    await prisma.service.create({
      data: {
        categoryId: cat.id, name: `Sauna ${stamp}`, durationMinutes: 30, priceCents: 50_000,
        requiredResourceType: 'SAUNA', sequenceRank: 10, changeoverMinutes: 20,
      },
    })
  ).id;
  bedSvcId = (
    await prisma.service.create({
      data: {
        categoryId: cat.id, name: `Massage ${stamp}`, durationMinutes: 60, priceCents: 100_000,
        requiredResourceType: 'BED', sequenceRank: 30,
      },
    })
  ).id;

  clientId = (
    await prisma.client.create({
      data: {
        branchId, name: `Seg ${stamp}`, mobile: `09${String(Date.now()).slice(-9)}`,
        email: `seg${stamp}@x.test`, addressCity: 'QC',
      },
    })
  ).id;

  // One visit: sauna 1:30–2:00, then a bed 2:20–3:20. The appointment's own
  // window spans the lot, exactly as a real booking stores it.
  await prisma.appointment.create({
    data: {
      branchId, clientId, reference: `SEG-${stamp}`,
      resourceId: saunaId, startAt: SAUNA_FROM, endAt: BED_TO, status: 'CONFIRMED',
      services: {
        create: [
          {
            serviceId: saunaSvcId, priceCents: 50_000, durationMinutes: 30, sortRank: 0,
            resourceId: saunaId, startAt: SAUNA_FROM, endAt: SAUNA_TO, changeoverMinutes: 20,
          },
          {
            serviceId: bedSvcId, priceCents: 100_000, durationMinutes: 60, sortRank: 1,
            resourceId: bedId, startAt: BED_FROM, endAt: BED_TO,
          },
        ],
      },
    },
  });
});

after(async () => {
  await prisma.appointmentService.deleteMany({ where: { appointment: { branchId } } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.resource.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { id: { in: [saunaSvcId, bedSvcId] } } });
  await prisma.serviceCategory.deleteMany({ where: { name: `seg-cat-${stamp}` } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const freeAt = (from: Date, to: Date) =>
  availableResources({ branchId, startAt: from, endAt: to }).then((rs) => rs.map((r) => r.id));

// ------------------------------------------------------- the bed during the sauna

test('the bed is sellable while the guest is in the sauna', async () => {
  // This is the sale the old model threw away: 1:30–2:00 the bed is empty and
  // nothing is happening on it, but it was reserved for the whole visit.
  assert.ok((await freeAt(SAUNA_FROM, SAUNA_TO)).includes(bedId));
});

test('and the sauna is not, because she is in it', async () => {
  assert.ok(!(await freeAt(SAUNA_FROM, SAUNA_TO)).includes(saunaId));
});

test('the sauna frees up the moment she leaves it', async () => {
  // Exclusive, but only for as long as she is inside — the next booking takes
  // it after her, which was the owner's rule for the sauna all along.
  assert.ok((await freeAt(BED_FROM, BED_TO)).includes(saunaId));
});

test('and the bed is hers once she is on it', async () => {
  assert.ok(!(await freeAt(BED_FROM, BED_TO)).includes(bedId));
});

test('the changeover between them belongs to nobody', async () => {
  // 2:00–2:20 is the shower and the walk. Neither place is occupied, and both
  // are too short a window to sell — but they must not read as *held*.
  const free = await freeAt(SAUNA_TO, BED_FROM);
  assert.ok(free.includes(saunaId), 'she has left the sauna');
  assert.ok(free.includes(bedId), 'she is not on the bed yet');
});

// ------------------------------------------------------------------- the guard

test('the guard lets somebody else have the bed during the sauna', async () => {
  await assert.doesNotReject(() =>
    assertNoConflicts({
      branchId, startAt: SAUNA_FROM, endAt: SAUNA_TO,
      employeeIds: [], resourceId: bedId,
    }),
  );
});

test('and refuses the bed once she is on it', async () => {
  await assert.rejects(
    () =>
      assertNoConflicts({
        branchId, startAt: BED_FROM, endAt: BED_TO,
        employeeIds: [], resourceId: bedId,
      }),
    /already taken/i,
  );
});

// --------------------------------------------------- the floor plan the desk sees

test('the plan draws the sauna taken and the bed free at 1:30', async () => {
  const plan = await floorPlan({ branchId, startAt: SAUNA_FROM, endAt: SAUNA_TO });
  assert.equal(plan.find((p) => p.id === saunaId)?.taken, 1);
  assert.equal(plan.find((p) => p.id === bedId)?.taken, 0);
});

test('and the other way round at 2:20', async () => {
  const plan = await floorPlan({ branchId, startAt: BED_FROM, endAt: BED_TO });
  assert.equal(plan.find((p) => p.id === saunaId)?.taken, 0);
  assert.equal(plan.find((p) => p.id === bedId)?.taken, 1);
});

// ------------------------------------------------- what the desk logs beats the plan

test('a sauna running twenty minutes late still holds the sauna', async () => {
  const seg = (await prisma.appointmentService.findFirst({
    where: { appointment: { branchId }, resourceId: saunaId },
  }))!;
  // She got in at 1:50 and is not out yet.
  await prisma.appointmentService.update({
    where: { id: seg.id },
    data: { actualStartAt: T('05:50') },
  });
  // 2:00–2:20 was free a moment ago; she is still in there now.
  assert.ok(!(await freeAt(SAUNA_TO, BED_FROM)).includes(saunaId));
  await prisma.appointmentService.update({
    where: { id: seg.id },
    data: { actualStartAt: null },
  });
});

test('and a logged finish releases it early', async () => {
  const seg = (await prisma.appointmentService.findFirst({
    where: { appointment: { branchId }, resourceId: saunaId },
  }))!;
  await prisma.appointmentService.update({
    where: { id: seg.id },
    data: { actualStartAt: T('05:30'), actualEndAt: T('05:45') },
  });
  // Out at 1:45, so 1:45–2:00 is sellable rather than held to the plan.
  assert.ok((await freeAt(T('05:45'), SAUNA_TO)).includes(saunaId));
  await prisma.appointmentService.update({
    where: { id: seg.id },
    data: { actualStartAt: null, actualEndAt: null },
  });
});

// --------------------------------------- a booking with no treatments still holds

test('a place blocked out with no treatments listed is not sellable', async () => {
  // A room held for cleaning, or a reservation taken before the guest chose.
  // Counting only treatments would quietly release it and sell it twice.
  const blocked = await prisma.appointment.create({
    data: {
      branchId, clientId, reference: `SEGB-${stamp}`,
      resourceId: bedId, startAt: T('08:00'), endAt: T('09:00'), status: 'CONFIRMED',
    },
  });
  assert.ok(!(await freeAt(T('08:00'), T('09:00'))).includes(bedId));
  await prisma.appointment.delete({ where: { id: blocked.id } });
});
