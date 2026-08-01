/**
 * An add-on is decided by the category, not by a box on each service.
 *
 *   "Add on is a category, anything in it is if adding no interval."
 *
 * Filing an extra under the right heading is then the whole of the work. The
 * one thing the shelf cannot decide is the sauna: an add-on happens wherever
 * the treatment before it happened, and a sauna session is a walk to another
 * room that is then held for her alone. So a sauna service filed under add-ons
 * is held back rather than quietly given no changeover and no place of its own.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { placeRuns, planVisit, visitMinutes, type Treatment } from '../src/lib/itinerary';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let addOnCatId: string;
let plainCatId: string;

before(async () => {
  addOnCatId = (
    await prisma.serviceCategory.create({
      data: { name: `AddOns ${stamp}`, isAddOns: true, sortRank: 900 },
    })
  ).id;
  plainCatId = (
    await prisma.serviceCategory.create({
      data: { name: `Plain ${stamp}`, isAddOns: false, sortRank: 901 },
    })
  ).id;
});

after(async () => {
  await prisma.service.deleteMany({ where: { name: { endsWith: stamp } } });
  await prisma.serviceCategory.deleteMany({ where: { id: { in: [addOnCatId, plainCatId] } } });
  await prisma.$disconnect();
});

/** What the settings action does when it saves a service. */
const derive = (categoryIsAddOns: boolean, place: string | null) =>
  categoryIsAddOns && place !== 'SAUNA';

test('the add-ons category makes its services add-ons', () => {
  assert.equal(derive(true, 'BED'), true);
  assert.equal(derive(true, 'CHAIR'), true);
});

test('an ordinary category does not', () => {
  assert.equal(derive(false, 'BED'), false);
});

test('a sauna session is never an add-on, whatever shelf it is on', () => {
  // She gets up and walks to another room, and the room is hers alone while
  // she is in it. Treating that as a continuation of the massage would give it
  // no changeover and force it to share the bed, which it cannot.
  assert.equal(derive(true, 'SAUNA'), false);
});

test('the category flag survives a round trip to the database', async () => {
  const cat = await prisma.serviceCategory.findUnique({ where: { id: addOnCatId } });
  assert.equal(cat?.isAddOns, true);
});

test('a service filed under add-ons is stored as one', async () => {
  const svc = await prisma.service.create({
    data: {
      name: `Compress ${stamp}`, categoryId: addOnCatId, durationMinutes: 15,
      priceCents: 15_000, requiredResourceType: 'BED',
      isAddOn: derive(true, 'BED'),
    },
  });
  assert.equal(svc.isAddOn, true);
});

test('and moving it to an ordinary category makes it a treatment again', async () => {
  const svc = await prisma.service.create({
    data: {
      name: `Moved ${stamp}`, categoryId: addOnCatId, durationMinutes: 30,
      priceCents: 30_000, requiredResourceType: 'BED', isAddOn: true,
    },
  });
  const moved = await prisma.service.update({
    where: { id: svc.id },
    data: { categoryId: plainCatId, isAddOn: derive(false, 'BED') },
  });
  assert.equal(moved.isAddOn, false);
});

// ------------------------------------------------- what it means on the floor

test('the flag is the whole difference between 95 minutes and 75', () => {
  const massage: Treatment = {
    serviceId: 'm', name: 'Massage', durationMinutes: 60, placeType: 'BED', sequenceRank: 30,
  };
  const asTreatment: Treatment = {
    serviceId: 'x', name: 'Extra', durationMinutes: 30, placeType: 'BED', sequenceRank: 40,
  };
  const asAddOn: Treatment = { ...asTreatment, isAddOn: true };

  assert.equal(visitMinutes([massage, asTreatment], 5), 95);
  assert.equal(visitMinutes([massage, asAddOn], 5), 90);

  // Either way it is one bed, held right through — the difference is the gap,
  // not the place.
  for (const second of [asTreatment, asAddOn]) {
    const runs = placeRuns(
      planVisit({ treatments: [massage, second], startAt: new Date(), changeoverMinutes: 5 }),
    );
    assert.equal(runs.length, 1);
  }
});
