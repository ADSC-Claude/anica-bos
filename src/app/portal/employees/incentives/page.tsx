import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatPeso } from '@/lib/money';
import { manilaMonthKey, formatMonthKey, addMonthsToKey } from '@/lib/datetime';
import { computeIncentives } from '@/lib/incentives';
import { PageHeader, EmptyState, Tabs, Alert, StatusBadge } from '@/components/ui';
import { IncentiveSchemeForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Incentives' };

/** Owner-only. Hidden from Admin and Receptionist by the RBAC matrix. */
export default async function IncentivesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branchId?: string }>;
}) {
  const user = await requirePage('incentives.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const monthKey = params.month ?? manilaMonthKey();

  const [rows, schemes] = await Promise.all([
    computeIncentives([branchId], monthKey),
    prisma.incentiveScheme.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const bySeheme = new Map<string, typeof rows>();
  for (const r of rows) {
    bySeheme.set(r.schemeId, [...(bySeheme.get(r.schemeId) ?? []), r]);
  }

  const tabs = [
    { href: '/portal/employees', label: 'Team' },
    { href: '/portal/employees/attendance', label: 'Attendance' },
    { href: '/portal/employees/payroll', label: 'Payroll' },
    { href: '/portal/employees/incentives', label: 'Incentives' },
  ];

  return (
    <div>
      <PageHeader
        title="Incentives"
        subtitle={`${formatMonthKey(monthKey)} · Owner-only rundown`}
        actions={
          <form className="flex gap-2" action="/portal/employees/incentives">
            <input type="month" name="month" defaultValue={monthKey} className="input w-auto" />
            <button className="btn-secondary btn-sm" type="submit">Go</button>
          </form>
        }
      />
      <Tabs tabs={tabs} current="/portal/employees/incentives" />

      <div className="mb-4">
        <Alert tone="warn">
          <strong>Read-only rewarding view.</strong> These amounts are suggestions computed from
          actual sales, ratings and attendance. They are <strong>not released through payroll</strong>{' '}
          and never appear on a payslip — reward staff manually outside the system. Only you can
          see this page.
        </Alert>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No incentive schemes are active"
          hint="Create one below and the system will compute suggested amounts from real data."
        />
      ) : (
        <div className="mb-8 space-y-4">
          {[...bySeheme.entries()].map(([schemeId, list]) => {
            const scheme = schemes.find((s) => s.id === schemeId);
            return (
              <div key={schemeId} className="card-pad">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="section-title">{list[0].schemeName}</h2>
                    <p className="text-xs capitalize text-cocoa-400">
                      {list[0].employeeRole.toLowerCase()} · {list[0].formula.replaceAll('_', ' ').toLowerCase()} ·{' '}
                      {scheme?.period.toLowerCase()}
                    </p>
                  </div>
                  <span className="num font-semibold text-cocoa-700">
                    {formatPeso(list.reduce((a, r) => a + r.suggestedCents, 0))} suggested
                  </span>
                </div>
                {list[0].note && <p className="muted mb-2">{list[0].note}</p>}
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Measured on</th>
                        <th className="text-right">Value</th>
                        <th className="text-right">Suggested reward</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <tr key={`${r.schemeId}-${r.employeeId}`}>
                          <td className="font-medium text-cocoa-800">{r.employeeName}</td>
                          <td className="text-xs text-cocoa-500">{r.metricLabel}</td>
                          <td className="num text-right">
                            {r.metric === 'revenue'
                              ? formatPeso(r.metricValue)
                              : r.metric === 'rating'
                                ? `${(r.metricValue / 10).toFixed(1)} ★`
                                : r.metricValue}
                          </td>
                          <td className="num text-right font-semibold">
                            {r.suggestedCents > 0 ? (
                              formatPeso(r.suggestedCents)
                            ) : (
                              <span className="text-cocoa-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="max-w-2xl">
        <h2 className="section-title mb-3">Incentive schemes</h2>
        {schemes.length > 0 && (
          <ul className="card mb-4 divide-y divide-sand-100">
            {schemes.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium text-cocoa-800">{s.name}</span>
                  <span className="block text-xs capitalize text-cocoa-400">
                    {s.targetRole.toLowerCase()} · {s.formula.replaceAll('_', ' ').toLowerCase()} ·{' '}
                    {s.formula === 'FIXED_AMOUNT' ? formatPeso(s.value) : `${s.value}%`}
                  </span>
                </span>
                <StatusBadge status={s.active ? 'ACTIVE' : 'CANCELLED'} label={s.active ? 'active' : 'inactive'} />
              </li>
            ))}
          </ul>
        )}
        <IncentiveSchemeForm
          schemes={schemes.map((s) => ({
            id: s.id,
            name: s.name,
            targetRole: s.targetRole,
            formula: s.formula,
            value: s.formula === 'FIXED_AMOUNT' ? s.value / 100 : s.value,
            targetValue: s.targetValue / 100,
            metric: s.metric,
            period: s.period,
            active: s.active,
            note: s.note,
          }))}
        />
      </div>

      <p className="mt-6 text-xs text-cocoa-400">
        Previous month:{' '}
        <a href={`/portal/employees/incentives?month=${addMonthsToKey(monthKey, -1)}`} className="underline underline-offset-4">
          {formatMonthKey(addMonthsToKey(monthKey, -1))}
        </a>
      </p>
    </div>
  );
}
