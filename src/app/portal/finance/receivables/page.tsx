import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatPeso } from '@/lib/money';
import { formatManila, manilaMonthKey } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState } from '@/components/ui';
import { FinanceTabs } from '@/components/finance-tabs';
import { generateStatementAction } from '../actions';
import { CorporatePaymentForm } from './payment-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Receivables' };

/** Ages an outstanding charge into the standard 0/30/60/90 buckets. */
function bucketFor(days: number): 'current' | 'd30' | 'd60' | 'd90' {
  if (days <= 30) return 'current';
  if (days <= 60) return 'd30';
  if (days <= 90) return 'd60';
  return 'd90';
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('finance.view');
  const params = await searchParams;
  await resolveBranchId(user, params.branchId);

  const accounts = await prisma.corporateAccount.findMany({
    include: {
      payments: true,
      statements: { orderBy: { issuedAt: 'desc' }, take: 6 },
      sales: {
        where: { status: 'PAID' },
        include: { payments: { where: { method: 'CORPORATE_CHARGE' } } },
        orderBy: { businessDate: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows = accounts.map((a) => {
    const charges = a.sales.flatMap((s) =>
      s.payments.map((p) => ({
        amount: p.amountCents,
        date: s.businessDate,
        days: Math.round((Date.now() - s.businessDate.getTime()) / 86_400_000),
      })),
    );
    const charged = charges.reduce((x, c) => x + c.amount, 0);
    const settled = a.payments.reduce((x, p) => x + p.amountCents, 0);
    const outstanding = charged - settled;

    // Apply payments oldest-first so the ageing buckets reflect what is still open.
    let remaining = settled;
    const ageing = { current: 0, d30: 0, d60: 0, d90: 0 };
    for (const c of charges) {
      const applied = Math.min(remaining, c.amount);
      remaining -= applied;
      const open = c.amount - applied;
      if (open > 0) ageing[bucketFor(c.days)] += open;
    }

    return { account: a, charged, settled, outstanding, ageing };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      outstanding: acc.outstanding + r.outstanding,
      current: acc.current + r.ageing.current,
      d30: acc.d30 + r.ageing.d30,
      d60: acc.d60 + r.ageing.d60,
      d90: acc.d90 + r.ageing.d90,
    }),
    { outstanding: 0, current: 0, d30: 0, d60: 0, d90: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Receivables"
        subtitle="Corporate charges, statements of account and ageing."
      />
      <FinanceTabs role={user.role} current="/portal/finance/receivables" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total outstanding" value={formatPeso(totals.outstanding)} tone={totals.outstanding ? 'warn' : 'good'} />
        <StatCard label="Current (0–30)" value={formatPeso(totals.current)} />
        <StatCard label="31–60 days" value={formatPeso(totals.d30)} tone={totals.d30 ? 'warn' : 'default'} />
        <StatCard label="61–90 days" value={formatPeso(totals.d60)} tone={totals.d60 ? 'warn' : 'default'} />
        <StatCard label="Over 90 days" value={formatPeso(totals.d90)} tone={totals.d90 ? 'bad' : 'default'} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No corporate accounts yet" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {rows.map(({ account: a, charged, settled, outstanding, ageing }) => (
              <div key={a.id} className="card-pad">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-cocoa-800">{a.name}</p>
                    <p className="text-xs text-cocoa-400">
                      Terms {a.paymentTermsDays} days
                      {a.creditLimitCents > 0 && ` · limit ${formatPeso(a.creditLimitCents)}`}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className={`num font-semibold ${outstanding > 0 ? 'text-clay-500' : 'text-cocoa-600'}`}>
                      {formatPeso(outstanding)}
                    </span>
                    {ageing.d90 > 0 && <StatusBadge status="BAD" label="over 90 days" />}
                  </span>
                </div>

                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="text-right">Charged</th>
                        <th className="text-right">Paid</th>
                        <th className="text-right">0–30</th>
                        <th className="text-right">31–60</th>
                        <th className="text-right">61–90</th>
                        <th className="text-right">90+</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="num text-right">{formatPeso(charged)}</td>
                        <td className="num text-right">{formatPeso(settled)}</td>
                        <td className="num text-right">{formatPeso(ageing.current)}</td>
                        <td className="num text-right">{formatPeso(ageing.d30)}</td>
                        <td className="num text-right">{formatPeso(ageing.d60)}</td>
                        <td className="num text-right text-clay-500">{formatPeso(ageing.d90)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <form action={generateStatementAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="accountId" value={a.id} />
                  <input type="month" name="monthKey" defaultValue={manilaMonthKey()} className="input w-auto" />
                  <button className="btn-secondary btn-sm" type="submit">
                    Generate statement of account
                  </button>
                </form>

                {a.statements.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {a.statements.map((s) => (
                      <li key={s.id} className="flex justify-between gap-3 text-cocoa-500">
                        <span>
                          {s.number} · {s.periodStart.toISOString().slice(0, 10)} →{' '}
                          {s.periodEnd.toISOString().slice(0, 10)} · due {formatManila(s.dueDate)}
                        </span>
                        <span className="num">{formatPeso(s.totalCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <CorporatePaymentForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      )}
    </div>
  );
}
