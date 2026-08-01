/**
 * A break the guest asked for.
 *
 * One tap on a start time gives a visit with the treatments as close together
 * as the floor allows, which is what almost everybody wants. This is the other
 * case: lunch between the sauna and the massage, asked for on purpose.
 *
 * Two things have to be true of it, and they pull in opposite directions:
 *
 *  - The wait is hers, not the house's. The place she is not yet in goes back
 *    on sale for the length of it — nobody holds a bed for an hour because a
 *    guest fancied a long lunch.
 *  - So the schedule must say so, and the booking must be re-planned on the
 *    server rather than trusted, because a browser sent the number.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createOnlineBooking } from '../src/lib/booking';
import { placeRuns, planVisit, visitMinutes, type Treatment } from '../src/lib/itinerary';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

const HOUSE = 5;
/** 1:30pm Manila. */
const AT = new Date('2027-03-04T05:30:00Z');
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila',
  }).format(d);

const sauna: Treatment = {
  serviceId: 'sauna', name: 'Sauna', durationMinutes: 30, placeType: 'SAUNA', sequenceRank: 10,
};
const massage: Treatment = {
  serviceId: 'massage', name: 'Massage', durationMinutes: 60, placeType: 'BED', sequenceRank: 30,
};

// ------------------------------------------------------------- the arithmetic

test('with no wait the treatments run as close together as the floor allows', () => {
  const [first, second] = planVisit({
    treatments: [sauna, massage], startAt: AT, changeoverMinutes: HOUSE,
  });
  assert.equal(hhmm(first.startAt), '13:30');
  assert.equal(hhmm(second.startAt), '14:05');
});

test('a wait pushes that treatment later, and only that one', () => {
  const [first, second] = planVisit({
    treatments: [sauna, { ...massage, gapBefore: 55 }],
    startAt: AT,
    changeoverMinutes: HOUSE,
  });
  // The sauna does not move: she asked for the massage later, not the whole
  // visit later.
  assert.equal(hhmm(first.startAt), '13:30');
  assert.equal(hhmm(first.endAt), '14:00');
  // 2:05 plus her 55 minutes.
  assert.equal(hhmm(second.startAt), '15:00');
  assert.equal(hhmm(second.endAt), '16:00');
});

test('the quoted length includes the wait, because she is here for it', () => {
  assert.equal(visitMinutes([sauna, massage], HOUSE), 95);
  assert.equal(visitMinutes([sauna, { ...massage, gapBefore: 55 }], HOUSE), 150);
});

test('a wait before the first treatment is meaningless and ignored', () => {
  // It would just be a later start time, which the slot picker already does.
  const [first] = planVisit({
    treatments: [{ ...sauna, gapBefore: 30 }, massage],
    startAt: AT,
    changeoverMinutes: HOUSE,
  });
  assert.equal(hhmm(first.startAt), '13:30');
});

test('an add-on cannot be pushed away from what it extends', () => {
  const compress: Treatment = {
    serviceId: 'compress', name: 'Back', durationMinutes: 15,
    placeType: 'BED', isAddOn: true, gapBefore: 30,
  };
  const [first, second] = planVisit({
    treatments: [massage, compress], startAt: AT, changeoverMinutes: HOUSE,
  });
  assert.equal(first.changeoverAfter, 0);
  assert.equal(hhmm(second.startAt), hhmm(first.endAt), 'straight on, wait or no wait');
});

// ------------------------------------------------------- what it costs the bed

test('a break gives the bed back, even between two bed treatments', () => {
  const candling: Treatment = {
    serviceId: 'ear', name: 'Ear Candling', durationMinutes: 30,
    placeType: 'BED', sequenceRank: 30,
  };

  // Back to back, it is one bed held right through.
  const together = placeRuns(
    planVisit({ treatments: [massage, candling], startAt: AT, changeoverMinutes: HOUSE }),
  );
  assert.equal(together.length, 1);

  // With an hour of lunch in the middle it is two separate holds, and the bed
  // is sellable to somebody else while she is out.
  const apart = placeRuns(
    planVisit({
      treatments: [massage, { ...candling, gapBefore: 60 }],
      startAt: AT,
      changeoverMinutes: HOUSE,
    }),
  );
  assert.equal(apart.length, 2, 'she is not lying on it during her lunch');
  assert.equal(hhmm(apart[0].endAt), '14:30');
  assert.equal(hhmm(apart[1].startAt), '15:35');
});

