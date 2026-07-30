import type { JournalSource, PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from './db';

/**
 * A deliberately small chart of accounts. Every sale and expense posts a
 * balanced double-entry JournalEntry, which is what makes the BIR-format
 * journals (sales, cash receipts, cash disbursements, general) real reports
 * rather than reformatted transaction lists.
 */
export const ACCOUNTS = [
  { code: '1000', name: 'Cash on Hand', type: 'ASSET' },
  { code: '1010', name: 'Cash in Bank / E-Wallet', type: 'ASSET' },
  { code: '1020', name: 'Petty Cash Fund', type: 'ASSET' },
  { code: '1100', name: 'Accounts Receivable — Corporate', type: 'ASSET' },
  { code: '1200', name: 'Inventory — Supplies & Retail', type: 'ASSET' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '2100', name: 'Unearned Revenue — Reservation Deposits', type: 'LIABILITY' },
  { code: '2110', name: 'Gift Certificate Liability', type: 'LIABILITY' },
  { code: '2120', name: 'Unearned Revenue — Prepaid Packages', type: 'LIABILITY' },
  { code: '2200', name: 'Output VAT Payable', type: 'LIABILITY' },
  { code: '2300', name: 'Tips Payable', type: 'LIABILITY' },
  { code: '3000', name: "Owner's Equity", type: 'EQUITY' },
  { code: '4000', name: 'Service Revenue', type: 'INCOME' },
  { code: '4100', name: 'Retail Product Sales', type: 'INCOME' },
  { code: '4200', name: 'Package & Membership Revenue', type: 'INCOME' },
  { code: '4900', name: 'Sales Discounts (contra)', type: 'INCOME' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
  { code: '6000', name: 'Salaries & Wages', type: 'EXPENSE' },
  { code: '6010', name: 'Therapist Commissions', type: 'EXPENSE' },
  { code: '6100', name: 'Rent', type: 'EXPENSE' },
  { code: '6110', name: 'Utilities', type: 'EXPENSE' },
  { code: '6120', name: 'Supplies', type: 'EXPENSE' },
  { code: '6130', name: 'Marketing', type: 'EXPENSE' },
  { code: '6900', name: 'Miscellaneous Expense', type: 'EXPENSE' },
] as const;

export const PAYMENT_ACCOUNT: Record<PaymentMethod, string> = {
  CASH: '1000',
  GCASH: '1010',
  BANK_TRANSFER: '1010',
  CORPORATE_CHARGE: '1100',
  GIFT_CERTIFICATE: '2110',
  DEPOSIT_CREDIT: '2100',
  LOYALTY_POINTS: '4900',
};

export type PostLine = { code: string; debit?: number; credit?: number; memo?: string };

/** Posts a balanced entry. Throws when debits and credits disagree. */
export async function postJournal(
  tx: Prisma.TransactionClient,
  input: {
    branchId: string;
    source: JournalSource;
    entryDate: Date;
    reference: string;
    memo?: string;
    saleId?: string | null;
    expenseId?: string | null;
    createdBy?: string;
    lines: PostLine[];
  },
) {
  const lines = input.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
  const debits = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credits = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (debits !== credits) {
    throw new Error(
      `Unbalanced journal entry for ${input.reference}: debits ${debits} ≠ credits ${credits}`,
    );
  }
  if (lines.length === 0) return null;

  const accounts = await tx.account.findMany({
    where: { code: { in: [...new Set(lines.map((l) => l.code))] } },
    select: { id: true, code: true },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  const missing = lines.filter((l) => !byCode.has(l.code));
  if (missing.length) {
    throw new Error(`Unknown account code(s): ${missing.map((m) => m.code).join(', ')}`);
  }

  return tx.journalEntry.create({
    data: {
      branchId: input.branchId,
      source: input.source,
      entryDate: input.entryDate,
      reference: input.reference,
      memo: input.memo ?? '',
      saleId: input.saleId ?? null,
      expenseId: input.expenseId ?? null,
      createdBy: input.createdBy ?? '',
      lines: {
        create: lines.map((l) => ({
          accountId: byCode.get(l.code)!,
          debitCents: l.debit ?? 0,
          creditCents: l.credit ?? 0,
          memo: l.memo ?? '',
        })),
      },
    },
  });
}

/** Ensures the chart of accounts exists (idempotent; used by seed and setup). */
export async function ensureAccounts() {
  for (const a of ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: a.code },
      create: { code: a.code, name: a.name, type: a.type },
      update: { name: a.name, type: a.type },
    });
  }
}
