/**
 * What a booking actually writes down when a visit needs one place or two.
 *
 *   "if the services is both in the same bed, or in the same chair services,
 *    this setup doesnt need complication and can push through with just 5mins
 *    interval just to prepare for the next service, but if add ons, no need
 *    for 5mins interval."
 *
 * The planner tests prove the arithmetic. These prove the booking obeys it —
 * that two bed treatments come out of the database on *one* bed with the five
 * minutes between them, that an add-on takes no gap at all, and that changing
 * the kind of place still produces two separate holds.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createOnlineBooking } from '../src/lib/booking';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let massageId: string;
let candlingId: string;
let compressId: string;
let saunaSvcId: string;

/** 5:00 PM Manila, a month out — past the lead time, nowhere near closing. */
function slotIso(dayOffset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
}

const client = () => ({
  name: `Runner ${stamp}`,
  mobile: `09${String(Date.now()).slice(-9)}`,
  email: `runs${stamp}@x.test`,
  birthday: '1990-01-01',
  addressCity: 'Quezon City',
});

before(async () => {
  const branch = await prisma.branch.create({
    data: {
      name: `run-${stamp}`, code: `RUN${stamp}`.slice(0, 10), address: '', contact: '',
      openMinute: 720, closeMinute: 1440, isDefault: false, active: true,
    },
  });
  branchId = branch.id;

  const cat = await prisma.serviceCategory.create({ data: { name: `RunCat ${stamp}` } });
  const svc = async (
    name: string, minutes: number, place: 'BED' | 'SAUNA', extra: Record<string, unknown> = {},
  ) =>
    (
      await prisma.service.create({
        data: {
          name: `${name} ${stamp}`, categoryId: cat.id, durationMinutes: minutes,
          priceCents: 100_000, requiredResourceType: place, ...extra,
        },
      })
    ).id;

  massageId = await svc('Run Massage', 60, 'BED', { sequenceRank: 30 });
  candlingId = await svc('Run Ear Candling', 30, 'BED', { sequenceRank: 30 });
  compressId = await svc('Run Compress', 15, 'BED', { sequenceRank: 50, isAddOn: true });
  saunaSvcId = await svc('Run Sauna', 30, 'SAUNA', { sequenceRank: 10 });

  // Two beds, so "one bed for both" is a choice the code made and not the only
  // bed there was.
  for (const [i, n] of ['Run Bed A', 'Run Bed B'].entries()) {
    await prisma.resource.create({
      data: { branchId, name: `${n} ${stamp}`, type: 'BED', capacity: 1, sortRank: i + 1 },
    });
  }
  await prisma.resource.create({
    data: {
      branchId, name: `Run Sauna ${stamp}`, type: 'SAUNA', capacity: 1,
      exclusiveUse: true, fillWhole: false, sortRank: 3,
    },
  });

  // Two therapists: one visit of two treatments still only needs one, but a
  // spare keeps the question about places rather than about staffing.
  for (const i of [0, 1]) {
    const e = await prisma.employee.create({
      data: {
        branchId, name: `Run Therapist ${i} ${stamp}`, employeeRole: 'THERAPIST',
        mobile: `093${String(Date.now()).slice(-8)}${i}`, active: true,
      },
    });
    for (const serviceId of [massageId, candlingId, compressId, saunaSvcId]) {
      await prisma.employeeSkill.create({ data: { employeeId: e.id, serviceId } });
    }
    // On duty every day, so no shift rule interferes with the question.
    for (let d = 0; d < 7; d += 1) {
      await prisma.employeeSchedule.create({
        data: { employeeId: e.id, dayOfWeek: d, isDayOff: false },
      });
    }
  }

  await prisma.setting.createMany({
    data: [
      { key: 'booking.enabled', value: true, branchId },
      { key: 'booking.depositPercent', value: 30, branchId },
      { key: 'booking.manualFallbackEnabled', value: true, branchId },
      { key: 'booking.leadTimeMinutes', value: 60, branchId },
      { key: 'booking.expiryMinutes', value: 120, branchId },
      { key: 'booking.changeoverMinutes', value: 5, branchId },
    ],
  });
});

after(async () => {
  await prisma.appointmentService.deleteMany({ where: { appointment: { branchId } } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.employeeSchedule.deleteMany({ where: { employee: { branchId } } });
  await prisma.employeeSkill.deleteMany({ where: { employee: { branchId } } });
  await prisma.employee.deleteMany({ where: { branchId } });
  await prisma.resource.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { name: { endsWith: stamp } } });
  await prisma.serviceCategory.deleteMany({ where: { name: `RunCat ${stamp}` } });
  await prisma.setting.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

/** Book a visit and read back its treatments in the order they run. */
async function bookAndRead(serviceIds: string[], day: number) {
  const res = await createOnlineBooking({
    branchId, serviceIds, startAtIso: slotIso(day), client: client(), intake: {}, consent: true,
    waiver: true,
  });
  const appt = (await prisma.appointment.findFirst({
    where: { reference: res.reference },
    include: { services: { include: { service: true }, orderBy: { startAt: 'asc' } } },
  }))!;
  return appt.services.map((s) => ({
    name: s.service.name,
    resourceId: s.resourceId,
    startAt: s.startAt!,
    endAt: s.endAt!,
  }));
}

const gapAfter = (a: { endAt: Date }, b: { startAt: Date }) =>
  Math.round((b.startAt.getTime() - a.endAt.getTime()) / 60_000);

test('two bed treatments come out on one bed, five minutes apart', async () => {
  const legs = await bookAndRead([massageId, candlingId], 31);

  assert.equal(legs.length, 2);
  assert.equal(
    legs[0].resourceId,
    legs[1].resourceId,
    'she does not get up and walk to another bed halfway through',
  );
  assert.equal(gapAfter(legs[0], legs[1]), 5, 'linen and oils are real minutes');
});

test('an add-on takes the same bed and no gap at all', async () => {
  const legs = await bookAndRead([massageId, compressId], 32);

  assert.equal(legs.length, 2);
  assert.equal(legs[0].resourceId, legs[1].resourceId);
  assert.equal(gapAfter(legs[0], legs[1]), 0, 'a compress is not a second appointment');
});

test('changing the kind of place gives two separate holds', async () => {
  const legs = await bookAndRead([saunaSvcId, massageId], 33);

  assert.equal(legs.length, 2);
  assert.notEqual(legs[0].resourceId, legs[1].resourceId, 'a sauna is not a bed');
  assert.equal(gapAfter(legs[0], legs[1]), 5);
});

test('the bed is not held while she is in the sauna', async () => {
  const legs = await bookAndRead([saunaSvcId, massageId], 34);
  const bedLeg = legs[1];

  // Anything else holding that bed during the sauna would be a booking the spa
  // could not have sold under the old whole-visit hold.
  const overlapping = await prisma.appointmentService.count({
    where: {
      resourceId: bedLeg.resourceId,
      startAt: { lt: legs[0].endAt },
      endAt: { gt: legs[0].startAt },
    },
  });
  assert.equal(overlapping, 0, 'the bed is free during the sauna, so nothing of hers is on it');
});