// ------------------------------------------------- what the booking writes down

let branchId: string;
let saunaSvcId: string;
let massageSvcId: string;

before(async () => {
  const branch = await prisma.branch.create({
    data: {
      name: `wait-${stamp}`, code: `WAI${stamp}`.slice(0, 10), address: '', contact: '',
      openMinute: 720, closeMinute: 1440, isDefault: false, active: true,
    },
  });
  branchId = branch.id;

  const cat = await prisma.serviceCategory.create({ data: { name: `WaitCat ${stamp}` } });
  saunaSvcId = (
    await prisma.service.create({
      data: {
        name: `Wait Sauna ${stamp}`, categoryId: cat.id, durationMinutes: 30,
        priceCents: 30_000, requiredResourceType: 'SAUNA', sequenceRank: 10,
      },
    })
  ).id;
  massageSvcId = (
    await prisma.service.create({
      data: {
        name: `Wait Massage ${stamp}`, categoryId: cat.id, durationMinutes: 60,
        priceCents: 100_000, requiredResourceType: 'BED', sequenceRank: 30,
      },
    })
  ).id;

  await prisma.resource.create({
    data: { branchId, name: `Wait Bed ${stamp}`, type: 'BED', capacity: 1, sortRank: 1 },
  });
  await prisma.resource.create({
    data: {
      branchId, name: `Wait Sauna ${stamp}`, type: 'SAUNA', capacity: 1,
      exclusiveUse: true, fillWhole: false, sortRank: 2,
    },
  });

  const e = await prisma.employee.create({
    data: {
      branchId, name: `Wait Therapist ${stamp}`, employeeRole: 'THERAPIST',
      mobile: `094${String(Date.now()).slice(-8)}`, active: true,
    },
  });
  for (const serviceId of [saunaSvcId, massageSvcId]) {
    await prisma.employeeSkill.create({ data: { employeeId: e.id, serviceId } });
  }
  for (let d = 0; d < 7; d += 1) {
    await prisma.employeeSchedule.create({
      data: { employeeId: e.id, dayOfWeek: d, isDayOff: false },
    });
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
  await prisma.serviceCategory.deleteMany({ where: { name: `WaitCat ${stamp}` } });
  await prisma.setting.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

/** 5:00 PM Manila, a month out. */
function slotIso(dayOffset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
}

async function book(waits: Record<string, number> | undefined, day: number) {
  const res = await createOnlineBooking({
    branchId,
    serviceIds: [saunaSvcId, massageSvcId],
    waits,
    startAtIso: slotIso(day),
    client: {
      name: `Waiter ${stamp}`, mobile: `09${String(Date.now()).slice(-9)}`,
      email: `wait${stamp}-${day}@x.test`, birthday: '1990-01-01', addressCity: 'Quezon City',
    },
    intake: {},
    consent: true,
  });
  const appt = (await prisma.appointment.findFirst({
    where: { reference: res.reference },
    include: { services: { orderBy: { startAt: 'asc' } } },
  }))!;
  return appt.services.map((s) => ({ startAt: s.startAt!, endAt: s.endAt!, id: s.serviceId }));
}

const gapBetweenRows = (a: { endAt: Date }, b: { startAt: Date }) =>
  Math.round((b.startAt.getTime() - a.endAt.getTime()) / 60_000);

test('a booking with no wait is back to back', async () => {
  const legs = await book(undefined, 41);
  assert.equal(gapBetweenRows(legs[0], legs[1]), 5);
});

test('a booking with a wait is written down with the wait in it', async () => {
  const legs = await book({ [massageSvcId]: 55 }, 42);
  assert.equal(gapBetweenRows(legs[0], legs[1]), 60, 'five minutes of changeover plus her 55');
});

test('a wait sent for the first treatment is refused, not obeyed', async () => {
  // Otherwise a crafted request could shift the start away from the slot the
  // availability check actually approved.
  const legs = await book({ [saunaSvcId]: 90 }, 43);
  assert.equal(gapBetweenRows(legs[0], legs[1]), 5);
  assert.equal(
    new Date(legs[0].startAt).toISOString(),
    slotIso(43),
    'the visit still starts when she said it would',
  );
});

test('an absurd wait is clamped rather than believed', async () => {
  const legs = await book({ [massageSvcId]: 99_999 }, 44);
  // 720 is the cap: half a day, longer than the spa is open.
  assert.equal(gapBetweenRows(legs[0], legs[1]), 725);
});
