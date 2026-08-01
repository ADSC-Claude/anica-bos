/**
 * End-to-end arithmetic tests against a real Postgres database.
 *
 * Everything runs inside an isolated branch created per run, so it can be
 * executed against the seeded demo database without disturbing it.
 *
 *   npm run test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { checkout, voidSale } from '../src/lib/pos';
import { profitAndLoss, salesSummary } from '../src/lib/metrics';
import { buildPayslipDrafts } from '../src/lib/payroll';
import { ensureAccounts } from '../src/lib/accounting';
import { manilaDateKey, dateKeyToBusinessDate, manilaInstant, addDaysToKey } from '../src/lib/datetime';

const prisma = new PrismaClient();
const P = (pesos: number) => Math.round(pesos * 100);
const stamp = Date.now().toString(36);

let branchId: string;
let cashierId: string;
let clientId: string;
let serviceId: string;
let productId: string;
let oilId: string;
let therapistId: string;
const today = manilaDateKey();

before(async () => {
  await ensureAccounts();

  const branch = await prisma.branch.create({
    data: { name: `Test Branch ${stamp}`, code: `T${stamp.slice(-4)}`.toUpperCase() },
  });
  branchId = branch.id;

  await prisma.receiptSeries.create({
    data: { branchId, prefix: `TS${stamp.slice(-3)}`.toUpperCase(), rangeStart: 1, rangeEnd: 9999, next: 1 },
  });

  const cashier = await prisma.user.create({
    data: {
      email: `cashier-${stamp}@test.local`,
      name: 'Test Cashier',
      role: 'RECEPTIONIST',
      passwordHash: 'x',
      branchId,
    },
  });
  cashierId = cashier.id;

  const category =
    (await prisma.serviceCategory.findFirst({ where: { name: 'Massage' } })) ??
    (await prisma.serviceCategory.create({ data: { name: `Cat ${stamp}` } }));

  const service = await prisma.service.create({
    data: {
      name: `Test Swedish ${stamp}`,
      categoryId: category.id,
      durationMinutes: 60,
      priceCents: P(1000),
    },
  });
  serviceId = service.id;

  const unit =
    (await prisma.unit.findFirst({ where: { name: 'ml' } })) ??
    (await prisma.unit.create({ data: { name: `ml-${stamp}` } }));
  const itemCategory =
    (await prisma.itemCategory.findFirst()) ??
    (await prisma.itemCategory.create({ data: { name: `Items ${stamp}` } }));

  const oil = await prisma.item.create({
    data: {
      branchId, name: `Test Oil ${stamp}`, categoryId: itemCategory.id, unitId: unit.id,
      costCents: P(1), stockQty: 1000, reorderLevel: 100,
    },
  });
  oilId = oil.id;
  await prisma.serviceRecipe.create({
    data: { serviceId: service.id, itemId: oil.id, quantity: 30 },
  });

  const product = await prisma.item.create({
    data: {
      branchId, name: `Test Balm ${stamp}`, categoryId: itemCategory.id, unitId: unit.id,
      costCents: P(100), retailPriceCents: P(250), sellable: true, stockQty: 10,
    },
  });
  productId = product.id;

  const therapist = await prisma.employee.create({
    data: {
      branchId, name: `Test Therapist ${stamp}`, employeeRole: 'THERAPIST',
      payType: 'DAILY_ALLOWANCE', payRateCents: P(200),
      sssMonthlyCents: P(600), philhealthMonthlyCents: P(400), pagibigMonthlyCents: P(200),
    },
  });
  therapistId = therapist.id;

  const client = await prisma.client.create({
    data: { branchId, name: `Test Client ${stamp}`, mobile: `0917${stamp.slice(-7)}` },
  });
  clientId = client.id;
});

after(async () => {
  // Remove the isolated branch and everything hanging off it.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "JournalLine" WHERE "entryId" IN (SELECT id FROM "JournalEntry" WHERE "branchId" = $1)`,
    branchId,
  );
  await prisma.journalEntry.deleteMany({ where: { branchId } });
  await prisma.commission.deleteMany({ where: { employeeId: therapistId } });
  await prisma.sale.deleteMany({ where: { branchId } });
  await prisma.stockMovement.deleteMany({ where: { branchId } });
  await prisma.serviceRecipe.deleteMany({ where: { serviceId } });
  await prisma.item.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { id: serviceId } });
  await prisma.attendance.deleteMany({ where: { branchId } });
  // Holidays are global, not branch-scoped, so this is the one row the branch
  // teardown cannot reach. Left behind, it lands inside a later run's payroll
  // window once the Manila date rolls over and the run counts two holidays
  // where the test set one.
  await prisma.holiday.deleteMany({ where: { name: { startsWith: 'Test Holiday ' } } });
  await prisma.employee.deleteMany({ where: { id: therapistId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.expense.deleteMany({ where: { branchId } });
  await prisma.receiptSeries.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { id: cashierId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

/* ---------------------------------------------------------------- checkout */

