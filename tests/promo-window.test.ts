/**
 * When a promo is on the website.
 *
 * Three dates doing three jobs — when it can be claimed, when it stops, and
 * when the website may mention it — and the one that decides what a stranger
 * sees is the third. These drive the real query rather than a copy of it, so
 * the rule cannot drift from the page.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { landingPromoWhere, isUpcoming } from '../src/lib/promos';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const NOW = new Date('2027-09-15T04:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Named so the fixtures can be cleaned up without touching real rows. */
const tag = (s: string) => `promo-window-${stamp}-${s}`;

before(async () => {
  await prisma.promo.createMany({
    data: [
      // Running now, no announce date: the ordinary case.
      {
        name: tag('live'), type: 'PERCENT', value: 10,
        startDate: day('2027-09-01'), endDate: day('2027-09-30'),
        active: true, showOnLanding: true,
      },
      // Starts in October, announced from mid-September.
      {
        name: tag('announced'), type: 'PERCENT', value: 15,
        startDate: day('2027-10-01'), endDate: day('2027-10-31'),
        showFromDate: day('2027-09-14'),
        active: true, showOnLanding: true,
      },
      // Starts in October, announced from the day it starts.
      {
        name: tag('not-yet'), type: 'PERCENT', value: 15,
        startDate: day('2027-10-01'), endDate: day('2027-10-31'),
        active: true, showOnLanding: true,
      },
      // Finished in August.
      {
        name: tag('over'), type: 'PERCENT', value: 20,
        startDate: day('2027-08-01'), endDate: day('2027-08-31'),
        active: true, showOnLanding: true,
      },
      // Running, but switched off — what the spa reaches for when a sample
      // promo is embarrassing them on the website.
      {
        name: tag('switched-off'), type: 'PERCENT', value: 10,
        startDate: day('2027-09-01'), endDate: day('2027-09-30'),
        active: false, showOnLanding: false,
      },
      // Running, but deliberately kept off the public page.
      {
        name: tag('till-only'), type: 'PERCENT', value: 10,
        startDate: day('2027-09-01'), endDate: day('2027-09-30'),
        active: true, showOnLanding: false,
      },
    ],
  });
});

after(async () => {
  await prisma.promo.deleteMany({ where: { name: { startsWith: `promo-window-${stamp}-` } } });
  await prisma.$disconnect();
});

const shown = async () => {
  const rows = await prisma.promo.findMany({
    where: { AND: [landingPromoWhere(NOW), { name: { startsWith: `promo-window-${stamp}-` } }] },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => r.name.replace(`promo-window-${stamp}-`, ''));
};

test('a promo running today is shown', async () => {
  assert.ok((await shown()).includes('live'));
});

test('a promo announced early is shown before it starts', async () => {
  assert.ok(
    (await shown()).includes('announced'),
    'the whole point of the announce date is that the website mentions it first',
  );
});

test('without an announce date it waits for its start date', async () => {
  assert.ok(!(await shown()).includes('not-yet'));
});

test('an expired promo drops off by itself', async () => {
  // Nobody should have to go and tidy it away — which is what the spa was
  // doing by hand before.
  assert.ok(!(await shown()).includes('over'));
});

test('switching a promo off takes it off the page', async () => {
  assert.ok(!(await shown()).includes('switched-off'));
});

test('a promo kept off the landing page stays off it', async () => {
  assert.ok(!(await shown()).includes('till-only'));
});

test('an announced promo is labelled as upcoming, a running one is not', () => {
  assert.equal(isUpcoming({ startDate: day('2027-10-01') }, NOW), true);
  assert.equal(isUpcoming({ startDate: day('2027-09-01') }, NOW), false);
  // The boundary belongs to the guest: on the morning it starts, it is live.
  assert.equal(isUpcoming({ startDate: NOW }, NOW), false);
});
