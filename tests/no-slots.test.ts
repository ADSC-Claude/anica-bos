/**
 * Why a day is empty — because "try another date" is a lie when every date is
 * empty.
 *
 * Reported as: no slots on any day the owner clicked, on a live site that had
 * been taking bookings the hour before. The cause was never the date. A day
 * with nothing in it has exactly one of a handful of causes, and all but one of
 * them are a setting somebody changed rather than a busy evening — so the form
 * has to name it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { diagnoseNoSlots, slotsForDay } from '../src/lib/availability';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let serviceId: string;
let otherServiceId: string;
let employeeId: string;
let bedId: string;

/** A date far enough out that attendance is not consulted. */
const DATE = '2027-09-14';
const day = () =>
  slotsForDay({
    dateKey: DATE,
    openMinute: 720,
    closeMinute: 1440,
    durationMinutes: 60,
    stepMinutes: 15,
    leadTimeMinutes: 60,
    now: new Date('2027-09-13T00:00:00Z'),
  });

const why = (over: Partial<Parameters<typeof diagnoseNoSlots>[0]> = {}) =>
  diagnoseNoSlots({
    branchId,
    serviceIds: [serviceId],
    serviceNames: ['Swedish Massage'],
    place: 'BED',
    candidates: day(),
    partySize: 1,
    ...over,
  });

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `why-${stamp}`, code: `WHY${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  // Services and categories are spa-wide, not per branch — one price list for
  // every location is the point of the model.
  const cat = await prisma.serviceCategory.create({
    data: { name: `cat-${stamp}`, sortRank: 1 },
  });
  const mk = async (name: string) =>
    (
      await prisma.service.create({
        data: {
          categoryId: cat.id, name: `${name} ${stamp}`,
          durationMinutes: 60, priceCents: 100_000, requiredResourceType: 'BED',
        },
      })
    ).id;
  serviceId = await mk('Swedish');
  otherServiceId = await mk('Shiatsu');

  bedId = (
    await prisma.resource.create({
      data: { branchId, name: `Bed ${stamp}`, type: 'BED', capacity: 1 },
    })
  ).id;

  employeeId = (
    await prisma.employee.create({
      data: { branchId, name: `Thera ${stamp}`, employeeRole: 'THERAPIST', active: true },
    })
  ).id;
});

after(async () => {
  await prisma.employeeSkill.deleteMany({ where: { employeeId } });
  await prisma.employee.deleteMany({ where: { branchId } });
  await prisma.resource.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { id: { in: [serviceId, otherServiceId] } } });
  await prisma.serviceCategory.deleteMany({ where: { name: `cat-${stamp}` } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

// ------------------------------------------------------------- the reported one

test('a therapist with the treatment not ticked empties every date, and says so', async () => {
  // The therapist exists and is active. She simply has no skill row for this
  // service — which is the state an owner lands in the moment they add a real
  // employee and do not tick the treatments. Nothing about the calendar is
  // wrong, and the old message sent them to try tomorrow, and the day after.
  const r = await why();
  assert.equal(r.code, 'NO_SKILLED_THERAPIST');
  assert.match(r.message, /Swedish Massage/);
  assert.match(r.message, /call us/i);
});

test('being skilled in a different treatment does not count', async () => {
  await prisma.employeeSkill.create({ data: { employeeId, serviceId: otherServiceId } });
  assert.equal((await why()).code, 'NO_SKILLED_THERAPIST');
});

test('every service in the booking must be covered, not just one', async () => {
  await prisma.employeeSkill.create({ data: { employeeId, serviceId } });
  // She can do both individually, so a booking of both is fine.
  assert.notEqual((await why({ serviceIds: [serviceId, otherServiceId] })).code, 'NO_SKILLED_THERAPIST');
  // Take one away and the pair is no longer bookable by anyone.
  await prisma.employeeSkill.deleteMany({ where: { employeeId, serviceId: otherServiceId } });
  assert.equal(
    (await why({ serviceIds: [serviceId, otherServiceId], serviceNames: ['Swedish', 'Shiatsu'] })).code,
    'NO_SKILLED_THERAPIST',
  );
});

// ------------------------------------------------------------- the other causes

test('with nobody on the books at all, it does not blame the treatment', async () => {
  await prisma.employee.update({ where: { id: employeeId }, data: { active: false } });
  const r = await why();
  assert.equal(r.code, 'NO_THERAPIST_AT_ALL');
  assert.doesNotMatch(r.message, /Swedish/, 'the treatment is not the problem here');
  await prisma.employee.update({ where: { id: employeeId }, data: { active: true } });
});

test('a skilled therapist with nowhere to put the guest reports the place', async () => {
  await prisma.resource.update({ where: { id: bedId }, data: { active: false } });
  const r = await why();
  assert.equal(r.code, 'NO_PLACE_CONFIGURED');
  assert.match(r.message, /bed/i);
  await prisma.resource.update({ where: { id: bedId }, data: { active: true } });
});

test('a day with no start times at all is the day, not the setup', async () => {
  const r = await why({ candidates: [] });
  assert.equal(r.code, 'CLOSED_FOR_DAY');
  assert.match(r.message, /another date/i);
});

test('skilled, housed and on shift falls through to the honest answer', async () => {
  // One therapist, one bed, no schedule row — so she defaults to working.
  const r = await why();
  assert.ok(
    r.code === 'FULLY_BOOKED' || r.code === 'PARTY_TOO_LARGE',
    `expected a genuine-capacity answer, got ${r.code}`,
  );
});

test('a group larger than the floor says so rather than "fully booked"', async () => {
  const r = await why({ partySize: 6 });
  assert.equal(r.code, 'PARTY_TOO_LARGE');
  assert.match(r.message, /group of 6/);
});

test('every reason tells the reader what to do next', async () => {
  // A diagnosis nobody can act on is the message we just replaced.
  for (const r of [
    await why({ candidates: [] }),
    await why(),
    await why({ partySize: 6 }),
  ]) {
    assert.match(r.message, /call us|another date/i, `no next step in: ${r.message}`);
  }
});