let saleId: string;
let receiptNo: string;

test('a paid sale updates commission, loyalty, inventory and finance with no re-entry', async () => {
  const result = await checkout({
    branchId,
    cashierId,
    cashierName: 'Test Cashier',
    clientId,
    businessDateKey: today,
    tipCents: P(100),
    // Member 10%, then a promo 15% — stacked, applied in order.
    discounts: [
      { label: 'Member 10%', type: 'PERCENT', value: 10 },
      { label: 'Promo 15%', type: 'PERCENT', value: 15 },
    ],
    lines: [
      { type: 'SERVICE', serviceId, employeeId: therapistId, quantity: 1 },
      { type: 'PRODUCT', itemId: productId, quantity: 2 },
    ],
    payments: [{ method: 'CASH', amountCents: P(2000) }],
  });
  saleId = result.saleId;
  receiptNo = result.receiptNo;

  // subtotal = 1000 service + 500 product = 1500
  // −10% = 150 → 1350 ; −15% of 1350 = 202.50 → 1147.50 ; +100 tip = 1247.50
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { lines: true, discounts: true, payments: true, commissions: true },
  });

  assert.equal(sale.subtotalCents, P(1500));
  assert.equal(sale.discountCents, P(150) + P(202.5));
  assert.equal(sale.totalCents, P(1247.5));
  assert.equal(sale.paidCents, P(2000));
  assert.equal(sale.changeCents, P(752.5));
  assert.match(receiptNo, /^TS[A-Z0-9]{3}-\d{6}$/, 'receipt number is prefixed and zero-padded');

  // Commission: 25% of the UNDISCOUNTED ₱1,000 list price = ₱250.
  assert.equal(sale.commissions.length, 1);
  assert.equal(sale.commissions[0].basisCents, P(1000), 'basis is the list price');
  assert.equal(sale.commissions[0].amountCents, P(250), 'discounts never reduce commission');

  // Loyalty: 1 point per ₱100 of net sales (₱1,147.50 → 11 points).
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  assert.equal(client.loyaltyPoints, 11);

  // Inventory: 30ml oil consumed by the service, 2 balms sold.
  const oil = await prisma.item.findUniqueOrThrow({ where: { id: oilId } });
  const product = await prisma.item.findUniqueOrThrow({ where: { id: productId } });
  assert.equal(oil.stockQty, 970);
  assert.equal(product.stockQty, 8);

  // COGS: 2 balms at ₱100 + 30ml oil at ₱1 = ₱230.
  assert.equal(sale.cogsCents, P(230));
});

test('the sale posts balanced double-entry journals', async () => {
  const entries = await prisma.journalEntry.findMany({
    where: { saleId },
    include: { lines: { include: { account: true } } },
  });
  assert.ok(entries.length >= 2, 'a sales entry and a COGS entry');

  for (const entry of entries) {
    const debits = entry.lines.reduce((a, l) => a + l.debitCents, 0);
    const credits = entry.lines.reduce((a, l) => a + l.creditCents, 0);
    assert.equal(debits, credits, `${entry.reference} must balance`);
  }

  const sales = entries.find((e) => e.source === 'SALES')!;
  const cash = sales.lines.find((l) => l.account.code === '1000')!;
  // Cash debited is what stayed in the drawer, not the note handed over.
  assert.equal(cash.debitCents, P(1247.5));

  const discountLine = sales.lines.find((l) => l.account.code === '4900')!;
  assert.equal(discountLine.debitCents, P(352.5), 'discounts hit the contra-income account');

  const tips = sales.lines.find((l) => l.account.code === '2300')!;
  assert.equal(tips.creditCents, P(100), 'tips are a liability, not revenue');
});

