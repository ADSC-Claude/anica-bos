import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings, listBranches } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { addMonthsToKey, formatMonthKey, manilaMonthKey, monthBounds, dateKeyToBusinessDate } from '@/lib/datetime';
import { profitAndLoss, salesSummary, monthRange } from '@/lib/metrics';
import { PageHeader, StatCard, Alert } from '@/components/ui';
import { FinanceTabs } from '@/components/finance-tabs';
import { BranchSwitcher } from '@/components/branch-switcher';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profit & Loss' };

export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branchId?: string }>;
}) {
  const user = await requirePage('finance.view');
  const params = await searchParams;
  const branches = await listBranches();
  const branchIds =
    user.role === 'OWNER' && (!params.branchId || params.branchId === 'all')
      ? branches.map((b) => b.id)
      : [await resolveBranchId(user, params.branchId)];

  const monthKey = params.month ?? manilaMonthKey();
  const prevKey = addMonthsToKey(monthKey, -1);
  const settings = await getSettings(branchIds[0]);

  const [pl, prevPl, sales] = await Promise.all([
    profitAndLoss(branchIds, monthRange(monthKey)),
    profitAndLoss(branchIds, monthRange(prevKey)),
    salesSummary(branchIds, monthRange(monthKey)),
  ]);

  // Running gross sales for the year, against the ₱3M VAT threshold.
  const yearStart = `${monthKey.slice(0, 4)}-01-01`;
  const ytd = await prisma.sale.aggregate({
    where: {
      branchId: { in: branchIds },
      status: 'PAID',
      businessDate: {
        gte: dateKeyToBusinessDate(yearStart),
        lte: dateKeyToBusinessDate(monthBounds(monthKey).toKey),
      },
    },
    _sum: { subtotalCents: true, discountCents: true },
  });
  const grossYtd = (ytd._sum.subtotalCents ?? 0) - (ytd._sum.discountCents ?? 0);
  const threshold = settings['tax.vatThresholdCents'];
  const thresholdPct = Math.round((grossYtd / threshold) * 100);

  const delta = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100));

  return (
    <div>
      <PageHeader
        title="Profit &amp; Loss"
        subtitle={formatMonthKey(monthKey)}
        actions={
          <>
            {user.role === 'OWNER' && branches.length > 1 && (
              <div className="w-48">
                <BranchSwitcher branches={branches} />
              </div>
            )}
            <form className="flex gap-2" action="/portal/finance/pl">
              <input type="month" name="month" defaultValue={monthKey} className="input w-auto" />
              <button className="btn-secondary btn-sm" type="submit">Go</button>
            </form>
            <Link href={`/api/portal/export/pl?month=${monthKey}`} className="btn-secondary btn-sm">
              Export CSV
            </Link>
          </>
        }
      />
      <FinanceTabs role={user.role} current="/portal/finance/pl" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Net revenue" value={formatPeso(pl.netRevenueCents)}
          hint={delta(pl.netRevenueCents, prevPl.netRevenueCents) !== null
            ? `${delta(pl.netRevenueCents, prevPl.netRevenueCents)! >= 0 ? '+' : ''}${delta(pl.netRevenueCents, prevPl.netRevenueCents)}% vs ${formatMonthKey(prevKey)}`
            : 'no prior month'} />
        <StatCard label="Gross profit" value={formatPeso(pl.grossProfitCents)} hint="after COGS" />
        <StatCard label="Operating expenses" value={formatPeso(pl.expenseCents)} />
        <StatCard label="Net profit" value={formatPeso(pl.netProfitCents)}
          tone={pl.netProfitCents >= 0 ? 'good' : 'bad'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">Statement</h2>
          <table className="tbl">
            <tbody>
              <PlRow label="Gross sales (list price)" value={pl.revenueCents} />
              <PlRow label="Less: discounts" value={-pl.discountCents} />
              <PlRow label="Net revenue" value={pl.netRevenueCents} bold />
              <PlRow label="Less: cost of goods sold" value={-pl.cogsCents} />
              <PlRow label="Gross profit" value={pl.grossProfitCents} bold />
              {pl.expenseByCategory.map((c) => (
                <PlRow key={c.name} label={`Less: ${c.name}`} value={-c.amountCents} />
              ))}
              <PlRow label="Total operating expenses" value={-pl.expenseCents} />
              <PlRow label="NET PROFIT" value={pl.netProfitCents} bold highlight />
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-moss-400">
            Tips ({formatPeso(sales.tipsCents)}) are excluded — they are payable to staff, not
            business income. Inventory purchases are capitalised and appear here only as COGS
            when the stock is consumed.
          </p>
        </div>

        <div className="space-y-4">
          <div className="card-pad">
            <h2 className="section-title mb-3">Month-over-month</h2>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="text-right">{formatMonthKey(prevKey)}</th>
                  <th className="text-right">{formatMonthKey(monthKey)}</th>
                  <th className="text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Net revenue', prevPl.netRevenueCents, pl.netRevenueCents],
                  ['COGS', prevPl.cogsCents, pl.cogsCents],
                  ['Expenses', prevPl.expenseCents, pl.expenseCents],
                  ['Net profit', prevPl.netProfitCents, pl.netProfitCents],
                ].map(([label, prev, now]) => {
                  const d = delta(now as number, prev as number);
                  return (
                    <tr key={label as string}>
                      <td>{label as string}</td>
                      <td className="num text-right">{formatPeso(prev as number)}</td>
                      <td className="num text-right">{formatPeso(now as number)}</td>
                      <td className={`num text-right ${d === null ? '' : d >= 0 ? 'text-moss-600' : 'text-clay-500'}`}>
                        {d === null ? '—' : `${d >= 0 ? '+' : ''}${d}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-2">Tax position</h2>
            <p className="text-sm text-moss-600">
              Registered as{' '}
              <strong>
                {settings['tax.regime'] === 'NON_VAT_8'
                  ? 'Non-VAT (8% income tax option)'
                  : 'VAT-registered'}
              </strong>
              .
            </p>
            {settings['tax.regime'] === 'NON_VAT_8' && (
              <>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-moss-500">Gross sales {monthKey.slice(0, 4)} to date</span>
                    <span className="num font-medium">{formatPeso(grossYtd)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sand-200">
                    <div
                      className={`h-full rounded-full ${thresholdPct >= 85 ? 'bg-clay-500' : 'bg-moss-500'}`}
                      style={{ width: `${Math.min(100, thresholdPct)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-moss-400">
                    {thresholdPct}% of the {formatPeso(threshold)} VAT registration threshold.
                  </p>
                </div>
                {thresholdPct >= 85 && (
                  <div className="mt-3">
                    <Alert tone="warn">
                      You are approaching the VAT threshold. Once you cross it you must register
                      for VAT — switch the tax regime in Settings and receipts and journals
                      reformat automatically.
                    </Alert>
                  </div>
                )}
              </>
            )}
            <p className="mt-3 text-[11px] text-moss-400">
              This is a record-keeping system, not yet a BIR-accredited CAS and not a filing
              system. Nothing is transmitted to the BIR or any third party — every export is
              produced only when you ask for it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? 'bg-moss-50' : ''}>
      <td className={bold ? 'font-semibold' : ''}>{label}</td>
      <td className={`num text-right ${bold ? 'font-semibold' : ''} ${value < 0 ? 'text-clay-500' : ''}`}>
        {formatPeso(value)}
      </td>
    </tr>
  );
}
