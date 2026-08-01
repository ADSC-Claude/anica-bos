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

      <div className="mb-4">
        <Alert tone="info">
          The order of time-in sets today&apos;s <strong>rotation queue</strong> for walk-ins and
          &ldquo;no preference&rdquo; online bookings — and only timed-in therapists appear as
          available on the public booking form.
        </Alert>
      </div>

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
