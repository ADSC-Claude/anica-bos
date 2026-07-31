import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { listBranches } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { addMonthsToKey, formatMonthKey, manilaMonthKey } from '@/lib/datetime';
import { kpiScorecard } from '@/lib/metrics';
import { PageHeader, Tabs, StatusBadge } from '@/components/ui';
import { BranchSwitcher } from '@/components/branch-switcher';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'KPI scorecard' };

export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branchId?: string }>;
}) {
  const user = await requirePage('reports.view');
  const params = await searchParams;
  const branches = await listBranches();
  const consolidated = user.role === 'OWNER' && (!params.branchId || params.branchId === 'all');
  const branchIds = consolidated
    ? branches.map((b) => b.id)
    : [await resolveBranchId(user, params.branchId)];

  const monthKey = params.month ?? manilaMonthKey();
  const board = await kpiScorecard(branchIds, monthKey);

  const fmt = (v: number, format: string) =>
    format === 'money'
      ? formatPeso(v)
      : format === 'percent'
        ? `${v}%`
        : format === 'rating'
          ? `${(v / 10).toFixed(1)} ★`
          : String(v);

  /** Green when at/over target, amber within 15%, red otherwise. */
  function ragFor(row: (typeof board.rows)[number]): 'OK' | 'WARN' | 'BAD' | null {
    if (row.target === null || row.target === 0) return null;
    const ratio = row.value / row.target;
    if (row.invert) {
      if (row.value <= row.target) return 'OK';
      return row.value <= row.target * 1.15 ? 'WARN' : 'BAD';
    }
    if (ratio >= 1) return 'OK';
    return ratio >= 0.85 ? 'WARN' : 'BAD';
  }

  return (
    <div>
      <PageHeader
        title="KPI scorecard"
        subtitle={`${formatMonthKey(monthKey)}${consolidated ? ' · all branches' : ''} · green / amber / red against your monthly targets`}
        actions={
          <>
            {user.role === 'OWNER' && branches.length > 1 && (
              <div className="w-48">
                <BranchSwitcher branches={branches} />
              </div>
            )}
            <form className="flex gap-2" action="/portal/reports/kpi">
              <input type="month" name="month" defaultValue={monthKey} className="input w-auto" />
              <button className="btn-secondary btn-sm" type="submit">Go</button>
            </form>
            <Link href={`/api/portal/export/kpi?month=${monthKey}`} className="btn-secondary btn-sm">
              Export CSV
            </Link>
          </>
        }
      />
      <Tabs
        tabs={[
          { href: '/portal/reports', label: 'Overview' },
          { href: '/portal/reports/kpi', label: 'KPI scorecard' },
        ]}
        current="/portal/reports/kpi"
      />

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>KPI</th>
              <th className="text-right">{formatMonthKey(board.prevMonthKey)}</th>
              <th className="text-right">This month</th>
              <th className="text-right">Target</th>
              <th className="text-right">Trend</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => {
              const rag = ragFor(r);
              const trend =
                r.previous === 0 ? null : Math.round(((r.value - r.previous) / Math.abs(r.previous)) * 100);
              return (
                <tr key={r.key}>
                  <td className="font-medium text-cocoa-800">{r.label}</td>
                  <td className="num text-right text-cocoa-400">
                    {r.previous ? fmt(r.previous, r.format) : '—'}
                  </td>
                  <td className="num text-right font-semibold">{fmt(r.value, r.format)}</td>
                  <td className="num text-right text-cocoa-500">
                    {r.target === null ? '—' : fmt(r.target, r.format)}
                  </td>
                  <td className={`num text-right ${trend === null ? 'text-cocoa-300' : (trend >= 0) !== Boolean(r.invert) ? 'text-cocoa-600' : 'text-clay-500'}`}>
                    {trend === null ? '—' : `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}%`}
                  </td>
                  <td>
                    {rag ? (
                      <StatusBadge
                        status={rag}
                        label={rag === 'OK' ? 'on target' : rag === 'WARN' ? 'close' : 'off target'}
                      />
                    ) : (
                      <span className="text-xs text-cocoa-300">no target set</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-cocoa-500">
        Set monthly targets in{' '}
        <Link href="/portal/settings/kpi" className="underline underline-offset-4">
          Settings → KPI targets
        </Link>
        . Previous month:{' '}
        <Link href={`/portal/reports/kpi?month=${addMonthsToKey(monthKey, -1)}`} className="underline underline-offset-4">
          {formatMonthKey(addMonthsToKey(monthKey, -1))}
        </Link>
        .
      </p>
    </div>
  );
}