test('the P&L for the month is arithmetically correct', async () => {
  const expenseCategory =
    (await prisma.expenseCategory.findFirst({ where: { capitalized: false } })) ??
    (await prisma.expenseCategory.create({ data: { name: `Misc ${stamp}`, accountCode: '6900' } }));

  await prisma.expense.create({
    data: {
      branchId,
      categoryId: expenseCategory.id,
      description: 'Test rent',
      amountCents: P(500),
      expenseDate: dateKeyToBusinessDate(today),
      status: 'APPROVED',
      submittedById: cashierId,
    },
  });

  const range = { fromKey: today, toKey: today };
  const summary = await salesSummary([branchId], range);
  const pl = await profitAndLoss([branchId], range);

  assert.equal(pl.revenueCents, P(1500), 'gross sales at list price');
  assert.equal(pl.discountCents, P(352.5));
  assert.equal(pl.netRevenueCents, P(1147.5));
  assert.equal(pl.cogsCents, P(230));
  assert.equal(pl.grossProfitCents, P(917.5), 'net revenue − COGS');
  assert.equal(pl.expenseCents, P(500));
  assert.equal(pl.netProfitCents, P(417.5), 'gross profit − expenses');

  // Every line reconciles.
  assert.equal(pl.netRevenueCents, pl.revenueCents - pl.discountCents);
  assert.equal(pl.grossProfitCents, pl.netRevenueCents - pl.cogsCents);
  assert.equal(pl.netProfitCents, pl.grossProfitCents - pl.expenseCents);
  assert.equal(summary.tipsCents, P(100), 'tips are tracked but excluded from profit');
});

/* ----------------------------------------------------------------- payroll */

test('payroll produces a correct payslip including holiday double pay', async () => {
  const dayA = addDaysToKey(today, -3);
  const dayB = addDaysToKey(today, -2); // marked as a regular holiday below
  const dayC = addDaysToKey(today, -1); // arrives late

  await prisma.holiday.upsert({
    where: { date: dateKeyToBusinessDate(dayB) },
    create: { date: dateKeyToBusinessDate(dayB), name: `Test Holiday ${stamp}`, type: 'REGULAR' },
    update: { type: 'REGULAR' },
  });

  for (const [dateKey, late] of [[dayA, false], [dayB, false], [dayC, true]] as [string, boolean][]) {
    await prisma.attendance.create({
      data: {
        branchId,
        employeeId: therapistId,
        workDate: dateKeyToBusinessDate(dateKey),
        timeIn: manilaInstant(dateKey, late ? 780 : 720),
        timeOut: manilaInstant(dateKey, 1440),
        isLate: late,
        lateMinutes: late ? 45 : 0,
        rotationRank: 1,
      },
    });
  }

  await prisma.employeeLoan.create({
    data: {
      employeeId: therapistId,
      type: 'CASH_ADVANCE',
      principalCents: P(1000),
      installmentCents: P(250),
      balanceCents: P(1000),
      startDate: new Date(),
    },
  });

  const drafts = await buildPayslipDrafts({
    branchId,
    fromKey: addDaysToKey(today, -7),
    toKey: today,
    includeOwnerOnlyPay: true,
  });
  const slip = drafts.find((d) => d.employeeId === therapistId);
  assert.ok(slip, 'the therapist has a payslip');

  // Base: 2 ordinary days × ₱200 + 1 regular holiday at 2× = ₱400 + ₱400 = ₱800.
  assert.equal(slip.daysWorked, 3);
  assert.equal(slip.holidayDays, 1);
  assert.equal(slip.basePayCents, P(800), '2 days at ₱200 plus a holiday at double');

  // Commission from the sale above.
  assert.equal(slip.commissionCents, P(250));
  // Tips are shared out; this therapist was the only one on the receipt.
  assert.equal(slip.tipsCents, P(100));

  // Deductions: 1 late × ₱50 + ₱250 loan + half of ₱1,200 monthly contributions.
  const expectedDeductions = P(50) + P(250) + P(300) + P(200) + P(100);
  assert.equal(slip.deductionsCents, expectedDeductions);

  // Net = base + commission + tips − deductions.
  assert.equal(
    slip.netPayCents,
    slip.basePayCents + slip.commissionCents + slip.tipsCents - slip.deductionsCents,
  );
  assert.equal(slip.netPayCents, P(800) + P(250) + P(100) - expectedDeductions);

  // The breakdown is itemised on the payslip.
  const kinds = slip.lines.map((l) => l.kind);
  for (const kind of ['base', 'holiday', 'commission', 'tips', 'late', 'loan', 'contribution']) {
    assert.ok(kinds.includes(kind), `payslip is missing the "${kind}" line`);
  }
});

