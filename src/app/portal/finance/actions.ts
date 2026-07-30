'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { can } from '@/lib/rbac';
import { dateKeyToBusinessDate, manilaDateKey, monthBounds } from '@/lib/datetime';
import { postJournal } from '@/lib/accounting';
import { notify, resolveNotifications } from '@/lib/notifications';
import { formatPeso } from '@/lib/money';

export type FormState = { error?: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const cents = (fd: FormData, k: string) => Math.round(Number(fd.get(k) ?? 0) * 100);

export async function submitExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('finance.submitExpense');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const amountCents = cents(formData, 'amount');
  const description = str(formData, 'description');
  const categoryId = str(formData, 'categoryId');

  if (amountCents <= 0) return { error: 'Enter an amount greater than zero.' };
  if (!description) return { error: 'Describe the expense.' };
  if (!categoryId) return { error: 'Choose a category.' };

  const autoApprove = can(user.role, 'finance.approve');
  const expense = await prisma.expense.create({
    data: {
      branchId,
      categoryId,
      description,
      amountCents,
      expenseDate: dateKeyToBusinessDate(str(formData, 'expenseDate') || manilaDateKey()),
      method: (str(formData, 'method') || 'CASH') as never,
      receiptUrl: str(formData, 'receiptUrl'),
      status: autoApprove ? 'APPROVED' : 'PENDING',
      submittedById: user.id,
      approvedById: autoApprove ? user.id : null,
      approvedAt: autoApprove ? new Date() : null,
      refType: 'manual',
    },
  });

  if (autoApprove) await postExpenseJournal(expense.id, user.name);

  await audit(user, {
    module: 'finance', action: 'submit_expense', entityType: 'Expense', entityId: expense.id,
    summary: `${formatPeso(amountCents)} — ${description}`,
    branchId,
    after: { amountCents, description, status: expense.status },
  });

  if (!autoApprove) {
    await notify({
      kind: 'EXPENSE_APPROVAL',
      title: `Expense to approve — ${formatPeso(amountCents)}`,
      body: `${description} · submitted by ${user.name}`,
      link: '/portal/finance/expenses',
      dedupeKey: `expense-approval:${expense.id}`,
      branchId,
      roles: ['ADMIN', 'OWNER'],
    });
  }

  revalidatePath('/portal/finance/expenses');
  return {
    ok: autoApprove
      ? 'Expense recorded and approved.'
      : 'Expense submitted. It stays pending until the Owner or Manager approves it.',
  };
}

async function postExpenseJournal(expenseId: string, userName: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { category: true, journalEntries: true },
  });
  if (!expense || expense.journalEntries.length > 0) return;

  const creditCode =
    expense.method === 'CASH' ? '1000' : expense.method === 'CORPORATE_CHARGE' ? '2000' : '1010';

  await prisma.$transaction(async (tx) => {
    await postJournal(tx, {
      branchId: expense.branchId,
      source: 'CASH_DISBURSEMENTS',
      entryDate: expense.expenseDate,
      reference: `EXP-${expense.id.slice(-6)}`,
      memo: expense.description,
      expenseId: expense.id,
      createdBy: userName,
      lines: [
        { code: expense.category.accountCode, debit: expense.amountCents },
        { code: creditCode, credit: expense.amountCents },
      ],
    });
  });
}

export async function decideExpenseAction(formData: FormData) {
  const user = await requirePage('finance.approve');
  const id = str(formData, 'id');
  const approve = str(formData, 'decision') === 'approve';

  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense || expense.status !== 'PENDING') return;

  await prisma.expense.update({
    where: { id },
    data: {
      status: approve ? 'APPROVED' : 'REJECTED',
      approvedById: user.id,
      approvedAt: new Date(),
      rejectReason: approve ? '' : str(formData, 'reason'),
    },
  });
  if (approve) await postExpenseJournal(id, user.name);

  await audit(user, {
    module: 'finance', action: approve ? 'approve_expense' : 'reject_expense',
    entityType: 'Expense', entityId: id,
    summary: `${approve ? 'Approved' : 'Rejected'} ${formatPeso(expense.amountCents)} — ${expense.description}`,
    sensitive: true, branchId: expense.branchId,
  });

  await resolveNotifications(`expense-approval:${id}`);
  revalidatePath('/portal/finance/expenses');
}

