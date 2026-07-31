import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { manilaMonthKey, monthBounds, dateKeyToBusinessDate } from '@/lib/datetime';
import { PageHeader, EmptyState, StatusBadge, Tabs } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Employees' };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('employees.attendance');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const canManage = can(user.role, 'employees.view');

  // A receptionist only needs the attendance screen.
  if (!canManage) {
    const employees = await prisma.employee.findMany({
      where: { branchId, active: true },
      orderBy: [{ employeeRole: 'asc' }, { name: 'asc' }],
    });
    return (
      <div>
        <PageHeader
          title="Employees"
          subtitle="You can log attendance. Records, pay and performance are managed by the Owner and Manager."
          actions={
            <Link href="/portal/employees/attendance" className="btn-primary btn-sm">
              Log attendance
            </Link>
          }
        />
        <div className="card divide-y divide-sand-100">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-cocoa-800">{e.name}</span>
              <span className="text-xs capitalize text-cocoa-400">
                {e.employeeRole.toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const monthKey = manilaMonthKey();
  const { fromKey, toKey } = monthBounds(monthKey);

  const employees = await prisma.employee.findMany({
    where: { branchId },
    include: {
      skills: true,
      attendances: {
        where: {
          workDate: { gte: dateKeyToBusinessDate(fromKey), lte: dateKeyToBusinessDate(toKey) },
        },
      },
      commissions: {
        where: {
          businessDate: { gte: dateKeyToBusinessDate(fromKey), lte: dateKeyToBusinessDate(toKey) },
        },
      },
      feedback: true,
      loans: { where: { status: 'ACTIVE' } },
    },
    orderBy: [{ active: 'desc' }, { employeeRole: 'asc' }, { name: 'asc' }],
  });

  const tabs = [
    { href: '/portal/employees', label: 'Team' },
    { href: '/portal/employees/attendance', label: 'Attendance' },
    ...(can(user.role, 'payroll.view') ? [{ href: '/portal/employees/payroll', label: 'Payroll' }] : []),
    ...(can(user.role, 'incentives.view') ? [{ href: '/portal/employees/incentives', label: 'Incentives' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${employees.filter((e) => e.active).length} active`}
        actions={
          <Link href="/portal/employees/new" className="btn-primary btn-sm">
            + Add employee
          </Link>
        }
      />
      <Tabs tabs={tabs} current="/portal/employees" />

      {employees.length === 0 ? (
        <EmptyState title="No employees yet" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="text-right">Days (MTD)</th>
                <th className="text-right">Late</th>
                <th className="text-right">Commissions (MTD)</th>
                <th className="text-right">Rating</th>
                <th>Skills</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const ratings = e.feedback.map((f) => f.rating);
                const avg = ratings.length
                  ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
                  : null;
                return (
                  <tr key={e.id} className={e.active ? '' : 'opacity-60'}>
                    <td>
                      <Link href={`/portal/employees/${e.id}`} className="font-medium text-cocoa-800 hover:underline">
                        {e.name}
                      </Link>
                      {e.loans.length > 0 && (
                        <span className="block text-[11px] text-clay-500">
                          {e.loans.length} active loan(s)
                        </span>
                      )}
                    </td>
                    <td className="text-xs capitalize text-cocoa-600">
                      {e.employeeRole.toLowerCase()}
                    </td>
                    <td className="num text-right">
                      {e.attendances.filter((a) => a.timeIn).length}
                    </td>
                    <td className="num text-right text-clay-500">
                      {e.attendances.filter((a) => a.isLate).length || ''}
                    </td>
                    <td className="num text-right">
                      {formatPeso(e.commissions.reduce((a, c) => a + c.amountCents, 0))}
                    </td>
                    <td className="num text-right">{avg ? `${avg} ★` : '—'}</td>
                    <td className="text-xs text-cocoa-400">{e.skills.length} service(s)</td>
                    <td>
                      <StatusBadge status={e.active ? 'ACTIVE' : 'CANCELLED'} label={e.active ? 'active' : 'inactive'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
