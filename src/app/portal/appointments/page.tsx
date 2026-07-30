import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { medicalAlertsFor } from '@/lib/medical';
import {
  addDaysToKey,
  formatDateKey,
  formatManila,
  formatTimeManila,
  manilaDateKey,
  manilaInstant,
  manilaMinuteOfDay,
  minutesToLabel,
  monthBounds,
  addMonthsToKey,
  formatMonthKey,
} from '@/lib/datetime';
import { PageHeader, StatusBadge, EmptyState, Tabs } from '@/components/ui';
import { formatPeso } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Appointments' };

type View = 'day' | 'week' | 'month' | 'list';

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: View; date?: string; month?: string; status?: string; branchId?: string }>;
}) {
  const user = await requirePage('appointments.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const view: View = params.view ?? 'day';
  const dateKey = params.date ?? manilaDateKey();
  const monthKey = params.month ?? dateKey.slice(0, 7);

  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });

  const base = `/portal/appointments`;
  const tabs = [
    { href: `${base}?view=day&date=${dateKey}`, label: 'Day' },
    { href: `${base}?view=week&date=${dateKey}`, label: 'Week' },
    { href: `${base}?view=month&month=${monthKey}`, label: 'Month' },
    { href: `${base}?view=list&date=${dateKey}`, label: 'List' },
  ];

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle={`${branch.name} · open ${minutesToLabel(branch.openMinute)} – ${minutesToLabel(branch.closeMinute)}`}
        actions={
          <>
            <Link href={`${base}/new?walkIn=1`} className="btn-secondary btn-sm">
              Walk-in now
            </Link>
            <Link href={`${base}/new`} className="btn-primary btn-sm">
              + New booking
            </Link>
          </>
        }
      />

      <Tabs tabs={tabs} current={tabs.find((t) => t.href.includes(`view=${view}`))?.href ?? tabs[0].href} />

      {view === 'day' && <DayView branchId={branchId} dateKey={dateKey} branch={branch} />}
      {view === 'week' && <WeekView branchId={branchId} dateKey={dateKey} />}
      {view === 'month' && <MonthView branchId={branchId} monthKey={monthKey} />}
      {view === 'list' && <ListView branchId={branchId} status={params.status} />}
    </div>
  );
}

/* ------------------------------------------------------------------ day */

