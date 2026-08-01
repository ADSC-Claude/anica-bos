import Link from 'next/link';
import { bookingFor } from '@/lib/party';
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
import { shownName } from '@/lib/people';
import { effectiveWindow } from '@/lib/itinerary';

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
  const [appointments, therapists, places] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        branchId,
        startAt: { gte: manilaInstant(dateKey, 0), lt: manilaInstant(dateKey, 1440) },
        status: { notIn: ['EXPIRED'] },
      },
      include: {
        client: { select: { id: true, name: true } },
        resource: { select: { name: true } },
        services: {
          include: {
            service: { select: { name: true } },
            employee: { select: { id: true, name: true, displayName: true } },
            resource: { select: { name: true } },
          },
          orderBy: { sortRank: 'asc' },
        },
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
    prisma.resource.findMany({
      where: { branchId, active: true },
      select: { id: true, name: true, type: true, capacity: true },
      orderBy: [{ sortRank: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const alerts = await medicalAlertsFor(appointments.map((a) => a.client.id));

  // Therapist columns = who is on duty, plus anyone booked that day.
  const columns = new Map<string, string>();
  for (const a of therapists) columns.set(a.employee.id, shownName(a.employee));
  for (const appt of appointments) {
    for (const s of appt.services) {
      if (s.employee) columns.set(s.employee.id, shownName(s.employee));
    }
  }
  const columnList = [...columns.entries()];
  const unassigned = appointments.filter((a) => a.services.every((s) => !s.employee));

  const hours: number[] = [];
  for (let m = branch.openMinute; m < branch.closeMinute; m += 60) hours.push(m);

  return (
    <div>
      <DayNav dateKey={dateKey} view="day" />

      {/* The day is two questions — who is free, and where they can be put —
          and the desk answers both at once for a walk-in. The calendar keeps
          its therapist columns; the floor stands beside it rather than
          replacing them. Only the day has this: a week of nine places is a
          column count nothing can read. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
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
              className="grid border-b border-sand-200 bg-sand-50 text-[11px] font-semibold uppercase tracking-wide text-cocoa-500"
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
                <div className="px-2 py-1.5 text-[11px] num text-cocoa-400">
                  {minutesToLabel(hourMinute)}
                </div>
                {columnList.map(([id]) => {
                  // One block per *treatment*, not per visit. A guest booked for
                  // a sauna at 1:30 and a massage at 2:20 belongs in two rows of
                  // the calendar, in two different places — drawing her as a
                  // single block from 1:30 to 3:20 hides the bed she is not on
                  // yet and the sauna she has already left.
                  const inHour = appointments.flatMap((a) =>
                    a.services
                      .filter((sv) => {
                        if (sv.employee?.id !== id) return false;
                        const w = effectiveWindow(sv);
                        if (!w) return false;
                        const start = manilaMinuteOfDay(w.start);
                        return start >= hourMinute && start < hourMinute + 60;
                      })
                      .map((sv) => ({ a, sv, w: effectiveWindow(sv)! })),
                  );
                  return (
                    <div key={id} className="min-h-12 border-l border-sand-100 p-1">
                      {inHour.map(({ a, sv, w }) => {
                        const running = Boolean(sv.actualStartAt) && !sv.actualEndAt;
                        const logged = Boolean(sv.actualStartAt || sv.actualEndAt);
                        return (
                          <Link
                            key={sv.id}
                            href={`/portal/appointments/${a.id}`}
                            className={`mb-1 block rounded-lg px-2 py-1 text-[11px] leading-tight text-cocoa-800 ${
                              running
                                ? 'bg-gilt-500/25 hover:bg-gilt-500/40'
                                : 'bg-cocoa-100 hover:bg-cocoa-200'
                            }`}
                          >
                            <span className="num block font-semibold">
                              {formatTimeManila(w.start)}–{formatTimeManila(w.end)}
                              {logged && (
                                <span className="ml-1 font-normal text-cocoa-500" title="actual time">
                                  ●
                                </span>
                              )}
                            </span>
                            <span className="block truncate font-medium">{a.client.name}</span>
                            <span className="block truncate text-cocoa-600">
                              {sv.service.name}
                              {sv.resource ? ` · ${sv.resource.name}` : ''}
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
                        );
                      })}
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

        <FloorPanel dateKey={dateKey} places={places} appointments={appointments} />
      </div>
    </div>
  );
}

/**
 * The floor for one day: every place, and who is on it when.
 *
 * Beside the calendar rather than inside it. The calendar answers "who is
 * free at four"; this answers "which bed is free at four", and a walk-in at
 * the desk needs both at once. Reading it should never require opening a
 * booking.
 */
function FloorPanel({
  dateKey,
  places,
  appointments,
}: {
  dateKey: string;
  places: { id: string; name: string; type: string; capacity: number }[];
  appointments: {
    id: string;
    resourceId: string | null;
    startAt: Date;
    endAt: Date;
    client: { name: string };
    services: {
      resourceId: string | null;
      startAt: Date | null;
      endAt: Date | null;
      actualStartAt: Date | null;
      actualEndAt: Date | null;
      service: { name: string };
    }[];
  }[];
}) {
  const isToday = dateKey === manilaDateKey();
  const nowMinute = manilaMinuteOfDay(new Date());

  /**
   * Who is on each place, treatment by treatment.
   *
   * A visit is a sequence now — sauna at six, bed at half past — so the place
   * is held per treatment, not per booking. Reading the appointment's own
   * resourceId would show only the first of them and quietly free the rest.
   * What actually happened wins over what was planned, which is how a
   * treatment that ran long keeps its bed.
   *
   * A booking holding a place with no treatments listed still holds it for its
   * whole window; that is the room blocked for cleaning, and availability
   * counts it the same way.
   */
  const holdsFor = (placeId: string) => {
    const out: { key: string; id: string; at: Date; until: Date; who: string; what: string }[] = [];
    for (const a of appointments) {
      if (a.services.length === 0) {
        if (a.resourceId === placeId) {
          out.push({
            key: a.id, id: a.id, at: a.startAt, until: a.endAt,
            who: a.client.name, what: 'Held',
          });
        }
        continue;
      }
      a.services.forEach((s, i) => {
        if (s.resourceId !== placeId) return;
        const at = s.actualStartAt ?? s.startAt;
        const until = s.actualEndAt ?? s.endAt;
        if (!at || !until) return;
        out.push({
          key: `${a.id}-${i}`, id: a.id, at, until,
          who: a.client.name, what: s.service.name,
        });
      });
    }
    return out.sort((x, y) => x.at.getTime() - y.at.getTime());
  };

  // Booked, but no treatment has been given a place — and the booking itself
  // has none either. These are the ones to settle before the guests arrive.
  const noPlaceYet = appointments.filter(
    (a) => !a.resourceId && a.services.every((s) => !s.resourceId),
  );

  if (places.length === 0) {
    return (
      <div className="card-pad">
        <h2 className="section-title mb-1">Floor</h2>
        <p className="muted text-sm">
          No rooms or beds set up yet — add them in Settings &rarr; Rooms &amp; beds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card-pad">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="section-title">Floor</h2>
          <span className="text-[11px] text-cocoa-400">
            {isToday ? `now ${minutesToLabel(nowMinute)}` : formatDateKey(dateKey)}
          </span>
        </div>

        <ul className="space-y-2">
          {places.map((p) => {
            const holds = holdsFor(p.id);

            // "Busy now" only means anything on today. On any other day the
            // honest answer is the list, not a live state.
            const onItNow = isToday
              ? holds.find(
                  (h) =>
                    manilaMinuteOfDay(h.at) <= nowMinute && manilaMinuteOfDay(h.until) > nowMinute,
                )
              : undefined;
            const next = isToday
              ? holds.find((h) => manilaMinuteOfDay(h.at) > nowMinute)
              : undefined;

            return (
              <li key={p.id} className="rounded-xl border border-sand-200 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-cocoa-800">
                    {p.name}
                    {p.capacity > 1 && (
                      <span className="ml-1 text-[11px] font-normal text-cocoa-400">
                        holds {p.capacity}
                      </span>
                    )}
                  </span>
                  {isToday && (
                    <StatusBadge
                      status={onItNow ? 'CANCELLED' : 'ACTIVE'}
                      label={onItNow ? `until ${formatTimeManila(onItNow.until)}` : 'free'}
                    />
                  )}
                </div>

                {holds.length === 0 ? (
                  <p className="mt-1 text-[11px] text-cocoa-400">Nothing booked all day.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {holds.map((h) => (
                      <li key={h.key} className="text-[11px] leading-tight">
                        <Link
                          href={`/portal/appointments/${h.id}`}
                          className={`block truncate rounded px-1 py-0.5 hover:bg-sand-100 ${
                            h.key === onItNow?.key ? 'bg-cocoa-100 text-cocoa-800' : 'text-cocoa-600'
                          }`}
                          title={`${h.who} — ${h.what}`}
                        >
                          <span className="num">{formatTimeManila(h.at)}</span> {h.who}
                          <span className="text-cocoa-400"> · {h.what}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {isToday && !onItNow && next && (
                  <p className="mt-1 text-[11px] text-cocoa-400">
                    Next at {formatTimeManila(next.at)}.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {noPlaceYet.length > 0 && (
        <div className="card-pad">
          <h2 className="section-title mb-1">No place yet</h2>
          <p className="mb-2 text-[11px] text-cocoa-400">
            Booked, but nothing has been given a bed or chair. Assign one before the guest arrives.
          </p>
          <ul className="space-y-1">
            {noPlaceYet.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/portal/appointments/${a.id}`}
                  className="block truncate rounded px-1 py-0.5 text-[11px] text-cocoa-600 hover:bg-sand-100"
                >
                  <span className="num">{formatTimeManila(a.startAt)}</span> {a.client.name}
                </Link>
              </li>
            ))}
          </ul>
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
            <div key={d} className={`card p-3 ${isToday ? 'border-cocoa-400' : ''}`}>
              <Link href={`/portal/appointments?view=day&date=${d}`} className="mb-2 block">
                <p className="text-xs font-semibold uppercase tracking-wide text-cocoa-500">
                  {formatDateKey(d).slice(0, 3)}
                </p>
                <p className="text-sm font-semibold text-cocoa-800">{d.slice(-2)}</p>
                <p className="text-[11px] text-cocoa-400">{items.length} booking(s)</p>
              </Link>
              <ul className="space-y-1">
                {items.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link href={`/portal/appointments/${a.id}`} className="block rounded-lg bg-sand-100 px-2 py-1 text-[11px] leading-tight hover:bg-sand-200">
                      <span className="font-semibold">{formatTimeManila(a.startAt)}</span>{' '}
                      {bookingFor(a)}
                      <span className="block truncate text-cocoa-500">
                        {a.services[0]?.employee?.name ?? 'unassigned'}
                      </span>
                    </Link>
                  </li>
                ))}
                {items.length > 6 && (
                  <li className="text-[11px] text-cocoa-400">+{items.length - 6} more</li>
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
        <p className="font-display text-lg font-semibold text-cocoa-800">{formatMonthKey(monthKey)}</p>
        <Link href={`/portal/appointments?view=month&month=${addMonthsToKey(monthKey, 1)}`} className="btn-secondary btn-sm">
          Next →
        </Link>
      </div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-sand-200 bg-sand-50 text-center text-[11px] font-semibold uppercase tracking-wide text-cocoa-500">
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
                  isToday ? 'bg-cocoa-50' : ''
                }`}
              >
                <span className="text-xs font-semibold text-cocoa-700">{Number(key.slice(-2))}</span>
                {c && (
                  <span className="mt-1 block text-[11px] text-cocoa-500">
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
            className={`badge ${status === s || (!status && !s) ? 'bg-cocoa-600 text-white' : 'bg-sand-200 text-cocoa-600'}`}
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
                    <Link href={`/portal/appointments/${a.id}`} className="font-medium text-cocoa-800 hover:underline">
                      {formatManila(a.startAt, { time: true })}
                    </Link>
                  </td>
                  <td>
                    {bookingFor(a)}
                    {/* A guest is on the bed, but the booker is who to call. */}
                    <span className="block text-xs text-cocoa-400">
                      {a.guestName ? `with ${a.client.name}` : a.client.mobile}
                    </span>
                  </td>
                  <td className="text-xs text-cocoa-600">
                    {a.services.map((s) => s.service.name).join(', ')}
                  </td>
                  <td className="text-xs">{a.services[0]?.employee?.name ?? '—'}</td>
                  <td className="text-xs">{a.resource?.name ?? '—'}</td>
                  <td className="text-xs capitalize">{a.source.replaceAll('_', ' ').toLowerCase()}</td>
                  <td className="num text-right text-xs">
                    {a.depositAmountCents ? formatPeso(a.depositPaidCents || a.depositAmountCents) : '—'}
                    {a.depositAmountCents > 0 && (
                      <span className="block text-[10px] text-cocoa-400">
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
        <p className="font-display text-base font-semibold text-cocoa-800">{formatDateKey(dateKey)}</p>
        {dateKey !== manilaDateKey() && (
          <Link href={`/portal/appointments?view=${view}&date=${manilaDateKey()}`} className="text-xs text-cocoa-500 underline underline-offset-4">
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
