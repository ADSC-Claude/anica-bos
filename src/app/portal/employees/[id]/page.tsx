import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { formatManila, manilaMonthKey, monthBounds, dateKeyToBusinessDate } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState } from '@/components/ui';
import { EmployeeForm } from '@/components/employee-form';
import { LoanForm } from './loan-form';

export const dynamic = 'force-dynamic';

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePage('employees.view');
  const { id } = await params;
  const { tab = 'overview' } = await searchParams;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true } },
      skills: { include: { service: { select: { name: true } } } },
      schedules: { orderBy: { dayOfWeek: 'asc' } },
      loans: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
      certifications: true,
      feedback: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!employee) notFound();

  const settings = await getSettings(employee.branchId);
  const canSeePay = !employee.payOwnerOnly || can(user.role, 'payroll.ownerOnlyPay');
  const canSeeGov = can(user.role, 'employees.govNumbers');

  const monthKey = manilaMonthKey();
  const { fromKey, toKey } = monthBounds(monthKey);
  const from = dateKeyToBusinessDate(fromKey);
  const to = dateKeyToBusinessDate(toKey);

  const [commissions, attendance, servicesDone, rebooking, services] = await Promise.all([
    prisma.commission.aggregate({
      where: { employeeId: id, businessDate: { gte: from, lte: to } },
      _sum: { amountCents: true, basisCents: true },
      _count: { _all: true },
    }),
    prisma.attendance.findMany({
      where: { employeeId: id, workDate: { gte: from, lte: to } },
      orderBy: { workDate: 'desc' },
    }),
    prisma.saleLine.count({
      where: {
        employeeId: id,
        sale: { status: 'PAID', businessDate: { gte: from, lte: to } },
      },
    }),
    prisma.appointmentService.findMany({
      where: { employeeId: id, appointment: { status: 'COMPLETED' } },
      select: { appointment: { select: { clientId: true } } },
    }),
    prisma.service.findMany({
      where: { active: true },
      include: { category: { select: { name: true, sortRank: true } } },
      orderBy: [{ category: { sortRank: 'asc' } }, { sortRank: 'asc' }],
    }),
  ]);

  const clientIds = rebooking.map((r) => r.appointment.clientId);
  const uniqueClients = new Set(clientIds).size;
  const rebookRate = uniqueClients
    ? Math.round(((clientIds.length - uniqueClients) / clientIds.length) * 100)
    : 0;
  const ratings = employee.feedback.map((f) => f.rating);
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tabs: [string, string][] = [
    ['overview', 'Overview'],
    ['attendance', 'Attendance'],
    ...(can(user.role, 'employees.loans') ? ([['loans', 'Loans']] as [string, string][]) : []),
    ['edit', 'Edit'],
  ];

  return (
    <div>
      <PageHeader
        title={employee.name}
        subtitle={`${employee.employeeRole.toLowerCase()} · ${employee.branch.name} · hired ${formatManila(employee.hireDate)}`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Services done (MTD)" value={String(servicesDone)} />
        <StatCard
          label="Revenue generated (MTD)"
          value={formatPeso(commissions._sum.basisCents ?? 0)}
          hint="at undiscounted list price"
        />
        <StatCard
          label="Commissions (MTD)"
          value={formatPeso(commissions._sum.amountCents ?? 0)}
          hint={`${commissions._count._all} line(s)`}
        />
        <StatCard
          label="Average rating"
          value={avgRating ? `${avgRating} ★` : '—'}
          hint={`Rebooking rate ${rebookRate}%`}
        />
      </div>

      <nav className="my-5 flex gap-1 overflow-x-auto border-b border-sand-200">
        {tabs.map(([key, label]) => (
          <a
            key={key}
            href={`/portal/employees/${employee.id}?tab=${key}`}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === key ? 'border-moss-600 text-moss-800' : 'border-transparent text-moss-400'
            }`}
          >
            {label}
          </a>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-pad">
            <h2 className="section-title mb-3">Details</h2>
            <dl className="space-y-1.5 text-sm">
              <Row label="Mobile" value={employee.mobile || '—'} />
              <Row label="Email" value={employee.email || '—'} />
              <Row label="Address" value={employee.address || '—'} />
              <Row label="Emergency" value={`${employee.emergencyName || '—'} ${employee.emergencyMobile}`} />
              {canSeeGov && (
                <>
                  <Row label="SSS" value={employee.sssNumber || '—'} />
                  <Row label="PhilHealth" value={employee.philhealthNumber || '—'} />
                  <Row label="Pag-IBIG" value={employee.pagibigNumber || '—'} />
                  <Row label="TIN" value={employee.tin || '—'} />
                </>
              )}
              {canSeePay && (
                <Row
                  label="Pay"
                  value={`${formatPeso(employee.payRateCents)} ${
                    employee.payType === 'FIXED_SALARY' ? 'per period' : 'per day'
                  }`}
                />
              )}
              {!canSeePay && <Row label="Pay" value="Owner-only — hidden" />}
            </dl>
          </div>

          <div className="space-y-4">
            <div className="card-pad">
              <h2 className="section-title mb-2">Skills</h2>
              {employee.skills.length === 0 ? (
                <p className="muted">No services assigned yet — this therapist will not be offered for bookings.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {employee.skills.map((s) => (
                    <li key={s.id} className="badge bg-sand-200 text-moss-700">{s.service.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card-pad">
              <h2 className="section-title mb-2">Default schedule</h2>
              <ul className="space-y-1 text-sm">
                {employee.schedules.map((s) => (
                  <li key={s.id} className="flex justify-between">
                    <span className="text-moss-600">{DAYS[s.dayOfWeek]}</span>
                    <span className={s.isDayOff ? 'text-clay-500' : 'text-moss-700'}>
                      {s.isDayOff ? 'Day off' : 'Working'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {employee.certifications.length > 0 && (
              <div className="card-pad">
                <h2 className="section-title mb-2">Certifications</h2>
                <ul className="space-y-1 text-sm">
                  {employee.certifications.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <span className="text-moss-700">{c.name}</span>
                      <span className="text-xs text-moss-400">
                        {c.expiryDate ? `expires ${formatManila(c.expiryDate)}` : 'no expiry'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>In</th>
                <th>Out</th>
                <th className="text-right">Queue #</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.id}>
                  <td>{a.workDate.toISOString().slice(0, 10)}</td>
                  <td className="num">{a.timeIn ? formatManila(a.timeIn, { time: true }).split(', ')[1] : '—'}</td>
                  <td className="num">{a.timeOut ? formatManila(a.timeOut, { time: true }).split(', ')[1] : '—'}</td>
                  <td className="num text-right">{a.rotationRank || '—'}</td>
                  <td>
                    {a.isAbsent && <StatusBadge status="BAD" label="absent" />}
                    {a.isLate && <StatusBadge status="WARN" label={`late ${a.lateMinutes}m`} />}
                  </td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-moss-400">
                    No attendance recorded this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'loans' && can(user.role, 'employees.loans') && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h2 className="section-title mb-3">Active &amp; past loans</h2>
            {employee.loans.length === 0 ? (
              <EmptyState title="No loans or cash advances" />
            ) : (
              <ul className="space-y-2">
                {employee.loans.map((l) => (
                  <li key={l.id} className="card-pad">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize text-moss-800">
                        {l.type.replaceAll('_', ' ').toLowerCase()}
                      </span>
                      <StatusBadge status={l.status} />
                    </div>
                    <dl className="mt-2 space-y-1 text-sm">
                      <Row label="Principal" value={formatPeso(l.principalCents)} />
                      <Row label="Per payroll" value={formatPeso(l.installmentCents)} />
                      <Row label="Balance" value={formatPeso(l.balanceCents)} />
                      <Row label="Started" value={formatManila(l.startDate)} />
                    </dl>
                    {l.payments.length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-moss-500">
                          {l.payments.length} payment(s)
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {l.payments.map((p) => (
                            <li key={p.id} className="flex justify-between">
                              <span>{formatManila(p.paidAt)}</span>
                              <span className="num">{formatPeso(p.amountCents)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="section-title mb-3">Record a loan or cash advance</h2>
            <LoanForm employeeId={employee.id} />
          </div>
        </div>
      )}

      {tab === 'edit' && (
        <div className="max-w-2xl">
          <EmployeeForm
            branchId={employee.branchId}
            canSeePay={canSeePay}
            canSeeGov={canSeeGov}
            defaultAllowancePesos={settings['payroll.dailyAllowanceCents'] / 100}
            services={services.map((s) => ({ id: s.id, name: s.name, categoryName: s.category.name }))}
            values={{
              id: employee.id,
              name: employee.name,
              employeeRole: employee.employeeRole,
              mobile: employee.mobile,
              email: employee.email,
              address: employee.address,
              emergencyName: employee.emergencyName,
              emergencyMobile: employee.emergencyMobile,
              hireDate: employee.hireDate.toISOString().slice(0, 10),
              active: employee.active,
              sssNumber: employee.sssNumber,
              philhealthNumber: employee.philhealthNumber,
              pagibigNumber: employee.pagibigNumber,
              tin: employee.tin,
              sssMonthly: employee.sssMonthlyCents / 100,
              philhealthMonthly: employee.philhealthMonthlyCents / 100,
              pagibigMonthly: employee.pagibigMonthlyCents / 100,
              payType: employee.payType,
              payRate: employee.payRateCents / 100,
              skillIds: employee.skills.map((s) => s.serviceId),
            }}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-moss-500">{label}</dt>
      <dd className="text-right text-moss-700">{value}</dd>
    </div>
  );
}
