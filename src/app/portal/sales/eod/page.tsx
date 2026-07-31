import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatDateKey, manilaDateKey, dateKeyToBusinessDate, addDaysToKey } from '@/lib/datetime';
import { PageHeader, StatCard, EmptyState, Tabs, Alert } from '@/components/ui';
import { EodForm } from './form';
import { reopenDayAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'End of day' };

export default async function EodPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branchId?: string }>;
}) {
  const user = await requirePage('eod.close');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const dateKey = params.date ?? manilaDateKey();
  const bizDate = dateKeyToBusinessDate(dateKey);
  const canReopen = can(user.role, 'finance.void');

  const [closing, sales, lastPetty, history] = await Promise.all([
    prisma.eodClosing.findUnique({
      where: { branchId_businessDate: { branchId, businessDate: bizDate } },
      include: { closedBy: { select: { name: true } } },
    }),
    prisma.sale.findMany({
      where: { branchId, businessDate: bizDate, status: 'PAID' },
      include: { payments: true },
    }),
    prisma.pettyCashTxn.findFirst({ where: { branchId }, orderBy: { createdAt: 'desc' } }),
    prisma.eodClosing.findMany({
      where: { branchId },
      include: { closedBy: { select: { name: true } } },
      orderBy: { businessDate: 'desc' },
      take: 14,
    }),
  ]);

  const expected: Record<string, number> = {};
  for (const sale of sales) {
    for (const p of sale.payments) {
      const amount = p.method === 'CASH' ? p.amountCents - sale.changeCents : p.amountCents;
      expected[p.method] = (expected[p.method] ?? 0) + amount;
    }
  }
  const gross = sales.reduce((a, s) => a + s.totalCents, 0);

  const tabs = [
    { href: '/portal/sales', label: "Today's sales" },
    { href: '/portal/sales/pos', label: 'New sale (POS)' },
    { href: '/portal/sales/petty-cash', label: 'Petty cash' },
    { href: '/portal/sales/eod', label: 'End of day' },
  ];

  return (
    <div>
      <PageHeader
        title="End-of-day closing"
        subtitle={`${formatDateKey(dateKey)} — the z-reading style daily sales report.`}
        actions={
          <form className="flex gap-2" action="/portal/sales/eod">
            <input type="date" name="date" defaultValue={dateKey} className="input w-auto" />
            <button className="btn-secondary btn-sm" type="submit">Go</button>
          </form>
        }
      />
      <Tabs tabs={tabs} current="/portal/sales/eod" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Receipts" value={String(sales.length)} />
        <StatCard label="Gross sales" value={formatPeso(gross)} />
        <StatCard label="Expected cash" value={formatPeso(expected.CASH ?? 0)} />
        <StatCard
          label="Status"
          value={closing ? 'Closed' : 'Open'}
          tone={closing ? 'good' : 'warn'}
          hint={closing ? `by ${closing.closedBy.name}` : 'not yet counted'}
        />
      </div>

      {closing ? (
        <div className="card-pad mb-6">
          <h2 className="section-title mb-3">Closing summary</h2>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Method</th>
                  <th className="text-right">Expected</th>
                  <th className="text-right">Counted</th>
                  <th className="text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(closing.expected as Record<string, number>).map(([method, amount]) => {
                  const counted = (closing.counted as Record<string, number>)[method] ?? 0;
                  const diff = counted - amount;
                  return (
                    <tr key={method}>
                      <td className="capitalize">{method.replaceAll('_', ' ').toLowerCase()}</td>
                      <td className="num text-right">{formatPeso(amount)}</td>
                      <td className="num text-right">{formatPeso(counted)}</td>
                      <td className={`num text-right ${diff === 0 ? '' : diff > 0 ? 'text-cocoa-600' : 'text-clay-500'}`}>
                        {diff === 0 ? '—' : formatPeso(diff)}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td>Petty cash box</td>
                  <td className="num text-right">{formatPeso(closing.pettyCashExpectedCents)}</td>
                  <td className="num text-right">{formatPeso(closing.pettyCashCountedCents)}</td>
                  <td className="num text-right">
                    {formatPeso(closing.pettyCashCountedCents - closing.pettyCashExpectedCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={`mt-3 text-sm font-semibold ${closing.overShortCents === 0 ? 'text-cocoa-600' : 'text-clay-500'}`}>
            {closing.overShortCents === 0
              ? 'Cash balanced exactly.'
              : closing.overShortCents > 0
                ? `Over by ${formatPeso(closing.overShortCents)}.`
                : `Short by ${formatPeso(-closing.overShortCents)}.`}
          </p>
          {closing.notes && <p className="mt-1 text-sm text-cocoa-600">{closing.notes}</p>}
          <p className="mt-2 text-xs text-cocoa-400">
            The day is locked — new sales, voids and edits for this date are blocked.
          </p>
          {canReopen && (
            <form action={reopenDayAction} className="mt-3">
              <input type="hidden" name="id" value={closing.id} />
              <button className="btn-secondary btn-sm" type="submit">
                Reopen this day (audit-logged)
              </button>
            </form>
          )}
        </div>
      ) : sales.length === 0 && dateKey !== manilaDateKey() ? (
        <div className="mb-6">
          <Alert tone="info">No sales were recorded on this date, so there is nothing to close.</Alert>
        </div>
      ) : (
        <div className="mb-6 max-w-lg">
          <EodForm
            branchId={branchId}
            dateKey={dateKey}
            expected={expected}
            pettyExpected={lastPetty?.balanceAfterCents ?? 0}
          />
        </div>
      )}

      <h2 className="section-title mb-3">Recent closings</h2>
      {history.length === 0 ? (
        <EmptyState title="No days closed yet" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Receipts</th>
                <th className="text-right">Gross sales</th>
                <th className="text-right">Cash over/short</th>
                <th>Closed by</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const key = h.businessDate.toISOString().slice(0, 10);
                return (
                  <tr key={h.id}>
                    <td>
                      <Link href={`/portal/sales/eod?date=${key}`} className="text-cocoa-800 hover:underline">
                        {formatDateKey(key)}
                      </Link>
                    </td>
                    <td className="num text-right">{h.salesCount}</td>
                    <td className="num text-right">{formatPeso(h.grossSalesCents)}</td>
                    <td className={`num text-right ${h.overShortCents === 0 ? '' : h.overShortCents > 0 ? 'text-cocoa-600' : 'text-clay-500'}`}>
                      {h.overShortCents === 0 ? 'balanced' : formatPeso(h.overShortCents)}
                    </td>
                    <td className="text-xs text-cocoa-500">{h.closedBy.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-cocoa-400">
        Tip: yesterday was {formatDateKey(addDaysToKey(dateKey, -1))} —{' '}
        <Link href={`/portal/sales/eod?date=${addDaysToKey(dateKey, -1)}`} className="underline underline-offset-4">
          open it
        </Link>
        .
      </p>
    </div>
  );
}
