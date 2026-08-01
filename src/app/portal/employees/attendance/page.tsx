import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import {
  addDaysToKey,
  dateKeyToBusinessDate,
  formatDateKey,
  formatTimeManila,
  manilaDateKey,
} from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, Tabs, Alert } from '@/components/ui';
import { attendanceAction } from '../actions';
import { shownName } from '@/lib/people';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attendance' };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branchId?: string }>;
}) {
  const user = await requirePage('employees.attendance');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const dateKey = params.date ?? manilaDateKey();
  const isToday = dateKey === manilaDateKey();
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();

  const employees = await prisma.employee.findMany({
    where: { branchId, active: true },
    include: {
      attendances: { where: { workDate: dateKeyToBusinessDate(dateKey) } },
      schedules: { where: { dayOfWeek: weekday } },
    },
    orderBy: [{ employeeRole: 'asc' }, { name: 'asc' }],
  });

  const timedIn = employees.filter((e) => e.attendances[0]?.timeIn);
  const absent = employees.filter((e) => e.attendances[0]?.isAbsent);
  const late = employees.filter((e) => e.attendances[0]?.isLate);

  const tabs = [
    { href: '/portal/employees', label: 'Team' },
    { href: '/portal/employees/attendance', label: 'Attendance' },
    ...(can(user.role, 'payroll.view') ? [{ href: '/portal/employees/payroll', label: 'Payroll' }] : []),
    ...(can(user.role, 'incentives.view') ? [{ href: '/portal/employees/incentives', label: 'Incentives' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle={formatDateKey(dateKey)}
        actions={
          <div className="flex gap-2">
            <Link href={`/portal/employees/attendance?date=${addDaysToKey(dateKey, -1)}`} className="btn-secondary btn-sm">
              ←
            </Link>
            <form action="/portal/employees/attendance">
              <input type="date" name="date" defaultValue={dateKey} className="input w-auto" />
            </form>
            <Link href={`/portal/employees/attendance?date=${addDaysToKey(dateKey, 1)}`} className="btn-secondary btn-sm">
              →
            </Link>
          </div>
        }
      />
      <Tabs tabs={tabs} current="/portal/employees/attendance" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Timed in" value={String(timedIn.length)} tone="good" />
        <StatCard label="Late" value={String(late.length)} tone={late.length ? 'warn' : 'default'} />
        <StatCard label="Absent" value={String(absent.length)} tone={absent.length ? 'bad' : 'default'} />
        <StatCard label="Not yet logged" value={String(employees.length - timedIn.length - absent.length)} />
      </div>

      {/* What this screen actually controls. It looks like a register and is
          not one: four separate things downstream read it, and none of them is
          obvious from a list of names and times. */}
      <details className="card-pad mb-4" open={!timedIn.length}>
        <summary className="cursor-pointer text-sm font-semibold text-cocoa-800">
          What timing in and out actually does
        </summary>
        <ul className="mt-2 space-y-2 text-sm text-cocoa-600">
          <li>
            <strong className="text-cocoa-800">It decides who can be booked today.</strong> A
            therapist who is not timed in is <em>not offered</em> on the public booking form or in
            the portal for today, however free she looks. Timing out ends it — she stops being
            offered for the rest of the day. This applies to <em>today and past days only</em>;
            future dates use her rest days from her employee record instead.
          </li>
          <li>
            <strong className="text-cocoa-800">The order of time-in is the queue.</strong> First
            in is first offered for walk-ins and &ldquo;no preference&rdquo; bookings, then it
            rotates by who has served fewest that day. Timing in early genuinely matters to a
            therapist&apos;s takings.
          </li>
          <li>
            <strong className="text-cocoa-800">Late is calculated, not typed.</strong> Timing in
            after opening plus the grace period marks the day late and records the minutes.
            Payroll turns that into the deduction set in Settings → Payroll. Nobody decides
            &ldquo;late&rdquo; by hand.
          </li>
          <li>
            <strong className="text-cocoa-800">It is what payroll counts.</strong> Days with a
            time-in are the days paid; days marked absent are deducted. A day never logged is
            neither — it simply does not exist, which is why an unlogged shift is worse than a
            late one.
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-cocoa-400">
          Marked the wrong person, or forgot? Log it on the day it happened — use the arrows above
          to go back to that date. Payroll reads the log, not the day it was typed.
        </p>
      </details>

      <div className="card divide-y divide-sand-100">
        {employees.map((e) => {
          const a = e.attendances[0];
          const dayOff = e.schedules[0]?.isDayOff;
          return (
            <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-40 flex-1">
                <Link href={`/portal/employees/${e.id}`} className="text-sm font-medium text-cocoa-800 hover:underline">
                  {shownName(e)}
                </Link>
                <p className="text-xs capitalize text-cocoa-400">
                  {e.employeeRole.toLowerCase()}
                  {dayOff && ' · scheduled day off'}
                </p>
              </div>

              <div className="flex min-w-40 flex-col text-xs text-cocoa-600">
                {a?.timeIn && (
                  <span>
                    In {formatTimeManila(a.timeIn)}
                    {a.rotationRank > 0 && (
                      <span className="ml-1 rounded-full bg-sand-200 px-1.5 py-0.5 text-[10px] font-bold">
                        #{a.rotationRank}
                      </span>
                    )}
                  </span>
                )}
                {a?.timeOut && <span>Out {formatTimeManila(a.timeOut)}</span>}
                {a?.isLate && <span className="text-clay-500">Late by {a.lateMinutes} min</span>}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {a?.isAbsent ? (
                  <StatusBadge status="BAD" label="absent" />
                ) : a?.timeOut ? (
                  <StatusBadge status="CANCELLED" label="timed out" />
                ) : a?.onBreak ? (
                  <StatusBadge status="WARN" label="on break" />
                ) : a?.timeIn ? (
                  <StatusBadge status="OK" label="on duty" />
                ) : null}

                {!a?.timeIn && !a?.isAbsent && (
                  <>
                    <Action branchId={branchId} employeeId={e.id} dateKey={dateKey} action="time_in" label="Time in" primary />
                    <Action branchId={branchId} employeeId={e.id} dateKey={dateKey} action="absent" label="Absent" />
                  </>
                )}
                {a?.timeIn && !a.timeOut && (
                  <>
                    <Action branchId={branchId} employeeId={e.id} dateKey={dateKey} action="break" label={a.onBreak ? 'End break' : 'Break'} />
                    <Action branchId={branchId} employeeId={e.id} dateKey={dateKey} action="time_out" label="Time out" primary />
                  </>
                )}
                {(a?.timeIn || a?.isAbsent) && !isToday && (
                  <Action branchId={branchId} employeeId={e.id} dateKey={dateKey} action="clear" label="Clear" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Action({
  branchId,
  employeeId,
  dateKey,
  action,
  label,
  primary,
}: {
  branchId: string;
  employeeId: string;
  dateKey: string;
  action: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={attendanceAction}>
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="dateKey" value={dateKey} />
      <input type="hidden" name="action" value={action} />
      <button className={primary ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} type="submit">
        {label}
      </button>
    </form>
  );
}
