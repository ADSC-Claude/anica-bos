/**
 * What an unpaid booking holds after its window shuts.
 *
 * A reservation holds its bed from the moment it is made, which is right — two
 * guests must not be sold the same bed while the first is on the payment page.
 * But the hold has a deadline, and the sweep that marks it expired runs on a
 * schedule. Between the deadline and the sweep the bed is empty and, until now,
 * unsellable: on a once-a-day job, most of a day of a room nobody could book.
 *
 * So availability stops honouring a hold the instant it lapses. That opens a
 * question the old behaviour never had to answer — what happens when the money
 * turns up late — and these prove both halves: the bed goes back on sale, and
 * a late payment cannot quietly take a bed somebody else is now holding.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { availableResources } from '../src/lib/availability';
import { confirmDeposit, expireStaleBookings } from '../src/lib/booking';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let bedId: string;
let serviceId: string;

/** 5:00 PM Manila, a month out — past the lead time, nowhere near closing. */
function slotAt(dayOffset: number): { startAt: Date; endAt: Date } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(9, 0, 0, 0);
  return { startAt: d, endAt: new Date(d.getTime() + 60 * 60_000) };
}

let seq = 0;
/**
 * A booking sitting on the bed, with its window and money set by the caller.
 * `expiresAt` in the past is a hold whose time has run out.
 */
async function hold(opts: {
  day: number;
  status: 'PENDING' | 'CONFIRMED';
  depositStatus: 'AWAITING_PAYMENT' | 'AWAITING_VERIFICATION' | 'FAILED' | 'PAID';
  expiresAt: Date | null;
}) {
  seq += 1;
  const { startAt, endAt } = slotAt(opts.day);
  const client = await prisma.client.create({
    data: {
      branchId,
      name: `Holder ${seq} ${stamp}`,
      mobile: `09${String(Date.now()).slice(-7)}${String(seq).padStart(2, '0')}`,
      email: `hold${seq}-${stamp}@x.test`,
      addressCity: 'Quezon City',
    },
  });
  return prisma.appointment.create({
    data: {
      branchId,
      clientId: client.id,
      reference: `LAPSE-${stamp}-${seq}`,
      startAt,
      endAt,
      status: opts.status,
      source: 'ONLINE',
      depositStatus: opts.depositStatus,
      depositAmountCents: 30_000,
      expiresAt: opts.expiresAt,
      resourceId: bedId,
      services: {
        create: [{ serviceId, priceCents: 100_000, durationMinutes: 60, startAt, endAt, resourceId: bedId }],
      },
    },
    include: { services: true },
  });
}

/** Is the one bed on offer for that slot? */
async function bedIsFree(day: number): Promise<boolean> {
  const { startAt, endAt } = slotAt(day);
  const free = await availableResources({ branchId, startAt, endAt });
  return free.some((r) => r.id === bedId);
}

before(async () => {
  const branch = await prisma.branch.create({
    data: {
      name: `lapse-${stamp}`, code: `LAP${stamp}`.slice(0, 10), address: '', contact: '',
      openMinute: 720, closeMinute: 1440, active: true,
    },
  });
  branchId = branch.id;

  const cat = await prisma.serviceCategory.create({ data: { name: `LapseCat ${stamp}` } });
  serviceId = (
    await prisma.service.create({
      data: {
        name: `Lapse Massage ${stamp}`, categoryId: cat.id, durationMinutes: 60,
        priceCents: 100_000, requiredResourceType: 'BED',
      },
    })
  ).id;

  // Exactly one bed, so "free" and "taken" are never a matter of degree.
  bedId = (
    await prisma.resource.create({
      data: { branchId, name: `Lapse Bed ${stamp}`, type: 'BED', capacity: 1 },
    })
  ).id;

  await prisma.setting.createMany({
    data: [
      { key: 'booking.enabled', value: true, branchId },
      { key: 'booking.expiryMinutes', value: 120, branchId },
      { key: 'booking.leadTimeMinutes', value: 60, branchId },
    ],
  });
});

