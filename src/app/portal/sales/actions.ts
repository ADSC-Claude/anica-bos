'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { verifyApprovalPin } from '@/lib/auth';
import { checkout, voidSale, CheckoutError, type CheckoutInput } from '@/lib/pos';
import { getSettings } from '@/lib/settings';
import { businessDate, dateKeyToBusinessDate, manilaDateKey } from '@/lib/datetime';
import { notify, resolveNotifications } from '@/lib/notifications';
import { postJournal } from '@/lib/accounting';
import { formatPeso } from '@/lib/money';
import { can } from '@/lib/rbac';

export type CheckoutState = {
  error?: string;
  receiptNo?: string;
  saleId?: string;
  giftCertificateCodes?: string[];
};

/** The POS posts a JSON basket; the server re-prices everything from the DB. */
export async function checkoutAction(payload: string): Promise<CheckoutState> {
  const user = await requirePage('pos.use');
  let body: (Omit<CheckoutInput, 'branchId' | 'cashierId'> & {
    branchId?: string;
    approvalPin?: string;
    manualDiscountPercent?: number;
  });
  try {
    body = JSON.parse(payload);
  } catch {
    return { error: 'Could not read the basket. Please try again.' };
  }

  const branchId = await resolveBranchId(user, body.branchId);
  const settings = await getSettings(branchId);

  // Discounts above the configured threshold need Owner/Admin approval.
  const threshold = settings['pos.discountApprovalPercent'];
  const lineTotal = (body.lines ?? []).reduce(
    (a, l) => a + (l.unitPriceCents ?? 0) * (l.quantity ?? 1),
    0,
  );
  const manualDiscounts = (body.discounts ?? []).filter((d) => !d.presetId && !d.voucherCode);
  const manualPercent = manualDiscounts.reduce(
    (a, d) => a + (d.type === 'PERCENT' ? d.value : lineTotal ? (d.value / lineTotal) * 100 : 100),
    0,
  );

  let approverId: string | null = null;
  if (manualDiscounts.length && manualPercent > threshold) {
    const approver = await verifyApprovalPin(body.approvalPin ?? '');
    if (!approver) {
      return {
        error: `A discount above ${threshold}% needs the Owner's approval PIN.`,
      };
    }
    approverId = approver.id;
    await audit(user, {
      module: 'sales',
      action: 'discount_approved',
      entityType: 'Sale',
      summary: `${approver.name} approved a ${Math.round(manualPercent)}% manual discount`,
      sensitive: true,
      branchId,
    });
  }

  try {
    const result = await checkout({
      ...body,
      branchId,
      cashierId: user.id,
      cashierName: user.name,
      discounts: (body.discounts ?? []).map((d) => ({
        ...d,
        approvedByUserId: d.presetId ? null : approverId,
      })),
    });

    await audit(user, {
      module: 'sales',
      action: 'checkout',
      entityType: 'Sale',
      entityId: result.saleId,
      summary: `Issued ${result.receiptNo} for ${formatPeso(result.totalCents)}`,
      branchId,
      after: { receiptNo: result.receiptNo, totalCents: result.totalCents },
    });

    if (body.appointmentId) await resolveNotifications(`appointment:${body.appointmentId}`);

    // Any item that fell below its reorder level during this sale.
    const low = await prisma.item.findMany({
      where: { branchId, archived: false, reorderLevel: { gt: 0 } },
    });
    for (const item of low.filter((i) => i.stockQty <= i.reorderLevel)) {
      await notify({
        kind: 'LOW_STOCK',
        title: `Low stock — ${item.name}`,
        body: `${item.stockQty} left (reorder at ${item.reorderLevel})`,
        link: `/portal/inventory/items/${item.id}`,
        dedupeKey: `low-stock:${item.id}`,
        branchId,
        roles: ['RECEPTIONIST', 'ADMIN', 'OWNER'],
      });
    }

    revalidatePath('/portal/sales');
    return {
      receiptNo: result.receiptNo,
      saleId: result.saleId,
      giftCertificateCodes: result.giftCertificateCodes,
    };
  } catch (err) {
    if (err instanceof CheckoutError) return { error: err.message };
    console.error('[checkout]', err);
    return { error: 'The sale could not be completed. Nothing was charged.' };
  }
}