/* -------------------------------------------------------------------- void */

test('voiding reverses stock, loyalty and journals while keeping the receipt number', async () => {
  const approver = await prisma.user.findFirstOrThrow({ where: { id: cashierId } });

  await voidSale({
    saleId,
    reason: 'Test void',
    userId: cashierId,
    userName: 'Test Cashier',
    approverId: approver.id,
  });

  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { commissions: true },
  });
  assert.equal(sale.status, 'VOIDED');
  assert.equal(sale.receiptNo, receiptNo, 'the receipt number is retained, never reused');
  assert.equal(sale.voidReason, 'Test void');
  assert.equal(sale.commissions.length, 0, 'unpaid commissions are reversed');

  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  assert.equal(client.loyaltyPoints, 0, 'loyalty points are clawed back');

  const oil = await prisma.item.findUniqueOrThrow({ where: { id: oilId } });
  const product = await prisma.item.findUniqueOrThrow({ where: { id: productId } });
  assert.equal(oil.stockQty, 1000, 'consumables are returned');
  assert.equal(product.stockQty, 10, 'retail stock is returned');

  // The original entries stay; reversing entries are posted alongside them.
  const entries = await prisma.journalEntry.findMany({
    where: { saleId },
    include: { lines: true },
  });
  assert.ok(entries.some((e) => e.reference.endsWith('-VOID')), 'reversal was posted');
  const net = entries.reduce(
    (a, e) => a + e.lines.reduce((x, l) => x + l.debitCents - l.creditCents, 0),
    0,
  );
  assert.equal(net, 0, 'the sale nets to zero after the reversal');

  // The voided sale drops out of the P&L.
  const pl = await profitAndLoss([branchId], { fromKey: today, toKey: today });
  assert.equal(pl.netRevenueCents, 0);
  assert.equal(pl.netProfitCents, -P(500), 'only the expense remains');
});

test('the next receipt number continues after a voided one — no gaps, no reuse', async () => {
  const result = await checkout({
    branchId,
    cashierId,
    businessDateKey: today,
    lines: [{ type: 'SERVICE', serviceId, employeeId: therapistId, quantity: 1 }],
    payments: [{ method: 'GCASH', amountCents: P(1000), reference: 'TESTREF' }],
  });

  const previous = Number(receiptNo.split('-')[1]);
  const next = Number(result.receiptNo.split('-')[1]);
  assert.equal(next, previous + 1, 'sequence continues past the voided receipt');
  assert.notEqual(result.receiptNo, receiptNo, 'a voided number is never reissued');
});

test('checkout refuses to under-collect', async () => {
  await assert.rejects(
    () =>
      checkout({
        branchId,
        cashierId,
        businessDateKey: today,
        lines: [{ type: 'SERVICE', serviceId, employeeId: therapistId, quantity: 1 }],
        payments: [{ method: 'CASH', amountCents: P(500) }],
      }),
    /short by/i,
    'a sale cannot be completed without full payment',
  );
});

test('only cash may be overpaid, since change comes from the drawer', async () => {
  await assert.rejects(
    () =>
      checkout({
        branchId,
        cashierId,
        businessDateKey: today,
        lines: [{ type: 'SERVICE', serviceId, employeeId: therapistId, quantity: 1 }],
        payments: [{ method: 'GCASH', amountCents: P(1500) }],
      }),
    /Only cash may be overpaid/i,
  );
});
