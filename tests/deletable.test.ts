/**
 * The guards on deletion, against a real database.
 *
 * The claim being tested is not "delete works" — it is that a record the books
 * depend on is refused, and that the refusal names what is in the way. A silent
 * foreign-key error would technically also prevent the delete, and would be
 * useless to the person holding the tablet.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { checkDeletable, DELETABLE } from '../src/lib/deletable';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let categoryId: string;
let unusedServiceId: string;
let usedServiceId: string;
let unusedClientId: string;
let usedClientId: string;
let freshUserId: string;
let cashierUserId: string;
let ownerUserId: string;

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `del-${stamp}`, code: `DEL${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  const cat = await prisma.serviceCategory.create({ data: { name: `Cat ${stamp}` } });
  categoryId = cat.id;

  const mk = (n: string) =>
    prisma.service.create({
      data: { name: n, categoryId, durationMinutes: 60, priceCents: 50000 },
    });
  unusedServiceId = (await mk(`Unused ${stamp}`)).id;
  usedServiceId = (await mk(`Used ${stamp}`)).id;

  const client = (n: string, mobile: string) =>
    prisma.client.create({
      data: { branchId, name: n, mobile, email: `${mobile}@x.test`, addressCity: 'QC' },
    });
  // 11 digits, and the distinguishing digit is last — slicing a suffix off the
  // end is exactly how these collided the first time.
  const digits = String(Date.now()).slice(-8);
  unusedClientId = (await client(`Unused ${stamp}`, `09${digits}1`)).id;
  usedClientId = (await client(`Used ${stamp}`, `09${digits}2`)).id;

  // Give the "used" pair history: one appointment referencing both.
  const appt = await prisma.appointment.create({
    data: {
      branchId,
      reference: `DEL-${stamp}`,
      clientId: usedClientId,
      startAt: new Date(),
      endAt: new Date(Date.now() + 3_600_000),
    },
  });
  await prisma.appointmentService.create({
    data: {
      appointmentId: appt.id,
      serviceId: usedServiceId,
      priceCents: 50000,
      durationMinutes: 60,
    },
  });

  const mkUser = (slug: string, role: 'OWNER' | 'RECEPTIONIST') =>
    prisma.user.create({
      data: {
        email: `${slug}-${stamp}@x.test`,
        name: `${slug} ${stamp}`,
        passwordHash: 'not-a-real-hash',
        role,
        branchId,
      },
    });
  freshUserId = (await mkUser('fresh', 'RECEPTIONIST')).id;
  cashierUserId = (await mkUser('cashier', 'RECEPTIONIST')).id;
  ownerUserId = (await mkUser('owner', 'OWNER')).id;

  // One sale, so the cashier is standing in the BIR paper trail.
  const series = await prisma.receiptSeries.create({
    data: { branchId, prefix: `T${stamp}`.slice(0, 6) },
  });
  await prisma.sale.create({
    data: {
      branchId,
      seriesId: series.id,
      receiptNo: `T-${stamp}-1`,
      sequence: 1,
      cashierId: cashierUserId,
      businessDate: new Date(),
    },
  });
});

after(async () => {
  await prisma.sale.deleteMany({ where: { branchId } });
  await prisma.receiptSeries.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { branchId } });
  await prisma.appointmentService.deleteMany({ where: { serviceId: usedServiceId } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { categoryId } });
  await prisma.serviceCategory.deleteMany({ where: { id: categoryId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

test('a service nothing points at can be deleted', async () => {
  const check = await checkDeletable('service', unusedServiceId);
  assert.equal(check?.deletable, true);
});

test('a service on an appointment is refused, and says so', async () => {
  const check = await checkDeletable('service', usedServiceId);
  assert.equal(check?.deletable, false);
  assert.ok(check && !check.deletable && check.blockedBy.length > 0);
  if (check && !check.deletable) {
    assert.match(check.blockedBy.join(', '), /appointment/);
    // and offers the way out, rather than leaving the user stuck
    assert.match(String(check.deactivate), /Deactivate/);
  }
});

test('a client with no history can be deleted', async () => {
  const check = await checkDeletable('client', unusedClientId);
  assert.equal(check?.deletable, true);
});

test('a client with an appointment is refused', async () => {
  const check = await checkDeletable('client', usedClientId);
  assert.equal(check?.deletable, false);
  if (check && !check.deletable) assert.match(check.blockedBy.join(', '), /appointment/);
});

test('a record that no longer exists reports as missing, not as deletable', async () => {
  assert.equal(await checkDeletable('service', 'does-not-exist'), null);
});

test('the registry covers only records that are safe to remove', () => {
  // Guard against a future edit quietly adding a financial record here: sales,
  // receipts, journals and payslips are void-only and must stay unreachable
  // from the delete action.
  assert.deepEqual(
    Object.keys(DELETABLE).sort(),
    ['client', 'employee', 'item', 'resource', 'service', 'serviceCategory', 'user'],
  );
});

test('a category with services in it is refused, and offers to hide instead', async () => {
  const check = await checkDeletable('serviceCategory', categoryId);
  assert.equal(check?.deletable, false);
  if (check && !check.deletable) {
    assert.match(check.blockedBy.join(', '), /service/);
    assert.match(String(check.deactivate), /Hide it instead/);
  }
});

test('a user account nothing points at can be deleted', async () => {
  assert.equal((await checkDeletable('user', freshUserId))?.deletable, true);
});

test('a user account that has rung up a sale is refused, and offers to disable', async () => {
  const check = await checkDeletable('user', cashierUserId);
  assert.equal(check?.deletable, false);
  if (check && !check.deletable) {
    assert.match(check.blockedBy.join(', '), /sale/);
    assert.match(String(check.deactivate), /Disable it instead/);
  }
});

test('you cannot lock yourself out of the account you are signed in with', async () => {
  assert.match(String(await DELETABLE.user.guard(freshUserId, freshUserId)), /yourself/);
});

test('an Owner can be removed while another Owner is still active', async () => {
  // Brought into being here rather than assumed: on a freshly pushed database
  // there is no seeded Owner, and a test that passes only against seed data is
  // testing the fixture.
  const spare = await prisma.user.create({
    data: {
      email: `spare-owner-${stamp}@x.test`,
      name: `Spare Owner ${stamp}`,
      passwordHash: 'not-a-real-hash',
      role: 'OWNER',
      branchId,
    },
  });
  try {
    assert.equal(await DELETABLE.user.guard(ownerUserId, freshUserId), null);
  } finally {
    await prisma.user.delete({ where: { id: spare.id } });
  }
});

test('the only remaining active Owner is refused', async () => {
  // Stand every other Owner down for the length of the assertion, so the
  // seeded Owner cannot mask the condition being tested, then put them back.
  const others = await prisma.user.findMany({
    where: { role: 'OWNER', active: true, id: { not: ownerUserId } },
    select: { id: true },
  });
  const ids = others.map((o) => o.id);
  await prisma.user.updateMany({ where: { id: { in: ids } }, data: { active: false } });
  try {
    assert.match(
      String(await DELETABLE.user.guard(ownerUserId, freshUserId)),
      /only active Owner/,
    );
  } finally {
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { active: true } });
  }
});

test('disabling an account stops sign-in and ends any session already open', async () => {
  const u = await prisma.user.create({
    data: {
      email: `off-${stamp}@x.test`,
      name: `Off ${stamp}`,
      passwordHash: 'not-a-real-hash',
      role: 'RECEPTIONIST',
      branchId,
    },
  });
  await DELETABLE.user.deactivate.run(u.id);
  const row = await prisma.user.findUnique({ where: { id: u.id } });
  assert.equal(row?.active, false, 'the account can no longer sign in');
  // Without this the signed cookie keeps working for the rest of its 12 hours.
  assert.ok(row?.sessionsRevoked, 'any open session is ended immediately');
});

test('a category nothing is filed under can be deleted', async () => {
  const empty = await prisma.serviceCategory.create({ data: { name: `Empty ${stamp}` } });
  try {
    assert.equal((await checkDeletable('serviceCategory', empty.id))?.deletable, true);
  } finally {
    await prisma.serviceCategory.deleteMany({ where: { id: empty.id } });
  }
});
