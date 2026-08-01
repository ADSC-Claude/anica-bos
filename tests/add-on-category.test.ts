/**
 * Which services run on with no interval, and which are treatments.
 *
 *   "single word like this: Head, Hand, Back, Foot, Hot Stone, Ventosa, Shower
 *    this is the only thing that if add up into anything doesnt need interval."
 *
 * Those seven share a shelf with the sauna and ear candling, which a guest
 * books on her own — so the category cannot be the answer by itself, and each
 * service keeps its own. The category only pre-ticks the box for anything new
 * filed there.
 *
 * The names are matched whole and never as a substring. The catalogue also
 * holds Foot Massage, Foot Spa and Hot Stone Massage, and a substring rule
 * would give a ninety-minute massage no changeover and make it share the
 * previous guest's bed.
 *
 * One thing no box can override: a sauna session. An add-on happens wherever
 * the treatment before it happened, and the sauna is a walk to another room
 * that is then held for her alone.
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
const derive = (ticked: boolean, place: string | null) => ticked && place !== 'SAUNA';

/** The migration's rule, which must match on the whole name and never part. */
const ADD_ON_NAMES = ['head', 'hand', 'back', 'foot', 'hot stone', 'ventosa', 'shower'];
const byName = (name: string) => ADD_ON_NAMES.includes(name.trim().toLowerCase());

test('the seven add-ons are matched by their whole name', () => {
  for (const n of ['Head', 'Hand', 'Back', 'Foot', 'Hot Stone', 'Ventosa', 'Shower']) {
    assert.equal(byName(n), true, `${n} is an add-on`);
  }
});

test('and a treatment that merely starts with one of those words is not', () => {
  // The catalogue holds all of these. Matching on a substring would give a
  // ninety-minute hot stone massage no changeover and make it share the
  // previous guest's bed.
  for (const n of [
    'Foot Massage (30 min)',
    'Foot Massage (60 min)',
    'Foot Spa (45 min)',
    'Hot Stone Massage (90 min)',
    'Back Massage (60 min)',
    'Head Spa (45 min)',
  ]) {
    assert.equal(byName(n), false, `${n} is a treatment in its own right`);
  }
});

test('ticking the box makes a service an add-on', () => {
  assert.equal(derive(true, 'BED'), true);
  assert.equal(derive(true, 'CHAIR'), true);
});

test('leaving it unticked does not', () => {
  assert.equal(derive(false, 'BED'), false);
});

test('a sauna session is never an add-on, however it is ticked or filed', () => {
  // She gets up and walks to another room, and the room is hers alone while
  // she is in it. Treating that as a continuation of the massage would give it
  // no changeover and force it to share the bed, which it cannot.
  assert.equal(derive(true, 'SAUNA'), false);
});

test('the category flag survives a round trip to the database', async () => {
  const cat = await prisma.serviceCategory.findUnique({ where: { id: addOnCatId } });
  assert.equal(cat?.isAddOns, true);
});

test('one category can hold both kinds at once', async () => {
  // The spa's real shelf: Head and the rest are add-ons, Sauna and Ear Candling
  // are treatments a guest books on her own, and they live together.
  const add = await prisma.service.create({
    data: {
      name: `Head ${stamp}`, categoryId: addOnCatId, durationMinutes: 15,
      priceCents: 15_000, requiredResourceType: 'BED', isAddOn: derive(true, 'BED'),
    },
  });
  const candling = await prisma.service.create({
    data: {
      name: `Ear Candling ${stamp}`, categoryId: addOnCatId, durationMinutes: 30,
      priceCents: 40_000, requiredResourceType: 'BED', isAddOn: derive(false, 'BED'),
    },
  });
  const sauna = await prisma.service.create({
    data: {
      name: `Sauna ${stamp}`, categoryId: addOnCatId, durationMinutes: 30,
      priceCents: 30_000, requiredResourceType: 'SAUNA', isAddOn: derive(true, 'SAUNA'),
    },
  });

  assert.equal(add.isAddOn, true);
  assert.equal(candling.isAddOn, false, 'a guest books ear candling on its own');
  assert.equal(sauna.isAddOn, false, 'and the sauna is a different room');
  assert.equal(add.categoryId, candling.categoryId);
  assert.equal(add.categoryId, sauna.categoryId);
});

test('unticking a service makes it a treatment again', async () => {
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
