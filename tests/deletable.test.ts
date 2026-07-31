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
});

after(async () => {
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
    ['client', 'employee', 'item', 'resource', 'service', 'serviceCategory'],
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

test('a category nothing is filed under can be deleted', async () => {
  const empty = await prisma.serviceCategory.create({ data: { name: `Empty ${stamp}` } });
  try {
    assert.equal((await checkDeletable('serviceCategory', empty.id))?.deletable, true);
  } finally {
    await prisma.serviceCategory.deleteMany({ where: { id: empty.id } });
  }
});