export type SimpleState = { error?: string; ok?: string };

export async function voidSaleAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const user = await requirePage('pos.void');
  const saleId = String(formData.get('saleId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const pin = String(formData.get('pin') ?? '');

  if (!reason) return { error: 'Enter the reason for voiding this sale.' };
  const approver = await verifyApprovalPin(pin);
  if (!approver) return { error: 'That approval PIN was not recognised.' };

  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) return { error: 'Sale not found.' };

  try {
    await voidSale({
      saleId,
      reason,
      userId: user.id,
      userName: user.name,
      approverId: approver.id,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }

  await audit(user, {
    module: 'sales',
    action: 'void',
    entityType: 'Sale',
    entityId: saleId,
    summary: `Voided ${sale.receiptNo} (${formatPeso(sale.totalCents)}) — approved by ${approver.name}. Reason: ${reason}`,
    sensitive: true,
    branchId: sale.branchId,
    before: { status: 'PAID', totalCents: sale.totalCents },
    after: { status: 'VOIDED', reason, approvedBy: approver.name },
  });

  revalidatePath('/portal/sales');
  revalidatePath(`/portal/sales/${saleId}`);
  return { ok: `${sale.receiptNo} voided. The receipt number is retained and never reused.` };
}

/* ------------------------------------------------------------- petty cash */

export async function pettyCashAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const user = await requirePage('pettycash.log');
  const branchId = await resolveBranchId(user, String(formData.get('branchId') ?? ''));
  const direction = String(formData.get('direction') ?? 'OUT') as 'IN' | 'OUT';
  const amountCents = Math.round(Number(formData.get('amount') ?? 0) * 100);
  const description = String(formData.get('description') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '') || null;

  if (amountCents <= 0) return { error: 'Enter an amount greater than zero.' };
  if (!description) return { error: 'Describe what the cash was for.' };

  // Only the Owner/Manager may top the fund up.
  if (direction === 'IN' && !can(user.role, 'pettycash.manage')) {
    return { error: 'Only the Owner or Manager can add money to the petty cash fund.' };
  }

  const last = await prisma.pettyCashTxn.findFirst({
    where: { branchId },
    orderBy: { createdAt: 'desc' },
  });
  const balance = last?.balanceAfterCents ?? 0;
  if (direction === 'OUT' && amountCents > balance) {
    return { error: `Only ${formatPeso(balance)} is left in the petty cash box.` };
  }
  const newBalance = direction === 'IN' ? balance + amountCents : balance - amountCents;

  await prisma.$transaction(async (tx) => {
    let expenseId: string | null = null;

    // Cash-outs become real expenses so they land in Finance and the P&L.
    if (direction === 'OUT') {
      const category =
        (categoryId ? await tx.expenseCategory.findUnique({ where: { id: categoryId } }) : null) ??
        (await tx.expenseCategory.findFirst({ where: { name: 'Miscellaneous' } })) ??
        (await tx.expenseCategory.create({ data: { name: 'Miscellaneous', accountCode: '6900' } }));

      const expense = await tx.expense.create({
        data: {
          branchId,
          categoryId: category.id,
          description: `Petty cash — ${description}`,
          amountCents,
          expenseDate: businessDate(),
          method: 'CASH',
          receiptUrl: String(formData.get('receiptUrl') ?? ''),
          status: can(user.role, 'finance.approve') ? 'APPROVED' : 'PENDING',
          approvedById: can(user.role, 'finance.approve') ? user.id : null,
          approvedAt: can(user.role, 'finance.approve') ? new Date() : null,
          submittedById: user.id,
          refType: 'petty_cash',
        },
      });
      expenseId = expense.id;

      if (expense.status === 'APPROVED') {
        await postJournal(tx, {
          branchId,
          source: 'CASH_DISBURSEMENTS',
          entryDate: expense.expenseDate,
          reference: `PC-${expense.id.slice(-6)}`,
          memo: expense.description,
          expenseId: expense.id,
          createdBy: user.name,
          lines: [
            { code: category.accountCode, debit: amountCents },
            { code: '1020', credit: amountCents },
          ],
        });
      }
    } else {
      await postJournal(tx, {
        branchId,
        source: 'GENERAL',
        entryDate: businessDate(),
        reference: `PC-IN-${Date.now().toString(36)}`,
        memo: `Petty cash replenishment — ${description}`,
        createdBy: user.name,
        lines: [
          { code: '1020', debit: amountCents },
          { code: '1000', credit: amountCents },
        ],
      });
    }

    await tx.pettyCashTxn.create({
      data: {
        branchId,
        direction,
        amountCents,
        categoryId,
        description,
        receiptUrl: String(formData.get('receiptUrl') ?? ''),
        balanceAfterCents: newBalance,
        businessDate: businessDate(),
        recordedById: user.id,
        recordedByName: user.name,
        expenseId,
      },
    });
  });

  await audit(user, {
    module: 'sales',
    action: `petty_cash_${direction.toLowerCase()}`,
    entityType: 'PettyCashTxn',
    summary: `${direction === 'IN' ? 'Added' : 'Paid out'} ${formatPeso(amountCents)} — ${description}`,
    branchId,
  });

  // Prompt for a replenishment when the box runs low.
  const minimum = (await getSettings(branchId))['pos.pettyCashMinimumCents'];
  if (newBalance <= minimum) {
    await notify({
      kind: 'PETTY_CASH_REQUEST',
      title: 'Petty cash is running low',
      body: `${formatPeso(newBalance)} left (minimum ${formatPeso(minimum)})`,
      link: '/portal/sales/petty-cash',
      dedupeKey: `petty-cash-low:${branchId}`,
      branchId,
      roles: ['ADMIN', 'OWNER'],
    });
  } else {
    await resolveNotifications(`petty-cash-low:${branchId}`);
  }

  revalidatePath('/portal/sales/petty-cash');
  return { ok: `Recorded. Balance is now ${formatPeso(newBalance)}.` };
}

export async function requestReplenishmentAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const user = await requirePage('pettycash.log');
  const branchId = await resolveBranchId(user, String(formData.get('branchId') ?? ''));
  const amountCents = Math.round(Number(formData.get('amount') ?? 0) * 100);
  if (amountCents <= 0) return { error: 'Enter the amount you need.' };

  const request = await prisma.pettyCashRequest.create({
    data: {
      branchId,
      amountCents,
      reason: String(formData.get('reason') ?? ''),
      requestedById: user.id,
      requestedByName: user.name,
    },
  });

  await notify({
    kind: 'PETTY_CASH_REQUEST',
    title: `Replenishment requested — ${formatPeso(amountCents)}`,
    body: `From ${user.name}`,
    link: '/portal/sales/petty-cash',
    dedupeKey: `petty-cash-request:${request.id}`,
    branchId,
    roles: ['ADMIN', 'OWNER'],
  });

  revalidatePath('/portal/sales/petty-cash');
  return { ok: 'Request sent to the Owner and Manager.' };
}

