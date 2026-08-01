/**
 * A party is several bookings made together and paid for once.
 *
 * Modelling it as one appointment holding four people would have broken
 * capacity, conflict checking, therapist rotation and commission in a single
 * stroke — every one of those is already per-person and already right. So a
 * party is N ordinary appointments sharing a reference.
 *
 * The risk that buys is *half a party*: a state where the booker's row moved
 * and the guests' rows did not. The fee sits entirely on the booker, so nothing
 * else would ever expire, confirm or cancel the rest on its own. These tests
 * are mostly about that.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createOnlineBooking, confirmDeposit, declineLateRequest } from '../src/lib/booking';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let massageId: string;
let footSpaId: string;
let therapistIds: string[] = [];

/** Far enough ahead to clear the lead time, and mid-evening so nothing overruns. */
function slotIso(dayOffset = 30) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  // 14:00 UTC == 10:00 PM Manila… too late. 09:00 UTC == 5:00 PM Manila.
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
}

const client = () => ({
  name: `Booker ${stamp}`,
  mobile: `09${String(Date.now()).slice(-9)}`,
  email: `party${stamp}@x.test`,
  birthday: '1990-01-01',
  addressCity: 'Quezon City',
});

before(async () => {
  const branch = await prisma.branch.create({
    data: {
      name: `pty-${stamp}`, code: `PTY${stamp}`.slice(0, 10), address: '', contact: '',
      openMinute: 720, closeMinute: 1440, isDefault: false, active: true,
    },
  });
  branchId = branch.id;

  const cat = await prisma.serviceCategory.create({ data: { name: `PtyCat ${stamp}` } });
  massageId = (
    await prisma.service.create({
      data: {
        name: `Pty Massage ${stamp}`, categoryId: cat.id, durationMinutes: 60,
        priceCents: 100000, requiredResourceType: 'BED',
      },
    })
  ).id;
  footSpaId = (
    await prisma.service.create({
      data: {
        name: `Pty Foot Spa ${stamp}`, categoryId: cat.id, durationMinutes: 45,
        priceCents: 50000, requiredResourceType: 'CHAIR',
      },
    })
  ).id;

  // Enough places for a party of three: two open beds and the two chairs.
  for (const [i, n] of ['Bed A', 'Bed B'].entries()) {
    await prisma.resource.create({
      data: { branchId, name: `${n} ${stamp}`, type: 'BED', capacity: 1, sortRank: i + 1 },
    });
  }
  await prisma.resource.create({
    data: { branchId, name: `Chairs ${stamp}`, type: 'CHAIR', capacity: 2, sortRank: 3 },
  });

  // Therapists, on shift, skilled in both treatments.
  for (const i of [0, 1, 2]) {
    const e = await prisma.employee.create({
      data: {
        branchId, name: `Pty Therapist ${i} ${stamp}`, employeeRole: 'THERAPIST',
        mobile: `092${String(Date.now()).slice(-8)}${i}`, active: true,
      },
    });
    therapistIds.push(e.id);
    for (const serviceId of [massageId, footSpaId]) {
      await prisma.employeeSkill.create({ data: { employeeId: e.id, serviceId } });
    }
    for (let d = 0; d < 7; d++) {
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
    ],
  });
});

