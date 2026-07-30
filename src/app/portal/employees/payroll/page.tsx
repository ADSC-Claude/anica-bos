import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatDateKey, manilaDateKey } from '@/lib/datetime';
import { currentPeriod, loadPayrollSettings } from '@/lib/payroll';
import { PageHeader, StatCard, StatusBadge, EmptyState, Tabs, Alert } from '@/components/ui';
import { PayrollGenerator } from './generator';
import { addPayslipLineAction, finalizePayrollAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payroll' };

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; branchId?: string; error?: string }>;
}) {
  const user = await requirePage('payroll.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const seesOwnerOnly = can(user.role, 'payroll.ownerOnlyPay');
  const settings = await loadPayrollSettings();
  const suggested = currentPeriod(settings.periodType, manilaDateKey());

  const periods = await prisma.payrollPeriod.findMany({
    where: { branchId },
    orderBy: { startDate: 'desc' },
    take: 12,
  });
  const periodId = params.periodId ?? periods[0]?.id;

  const period = periodId
    ? await prisma.payrollPeriod.findUnique({
        where: { id: periodId },
        include: {
          payslips: {
            include: { employee: true, lines: { orderBy: { sortRank: 'asc' } } },
            orderBy: { employee: { name: 'asc' } },
          },
        },
      })
    : null;

  // Admin never sees the Owner-only pay structures (Receptionist / Manager).
  const payslips = (period?.payslips ?? []).filter((p) => seesOwnerOnly || !p.employee.payOwnerOnly);
  const hidden = (period?.payslips.length ?? 0) - payslips.length;

  const tabs = [
    { href: '/portal/employees', label: 'Team' },
    { href: '/portal/employees/attendance', label: 'Attendance' },
    { href: '/portal/employees/payroll', label: 'Payroll' },
    ...(can(user.role, 'incentives.view') ? [{ href: '/portal/employees/incentives', label: 'Incentives' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Payroll helper"
        subtitle={`${settings.periodType === 'SEMI_MONTHLY' ? 'Semi-monthly' : 'Weekly'} periods · record-keeping only, no bank or government filing`}
        actions={
          period && (
            <Link href={`/api/portal/export/payroll?periodId=${period.id}`} className="btn-secondary btn-sm">
              Export CSV
            </Link>
          )
        }
      />
      <Tabs tabs={tabs} current="/portal/employees/payroll" />

      {params.error === 'owner-only' && (
        <div className="mb-4">
          <Alert tone="danger">
            This period includes the Receptionist or Manager payslip, which only the Owner can
            finalise.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <PayrollGenerator
            branchId={branchId}
            defaultFrom={suggested.fromKey}
            defaultTo={suggested.toKey}
          />

          {periods.length > 0 && (
            <div className="card-pad">
              <p className="label">Past periods</p>
              <ul className="space-y-1 text-sm">
                {periods.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/portal/employees/payroll?periodId=${p.id}`}
                      className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                        p.id === periodId ? 'bg-moss-100 font-medium' : 'hover:bg-sand-100'
                      }`}
                    >
                      <span>
                        {p.startDate.toISOString().slice(0, 10)} → {p.endDate.toISOString().slice(0, 10)}
                      </span>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          {!period ? (
            <EmptyState
              title="No payroll period generated yet"
              hint="Pick the period dates on the left and generate the draft payslips."
            />
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Payslips" value={String(payslips.length)} hint={hidden ? `${hidden} hidden (Owner-only)` : undefined} />
                <StatCard label="Base pay" value={formatPeso(payslips.reduce((a, p) => a + p.basePayCents, 0))} />
                <StatCard label="Commissions" value={formatPeso(payslips.reduce((a, p) => a + p.commissionCents, 0))} />
                <StatCard
                  label="Net payout"
                  value={formatPeso(payslips.reduce((a, p) => a + p.netPayCents, 0))}
                  tone="good"
                />
              </div>

              {period.status === 'FINALIZED' && (
                <div className="mb-4">
                  <Alert tone="success">
                    Finalised {period.finalizedAt ? `on ${period.finalizedAt.toISOString().slice(0, 10)}` : ''}
                    {period.finalizedBy ? ` by ${period.finalizedBy}` : ''}. Commissions in this
                    period are now claimed and cannot be paid twice.
                  </Alert>
                </div>
              )}

              <div className="space-y-3">
                {payslips.map((slip) => (
                  <div key={slip.id} className="card-pad">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-moss-800">{slip.employee.name}</p>
                        <p className="text-xs capitalize text-moss-400">
                          {slip.employee.employeeRole.toLowerCase()} · {slip.daysWorked} day(s)
                          {slip.holidayDays > 0 && `, ${slip.holidayDays} holiday`}
                          {slip.employee.payOwnerOnly && ' · Owner-only pay structure'}
                        </p>
                      </div>
                      <span className="num text-lg font-semibold text-moss-700">
                        {formatPeso(slip.netPayCents)}
                      </span>
                    </div>

                    <ul className="space-y-0.5 text-sm">
                      {slip.lines.map((l) => (
                        <li key={l.id} className="flex justify-between gap-3">
                          <span className={l.amountCents < 0 ? 'text-clay-500' : 'text-moss-600'}>
                            {l.label}
                            {l.manual && <span className="ml-1 text-[10px] text-moss-400">(manual)</span>}
                          </span>
                          <span className={`num ${l.amountCents < 0 ? 'text-clay-500' : ''}`}>
                            {l.amountCents < 0 ? '−' : ''}
                            {formatPeso(Math.abs(l.amountCents))}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {period.status === 'DRAFT' && can(user.role, 'payroll.finalize') && (
                      <form action={addPayslipLineAction} className="mt-3 flex flex-wrap gap-1.5">
                        <input type="hidden" name="payslipId" value={slip.id} />
                        <input name="label" className="input min-h-9 flex-1 py-1 text-xs" placeholder="Adjustment label" />
                        <select name="direction" className="select min-h-9 w-28 py-1 text-xs">
                          <option value="addition">Addition</option>
                          <option value="deduction">Deduction</option>
                        </select>
                        <input name="amount" type="number" step="0.01" min="0" className="input min-h-9 w-24 py-1 text-xs" placeholder="₱" />
                        <button className="btn-secondary btn-sm" type="submit">Add</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>

              {period.status === 'DRAFT' && can(user.role, 'payroll.finalize') && (
                <form action={finalizePayrollAction} className="mt-4">
                  <input type="hidden" name="periodId" value={period.id} />
                  <button className="btn-primary" type="submit">
                    Finalise payroll for this period
                  </button>
                  <p className="mt-2 text-xs text-moss-400">
                    Finalising locks the payslips, claims the commissions, and posts loan
                    installments against each balance. Incentives are never included here.
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-moss-400">
        Period suggested from today: {formatDateKey(suggested.fromKey)} → {formatDateKey(suggested.toKey)}
      </p>
    </div>
  );
}
