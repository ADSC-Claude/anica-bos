import Link from 'next/link';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import {
  formatDateKey,
  formatTimeManila,
  manilaDateKey,
  manilaMonthKey,
  addMonthsToKey,
  monthBounds,
} from '@/lib/datetime';
import {
  appointmentStats,
  expenseTotal,
  lowStockItems,
  salesSummary,
  therapistUtilisation,
  topServices,
  todayRange,
  monthRange,
} from '@/lib/metrics';
import { listNotifications } from '@/lib/notifications';
import { listBranches } from '@/lib/settings';
import { PageHeader, StatCard, StatusBadge, EmptyState, Alert } from '@/components/ui';
import { BranchSwitcher } from '@/components/branch-switcher';
import { NotificationList } from '@/components/notification-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; denied?: string }>;
}) {
  const user = await requirePage('dashboard.view');
  const params = await searchParams;
  const branches = await listBranches();

  // Non-owners are pinned to their branch, whatever the query string says.
  const branchIds =
    user.role === 'OWNER'
      ? params.branchId && params.branchId !== 'all'
        ? [params.branchId]
        : branches.map((b) => b.id)
      : [user.branchId ?? branches[0]?.id].filter(Boolean) as string[];

  const showFinancials = can(user.role, 'dashboard.financials');
  const notifications = await listNotifications(user, 12);

  const todayKey = manilaDateKey();
  const dayStart = new Date(`${todayKey}T00:00:00+08:00`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const [todaySales, todayAppointments, lowStock, announcements] = await Promise.all([
    salesSummary(branchIds, todayRange()),
    prisma.appointment.findMany({
      where: {
        branchId: { in: branchIds },
        startAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ['CANCELLED', 'EXPIRED'] },
      },
      include: {
        client: { select: { name: true, mobile: true } },
        resource: { select: { name: true } },
        services: { include: { service: { select: { name: true } }, employee: { select: { name: true } } } },
      },
      orderBy: { startAt: 'asc' },
    }),
    lowStockItems(branchIds),
    prisma.announcement.findMany({
      where: { pinned: true, OR: [{ branchId: null }, { branchId: { in: branchIds } }] },
      include: { author: { select: { name: true } }, reads: { where: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ]);

  const unreadAnnouncements = announcements.filter((a) => a.reads.length === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${user.name.split(' ')[0]}`}
        subtitle={formatDateKey(todayKey)}
        actions={
          user.role === 'OWNER' && branches.length > 1 ? (
            <div className="w-56">
              <BranchSwitcher branches={branches} />
            </div>
          ) : null
        }
      />

      {params.denied && (
        <Alert tone="danger">
          Your role does not have access to that page ({params.denied}).
        </Alert>
      )}

      {unreadAnnouncements.map((a) => (
        <Alert key={a.id} tone="info">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{a.title}</strong> — {a.body.slice(0, 140)}
              {a.body.length > 140 ? '…' : ''}{' '}
              <span className="text-xs opacity-70">· {a.author.name}</span>
            </span>
            <Link href="/portal/announcements" className="btn-secondary btn-sm">
              Read &amp; acknowledge
            </Link>
          </div>
        </Alert>
      ))}

      {showFinancials ? (
        <OwnerView branchIds={branchIds} todaySales={todaySales} lowStockCount={lowStock.length} />
      ) : (
        <ReceptionistView todaySales={todaySales} appointments={todayAppointments} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Today&apos;s schedule</h2>
            <Link href="/portal/appointments" className="text-sm text-moss-600 underline underline-offset-4">
              Open calendar
            </Link>
          </div>
          {todayAppointments.length === 0 ? (
            <EmptyState
              title="No appointments booked for today yet"
              hint="Walk-ins can be added straight from the calendar or the POS."
              action={
                <Link href="/portal/appointments" className="btn-primary btn-sm">
                  Add a booking
                </Link>
              }
            />
          ) : (
            <div className="card divide-y divide-sand-100">
              {todayAppointments.slice(0, 12).map((a) => (
                <Link
                  key={a.id}
                  href={`/portal/appointments/${a.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-sand-50"
                >
                  <div className="w-16 shrink-0 text-sm font-semibold num text-moss-700">
                    {formatTimeManila(a.startAt)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-moss-800">{a.client.name}</p>
                    <p className="truncate text-xs text-moss-400">
                      {a.services.map((s) => s.service.name).join(', ')}
                      {a.services[0]?.employee ? ` · ${a.services[0].employee.name}` : ''}
                      {a.resource ? ` · ${a.resource.name}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Needs your attention</h2>
            <Link href="/portal/notifications" className="text-sm text-moss-600 underline underline-offset-4">
              See all
            </Link>
          </div>
          <NotificationList notifications={notifications} compact />
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- owner view */

async function OwnerView({
  branchIds,
  todaySales,
  lowStockCount,
}: {
  branchIds: string[];
  todaySales: Awaited<ReturnType<typeof salesSummary>>;
  lowStockCount: number;
}) {
  const monthKey = manilaMonthKey();
  const lastMonthKey = addMonthsToKey(monthKey, -1);
  const mtd = monthRange(monthKey);
  // Compare like-for-like: same number of elapsed days last month.
  const elapsedDays = Number(manilaDateKey().slice(-2));
  const lastBounds = monthBounds(lastMonthKey);
  const lastSameSpan = {
    fromKey: lastBounds.fromKey,
    toKey: `${lastMonthKey}-${String(Math.min(elapsedDays, Number(lastBounds.toKey.slice(-2)))).padStart(2, '0')}`,
  };

  const [monthSales, lastMonthSales, monthExpenses, appts, services, util, pendingCounts] =
    await Promise.all([
      salesSummary(branchIds, mtd),
      salesSummary(branchIds, lastSameSpan),
      expenseTotal(branchIds, mtd),
      appointmentStats(branchIds, todayRange()),
      topServices(branchIds, mtd, 5),
      therapistUtilisation(branchIds, mtd),
      Promise.all([
        prisma.appointment.count({
          where: { branchId: { in: branchIds }, status: 'PENDING' },
        }),
        prisma.expense.count({ where: { branchId: { in: branchIds }, status: 'PENDING' } }),
      ]),
    ]);

  const [pendingBookings, pendingExpenses] = pendingCounts;
  const netToday = todaySales.netSalesCents;
  const growth =
    lastMonthSales.netSalesCents > 0
      ? Math.round(
          ((monthSales.netSalesCents - lastMonthSales.netSalesCents) /
            lastMonthSales.netSalesCents) *
            100,
        )
      : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue today" value={formatPeso(netToday)} hint={`${todaySales.saleCount} receipts`} href="/portal/sales" />
        <StatCard label="Month to date" value={formatPeso(monthSales.netSalesCents)} hint={growth === null ? 'No comparison yet' : `${growth >= 0 ? '+' : ''}${growth}% vs last month`} tone={growth !== null && growth < 0 ? 'bad' : 'good'} href="/portal/reports" />
        <StatCard label="Expenses MTD" value={formatPeso(monthExpenses)} hint={pendingExpenses ? `${pendingExpenses} awaiting approval` : 'All approved'} href="/portal/finance/expenses" tone={pendingExpenses ? 'warn' : 'default'} />
        <StatCard label="Net profit MTD" value={formatPeso(monthSales.netSalesCents - monthSales.cogsCents - monthExpenses)} hint="Revenue − COGS − expenses" href="/portal/finance/pl" tone={monthSales.netSalesCents - monthSales.cogsCents - monthExpenses >= 0 ? 'good' : 'bad'} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bookings today" value={String(appts.total)} hint={`${appts.online} online · ${appts.walkIn} walk-in`} href="/portal/appointments" />
        <StatCard label="Pending online bookings" value={String(pendingBookings)} tone={pendingBookings ? 'warn' : 'default'} href="/portal/appointments?status=PENDING" />
        <StatCard label="Therapist utilisation" value={`${util.overall}%`} hint="Booked ÷ on-duty hours (MTD)" href="/portal/reports/kpi" />
        <StatCard label="Low stock items" value={String(lowStockCount)} tone={lowStockCount ? 'bad' : 'good'} href="/portal/inventory" />
      </div>

      {services.length > 0 && (
        <div className="card-pad">
          <h2 className="section-title mb-3">Top services this month</h2>
          <ul className="space-y-2">
            {services.map((s) => {
              const max = services[0].revenueCents || 1;
              return (
                <li key={s.name}>
                  <div className="flex justify-between text-sm">
                    <span className="truncate text-moss-700">{s.name}</span>
                    <span className="num font-medium text-moss-800">{formatPeso(s.revenueCents)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand-200">
                    <div
                      className="h-full rounded-full bg-moss-500"
                      style={{ width: `${Math.round((s.revenueCents / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------- receptionist view */

function ReceptionistView({
  todaySales,
  appointments,
}: {
  todaySales: Awaited<ReturnType<typeof salesSummary>>;
  appointments: { status: string }[];
}) {
  const pending = appointments.filter((a) => a.status === 'PENDING').length;
  const inService = appointments.filter((a) => a.status === 'IN_SERVICE').length;
  const checkedIn = appointments.filter((a) => a.status === 'CHECKED_IN').length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Deliberately no profit figures for this role. */}
        <StatCard label="Sales today" value={String(todaySales.saleCount)} hint="receipts issued" href="/portal/sales" />
        <StatCard label="Appointments today" value={String(appointments.length)} href="/portal/appointments" />
        <StatCard label="Pending online bookings" value={String(pending)} tone={pending ? 'warn' : 'default'} href="/portal/appointments?status=PENDING" />
        <StatCard label="In session / checked in" value={`${inService} / ${checkedIn}`} href="/portal/appointments" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/portal/sales/pos" className="btn-primary">
          New sale (POS)
        </Link>
        <Link href="/portal/appointments/new?walkIn=1" className="btn-secondary">
          Walk-in now
        </Link>
        <Link href="/portal/employees/attendance" className="btn-secondary">
          Log attendance
        </Link>
      </div>
      <TherapistsOnDuty />
    </>
  );
}

async function TherapistsOnDuty() {
  const todayKey = manilaDateKey();
  const attendance = await prisma.attendance.findMany({
    where: {
      workDate: new Date(`${todayKey}T00:00:00Z`),
      timeIn: { not: null },
      employee: { employeeRole: 'THERAPIST' },
    },
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          appointmentServices: {
            where: {
              appointment: {
                status: 'IN_SERVICE',
              },
            },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { rotationRank: 'asc' },
  });

  if (!attendance.length) {
    return (
      <EmptyState
        title="No therapists timed in yet today"
        hint="Log time-in in Employees → Attendance. The time-in order sets the walk-in rotation queue and controls who appears on the public booking form."
        action={
          <Link href="/portal/employees/attendance" className="btn-primary btn-sm">
            Log attendance
          </Link>
        }
      />
    );
  }

  return (
    <div className="card-pad">
      <h2 className="section-title mb-3">Therapists on duty (rotation order)</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {attendance.map((a) => {
          const busy = a.employee.appointmentServices.length > 0;
          const status = a.timeOut
            ? { label: 'Timed out', tone: 'CANCELLED' }
            : a.onBreak
              ? { label: 'On break', tone: 'WARN' }
              : busy
                ? { label: 'In session', tone: 'IN_SERVICE' }
                : { label: 'Available', tone: 'OK' };
          return (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-sand-200 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sand-200 text-[11px] font-bold text-moss-600">
                  {a.rotationRank}
                </span>
                <span className="truncate text-sm text-moss-800">{a.employee.name}</span>
              </span>
              <StatusBadge status={status.tone} label={status.label} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
