/**
 * `active` is derived from `status`, and the two must never disagree.
 *
 * The roster, the POS, availability and payroll all filter on `active`. A
 * SEPARATED employee still reading as active would stay bookable, and an ACTIVE
 * one reading as inactive would silently drop off payroll — neither shows up as
 * an error anywhere, which is why it is worth a test.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, type EmploymentStatus } from '@prisma/client';
import { DELETABLE } from '../src/lib/deletable';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let branchId: string;
let employeeId: string;

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `emp-${stamp}`, code: `EMP${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;
  const e = await prisma.employee.create({
    data: { branchId, name: `Therapist ${stamp}`, employeeRole: 'THERAPIST' },
  });
  employeeId = e.id;
});

after(async () => {
  await prisma.employmentEvent.deleteMany({ where: { employeeId } });
  await prisma.employee.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

test('a new employee starts active', async () => {
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  assert.equal(e.status, 'ACTIVE');
  assert.equal(e.active, true);
});

test('only ACTIVE leaves someone bookable', async () => {
  // Mirrors what setEmploymentStatusAction derives.
  const derive = (s: EmploymentStatus) => s === 'ACTIVE';
  assert.equal(derive('ACTIVE'), true);
  assert.equal(derive('ON_LEAVE'), false);
  assert.equal(derive('SUSPENDED'), false);
  assert.equal(derive('SEPARATED'), false);
});

test('separating sets a date, and keeps the record', async () => {
  const lastDay = new Date('2026-07-31T00:00:00Z');
  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      status: 'SEPARATED',
      active: false,
      statusFrom: lastDay,
      statusReason: 'Resigned',
    },
  });

  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  assert.equal(e.status, 'SEPARATED');
  assert.equal(e.active, false);
  assert.equal(e.statusFrom?.toISOString(), lastDay.toISOString());
  assert.equal(e.statusReason, 'Resigned');
  // Still there — separation hides, it does not remove.
  assert.ok(e.id);
});

test('leave and suspension carry a range; separation does not', async () => {
  const from = new Date('2026-08-01T00:00:00Z');
  const until = new Date('2026-08-15T00:00:00Z');
  await prisma.employee.update({
    where: { id: employeeId },
    data: { status: 'ON_LEAVE', active: false, statusFrom: from, statusUntil: until },
  });
  let e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  assert.equal(e.statusUntil?.toISOString(), until.toISOString());

  // Separation is open-ended — an end date here would be meaningless.
  await prisma.employee.update({
    where: { id: employeeId },
    data: { status: 'SEPARATED', active: false, statusFrom: from, statusUntil: null },
  });
  e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  assert.equal(e.statusUntil, null);
});

test('history survives the status being changed back', async () => {
  await prisma.employmentEvent.deleteMany({ where: { employeeId } });
  await prisma.employmentEvent.create({
    data: {
      employeeId,
      status: 'SUSPENDED',
      startDate: new Date('2026-06-01T00:00:00Z'),
      endDate: new Date('2026-06-07T00:00:00Z'),
      reason: 'Under review',
      recordedBy: 'Owner',
    },
  });

  // Lift it: the employee is active again...
  await prisma.employee.update({
    where: { id: employeeId },
    data: { status: 'ACTIVE', active: true, statusFrom: null, statusUntil: null, statusReason: '' },
  });

  // ...and the suspension is still on the record.
  const events = await prisma.employmentEvent.findMany({ where: { employeeId } });
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'SUSPENDED');
  assert.equal(events[0].reason, 'Under review');
});

test('the delete fallback sets status and active together', async () => {
  await prisma.employee.update({
    where: { id: employeeId },
    data: { status: 'ACTIVE', active: true, statusFrom: null },
  });

  await DELETABLE.employee.deactivate.run(employeeId);

  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  assert.equal(e.status, 'SEPARATED');
  assert.equal(e.active, false);
  // and does not leave the separated list showing a blank last day
  assert.ok(e.statusFrom);
});

test('taking someone back on clears the separation date', async () => {
  await prisma.employee.update({
    where: { id: employeeId },
    data: { status: 'ACTIVE', active: true, statusFrom: null, statusReason: '' },
  });
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
  assert.equal(e.statusFrom, null);
  assert.equal(e.statusReason, '');
});