after(async () => {
  await prisma.appointmentService.deleteMany({ where: { appointment: { branchId } } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.resource.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { name: { endsWith: stamp } } });
  await prisma.serviceCategory.deleteMany({ where: { name: `LapseCat ${stamp}` } });
  await prisma.setting.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const anHourAgo = () => new Date(Date.now() - 60 * 60_000);
const inAnHour = () => new Date(Date.now() + 60 * 60_000);

// ------------------------------------------------------------------ the hold

test('a booking still inside its window keeps the bed', async () => {
  await hold({ day: 40, status: 'PENDING', depositStatus: 'AWAITING_PAYMENT', expiresAt: inAnHour() });
  assert.equal(
    await bedIsFree(40),
    false,
    'the guest is still at the payment page — selling her bed underneath her is the bug this whole hold exists to prevent',
  );
});

test('a booking past its window lets the bed go, without waiting for the sweep', async () => {
  const appt = await hold({
    day: 41, status: 'PENDING', depositStatus: 'AWAITING_PAYMENT', expiresAt: anHourAgo(),
  });
  assert.equal(await bedIsFree(41), true, 'the fee never came, so the bed is for sale again');

  // Still PENDING in the table: the point is that availability no longer waits
  // for the job to say so.
  const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
  assert.equal(row.status, 'PENDING', 'nothing has swept it yet — availability decided on its own');
});

test('a paid booking keeps its bed however old the window is', async () => {
  await hold({ day: 42, status: 'CONFIRMED', depositStatus: 'PAID', expiresAt: anHourAgo() });
  assert.equal(await bedIsFree(42), false, 'she paid; the deadline stopped mattering');
});

test('a transfer waiting on the desk keeps its bed', async () => {
  await hold({
    day: 43, status: 'PENDING', depositStatus: 'AWAITING_VERIFICATION', expiresAt: anHourAgo(),
  });
  assert.equal(
    await bedIsFree(43),
    false,
    'she has paid by hand and is waiting on us to check the proof — the delay is ours, so the hold stays hers',
  );
});

// --------------------------------------------------------- the late payment

test('paying late still confirms when nobody took the place', async () => {
  const appt = await hold({
    day: 44, status: 'PENDING', depositStatus: 'AWAITING_PAYMENT', expiresAt: anHourAgo(),
  });
  const ok = await confirmDeposit({ reference: appt.reference, paidCents: 30_000, method: 'GCASH' });
  assert.equal(ok, true);

  const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
  assert.equal(row.status, 'CONFIRMED', 'a few minutes late on an empty afternoon is not a reason to turn her away');
  assert.equal(row.depositStatus, 'PAID');
  assert.equal(row.expiresAt, null, 'the clock is done with');
});

test('paying late does not take a place somebody else now holds', async () => {
  const lapsed = await hold({
    day: 45, status: 'PENDING', depositStatus: 'AWAITING_PAYMENT', expiresAt: anHourAgo(),
  });
  // The bed went back on sale and somebody else took it, paid.
  await hold({ day: 45, status: 'CONFIRMED', depositStatus: 'PAID', expiresAt: null });

  const ok = await confirmDeposit({ reference: lapsed.reference, paidCents: 30_000, method: 'GCASH' });
  assert.equal(ok, true, 'the payment happened and is recorded — what it cannot do is buy back the bed');

  const row = await prisma.appointment.findUniqueOrThrow({ where: { id: lapsed.id } });
  assert.equal(row.status, 'EXPIRED', 'the booking stays lapsed; the bed is not hers');
  assert.equal(row.depositStatus, 'PAID', 'her money is on the record, because it really was taken');
  assert.match(
    row.cancelReason,
    /refund|rebook/i,
    'the row itself says what the desk owes her',
  );
});

test('the desk is told there is money to hand back', async () => {
  const notes = await prisma.notification.findMany({
    where: { branchId, dedupeKey: { startsWith: 'late-deposit:' } },
  });
  assert.ok(notes.length >= 1, 'a late payment that lost its place cannot be left for someone to notice');
  assert.match(notes[0].body, /refund|move her/i);
});

// ------------------------------------------------------- the sweep on traffic

test('two sweeps at once expire a booking once, not twice', async () => {
  // Drain what the earlier tests left lying about — one of them deliberately
  // leaves a lapsed booking unswept — so the race below is about this booking
  // and not about who happened to reach a different one first.
  await expireStaleBookings();

  const appt = await hold({
    day: 46, status: 'PENDING', depositStatus: 'AWAITING_PAYMENT', expiresAt: anHourAgo(),
  });

  // The nightly job and a guest browsing free times, landing together. Before
  // the flip was conditional both would have claimed this booking and both
  // would have emailed her.
  const [a, b] = await Promise.all([expireStaleBookings(), expireStaleBookings()]);
  assert.equal(a + b, 1, 'exactly one caller got to expire it');

  const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
  assert.equal(row.status, 'EXPIRED');
});

test('a sweep leaves alone what it should', async () => {
  const live = await hold({
    day: 47, status: 'PENDING', depositStatus: 'AWAITING_PAYMENT', expiresAt: inAnHour(),
  });
  const byHand = await hold({
    day: 48, status: 'PENDING', depositStatus: 'AWAITING_VERIFICATION', expiresAt: anHourAgo(),
  });
  await expireStaleBookings();

  for (const [appt, why] of [
    [live, 'still inside her window'],
    [byHand, 'paid by hand, waiting on us to check the proof'],
  ] as const) {
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    assert.equal(row.status, 'PENDING', why);
  }
});
