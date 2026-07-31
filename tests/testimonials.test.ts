/**
 * What reaches the public page, and what does not.
 *
 * Feedback is recorded by a receptionist at the counter. Publishing it under a
 * guest's name on a website anyone can read is a different act, so the gate is
 * an explicit tick rather than a high rating — and the surname never travels
 * with it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { shortName, publishableFeedback } from '../src/lib/testimonials';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let branchId: string;

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `tst-${stamp}`, code: `TST${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  const mk = async (name: string, digits: string) =>
    (await prisma.client.create({
      data: { branchId, name, mobile: `09${digits}`, email: `${digits}@x.test`, addressCity: 'QC' },
    })).id;

  const base = String(Date.now()).slice(-8);
  const released = await mk(`Maria Santos ${stamp}`, `${base}1`);
  const quiet = await mk(`Juan Cruz ${stamp}`, `${base}2`);
  const wordless = await mk(`Ana Reyes ${stamp}`, `${base}3`);

  await prisma.clientFeedback.createMany({
    data: [
      { clientId: released, rating: 5, comment: 'Wonderful, thank you.', showOnLanding: true },
      // Five stars, glowing words, never released — the common case, and the
      // one a rating-based filter would have published without asking.
      { clientId: quiet, rating: 5, comment: 'Best massage in QC.', showOnLanding: false },
      // Released, but nothing to read: a bare rating is not a testimonial.
      { clientId: wordless, rating: 5, comment: '', showOnLanding: true },
    ],
  });
});

after(async () => {
  await prisma.clientFeedback.deleteMany({ where: { client: { branchId } } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

test('a surname never reaches the page', () => {
  assert.equal(shortName('Maria Santos'), 'Maria S.');
  assert.equal(shortName('Maria Clara Santos'), 'Maria S.');
});

test('a single name is left alone rather than mangled', () => {
  assert.equal(shortName('Madonna'), 'Madonna');
});

test('an empty name degrades to something printable', () => {
  assert.equal(shortName('   '), 'A guest');
});

test('only feedback that was released is published', async () => {
  const rows = await publishableFeedback(prisma, 10);
  const mine = rows.filter((r) => r.client.name.includes(stamp));
  assert.equal(mine.length, 1, 'exactly one of the three qualifies');
  assert.match(mine[0].comment, /Wonderful/);
});

test('a glowing 5-star comment stays private until it is ticked', async () => {
  const rows = await publishableFeedback(prisma, 10);
  const leaked = rows.find((r) => r.comment === 'Best massage in QC.');
  assert.equal(leaked, undefined, 'a high rating is not consent');
});

test('a released rating with no words is not shown as a quote', async () => {
  const rows = await publishableFeedback(prisma, 10);
  assert.ok(rows.every((r) => r.comment.trim().length > 0));
});
