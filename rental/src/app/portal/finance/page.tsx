import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage, assertProperty, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPeso, formatPesoShort, toCents } from '@/lib/money';
import { formatStayDate, manilaMonthKey, monthBounds, formatMonthKey, addMonthsToKey, toStayDate, toDateKey } from '@/lib/datetime';
import { cashReceived, outstandingBalances, profitAndLoss } from '@/lib/finance';
import { guestName } from '@/lib/guests';
import { storeFile } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { Card, Empty, Notice, PageHeader, Stat, Bar } from '@/components/ui';

export const metadata = { title: 'Finance' };
export const dynamic = 'force-dynamic';

function back(month: string, message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/finance?month=${month}&${kind}=${encodeURIComponent(message)}`);
}

async function expenseAction(formData: FormData) {
  'use server';
  const user = await requirePage('finance.submitExpense');
  const month = String(formData.get('month') || manilaMonthKey());

  const propertyId = String(formData.get('propertyId') || '') || null;
  if (propertyId) await assertProperty(user, propertyId);

  const amountCents = toCents(String(formData.get('amount') || '0'));
  if (amountCents <= 0) back(month, 'An expense needs an amount.', 'error');

  const categoryId = String(formData.get('categoryId') ?? '');
  if (!categoryId) back(month, 'Choose a category.', 'error');

  const branchId = propertyId
    ? (await prisma.property.findUnique({ where: { id: propertyId }, select: { branchId: true } }))?.branchId ?? null
    : null;

  const expense = await prisma.expense.create({
    data: {
      propertyId,
      branchId,
      categoryId,
      date: toStayDate(String(formData.get('date') || toDateKey(new Date()))),
      amountCents,
      description: String(formData.get('description') ?? ''),
      method: String(formData.get('method') || 'CASH'),
      createdById: user.id,
    },
  });

  // The receipt is optional, but the moment to attach it is now, standing in
  // the shop — not later, from memory. Stored after the row exists so the
  // object path is the expense's own id; a rejected file costs the receipt,
  // never the expense.
  const receipt = formData.get('receipt');
  if (receipt instanceof File && receipt.size > 0) {
    try {
      const stored = await storeFile({ file: receipt, entityType: 'expense', entityId: expense.id });
      await prisma.expense.update({ where: { id: expense.id }, data: { receiptUrl: stored.url } });
    } catch {
      back(month, 'Expense saved, but the receipt could not be read — attach it again.', 'error');
    }
  }

  await audit(user, {
    module: 'finance',
    action: 'expense.create',
    entityType: 'Expense',
    entityId: expense.id,
    propertyId,
    summary: `Expense ${formatPeso(amountCents)} recorded`,
    after: { amountCents, categoryId, propertyId },
  });
  back(month, 'Expense recorded.');
}

async function deleteExpenseAction(formData: FormData) {
  'use server';
  const user = await requirePage('finance.edit');
  const id = String(formData.get('expenseId'));
  const month = String(formData.get('month') || manilaMonthKey());

  const before = await prisma.expense.findUnique({
    where: { id },
    select: { amountCents: true, propertyId: true, description: true, ticketId: true },
  });
  if (!before) back(month, 'That expense no longer exists.', 'error');
  if (before.propertyId) await assertProperty(user, before.propertyId);
  if (before.ticketId) {
    back(month, 'That expense came from a maintenance ticket — reopen the ticket instead.', 'error');
  }

  await prisma.expense.delete({ where: { id } });
  await audit(user, {
    module: 'finance',
    action: 'expense.delete',
    entityType: 'Expense',
    entityId: id,
    propertyId: before.propertyId,
    summary: `Expense ${formatPeso(before.amountCents)} deleted`,
    before,
  });
  back(month, 'Expense deleted.');
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePage('finance.view');
  const sp = await searchParams;
  const month = sp.month ?? manilaMonthKey();
  const { fromKey, toKey } = monthBounds(month);
  const propertyIds = await visibleProperties(user);
  const mayEnter = can(user.role, 'finance.submitExpense');
  const mayDelete = can(user.role, 'finance.edit');

  const [pl, cash, outstanding, categories, properties, expenses] = await Promise.all([
    profitAndLoss({ fromKey, toKey, propertyIds }),
    cashReceived(fromKey, toKey, propertyIds),
    outstandingBalances(propertyIds),
    prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.property.findMany({
      where: propertyIds ? { id: { in: propertyIds } } : {},
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.expense.findMany({
      where: {
        date: { gte: toStayDate(fromKey), lte: toStayDate(toKey) },
        ...(propertyIds ? { OR: [{ propertyId: { in: propertyIds } }, { propertyId: null }] } : {}),
      },
      include: {
        category: { select: { name: true } },
        property: { select: { name: true } },
        vendor: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 200,
    }),
  ]);

  const biggestCategory = pl.expensesByCategory[0]?.amountCents ?? 0;

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle={
          <>
            {formatMonthKey(month)} · revenue is what was <em>earned</em> in the month, not what
            was received in it
          </>
        }
        actions={
          <>
            <Link className="btn btn-secondary" href={`/portal/finance?month=${addMonthsToKey(month, -1)}`}>
              ← {formatMonthKey(addMonthsToKey(month, -1))}
            </Link>
            <Link className="btn btn-secondary" href={`/portal/finance?month=${addMonthsToKey(month, 1)}`}>
              {formatMonthKey(addMonthsToKey(month, 1))} →
            </Link>
            {can(user.role, 'finance.export') && (
              <Link
                className="btn btn-secondary"
                href={`/api/reports/pl.csv?from=${fromKey}&to=${toKey}`}
              >
                Export CSV
              </Link>
            )}
          </>
        }
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Revenue" value={formatPesoShort(pl.totals.revenueCents)} formula="Nights slept in the month, at the rate agreed" />
        <Stat label="Expenses" value={formatPesoShort(pl.totals.expenseCents)} />
        <Stat
          label="Net profit"
          value={formatPesoShort(pl.totals.netCents)}
          tone={pl.totals.netCents < 0 ? 'bad' : undefined}
          formula="Revenue − Expenses"
        />
        <Stat
          label="Margin"
          value={`${pl.totals.marginPercent.toFixed(1)}%`}
          formula="Net ÷ Revenue × 100"
        />
        <Stat
          label="Cash received"
          value={formatPesoShort(cash.totalCents)}
          hint={`${cash.payments.length} payments`}
          formula="Payments that cleared in the month, whenever the stay is"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Profit and loss by property">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                    <th className="py-2">Property</th>
                    <th className="py-2 text-right">Accommodation</th>
                    <th className="py-2 text-right">Cleaning</th>
                    <th className="py-2 text-right">Add-ons</th>
                    <th className="py-2 text-right">Revenue</th>
                    <th className="py-2 text-right">Expenses</th>
                    <th className="py-2 text-right">Net</th>
                    <th className="py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                  {pl.rows.map((r) => (
                    <tr key={r.propertyId ?? 'none'}>
                      <td className="py-2 font-medium">{r.propertyName}</td>
                      <td className="py-2 text-right tabular-nums">{formatPesoShort(r.accommodationCents)}</td>
                      <td className="py-2 text-right tabular-nums">{formatPesoShort(r.cleaningFeeCents)}</td>
                      <td className="py-2 text-right tabular-nums">{formatPesoShort(r.addOnsCents)}</td>
                      <td className="py-2 text-right tabular-nums">{formatPesoShort(r.revenueCents)}</td>
                      <td className="py-2 text-right tabular-nums">{formatPesoShort(r.expenseCents)}</td>
                      <td
                        className={`py-2 text-right font-semibold tabular-nums ${r.netCents < 0 ? 'text-[color:var(--bad)]' : ''}`}
                      >
                        {formatPesoShort(r.netCents)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.marginPercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {pl.unallocatedExpenseCents > 0 && (
                    <tr className="text-[color:var(--color-ink-500)]">
                      <td className="py-2 italic">Business-wide (no property)</td>
                      <td className="py-2" colSpan={4} />
                      <td className="py-2 text-right tabular-nums">
                        {formatPesoShort(pl.unallocatedExpenseCents)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        −{formatPesoShort(pl.unallocatedExpenseCents)}
                      </td>
                      <td className="py-2" />
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[color:var(--color-sand-300)] font-bold">
                    <td className="py-2">Consolidated</td>
                    <td className="py-2" colSpan={3} />
                    <td className="py-2 text-right tabular-nums">{formatPeso(pl.totals.revenueCents)}</td>
                    <td className="py-2 text-right tabular-nums">{formatPeso(pl.totals.expenseCents)}</td>
                    <td
                      className={`py-2 text-right tabular-nums ${pl.totals.netCents < 0 ? 'text-[color:var(--bad)]' : ''}`}
                    >
                      {formatPeso(pl.totals.netCents)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {pl.totals.marginPercent.toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
              An expense with no property lands in the consolidated total and on no single
              property&rsquo;s statement, so the two can never disagree.
            </p>
          </Card>

          <Card title={`Expenses in ${formatMonthKey(month)}`}>
            {expenses.length === 0 ? (
              <Empty>Nothing recorded this month.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                      <th className="py-2">Date</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Property</th>
                      <th className="py-2">Description</th>
                      <th className="py-2 text-right">Amount</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 text-xs">{formatStayDate(e.date)}</td>
                        <td className="py-2">{e.category.name}</td>
                        <td className="py-2 text-xs">
                          {e.property?.name ?? (
                            <span className="italic text-[color:var(--color-ink-500)]">
                              business-wide
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          {e.description}
                          {e.receiptUrl && (
                            <a
                              className="ml-2 text-xs underline"
                              href={e.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              receipt
                            </a>
                          )}
                          {e.ticketId && (
                            <span className="ml-2 text-xs text-[color:var(--color-ink-500)]">
                              from a ticket
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatPeso(e.amountCents)}</td>
                        <td className="py-2 text-right">
                          {mayDelete && !e.ticketId && (
                            <form action={deleteExpenseAction}>
                              <input type="hidden" name="expenseId" value={e.id} />
                              <input type="hidden" name="month" value={month} />
                              <button
                                className="text-xs text-[color:var(--bad)] hover:underline"
                                type="submit"
                              >
                                Delete
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {mayEnter && (
            <Card title="Record an expense">
              <form action={expenseAction} className="space-y-3">
                <input type="hidden" name="month" value={month} />
                <label className="block">
                  <span className="label">Date</span>
                  <input
                    className="field"
                    name="date"
                    type="date"
                    defaultValue={toDateKey(new Date())}
                  />
                </label>
                <label className="block">
                  <span className="label">Category *</span>
                  <select className="field" name="categoryId" required defaultValue="">
                    <option value="" disabled>
                      Choose…
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Property</span>
                  <select className="field" name="propertyId" defaultValue="">
                    <option value="">Business-wide</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Amount *</span>
                  <input className="field" name="amount" type="number" step="0.01" min="0" required />
                </label>
                <label className="block">
                  <span className="label">Description</span>
                  <input className="field" name="description" />
                </label>
                <label className="block">
                  <span className="label">Paid by</span>
                  <select className="field" name="method" defaultValue="CASH">
                    <option value="CASH">Cash</option>
                    <option value="GCASH">GCash</option>
                    <option value="BANK">Bank transfer</option>
                    <option value="CARD">Card</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Receipt photo</span>
                  <input
                    className="field"
                    name="receipt"
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                  />
                </label>
                <button className="btn btn-primary" type="submit">
                  Record
                </button>
              </form>
            </Card>
          )}

          <Card title="Where the money went">
            {pl.expensesByCategory.length === 0 ? (
              <Empty>No expenses this month.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {pl.expensesByCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between">
                      <span>{c.category}</span>
                      <span className="tabular-nums">{formatPesoShort(c.amountCents)}</span>
                    </div>
                    <Bar value={c.amountCents} target={biggestCategory} tone="warn" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Owed to us">
            {outstanding.length === 0 ? (
              <Empty>Every confirmed stay is paid up.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {outstanding.slice(0, 12).map((o) => (
                  <li key={o.id} className="flex justify-between">
                    <Link href={`/portal/reservations/${o.id}`} className="hover:underline">
                      <span className="font-mono text-xs">{o.reference}</span>
                      <span className="ml-2 text-xs text-[color:var(--color-ink-500)]">
                        {guestName(o.guest)}
                      </span>
                    </Link>
                    <span className="tabular-nums font-semibold text-[color:var(--bad)]">
                      {formatPesoShort(o.balanceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
