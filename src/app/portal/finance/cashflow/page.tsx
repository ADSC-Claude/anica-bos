import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatPeso } from '@/lib/money';
import {
  addMonthsToKey, dateKeyToBusinessDate, formatDateKey, formatMonthKey,
  manilaMonthKey, monthBounds, dateKeyRange,
} from '@/lib/datetime';
import { PageHeader, StatCard } from '@/components/ui';
import { FinanceTabs } from '@/components/finance-tabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cash flow' };

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branchId?: string }>;
}) {
  const user = await requirePage('finance.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const monthKey = params.month ?? manilaMonthKey();
  const { fromKey, toKey } = monthBounds(monthKey);
  const from = dateKeyToBusinessDate(fromKey);
  const to = dateKeyToBusinessDate(toKey);

  const [payments, expenses, petty] = await Promise.all([
    prisma.payment.findMany({
      where: {
        sale: { branchId, status: 'PAID', businessDate: { gte: from, lte: to } },
      },
      include: { sale: { select: { businessDate: true, changeCents: true } } },
    }),
    prisma.expense.findMany({
      where: {
        branchId,
        status: 'APPROVED',
        voided: false,
        expenseDate: { gte: from, lte: to },
      },
      include: { category: true },
    }),
    prisma.pettyCashTxn.findMany({
      where: { branchId, businessDate: { gte: from, lte: to } },
    }),
  ]);

  const days = dateKeyRange(fromKey, toKey);
  const byDay = new Map<string, { in: number; out: number }>();
  for (const d of days) byDay.set(d, { in: 0, out: 0 });

  const inByMethod = new Map<string, number>();
  for (const p of payments) {
    const key = p.sale.businessDate.toISOString().slice(0, 10);
    // Non-cash "payments" (deposit credit, GC) are not fresh cash this month.
    const isCashLike = ['CASH', 'GCASH', 'BANK_TRANSFER'].includes(p.method);
    const amount = p.method === 'CASH' ? p.amountCents - p.sale.changeCents : p.amountCents;
    if (isCashLike) {
      const row = byDay.get(key);
      if (row) row.in += amount;
      inByMethod.set(p.method, (inByMethod.get(p.method) ?? 0) + amount);
    }
  }

  const outByCategory = new Map<string, number>();
  for (const e of expenses) {
    const key = e.expenseDate.toISOString().slice(0, 10);
    const row = byDay.get(key);
    if (row) row.out += e.amountCents;
    outByCategory.set(e.category.name, (outByCategory.get(e.category.name) ?? 0) + e.amountCents);
  }

  const totalIn = [...inByMethod.values()].reduce((a, b) => a + b, 0);
  const totalOut = [...outByCategory.values()].reduce((a, b) => a + b, 0);
  const pettyBalance = petty.length ? petty[petty.length - 1].balanceAfterCents : 0;

  return (
    <div>
      <PageHeader
        title="Cash flow"
        subtitle={formatMonthKey(monthKey)}
        actions={
          <form className="flex gap-2" action="/portal/finance/cashflow">
            <input type="month" name="month" defaultValue={monthKey} className="input w-auto" />
            <button className="btn-secondary btn-sm" type="submit">Go</button>
          </form>
        }
      />
      <FinanceTabs role={user.role} current="/portal/finance/cashflow" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash in" value={formatPeso(totalIn)} tone="good" />
        <StatCard label="Cash out" value={formatPeso(totalOut)} tone="bad" />
        <StatCard
          label="Net movement"
          value={formatPeso(totalIn - totalOut)}
          tone={totalIn - totalOut >= 0 ? 'good' : 'bad'}
        />
        <StatCard label="Petty cash on hand" value={formatPeso(pettyBalance)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-pad">
          <h2 className="section-title mb-3">In, by payment method</h2>
          <ul className="space-y-1 text-sm">
            {[...inByMethod.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([method, amount]) => (
                <li key={method} className="flex justify-between gap-3">
                  <span className="capitalize text-moss-600">
                    {method.replaceAll('_', ' ').toLowerCase()}
                  </span>
                  <span className="num">{formatPeso(amount)}</span>
                </li>
              ))}
            {inByMethod.size === 0 && <li className="muted">No cash received this month.</li>}
          </ul>
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-3">Out, by category</h2>
          <ul className="space-y-1 text-sm">
            {[...outByCategory.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, amount]) => (
                <li key={name} className="flex justify-between gap-3">
                  <span className="text-moss-600">{name}</span>
                  <span className="num">{formatPeso(amount)}</span>
                </li>
              ))}
            {outByCategory.size === 0 && <li className="muted">No spending recorded.</li>}
          </ul>
        </div>

        <div className="card-pad lg:row-span-2">
          <h2 className="section-title mb-3">Daily movement</h2>
          <div className="max-h-96 overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="text-right">In</th>
                  <th className="text-right">Out</th>
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const row = byDay.get(d)!;
                  if (row.in === 0 && row.out === 0) return null;
                  return (
                    <tr key={d}>
                      <td className="whitespace-nowrap text-xs">{formatDateKey(d)}</td>
                      <td className="num text-right text-moss-600">{row.in ? formatPeso(row.in) : '—'}</td>
                      <td className="num text-right text-clay-500">{row.out ? formatPeso(row.out) : '—'}</td>
                      <td className="num text-right font-medium">{formatPeso(row.in - row.out)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-moss-400">
        Previous month:{' '}
        <a href={`/portal/finance/cashflow?month=${addMonthsToKey(monthKey, -1)}`} className="underline underline-offset-4">
          {formatMonthKey(addMonthsToKey(monthKey, -1))}
        </a>
      </p>
    </div>
  );
}
