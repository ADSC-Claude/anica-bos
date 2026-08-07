import Link from 'next/link';
import { requirePage, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { kpis, kpisByProperty, sourceMix, todayBoard } from '@/lib/metrics';
import { profitAndLoss, outstandingBalances } from '@/lib/finance';
import { openNotifications } from '@/lib/notifications';
import { prisma } from '@/lib/db';
import { formatPeso, formatPesoShort, ratio } from '@/lib/money';
import { manilaDateKey, manilaMonthKey, monthBounds, formatMonthKey, minutesToLabel, formatStayDate } from '@/lib/datetime';
import { Card, Stat, Bar, Pill, ReadyPill, Empty, PageHeader, Money } from '@/components/ui';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const SEVERITY_TONE = { URGENT: 'bad', HIGH: 'bad', MEDIUM: 'warn', LOW: 'info', INFO: 'info' } as const;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string }>;
}) {
  const user = await requirePage('dashboard.view');
  const params = await searchParams;
  const monthKey = params.month ?? manilaMonthKey();
  const { fromKey, toKey } = monthBounds(monthKey);
  const todayKey = manilaDateKey();

  const propertyIds = await visibleProperties(user);
  const settings = await getSettings();
  const showMoney = can(user.role, 'dashboard.financials');

  const branches = await prisma.branch.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  });
  const branchId = params.branch && params.branch !== 'all' ? params.branch : null;

  const [board, month, perProperty, mix, alerts] = await Promise.all([
    todayBoard(propertyIds, todayKey),
    kpis({ fromKey, toKey, propertyIds, branchId }),
    kpisByProperty({ fromKey, toKey, propertyIds, branchId }),
    sourceMix({ fromKey, toKey, propertyIds, branchId }),
    openNotifications(user.role, propertyIds),
  ]);

  const pl = showMoney ? await profitAndLoss({ fromKey, toKey, propertyIds, branchId }) : null;
  const balances = showMoney ? await outstandingBalances(propertyIds) : [];
  const urgent = alerts.filter((a) => a.severity === 'URGENT' || a.severity === 'HIGH');

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${formatMonthKey(monthKey)} · ${board.readyCount} of ${board.properties.length} units ready`}
        actions={
          <form className="flex flex-wrap gap-2" method="get">
            {branches.length > 1 && (
              <select className="field w-auto" name="branch" defaultValue={params.branch ?? 'all'}>
                <option value="all">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <input className="field w-auto" type="month" name="month" defaultValue={monthKey} />
            <button className="btn btn-secondary" type="submit">
              Show
            </button>
          </form>
        }
      />

      {urgent.length > 0 && (
        <section className="mb-5 rounded-xl border-l-4 border-[color:var(--bad)] bg-white p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[color:var(--bad)]">
            {urgent.length} thing{urgent.length === 1 ? '' : 's'} need you
          </h2>
          <ul className="space-y-2">
            {urgent.map((a) => (
              <li key={a.id}>
                <Link href={a.link} className="flex items-center justify-between gap-3 hover:underline">
                  <span className="text-sm font-medium">{a.title}</span>
                  <span className="text-xs text-[color:var(--color-ink-500)]">{a.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- today ------------------------------------------------------- */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Arriving today" value={board.arrivals.length} />
        <Stat label="Leaving today" value={board.departures.length} />
        <Stat label="In house" value={board.inHouse} />
        <Stat
          label="Ready"
          value={`${board.readyCount}/${board.properties.length}`}
          tone={board.readyCount < board.properties.length ? 'warn' : undefined}
        />
        <Stat label="Turnovers open" value={board.properties.filter((p) => p.readyState === 'CLEANING').length} />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card title="Arrivals today">
          {board.arrivals.length === 0 ? (
            <Empty>Nobody arriving today.</Empty>
          ) : (
            <ul className="divide-y divide-[color:var(--color-sand-200)]">
              {board.arrivals.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/portal/reservations/${a.id}`} className="font-medium hover:underline">
                      {a.guest.firstName} {a.guest.lastName}
                    </Link>
                    <p className="text-xs text-[color:var(--color-ink-500)]">
                      {a.property.name} · from {minutesToLabel(a.property.checkInMinute)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ReadyPill state={a.property.readyState} />
                    {showMoney && a.totalCents - a.paidCents > 0 && (
                      <Pill tone="bad">{formatPesoShort(a.totalCents - a.paidCents)} due</Pill>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Departures today">
          {board.departures.length === 0 ? (
            <Empty>Nobody leaving today.</Empty>
          ) : (
            <ul className="divide-y divide-[color:var(--color-sand-200)]">
              {board.departures.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <Link href={`/portal/reservations/${d.id}`} className="font-medium hover:underline">
                      {d.guest.firstName} {d.guest.lastName}
                    </Link>
                    <p className="text-xs text-[color:var(--color-ink-500)]">
                      {d.property.name} · by {minutesToLabel(d.property.checkOutMinute)}
                    </p>
                  </div>
                  <Pill tone={d.status === 'CHECKED_OUT' ? 'ok' : 'warn'}>
                    {d.status === 'CHECKED_OUT' ? 'Checked out' : 'In house'}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* --- the month --------------------------------------------------- */}
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[color:var(--color-ink-500)]">
        {formatMonthKey(monthKey)}
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="ADR"
          value={formatPesoShort(month.adrCents)}
          formula={`${formatPeso(month.accommodationCents)} ÷ ${month.nightsSold} nights sold`}
        />
        <Stat
          label="Occupancy"
          value={`${month.occupancyPercent}%`}
          formula={`${month.nightsSold} ÷ ${month.availableNights} property-nights`}
        />
        <Stat
          label="RevPAR"
          value={formatPesoShort(month.revParCents)}
          formula={`${formatPeso(month.accommodationCents)} ÷ ${month.availableNights} available`}
        />
        <Stat
          label="Average stay"
          value={`${month.averageStayNights} nights`}
          formula={`${month.nightsSold} nights ÷ ${month.bookings} bookings`}
        />
      </div>

      {showMoney && pl && (
        <div className="mb-5 grid gap-4 lg:grid-cols-3">
          <Card title="Revenue" className="lg:col-span-2">
            <div className="space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold">
                    <Money cents={pl.totals.revenueCents} />
                  </span>
                  <span className="text-xs text-[color:var(--color-ink-500)]">
                    target {formatPesoShort(settings['kpi.monthlyRevenueTargetCents'])}
                  </span>
                </div>
                <Bar value={pl.totals.revenueCents} target={settings['kpi.monthlyRevenueTargetCents']} />
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-[color:var(--color-ink-500)]">Expenses</dt>
                  <dd className="font-semibold">
                    <Money cents={pl.totals.expenseCents} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[color:var(--color-ink-500)]">Net operating profit</dt>
                  <dd className="font-semibold text-[color:var(--ok)]">
                    <Money cents={pl.totals.netCents} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[color:var(--color-ink-500)]">Margin</dt>
                  <dd className="font-semibold">{pl.totals.marginPercent}%</dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card title="Where bookings came from">
            {mix.length === 0 ? (
              <Empty>No bookings in this window.</Empty>
            ) : (
              <ul className="space-y-2">
                {mix.map((m) => (
                  <li key={m.source}>
                    <div className="flex justify-between text-sm">
                      <span>{m.source.replace(/_/g, ' ').toLowerCase()}</span>
                      <span className="font-semibold">{m.percent}%</span>
                    </div>
                    <Bar value={m.percent} target={100} tone="ok" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card title="Per property" className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                <th className="py-2">Property</th>
                <th className="py-2 text-right">Nights</th>
                <th className="py-2 text-right">Occ.</th>
                <th className="py-2 text-right">ADR</th>
                <th className="py-2 text-right">RevPAR</th>
                {showMoney && <th className="py-2 text-right">Revenue</th>}
                {showMoney && <th className="py-2 text-right">Expenses</th>}
                {showMoney && <th className="py-2 text-right">Net</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-sand-200)]">
              {perProperty.map((row) => {
                const plRow = pl?.rows.find((r) => r.propertyId === row.property.id);
                return (
                  <tr key={row.property.id}>
                    <td className="py-2">
                      <Link href={`/portal/properties/${row.property.id}`} className="hover:underline">
                        {row.property.name}
                      </Link>
                      <span className="ml-2 text-xs text-[color:var(--color-ink-500)]">
                        {row.property.branch.name}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{row.nightsSold}</td>
                    <td className="py-2 text-right tabular-nums">{row.occupancyPercent}%</td>
                    <td className="py-2 text-right tabular-nums">{formatPesoShort(row.adrCents)}</td>
                    <td className="py-2 text-right tabular-nums">{formatPesoShort(row.revParCents)}</td>
                    {showMoney && (
                      <td className="py-2 text-right tabular-nums">
                        {formatPesoShort(plRow?.revenueCents ?? 0)}
                      </td>
                    )}
                    {showMoney && (
                      <td className="py-2 text-right tabular-nums">
                        {formatPesoShort(plRow?.expenseCents ?? 0)}
                      </td>
                    )}
                    {showMoney && (
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {formatPesoShort(plRow?.netCents ?? 0)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {showMoney && pl && pl.unallocatedExpenseCents > 0 && (
              <tfoot>
                <tr className="border-t border-[color:var(--color-sand-300)] text-xs text-[color:var(--color-ink-500)]">
                  <td className="py-2" colSpan={7}>
                    Business-wide expenses not attributed to one property
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    −{formatPesoShort(pl.unallocatedExpenseCents)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Everything else needing attention">
          {alerts.length === 0 ? (
            <Empty>Nothing outstanding. Enjoy it.</Empty>
          ) : (
            <ul className="divide-y divide-[color:var(--color-sand-200)]">
              {alerts.slice(0, 12).map((a) => (
                <li key={a.id} className="py-2">
                  <Link href={a.link} className="flex items-start justify-between gap-3 hover:underline">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.title}</p>
                      {a.body && (
                        <p className="truncate text-xs text-[color:var(--color-ink-500)]">{a.body}</p>
                      )}
                    </div>
                    <Pill tone={SEVERITY_TONE[a.severity]}>{a.severity.toLowerCase()}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {showMoney && (
          <Card title="Unpaid balances">
            {balances.length === 0 ? (
              <Empty>Everything is settled.</Empty>
            ) : (
              <ul className="divide-y divide-[color:var(--color-sand-200)]">
                {balances.slice(0, 10).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link href={`/portal/reservations/${b.id}`} className="text-sm font-medium hover:underline">
                        {b.reference}
                      </Link>
                      <p className="text-xs text-[color:var(--color-ink-500)]">
                        {b.guest.firstName} {b.guest.lastName} · {b.property.name} · arrives{' '}
                        {formatStayDate(b.checkIn)}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-[color:var(--bad)]">
                      {formatPesoShort(b.balanceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <p className="mt-6 text-xs text-[color:var(--color-ink-500)]">
        Occupancy counts property-nights: {month.propertyCount} properties ×{' '}
        {ratio(month.availableNights, Math.max(1, month.propertyCount))} days ={' '}
        {month.availableNights} available.
      </p>
    </>
  );
}
