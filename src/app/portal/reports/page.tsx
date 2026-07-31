import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { listBranches } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import {
  addMonthsToKey, formatMonthKey, manilaMonthKey, monthBounds, manilaDateKey,
} from '@/lib/datetime';
import {
  salesSummary, profitAndLoss, appointmentStats, clientStats, topServices,
  therapistUtilisation, monthRange, roomOccupancy,
} from '@/lib/metrics';
import { PageHeader, StatCard, Tabs, EmptyState } from '@/components/ui';
import { BranchSwitcher } from '@/components/branch-switcher';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports' };

const EXPORTS: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'Sales',
    items: [
      { key: 'daily-sales', label: 'Daily sales (EOD report)' },
      { key: 'sales-by-service', label: 'Sales by service' },
      { key: 'sales-by-category', label: 'Sales by category' },
      { key: 'sales-by-therapist', label: 'Sales by therapist' },
      { key: 'sales-by-payment', label: 'Sales by payment method' },
      { key: 'sales-by-hour', label: 'Sales by hour of day' },
    ],
  },
  {
    group: 'Appointments & clients',
    items: [
      { key: 'appointments', label: 'Appointment stats' },
      { key: 'clients', label: 'Client list' },
      { key: 'lapsed-clients', label: 'Lapsed clients' },
    ],
  },
  {
    group: 'Employees',
    items: [
      { key: 'attendance', label: 'Attendance summary' },
      { key: 'commissions', label: 'Commission report' },
      { key: 'utilisation', label: 'Therapist utilisation' },
    ],
  },
  {
    group: 'Inventory',
    items: [
      { key: 'inventory', label: 'Stock levels & value' },
      { key: 'stock-movements', label: 'Stock usage & variance' },
      { key: 'purchases', label: 'Purchase history' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { key: 'pl', label: 'Profit & Loss' },
      { key: 'expenses', label: 'Expense breakdown' },
      { key: 'kpi', label: 'KPI scorecard' },
    ],
  },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branchId?: string }>;
}) {
  const user = await requirePage('reports.ownDailySummary');
  const params = await searchParams;

  // A receptionist gets only her own daily summary.
  if (!can(user.role, 'reports.view')) {
    return <ReceptionistSummary />;
  }

  const branches = await listBranches();
  const consolidated = user.role === 'OWNER' && (!params.branchId || params.branchId === 'all');
  const branchIds = consolidated
    ? branches.map((b) => b.id)
    : [await resolveBranchId(user, params.branchId)];

  const monthKey = params.month ?? manilaMonthKey();
  const prevKey = addMonthsToKey(monthKey, -1);
  const range = monthRange(monthKey);
  const { fromKey, toKey } = monthBounds(monthKey);

  const [sales, prevSales, pl, prevPl, appts, clients, prevClients, services, util, occupancy] =
    await Promise.all([
      salesSummary(branchIds, range),
      salesSummary(branchIds, monthRange(prevKey)),
      profitAndLoss(branchIds, range),
      profitAndLoss(branchIds, monthRange(prevKey)),
      appointmentStats(branchIds, range),
      clientStats(branchIds, range),
      clientStats(branchIds, monthRange(prevKey)),
      topServices(branchIds, range, 8),
      therapistUtilisation(branchIds, range),
      roomOccupancy(branchIds, range),
    ]);

  // Per-branch comparison for the consolidated Owner view.
  const perBranch = consolidated
    ? await Promise.all(
        branches.map(async (b) => ({
          branch: b,
          sales: await salesSummary([b.id], range),
          util: await therapistUtilisation([b.id], range),
        })),
      )
    : [];

  const delta = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100));
  const exportBase = `?from=${fromKey}&to=${toKey}&month=${monthKey}${consolidated ? '' : `&branchId=${branchIds[0]}`}`;

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`${formatMonthKey(monthKey)}${consolidated ? ' · all branches' : ''}`}
        actions={
          <>
            {user.role === 'OWNER' && branches.length > 1 && (
              <div className="w-48">
                <BranchSwitcher branches={branches} />
              </div>
            )}
            <form className="flex gap-2" action="/portal/reports">
              <input type="month" name="month" defaultValue={monthKey} className="input w-auto" />
              <button className="btn-secondary btn-sm" type="submit">Go</button>
            </form>
          </>
        }
      />
      <Tabs
        tabs={[
          { href: '/portal/reports', label: 'Overview' },
          { href: '/portal/reports/kpi', label: 'KPI scorecard' },
        ]}
        current="/portal/reports"
      />

      {/* --- the "how is the business doing" one-pager --- */}
      <h2 className="section-title mb-3">Month-over-month growth</h2>
      <div className="mb-6 card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Measure</th>
              <th className="text-right">{formatMonthKey(prevKey)}</th>
              <th className="text-right">{formatMonthKey(monthKey)}</th>
              <th className="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Net revenue', prevSales.netSalesCents, sales.netSalesCents, 'money'],
              ['Receipts issued', prevSales.saleCount, sales.saleCount, 'count'],
              ['Average sale value', prevSales.averageSaleCents, sales.averageSaleCents, 'money'],
              ['Clients served', prevClients.clientsServed, clients.clientsServed, 'count'],
              ['New clients', prevClients.newClients, clients.newClients, 'count'],
              ['Retention rate', prevClients.retentionRate, clients.retentionRate, 'percent'],
              ['Net profit', prevPl.netProfitCents, pl.netProfitCents, 'money'],
            ].map(([label, prev, now, fmt]) => {
              const d = delta(now as number, prev as number);
              const format = (v: number) =>
                fmt === 'money' ? formatPeso(v) : fmt === 'percent' ? `${v}%` : String(v);
              return (
                <tr key={label as string}>
                  <td className="font-medium">{label as string}</td>
                  <td className="num text-right text-cocoa-500">{format(prev as number)}</td>
                  <td className="num text-right font-semibold">{format(now as number)}</td>
                  <td className={`num text-right ${d === null ? 'text-cocoa-400' : d >= 0 ? 'text-cocoa-600' : 'text-clay-500'}`}>
                    {d === null ? '—' : `${d >= 0 ? '+' : ''}${d}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bookings" value={String(appts.total)} hint={`${appts.online} online · ${appts.walkIn} walk-in`} />
        <StatCard label="Cancellations" value={String(appts.cancelled)} />
        <StatCard label="No-shows" value={String(appts.noShow)} tone={appts.noShow ? 'warn' : 'good'} />
        <StatCard label="Room occupancy" value={`${occupancy}%`} />
      </div>

      {consolidated && perBranch.length > 1 && (
        <>
          <h2 className="section-title mb-3">Branch comparison</h2>
          <div className="mb-6 card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th className="text-right">Receipts</th>
                  <th className="text-right">Net revenue</th>
                  <th className="text-right">Average sale</th>
                  <th className="text-right">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {perBranch.map((b) => (
                  <tr key={b.branch.id}>
                    <td className="font-medium">{b.branch.name}</td>
                    <td className="num text-right">{b.sales.saleCount}</td>
                    <td className="num text-right">{formatPeso(b.sales.netSalesCents)}</td>
                    <td className="num text-right">{formatPeso(b.sales.averageSaleCents)}</td>
                    <td className="num text-right">{b.util.overall}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-3">Top services</h2>
          {services.length === 0 ? (
            <p className="muted">No sales this month.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Service</th>
                  <th className="text-right">Sold</th>
                  <th className="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="num text-right">{s.count}</td>
                    <td className="num text-right">{formatPeso(s.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-3">Therapist performance</h2>
          {util.rows.length === 0 ? (
            <p className="muted">No attendance logged this month.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Therapist</th>
                  <th className="text-right">On duty (h)</th>
                  <th className="text-right">Booked (h)</th>
                  <th className="text-right">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {util.rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td>{r.name}</td>
                    <td className="num text-right">{(r.availableMinutes / 60).toFixed(1)}</td>
                    <td className="num text-right">{(r.bookedMinutes / 60).toFixed(1)}</td>
                    <td className={`num text-right ${r.utilisation >= 60 ? 'text-cocoa-600' : 'text-sand-500'}`}>
                      {r.utilisation}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h2 className="section-title mb-3">Export to CSV / Excel</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXPORTS.map((group) => (
          <div key={group.group} className="card-pad">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cocoa-500">
              {group.group}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={`/api/portal/export/${item.key}${exportBase}${item.key === 'daily-sales' ? `&date=${manilaDateKey()}` : ''}`}
                    className="block rounded-lg px-2 py-1.5 text-sm text-cocoa-700 hover:bg-sand-100"
                  >
                    ↓ {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-cocoa-400">
        Every CSV opens directly in Excel or Google Sheets. Printable PDFs: open any report and
        use your browser&apos;s Print → Save as PDF. Client health information is excluded from all
        exports.
      </p>
    </div>
  );
}

/* ------------------------------------------------- receptionist-only view */

async function ReceptionistSummary() {
  const user = await requirePage('reports.ownDailySummary');
  const branchId = await resolveBranchId(user, null);
  const dateKey = manilaDateKey();
  const summary = await salesSummary([branchId], { fromKey: dateKey, toKey: dateKey });
  const appts = await appointmentStats([branchId], { fromKey: dateKey, toKey: dateKey });

  return (
    <div>
      <PageHeader
        title="My daily summary"
        subtitle="Today at a glance. Full reports are available to the Owner and Manager."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Receipts issued" value={String(summary.saleCount)} />
        <StatCard label="Appointments" value={String(appts.total)} />
        <StatCard label="Completed" value={String(appts.completed)} />
        <StatCard label="No-shows" value={String(appts.noShow)} />
      </div>
      <EmptyState
        title="Need the day's sales list?"
        hint="Download the daily sales report for today — it lists every receipt you issued."
        action={
          <Link href={`/api/portal/export/daily-sales?date=${dateKey}`} className="btn-primary btn-sm">
            ↓ Download today&apos;s sales CSV
          </Link>
        }
      />
    </div>
  );
}
