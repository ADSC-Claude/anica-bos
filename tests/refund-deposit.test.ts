/**
 * Refunding a reservation fee, against a real database.
 *
 * The claim under test is not "a refund works" — it is that the ways to lose
 * money are closed: refunding twice, refunding a fee that was never paid, and
 * marking a booking refunded when the gateway refused.
 *
 * PAYMONGO_SECRET_KEY is unset here, so the gateway runs in simulated mode and
 * nothing leaves the building.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { refundDeposit } from '../src/lib/booking';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let clientId: string;

const makeBooking = async (over: Record<string, unknown> = {}) => {
  const start = new Date(Date.now() + 48 * 3600_000);
  return prisma.appointment.create({
    data: {
      branchId,
      clientId,
      reference: `ANC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      startAt: start,
      endAt: new Date(start.getTime() + 3600_000),
      status: 'CANCELLED',
      depositStatus: 'PAID',
      depositAmountCents: 45000,
      depositPaidCents: 45000,
      ...over,
    },
  });
};

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `ref-${stamp}`, code: `REF${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;
  const client = await prisma.client.create({
    data: {
      branchId, name: `Refund ${stamp}`, mobile: `09${String(Date.now()).slice(-9)}`,
      email: `${stamp}@x.test`, addressCity: 'QC',
    },
  });
  clientId = client.id;
});

after(async () => {
  await prisma.notification.deleteMany({ where: { branchId } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

test('a paid fee on a cancelled booking is refunded and marked so', async () => {
  const appt = await makeBooking({ gatewayPaymentId: 'pay_test_abc' });
  const result = await refundDeposit({
    appointmentId: appt.id, reason: 'cancelled in time', refundedBy: 'Test Owner',
  });

  assert.equal(result.ok, true);
  assert.equal(result.amountCents, 45000);
  const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
  assert.equal(after.depositStatus, 'REFUNDED');
});

test('the same fee cannot be refunded twice', async () => {
  const appt = await makeBooking({ gatewayPaymentId: 'pay_test_abc' });
  const first = await refundDeposit({ appointmentId: appt.id, reason: '', refundedBy: 'x' });
  assert.equal(first.ok, true);

  const second = await refundDeposit({ appointmentId: appt.id, reason: '', refundedBy: 'x' });
  assert.equal(second.ok, false, 'the second attempt is refused, not repeated');
  assert.match(String(second.error), /already been refunded/i);
});

test('a forfeited fee is not refundable — the late cancellation kept it', async () => {
  const appt = await makeBooking({ depositStatus: 'FORFEITED' });
  const result = await refundDeposit({ appointmentId: appt.id, reason: '', refundedBy: 'x' });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /no paid reservation fee/i);
});

test('a booking that never paid has nothing to send back', async () => {
  const appt = await makeBooking({ depositStatus: 'AWAITING_PAYMENT', depositPaidCents: 0 });
  const result = await refundDeposit({ appointmentId: appt.id, reason: '', refundedBy: 'x' });
  assert.equal(result.ok, false);
});

test('a fee paid by hand is flagged for manual sending, not silently dropped', async () => {
  // No gateway ids: the guest sent it over GCash and the desk verified a
  // screenshot, so there is no PayMongo payment to reverse.
  const appt = await makeBooking({ depositMethod: 'manual transfer' });
  const result = await refundDeposit({ appointmentId: appt.id, reason: '', refundedBy: 'x' });

  assert.equal(result.ok, true);
  assert.equal(result.manual, true, 'the desk is told to send this one itself');
  assert.equal(result.gatewayRefundId, undefined);
  const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
  assert.equal(after.depositStatus, 'REFUNDED');
});

test('a booking that no longer exists is refused rather than throwing', async () => {
  const result = await refundDeposit({
    appointmentId: 'does-not-exist', reason: '', refundedBy: 'x',
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /no longer exists/i);
});
