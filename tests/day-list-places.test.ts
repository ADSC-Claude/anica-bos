/**
 * The day list has to check every treatment, not just the longest one.
 *
 * Before this, step 1 asked one question — "is a bed free for the whole visit?"
 * — because the longest treatment decided the place. For a sauna and a massage
 * that was wrong in both directions at once:
 *
 *  - The sauna was never looked at, so times it could not honour were offered.
 *    The guest filled in the entire form and was refused at the last step,
 *    where the per-treatment check finally ran.
 *  - The bed was demanded for the whole visit, including the half hour she
 *    spends in the sauna, so times that would have sold were hidden.
 *
 * These run against the database because the fault was in what was asked of it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { blockersForRuns, loadDayFloor } from '../src/lib/availability';
import { placeRuns, planVisit, type Treatment } from '../src/lib/itinerary';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let clientId: string;
let bedId: string;
let saunaId: string;

const HOUSE = 5;

/** Manila is UTC+8 with no daylight saving, so the offset is just arithmetic. */
const DAY1 = (hhmm: string) => new Date(`2027-04-11T${hhmm}:00Z`);
const DAY2 = (hhmm: string) => new Date(`2027-04-12T${hhmm}:00Z`);
/** 12:00pm Manila = 04:00Z. */
const noon = '04:00';

const sauna: Treatment = {
  serviceId: 'sauna', name: 'Sauna Session', durationMinutes: 30,
  sequenceRank: 10, placeType: 'SAUNA',
};
const massage: Treatment = {
  serviceId: 'swedish', name: 'Swedish Massage', durationMinutes: 60,
  sequenceRank: 30, placeType: 'BED',
};
const earCandling: Treatment = {
  serviceId: 'ear', name: 'Ear Candling', durationMinutes: 30,
  sequenceRank: 30, placeType: 'BED',
};

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `day-${stamp}`, code: `DAY${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  bedId = (
    await prisma.resource.create({
      data: { branchId, name: `Bed ${stamp}`, type: 'BED', capacity: 1, sortRank: 1 },
    })
  ).id;
  saunaId = (
    await prisma.resource.create({
      data: {
        branchId, name: `Sauna ${stamp}`, type: 'SAUNA', capacity: 1,
        exclusiveUse: true, fillWhole: false, sortRank: 2,
      },
    })
  ).id;

  clientId = (
    await prisma.client.create({
      data: {
        branchId, name: `Day ${stamp}`, mobile: `09${String(Date.now()).slice(-9)}`,
        email: `day${stamp}@x.test`, addressCity: 'QC',
      },
    })
  ).id;

  const cat = await prisma.serviceCategory.create({ data: { name: `day-cat-${stamp}` } });
  const svc = await prisma.service.create({
    data: {
      categoryId: cat.id, name: `Day filler ${stamp}`, durationMinutes: 60,
      priceCents: 100_000, requiredResourceType: 'BED',
    },
  });

  /** Somebody else's booking, holding one place for one window. */
  const hold = async (resourceId: string, from: Date, to: Date, ref: string) => {
    await prisma.appointment.create({
      data: {
        branchId, clientId, reference: ref, resourceId,
        startAt: from, endAt: to, status: 'CONFIRMED',
        services: {
          create: [{
            serviceId: svc.id, priceCents: 100_000,
            durationMinutes: Math.round((to.getTime() - from.getTime()) / 60_000),
            sortRank: 0, resourceId, startAt: from, endAt: to,
          }],
        },
      },
    });
  };

  // Day one — the preview's scenario exactly.
  await hold(bedId, DAY1(noon), DAY1('05:00'), `DAY-B-${stamp}`);   // bed  12:00–1:00pm
  await hold(saunaId, DAY1('05:30'), DAY1('06:30'), `DAY-S-${stamp}`); // sauna 1:30–2:30pm

  // Day two — five minutes of bed, right in the middle of a two-treatment visit.
  await hold(bedId, DAY2('06:00'), DAY2('06:05'), `DAY-G-${stamp}`);  // bed 2:00–2:05pm
});

after(async () => {
  await prisma.appointmentService.deleteMany({ where: { appointment: { branchId } } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.resource.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { name: `Day filler ${stamp}` } });
  await prisma.serviceCategory.deleteMany({ where: { name: `day-cat-${stamp}` } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

/** What stops this visit, starting at this time. */
async function blockersAt(startAt: Date, treatments: Treatment[]) {
  const day = startAt.toISOString().slice(0, 10);
  const floor = await loadDayFloor({
    branchId,
    from: new Date(`${day}T00:00:00Z`),
    to: new Date(`${day}T23:59:00Z`),
  });
  const runs = placeRuns(planVisit({ treatments, startAt, changeoverMinutes: HOUSE })).map((r) => ({
    placeType: r.placeType,
    startAt: r.startAt,
    endAt: r.endAt,
    label: r.segments.map((s) => s.name).join(' and '),
  }));
  return blockersForRuns(floor, runs);
}

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila',
  }).format(d);

// ------------------------------------------------- offered today, refused later

test('a start whose sauna is taken is refused, and says so', async () => {
  // 2:00pm: the bed is free from 1:00 onwards, so the old check offered this
  // and the guest was turned away after filling in the form.
  const blockers = await blockersAt(DAY1('06:00'), [sauna, massage]);

  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].treatment, 'Sauna Session');
  assert.equal(blockers[0].placeType, 'SAUNA');
  assert.ok(blockers[0].freeAt);
  assert.equal(hhmm(blockers[0].freeAt!), '14:30', 'the sauna comes back at half two');
});

test('the massage is named when the bed is the problem', async () => {
  // 12:00pm: sauna 12:00–12:30 is free, but the bed is somebody else's until
  // one o'clock and her massage would start at 12:35.
  const blockers = await blockersAt(DAY1(noon), [sauna, massage]);

  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].treatment, 'Swedish Massage');
  assert.equal(hhmm(blockers[0].freeAt!), '13:00');
});

// ------------------------------------------------------- hidden today, sellable

test('a start the old check hid is offered, because she is in the sauna', async () => {
  // 12:30pm. The bed is busy until 1:00, and the old check wanted it from
  // 12:30 — but she is in the sauna until 1:00 and does not need a bed until
  // 1:05. This booking was always sellable and was never offered.
  assert.deepEqual(await blockersAt(DAY1('04:30'), [sauna, massage]), []);
});

test('and the ordinary case still works', async () => {
  // 2:30pm: the sauna is handed over the moment the other guest leaves it.
  assert.deepEqual(await blockersAt(DAY1('06:30'), [sauna, massage]), []);
});

// -------------------------------------------------------- the same-bed rule

test('nobody may book the five minutes between two of her bed treatments', async () => {
  // Massage 1:00–2:00, ear candling 2:05–2:35, and somebody holding the bed
  // 2:00–2:05. Checked treatment by treatment this looks free — neither of her
  // two windows overlaps those five minutes. But she is lying on that bed, and
  // the run is what is really held.
  const blockers = await blockersAt(DAY2('05:00'), [massage, earCandling]);

  assert.equal(blockers.length, 1);
  assert.equal(
    blockers[0].treatment,
    'Swedish Massage and Ear Candling',
    'the whole run is named, because the whole run is the hold',
  );
});

test('the same two treatments fit once the bed is clear', async () => {
  assert.deepEqual(await blockersAt(DAY2('07:00'), [massage, earCandling]), []);
});