after(async () => {
  await prisma.appointmentService.deleteMany({ where: { appointment: { branchId } } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.employeeSkill.deleteMany({ where: { employee: { branchId } } });
  await prisma.employeeSchedule.deleteMany({ where: { employee: { branchId } } });
  await prisma.employee.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.resource.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { id: { in: [massageId, footSpaId] } } });
  await prisma.serviceCategory.deleteMany({ where: { name: `PtyCat ${stamp}` } });
  await prisma.setting.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const book = (guests: { name: string; serviceIds: string[] }[] = [], day = 30) =>
  createOnlineBooking({
    branchId,
    serviceIds: [massageId],
    startAtIso: slotIso(day),
    client: client(),
    intake: {},
    consent: true,
    waiver: true,
    guests,
  });

test('a booking without the treatment waiver is refused', async () => {
  await assert.rejects(
    () =>
      createOnlineBooking({
        branchId,
        serviceIds: [massageId],
        startAtIso: slotIso(29),
        client: client(),
        intake: {},
        consent: true,
        waiver: false,
      }),
    /treatment consent/i,
    'data-privacy consent alone does not cover the treatment itself',
  );
});

test('a booking of one creates one appointment and no party reference', async () => {
  const res = await book([], 30);
  const rows = await prisma.appointment.findMany({ where: { reference: res.reference } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].partyRef, '', 'a party of one is not a party');
  assert.equal(rows[0].guestName, '', 'the booker is not a guest of themselves');
});

test('a party creates one appointment per guest, linked', async () => {
  const res = await book(
    [
      { name: 'Nina Reyes', serviceIds: [footSpaId] },
      { name: 'Joy Mendoza', serviceIds: [massageId] },
    ],
    31,
  );
  const lead = await prisma.appointment.findUniqueOrThrow({ where: { reference: res.reference } });
  assert.ok(lead.partyRef, 'the lead row carries the party reference');

  const party = await prisma.appointment.findMany({
    where: { partyRef: lead.partyRef },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(party.length, 3);
  assert.deepEqual(
    party.map((p) => p.guestName),
    ['', 'Nina Reyes', 'Joy Mendoza'],
    'guests are named; the booker is not',
  );
});

test('the fee covers the party and sits only on the booker', async () => {
  const res = await book([{ name: 'Nina Reyes', serviceIds: [footSpaId] }], 32);
  // ₱1,000 massage + ₱500 foot spa = ₱1,500, of which 30% is ₱450.
  assert.equal(res.depositCents, 45000, 'one fee, on both treatments');

  const lead = await prisma.appointment.findUniqueOrThrow({ where: { reference: res.reference } });
  const others = await prisma.appointment.findMany({
    where: { partyRef: lead.partyRef, id: { not: lead.id } },
  });
  assert.equal(lead.depositAmountCents, 45000);
  assert.ok(
    others.every((o) => o.depositAmountCents === 0),
    'a guest is never asked for a share nobody will collect',
  );
});

test('a guest is placed somewhere their treatment can happen', async () => {
  const res = await book([{ name: 'Nina Reyes', serviceIds: [footSpaId] }], 33);
  const lead = await prisma.appointment.findUniqueOrThrow({
    where: { reference: res.reference },
    include: { resource: true },
  });
  const guest = await prisma.appointment.findFirstOrThrow({
    where: { partyRef: lead.partyRef, guestName: 'Nina Reyes' },
    include: { resource: true },
  });
  assert.equal(lead.resource?.type, 'BED', 'the massage got a bed');
  assert.equal(guest.resource?.type, 'CHAIR', 'the foot spa got a chair');
});

test('two guests needing a bed do not land on the same single bed', async () => {
  const res = await book([{ name: 'Nina Reyes', serviceIds: [massageId] }], 34);
  const lead = await prisma.appointment.findUniqueOrThrow({ where: { reference: res.reference } });
  const party = await prisma.appointment.findMany({ where: { partyRef: lead.partyRef } });
  const places = party.map((p) => p.resourceId);
  assert.equal(new Set(places).size, places.length, 'each got their own bed');
});

// ------------------------------------------------- the half-a-party risks

test('paying once confirms every guest', async () => {
  const res = await book([{ name: 'Nina Reyes', serviceIds: [footSpaId] }], 35);
  const lead = await prisma.appointment.findUniqueOrThrow({ where: { reference: res.reference } });

  await confirmDeposit({ reference: res.reference, paidCents: res.depositCents, method: 'gcash' });

  const party = await prisma.appointment.findMany({ where: { partyRef: lead.partyRef } });
  assert.ok(
    party.every((p) => p.status === 'CONFIRMED'),
    'a guest row left PENDING would expire out from under a paid booking',
  );
});

test('declining a late request cancels every guest', async () => {
  const res = await book([{ name: 'Nina Reyes', serviceIds: [footSpaId] }], 36);
  const lead = await prisma.appointment.findUniqueOrThrow({ where: { reference: res.reference } });
  // Force the party into the approval queue, as a late slot would.
  await prisma.appointment.updateMany({
    where: { partyRef: lead.partyRef },
    data: { needsApproval: true },
  });

  await declineLateRequest({
    appointmentId: lead.id,
    reason: 'We cannot stay past closing that night.',
    declinedBy: 'Test',
  });

  const party = await prisma.appointment.findMany({ where: { partyRef: lead.partyRef } });
  assert.ok(
    party.every((p) => p.status === 'CANCELLED'),
    'a guest row left behind would hold a bed for a booking that was refused',
  );
  assert.ok(party.every((p) => !p.needsApproval));
});

// ------------------------------------------------------------- validation

test('a guest without a name is refused', async () => {
  await assert.rejects(
    () => book([{ name: '   ', serviceIds: [footSpaId] }], 37),
    /name for each guest/,
  );
});

test('a guest without a treatment is refused', async () => {
  await assert.rejects(
    () => book([{ name: 'Nina Reyes', serviceIds: [] }], 38),
    /at least one treatment/,
  );
});