async function DayView({
  branchId,
  dateKey,
  branch,
}: {
  branchId: string;
  dateKey: string;
  branch: { openMinute: number; closeMinute: number };
}) {
  const [appointments, therapists] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        branchId,
        startAt: { gte: manilaInstant(dateKey, 0), lt: manilaInstant(dateKey, 1440) },
        status: { notIn: ['EXPIRED'] },
      },
      include: {
        client: { select: { id: true, name: true } },
        resource: { select: { name: true } },
        services: { include: { service: { select: { name: true } }, employee: { select: { id: true, name: true } } } },
      },
      orderBy: { startAt: 'asc' },
    }),
    prisma.attendance.findMany({
      where: {
        branchId,
        workDate: new Date(`${dateKey}T00:00:00Z`),
        timeIn: { not: null },
        employee: { employeeRole: 'THERAPIST' },
      },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { rotationRank: 'asc' },
    }),
  ]);

  const alerts = await medicalAlertsFor(appointments.map((a) => a.client.id));

  // Therapist columns = who is on duty, plus anyone booked that day.
  const columns = new Map<string, string>();
  for (const a of therapists) columns.set(a.employee.id, a.employee.name);
  for (const appt of appointments) {
    for (const s of appt.services) {
      if (s.employee) columns.set(s.employee.id, s.employee.name);
    }
  }
  const columnList = [...columns.entries()];
  const unassigned = appointments.filter((a) => a.services.every((s) => !s.employee));

  const hours: number[] = [];
  for (let m = branch.openMinute; m < branch.closeMinute; m += 60) hours.push(m);

  return (
    <div>
      <DayNav dateKey={dateKey} view="day" />

      {columnList.length === 0 ? (
        <EmptyState
          title="No therapists on duty for this day"
          hint="Log time-in in Employees → Attendance. Only timed-in therapists can take bookings."
          action={
            <Link href="/portal/employees/attendance" className="btn-primary btn-sm">
              Log attendance
            </Link>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <div className="min-w-[720px]">
            <div
              className="grid border-b border-sand-200 bg-sand-50 text-[11px] font-semibold uppercase tracking-wide text-moss-500"
              style={{ gridTemplateColumns: `64px repeat(${columnList.length}, minmax(120px, 1fr))` }}
            >
              <div className="px-2 py-2">Time</div>
              {columnList.map(([id, name]) => (
                <div key={id} className="truncate px-2 py-2">{name}</div>
              ))}
            </div>

            {hours.map((hourMinute) => (
              <div
                key={hourMinute}
                className="grid border-b border-sand-100"
                style={{ gridTemplateColumns: `64px repeat(${columnList.length}, minmax(120px, 1fr))` }}
              >
                <div className="px-2 py-1.5 text-[11px] num text-moss-400">
                  {minutesToLabel(hourMinute)}
                </div>
                {columnList.map(([id]) => {
                  const inHour = appointments.filter((a) => {
                    const start = manilaMinuteOfDay(a.startAt);
                    return (
                      start >= hourMinute &&
                      start < hourMinute + 60 &&
                      a.services.some((s) => s.employee?.id === id)
                    );
                  });
                  return (
                    <div key={id} className="min-h-12 border-l border-sand-100 p-1">
                      {inHour.map((a) => (
                        <Link
                          key={a.id}
                          href={`/portal/appointments/${a.id}`}
                          className="mb-1 block rounded-lg bg-moss-100 px-2 py-1 text-[11px] leading-tight text-moss-800 hover:bg-moss-200"
                        >
                          <span className="block font-semibold">
                            {formatTimeManila(a.startAt)} {a.client.name}
                          </span>
                          <span className="block truncate text-moss-600">
                            {a.services.map((s) => s.service.name).join(', ')}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1">
                            <StatusBadge status={a.status} />
                            {(alerts.get(a.client.id)?.length ?? 0) > 0 && (
                              <span className="badge bg-clay-500 text-white" title="Health alert">
                                ⚕ alert
                              </span>
                            )}
                          </span>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="mt-4">
          <h2 className="section-title mb-2">Unassigned bookings</h2>
          <div className="card divide-y divide-sand-100">
            {unassigned.map((a) => (
              <Link key={a.id} href={`/portal/appointments/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sand-50">
                <span className="text-sm">
                  <strong>{formatTimeManila(a.startAt)}</strong> · {a.client.name} ·{' '}
                  {a.services.map((s) => s.service.name).join(', ')}
                </span>
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- week */

async function WeekView({ branchId, dateKey }: { branchId: string; dateKey: string }) {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const startKey = addDaysToKey(dateKey, -weekday);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(startKey, i));

  const appointments = await prisma.appointment.findMany({
    where: {
      branchId,
      startAt: { gte: manilaInstant(startKey, 0), lt: manilaInstant(days[6], 1440) },
      status: { notIn: ['EXPIRED'] },
    },
    include: {
      client: { select: { name: true } },
      services: { include: { service: { select: { name: true } }, employee: { select: { name: true } } } },
    },
    orderBy: { startAt: 'asc' },
  });

  return (
    <div>
      <DayNav dateKey={dateKey} view="week" step={7} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => {
          const items = appointments.filter((a) => manilaDateKey(a.startAt) === d);
          const isToday = d === manilaDateKey();
          return (
            <div key={d} className={`card p-3 ${isToday ? 'border-moss-400' : ''}`}>
              <Link href={`/portal/appointments?view=day&date=${d}`} className="mb-2 block">
                <p className="text-xs font-semibold uppercase tracking-wide text-moss-500">
                  {formatDateKey(d).slice(0, 3)}
                </p>
                <p className="text-sm font-semibold text-moss-800">{d.slice(-2)}</p>
                <p className="text-[11px] text-moss-400">{items.length} booking(s)</p>
              </Link>
              <ul className="space-y-1">
                {items.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link href={`/portal/appointments/${a.id}`} className="block rounded-lg bg-sand-100 px-2 py-1 text-[11px] leading-tight hover:bg-sand-200">
                      <span className="font-semibold">{formatTimeManila(a.startAt)}</span>{' '}
                      {a.client.name}
                      <span className="block truncate text-moss-500">
                        {a.services[0]?.employee?.name ?? 'unassigned'}
                      </span>
                    </Link>
                  </li>
                ))}
                {items.length > 6 && (
                  <li className="text-[11px] text-moss-400">+{items.length - 6} more</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- month */

async function MonthView({ branchId, monthKey }: { branchId: string; monthKey: string }) {
  const { fromKey, toKey } = monthBounds(monthKey);
  const appointments = await prisma.appointment.findMany({
    where: {
      branchId,
      startAt: { gte: manilaInstant(fromKey, 0), lt: manilaInstant(toKey, 1440) },
      status: { notIn: ['EXPIRED'] },
    },
    select: { id: true, startAt: true, status: true },
  });

  const counts = new Map<string, { total: number; pending: number }>();
  for (const a of appointments) {
    const key = manilaDateKey(a.startAt);
    const prev = counts.get(key) ?? { total: 0, pending: 0 };
    counts.set(key, {
      total: prev.total + 1,
      pending: prev.pending + (a.status === 'PENDING' ? 1 : 0),
    });
  }

  const firstWeekday = new Date(`${fromKey}T00:00:00Z`).getUTCDay();
  const daysInMonth = Number(toKey.slice(-2));
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`),
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/portal/appointments?view=month&month=${addMonthsToKey(monthKey, -1)}`} className="btn-secondary btn-sm">
          ← Previous
        </Link>
        <p className="font-display text-lg font-semibold text-moss-800">{formatMonthKey(monthKey)}</p>
        <Link href={`/portal/appointments?view=month&month=${addMonthsToKey(monthKey, 1)}`} className="btn-secondary btn-sm">
          Next →
        </Link>
      </div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-sand-200 bg-sand-50 text-center text-[11px] font-semibold uppercase tracking-wide text-moss-500">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((key, i) => {
            if (!key) return <div key={`empty-${i}`} className="min-h-20 border-b border-r border-sand-100" />;
            const c = counts.get(key);
            const isToday = key === manilaDateKey();
            return (
              <Link
                key={key}
                href={`/portal/appointments?view=day&date=${key}`}
                className={`min-h-20 border-b border-r border-sand-100 p-2 transition hover:bg-sand-50 ${
                  isToday ? 'bg-moss-50' : ''
                }`}
              >
                <span className="text-xs font-semibold text-moss-700">{Number(key.slice(-2))}</span>
                {c && (
                  <span className="mt-1 block text-[11px] text-moss-500">
                    {c.total} booking{c.total === 1 ? '' : 's'}
                    {c.pending > 0 && (
                      <span className="mt-0.5 block font-semibold text-clay-500">
                        {c.pending} pending
                      </span>
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- list */

async function ListView({ branchId, status }: { branchId: string; status?: string }) {
  const appointments = await prisma.appointment.findMany({
    where: {
      branchId,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      client: { select: { name: true, mobile: true } },
      resource: { select: { name: true } },
      services: { include: { service: { select: { name: true } }, employee: { select: { name: true } } } },
    },
    orderBy: { startAt: 'desc' },
    take: 200,
  });

  const statuses = ['', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {statuses.map((s) => (
          <Link
            key={s || 'all'}
            href={`/portal/appointments?view=list${s ? `&status=${s}` : ''}`}
            className={`badge ${status === s || (!status && !s) ? 'bg-moss-600 text-white' : 'bg-sand-200 text-moss-600'}`}
          >
            {s ? s.replaceAll('_', ' ').toLowerCase() : 'all'}
          </Link>
        ))}
      </div>
      {appointments.length === 0 ? (
        <EmptyState title="No appointments match" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Client</th>
                <th>Services</th>
                <th>Therapist</th>
                <th>Room</th>
                <th>Source</th>
                <th className="text-right">Deposit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/portal/appointments/${a.id}`} className="font-medium text-moss-800 hover:underline">
                      {formatManila(a.startAt, { time: true })}
                    </Link>
                  </td>
                  <td>
                    {a.client.name}
                    <span className="block text-xs text-moss-400">{a.client.mobile}</span>
                  </td>
                  <td className="text-xs text-moss-600">
                    {a.services.map((s) => s.service.name).join(', ')}
                  </td>
                  <td className="text-xs">{a.services[0]?.employee?.name ?? '—'}</td>
                  <td className="text-xs">{a.resource?.name ?? '—'}</td>
                  <td className="text-xs capitalize">{a.source.replaceAll('_', ' ').toLowerCase()}</td>
                  <td className="num text-right text-xs">
                    {a.depositAmountCents ? formatPeso(a.depositPaidCents || a.depositAmountCents) : '—'}
                    {a.depositAmountCents > 0 && (
                      <span className="block text-[10px] text-moss-400">
                        {a.depositStatus.replaceAll('_', ' ').toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DayNav({ dateKey, view, step = 1 }: { dateKey: string; view: View; step?: number }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <Link
        href={`/portal/appointments?view=${view}&date=${addDaysToKey(dateKey, -step)}`}
        className="btn-secondary btn-sm"
      >
        ← Previous
      </Link>
      <div className="text-center">
        <p className="font-display text-base font-semibold text-moss-800">{formatDateKey(dateKey)}</p>
        {dateKey !== manilaDateKey() && (
          <Link href={`/portal/appointments?view=${view}&date=${manilaDateKey()}`} className="text-xs text-moss-500 underline underline-offset-4">
            Jump to today
          </Link>
        )}
      </div>
      <Link
        href={`/portal/appointments?view=${view}&date=${addDaysToKey(dateKey, step)}`}
        className="btn-secondary btn-sm"
      >
        Next →
      </Link>
    </div>
  );
}