export async function decideReplenishmentAction(formData: FormData) {
  const user = await requirePage('pettycash.manage');
  const id = String(formData.get('id') ?? '');
  const approve = String(formData.get('decision') ?? '') === 'approve';

  const request = await prisma.pettyCashRequest.update({
    where: { id },
    data: {
      status: approve ? 'APPROVED' : 'REJECTED',
      decidedById: user.id,
      decidedAt: new Date(),
    },
  });

  await audit(user, {
    module: 'sales',
    action: approve ? 'approve_replenishment' : 'reject_replenishment',
    entityType: 'PettyCashRequest',
    entityId: id,
    summary: `${approve ? 'Approved' : 'Rejected'} ${formatPeso(request.amountCents)} replenishment`,
    sensitive: true,
    branchId: request.branchId,
  });

  await resolveNotifications(`petty-cash-request:${id}`);
  revalidatePath('/portal/sales/petty-cash');
}

/* -------------------------------------------------------------------- EOD */

export async function closeDayAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const user = await requirePage('eod.close');
  const branchId = await resolveBranchId(user, String(formData.get('branchId') ?? ''));
  const dateKey = String(formData.get('dateKey') ?? manilaDateKey());
  const bizDate = dateKeyToBusinessDate(dateKey);

  const existing = await prisma.eodClosing.findUnique({
    where: { branchId_businessDate: { branchId, businessDate: bizDate } },
  });
  if (existing) return { error: 'That day is already closed.' };

  const sales = await prisma.sale.findMany({
    where: { branchId, businessDate: bizDate, status: 'PAID' },
    include: { payments: true },
  });

  const expected: Record<string, number> = {};
  for (const sale of sales) {
    for (const p of sale.payments) {
      const amount = p.method === 'CASH' ? p.amountCents - sale.changeCents : p.amountCents;
      expected[p.method] = (expected[p.method] ?? 0) + amount;
    }
  }

  const counted: Record<string, number> = {};
  for (const method of ['CASH', 'GCASH', 'BANK_TRANSFER'] as PaymentMethod[]) {
    counted[method] = Math.round(Number(formData.get(`counted_${method}`) ?? 0) * 100);
  }

  const lastPetty = await prisma.pettyCashTxn.findFirst({
    where: { branchId },
    orderBy: { createdAt: 'desc' },
  });
  const pettyExpected = lastPetty?.balanceAfterCents ?? 0;
  const pettyCounted = Math.round(Number(formData.get('counted_PETTY') ?? 0) * 100);

  const expectedCash = expected.CASH ?? 0;
  const overShort = counted.CASH - expectedCash + (pettyCounted - pettyExpected);

  const closing = await prisma.eodClosing.create({
    data: {
      branchId,
      businessDate: bizDate,
      expected,
      counted,
      expectedCashCents: expectedCash,
      countedCashCents: counted.CASH,
      overShortCents: overShort,
      pettyCashExpectedCents: pettyExpected,
      pettyCashCountedCents: pettyCounted,
      salesCount: sales.length,
      grossSalesCents: sales.reduce((a, s) => a + s.totalCents, 0),
      notes: String(formData.get('notes') ?? ''),
      closedById: user.id,
    },
  });

  await audit(user, {
    module: 'sales',
    action: 'eod_close',
    entityType: 'EodClosing',
    entityId: closing.id,
    summary: `Closed ${dateKey}: ${sales.length} receipts, cash ${overShort === 0 ? 'balanced' : overShort > 0 ? `over by ${formatPeso(overShort)}` : `short by ${formatPeso(-overShort)}`}`,
    sensitive: true,
    branchId,
    after: { expected, counted, overShort },
  });

  revalidatePath('/portal/sales/eod');
  redirect(`/portal/sales/eod?date=${dateKey}`);
}

/** Owner/Manager only — reopening a locked day is audit-logged. */
export async function reopenDayAction(formData: FormData) {
  const user = await requirePage('finance.void');
  const id = String(formData.get('id') ?? '');
  const closing = await prisma.eodClosing.findUnique({ where: { id } });
  if (!closing) return;

  await prisma.eodClosing.delete({ where: { id } });
  await audit(user, {
    module: 'sales',
    action: 'eod_reopen',
    entityType: 'EodClosing',
    entityId: id,
    summary: `Reopened the closed day ${closing.businessDate.toISOString().slice(0, 10)}`,
    sensitive: true,
    branchId: closing.branchId,
    before: { closedAt: closing.closedAt, overShortCents: closing.overShortCents },
  });
  revalidatePath('/portal/sales/eod');
}
