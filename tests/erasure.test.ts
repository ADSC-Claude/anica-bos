/**
 * Erasing a client, against a real database.
 *
 * Two claims, and the second is the one that matters. The first is that the
 * personal information genuinely goes — an erasure that leaves the health
 * answers behind is a lie told to someone who trusted the spa. The second is
 * that the books do not move: same receipt, same total, same PWD ID on the
 * discount that was claimed against it. A privacy feature that quietly puts a
 * hole in a gapless receipt series has traded one legal problem for a worse one.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { eraseClientPersonalData } from '../src/lib/erasure';
import type { SessionUser } from '../src/lib/auth';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let clientId: string;
let secondClientId: string;
let ownerId: string;
let saleId: string;
let appointmentId: string;
let definitionId: string;
let feedbackId: string;

const owner = (): SessionUser => ({
  id: ownerId,
  email: `owner-${stamp}@x.test`,
  name: `Owner ${stamp}`,
  role: 'OWNER',
  branchId,
  mustChangePassword: false,
});

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `era-${stamp}`, code: `ERA${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  const user = await prisma.user.create({
    data: {
      email: `owner-${stamp}@x.test`,
      name: `Owner ${stamp}`,
      passwordHash: 'not-a-real-hash',
      role: 'OWNER',
      branchId,
    },
  });
  ownerId = user.id;

  const client = await prisma.client.create({
    data: {
      branchId,
      name: `Maria ${stamp}`,
      mobile: `09${String(Date.now()).slice(-9)}`,
      email: `maria-${stamp}@x.test`,
      birthday: new Date('1990-04-11'),
      addressCity: 'Quezon City',
      addressLine: '12 Mabini St',
      barangay: 'Bagumbayan',
      notes: 'Prefers the quiet room',
      tags: ['regular'],
      pwdIdNumber: 'PWD-12345',
      seniorIdNumber: '',
      loyaltyPoints: 40,
      consentGiven: true,
      consentAt: new Date(),
      waiverGiven: true,
      waiverAt: new Date(),
      medicalUpdatedAt: new Date(),
    },
  });
  clientId = client.id;

  // A second client at the same branch, erased later, to prove two erasures do
  // not collide on the branch+mobile uniqueness.
  const other = await prisma.client.create({
    data: {
      branchId,
      name: `Other ${stamp}`,
      mobile: `08${String(Date.now()).slice(-9)}`,
    },
  });
  secondClientId = other.id;

  const definition = await prisma.clientFieldDefinition.create({
    data: {
      key: `allergies-${stamp}`,
      label: 'Allergies',
      section: 'MEDICAL',
      type: 'TEXT',
    },
  });
  definitionId = definition.id;
  await prisma.clientFieldValue.create({
    data: { clientId, definitionId, value: 'Penicillin' },
  });

  await prisma.clientFollowUp.create({
    data: { clientId, channel: 'call', note: 'Called about her recovery' },
  });

  const feedback = await prisma.clientFeedback.create({
    data: { clientId, rating: 5, comment: 'Loved the massage', showOnLanding: true },
  });
  feedbackId = feedback.id;

  await prisma.emailLog.create({
    data: { to: `maria-${stamp}@x.test`, subject: 'Your booking', clientId },
  });

  await prisma.shiftNote.create({
    data: {
      branchId,
      noteDate: new Date(),
      body: 'Maria mentioned her back is sore',
      clientId,
      authorId: ownerId,
    },
  });

  const appt = await prisma.appointment.create({
    data: {
      branchId,
      clientId,
      reference: `ERA-${stamp}`,
      startAt: new Date(),
      endAt: new Date(Date.now() + 3_600_000),
      notes: 'Wants the corner bed',
      guestName: 'Her sister Ana',
      depositStatus: 'PAID',
      depositReference: 'GC-987654',
      depositProofUrl: 'data:image/png;base64,AAAA',
    },
  });
  appointmentId = appt.id;

  const series = await prisma.receiptSeries.create({
    data: { branchId, prefix: `E${stamp}`.slice(0, 6) },
  });
  const sale = await prisma.sale.create({
    data: {
      branchId,
      seriesId: series.id,
      receiptNo: `E-${stamp}-1`,
      sequence: 1,
      cashierId: ownerId,
      clientId,
      businessDate: new Date(),
      totalCents: 150000,
    },
  });
  saleId = sale.id;
  await prisma.saleDiscount.create({
    data: {
      saleId: sale.id,
      label: 'PWD',
      type: 'PERCENT',
      value: 20,
      amountCents: 30000,
      idNumber: 'PWD-12345',
    },
  });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { branchId } });
  await prisma.saleDiscount.deleteMany({ where: { saleId } });
  await prisma.sale.deleteMany({ where: { branchId } });
  await prisma.receiptSeries.deleteMany({ where: { branchId } });
  await prisma.shiftNote.deleteMany({ where: { branchId } });
  await prisma.emailLog.deleteMany({ where: { clientId } });
  await prisma.clientFeedback.deleteMany({ where: { clientId } });
  await prisma.clientFollowUp.deleteMany({ where: { clientId } });
  await prisma.clientFieldValue.deleteMany({ where: { definitionId } });
  await prisma.clientFieldDefinition.deleteMany({ where: { id: definitionId } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

test('the erasure reports what it took out', async () => {
  const result = await eraseClientPersonalData(owner(), clientId);
  assert.equal(result.fieldValues, 1);
  assert.equal(result.followUps, 1);
  assert.equal(result.feedback, 1);
  assert.equal(result.emailLogs, 1);
  assert.equal(result.shiftNotes, 1);
  assert.equal(result.proofImagesRemoved, 1);
  assert.equal(result.appointmentsScrubbed, 1);
});

test('every health answer is gone', async () => {
  const values = await prisma.clientFieldValue.findMany({ where: { clientId } });
  assert.equal(values.length, 0);
});

test('who she is has been taken out of the client row', async () => {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  assert.equal(c.name, 'Erased client');
  assert.equal(c.email, '');
  assert.equal(c.birthday, null);
  assert.equal(c.addressCity, '');
  assert.equal(c.addressLine, '');
  assert.equal(c.barangay, '');
  assert.equal(c.notes, '');
  assert.deepEqual(c.tags, []);
  assert.equal(c.pwdIdNumber, '');
  assert.equal(c.loyaltyPoints, 0);
  assert.ok(!c.mobile.startsWith('09'), 'the real mobile must not survive');
  assert.ok(c.erasedAt instanceof Date);
});

test('consent does not outlive the data it covered', async () => {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  assert.equal(c.consentGiven, false);
  assert.equal(c.consentAt, null);
  assert.equal(c.waiverGiven, false);
  assert.equal(c.waiverAt, null);
  assert.equal(c.medicalUpdatedAt, null);
});

test('the notes staff wrote about her go too', async () => {
  assert.equal((await prisma.clientFollowUp.findMany({ where: { clientId } })).length, 0);
  assert.equal((await prisma.shiftNote.findMany({ where: { clientId } })).length, 0);
  assert.equal((await prisma.emailLog.findMany({ where: { clientId } })).length, 0);
});

test('her feedback keeps its rating and loses her words', async () => {
  const f = await prisma.clientFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
  assert.equal(f.rating, 5, 'therapist averages must not shift');
  assert.equal(f.comment, '');
  assert.equal(f.showOnLanding, false, 'a published quote is the least anonymous thing here');
});

test('the receipt is untouched', async () => {
  const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
  assert.equal(sale.receiptNo, `E-${stamp}-1`);
  assert.equal(sale.totalCents, 150000);
  assert.equal(sale.clientId, clientId, 'the sale still points at the shell');
});

test('the PWD ID stays on the discount that was claimed against it', async () => {
  const discounts = await prisma.saleDiscount.findMany({ where: { saleId } });
  assert.equal(discounts.length, 1);
  assert.equal(discounts[0].idNumber, 'PWD-12345', 'BIR wants the evidence for the discount');
});

test('the appointment survives; its free text and deposit photo do not', async () => {
  const a = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  assert.equal(a.notes, '');
  assert.equal(a.guestName, '');
  assert.equal(a.depositProofUrl, '', 'a bank screenshot shows an account name and a balance');
  assert.equal(a.depositReference, 'GC-987654', 'the payment must still be traceable');
  assert.equal(a.depositStatus, 'PAID');
});

test('the erasure is audited without naming her', async () => {
  const entry = await prisma.auditLog.findFirst({
    where: { action: 'erase_personal_data', entityId: clientId },
  });
  assert.ok(entry, 'an erasure the spa cannot evidence is not accountable');
  assert.equal(entry.sensitive, true);
  assert.ok(
    !entry.summary.includes('Maria'),
    'naming her would write her back into an append-only table',
  );
});

test('erasing twice is refused rather than silently repeated', async () => {
  await assert.rejects(
    () => eraseClientPersonalData(owner(), clientId),
    /already been erased/,
  );
});

test('two erased clients at one branch do not collide', async () => {
  await eraseClientPersonalData(owner(), secondClientId);
  const both = await prisma.client.findMany({
    where: { branchId, erasedAt: { not: null } },
    select: { mobile: true },
  });
  assert.equal(both.length, 2);
  assert.equal(new Set(both.map((c) => c.mobile)).size, 2, 'the placeholder must stay unique');
});