/** Owner only. Financial records are never deleted — this posts a reversal. */
export async function voidExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('finance.void');
  const id = str(formData, 'id');
  const reason = str(formData, 'reason');
  if (!reason) return { error: 'A reason is required to void a financial record.' };

  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { journalEntries: { include: { lines: { include: { account: true } } } } },
  });
  if (!expense) return { error: 'Expense not found.' };
  if (expense.voided) return { error: 'That expense is already voided.' };

  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id },
      data: { voided: true, voidReason: reason },
    });
    for (const entry of expense.journalEntries) {
      await postJournal(tx, {
        branchId: expense.branchId,
        source: entry.source,
        entryDate: expense.expenseDate,
        reference: `${entry.reference}-VOID`,
        memo: `Void: ${reason}`,
        expenseId: expense.id,
        reversesEntryId: entry.id,
        createdBy: user.name,
        lines: entry.lines.map((l) => ({
          code: l.account.code,
          debit: l.creditCents,
          credit: l.debitCents,
        })),
      });
    }
  });

  await audit(user, {
    module: 'finance', action: 'void_expense', entityType: 'Expense', entityId: id,
    summary: `Voided ${formatPeso(expense.amountCents)} — ${expense.description}. Reason: ${reason}`,
    sensitive: true, branchId: expense.branchId,
    before: { voided: false }, after: { voided: true, reason },
  });

  revalidatePath('/portal/finance/expenses');
  return { ok: 'Voided with a reversing journal entry. Nothing was deleted.' };
}

export async function saveExpenseCategoryAction(formData: FormData) {
  const user = await requirePage('settings.edit');
  const name = str(formData, 'name');
  if (!name) return;
  const category = await prisma.expenseCategory.create({
    data: {
      name,
      accountCode: str(formData, 'accountCode') || '6900',
      capitalized: formData.get('capitalized') === 'on',
    },
  });
  await audit(user, {
    module: 'finance', action: 'create_expense_category', entityType: 'ExpenseCategory',
    entityId: category.id, summary: `Added expense category "${name}"`,
  });
  revalidatePath('/portal/finance/expenses');
}

/* ------------------------------------------------------------ receivables */

export async function generateStatementAction(formData: FormData) {
  const user = await requirePage('finance.view');
  const accountId = str(formData, 'accountId');
  const monthKey = str(formData, 'monthKey') || manilaDateKey().slice(0, 7);
  const { fromKey, toKey } = monthBounds(monthKey);

  const account = await prisma.corporateAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const charges = await prisma.payment.findMany({
    where: {
      method: 'CORPORATE_CHARGE',
      sale: {
        corporateAccountId: accountId,
        status: 'PAID',
        businessDate: {
          gte: dateKeyToBusinessDate(fromKey),
          lte: dateKeyToBusinessDate(toKey),
        },
      },
    },
  });
  const total = charges.reduce((a, p) => a + p.amountCents, 0);
  if (total === 0) return;

  const count = await prisma.corporateStatement.count();
  const statement = await prisma.corporateStatement.create({
    data: {
      accountId,
      number: `SOA-${monthKey.replace('-', '')}-${String(count + 1).padStart(4, '0')}`,
      periodStart: dateKeyToBusinessDate(fromKey),
      periodEnd: dateKeyToBusinessDate(toKey),
      totalCents: total,
      dueDate: new Date(
        dateKeyToBusinessDate(toKey).getTime() + account.paymentTermsDays * 86_400_000,
      ),
    },
  });

  await audit(user, {
    module: 'finance', action: 'generate_statement', entityType: 'CorporateStatement',
    entityId: statement.id,
    summary: `Statement ${statement.number} for ${account.name}: ${formatPeso(total)}`,
    sensitive: true,
  });
  revalidatePath('/portal/finance/receivables');
}

export async function recordCorporatePaymentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('finance.view');
  const accountId = str(formData, 'accountId');
  const amountCents = cents(formData, 'amount');
  if (!accountId || amountCents <= 0) return { error: 'Choose an account and enter an amount.' };

  const account = await prisma.corporateAccount.findUnique({ where: { id: accountId } });
  if (!account) return { error: 'Account not found.' };

  const branch = await prisma.branch.findFirstOrThrow({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const method = (str(formData, 'method') || 'BANK_TRANSFER') as never;

  await prisma.$transaction(async (tx) => {
    await tx.corporatePayment.create({
      data: {
        accountId,
        amountCents,
        method,
        reference: str(formData, 'reference'),
        recordedBy: user.name,
        note: str(formData, 'note'),
      },
    });
    await postJournal(tx, {
      branchId: branch.id,
      source: 'CASH_RECEIPTS',
      entryDate: dateKeyToBusinessDate(manilaDateKey()),
      reference: `AR-${accountId.slice(-6)}-${Date.now().toString(36)}`,
      memo: `Payment received from ${account.name}`,
      createdBy: user.name,
      lines: [
        { code: method === 'CASH' ? '1000' : '1010', debit: amountCents },
        { code: '1100', credit: amountCents },
      ],
    });
  });

  await audit(user, {
    module: 'finance', action: 'corporate_payment', entityType: 'CorporateAccount',
    entityId: accountId,
    summary: `Received ${formatPeso(amountCents)} from ${account.name}`,
    sensitive: true,
  });

  await resolveNotifications(`overdue-corporate:${accountId}`);
  revalidatePath('/portal/finance/receivables');
  return { ok: `Recorded ${formatPeso(amountCents)}.` };
}
