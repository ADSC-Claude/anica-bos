import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatusBadge } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { SettingsForm } from '@/components/settings-form';
import { saveHolidayAction } from '../actions';
import { parseLateBands } from '@/lib/late-bands';
import { LateBandsEditor } from './late-bands-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payroll settings' };

export default async function PayrollSettingsPage() {
  const user = await requirePage('settings.edit');
  const s = await getSettings(user.branchId);
  const holidays = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  // Only so the band editor can show what a band means in clock terms — "1
  // minute past grace" is abstract, "arriving 12:16 PM" is not.
  // findFirst, not findUnique: an Owner signed in across branches has no
  // branch of their own, and the example times only need *a* branch's hours.
  const branch = await prisma.branch.findFirst({
    where: user.branchId ? { id: user.branchId } : { active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { openMinute: true },
  });
  const openMinute = branch?.openMinute ?? 720;

  return (
    <div>
      <PageHeader title="Payroll rules" subtitle="Allowances, deductions, holiday multipliers and the holiday calendar." />
      <SettingsNav role={user.role} current="/portal/settings/payroll" />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="max-w-2xl">
          <SettingsForm section="payroll">
            <div className="card-pad space-y-3">
              <p className="section-title">Base pay &amp; commission</p>
              <label className="block">
                <span className="label">Payroll period</span>
                <select name="periodType" className="select" defaultValue={s['payroll.periodType']}>
                  <option value="SEMI_MONTHLY">Semi-monthly (1–15, 16–end)</option>
                  <option value="WEEKLY">Weekly (Mon–Sun)</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Therapist daily allowance (₱)</span>
                  <input name="dailyAllowance" type="number" step="0.01" min={0} className="input"
                    defaultValue={s['payroll.dailyAllowanceCents'] / 100} />
                </label>
                <label className="block">
                  <span className="label">Default commission (%)</span>
                  <input name="commissionPercent" type="number" min={0} max={100} className="input"
                    defaultValue={s['payroll.commissionPercent']} />
                  <span className="mt-1 block text-[11px] text-cocoa-400">
                    Always computed on the undiscounted list price.
                  </span>
                </label>
              </div>
            </div>

            <div className="card-pad space-y-3">
              <p className="section-title">Late &amp; absence</p>
              <label className="block">
                <span className="label">Grace period before "late" (minutes)</span>
                <input name="lateGraceMinutes" type="number" min={0} className="input"
                  defaultValue={s['payroll.lateGraceMinutes']} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Late deduction type</span>
                  <select name="lateDeductionType" className="select" defaultValue={s['payroll.lateDeductionType']}>
                    <option value="FIXED">Fixed ₱ per late</option>
                    <option value="PERCENT">% of the daily allowance</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Late deduction value</span>
                  <input name="lateDeductionValue" type="number" step="0.01" min={0} className="input"
                    defaultValue={
                      s['payroll.lateDeductionType'] === 'FIXED'
                        ? s['payroll.lateDeductionValue'] / 100
                        : s['payroll.lateDeductionValue']
                    } />
                  <span className="mt-1 block text-[11px] text-cocoa-400">
                    Charged once per late arrival, however late. Add bands below to charge by
                    how late instead.
                  </span>
                </label>
              </div>

              <LateBandsEditor
                initial={parseLateBands(s['payroll.lateBands'])}
                openMinute={openMinute}
                graceMinutes={s['payroll.lateGraceMinutes']}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Absence deduction type</span>
                  <select name="absenceDeductionType" className="select" defaultValue={s['payroll.absenceDeductionType']}>
                    <option value="PERCENT">% of the daily allowance</option>
                    <option value="FIXED">Fixed ₱ per absence</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Absence deduction value</span>
                  <input name="absenceDeductionValue" type="number" step="0.01" min={0} className="input"
                    defaultValue={
                      s['payroll.absenceDeductionType'] === 'FIXED'
                        ? s['payroll.absenceDeductionValue'] / 100
                        : s['payroll.absenceDeductionValue']
                    } />
                </label>
              </div>
            </div>

            <div className="card-pad space-y-3">
              <p className="section-title">Holiday pay</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Regular holiday multiplier (%)</span>
                  <input name="regularHolidayMultiplier" type="number" min={100} className="input"
                    defaultValue={s['payroll.regularHolidayMultiplier']} />
                  <span className="mt-1 block text-[11px] text-cocoa-400">200 = double pay</span>
                </label>
                <label className="block">
                  <span className="label">Special holiday multiplier (%)</span>
                  <input name="specialHolidayMultiplier" type="number" min={100} className="input"
                    defaultValue={s['payroll.specialHolidayMultiplier']} />
                  <span className="mt-1 block text-[11px] text-cocoa-400">130 = 1.3×</span>
                </label>
              </div>
            </div>
          </SettingsForm>
        </div>

        <div>
          <h2 className="section-title mb-3">Holiday calendar</h2>
          <form action={saveHolidayAction} className="card-pad mb-3 space-y-2">
            <label className="block">
              <span className="label">Date</span>
              <input name="date" type="date" className="input" required />
            </label>
            <label className="block">
              <span className="label">Name</span>
              <input name="name" className="input" required placeholder="e.g. Christmas Day" />
            </label>
            <label className="block">
              <span className="label">Type</span>
              <select name="type" className="select" defaultValue="REGULAR">
                <option value="REGULAR">Regular holiday</option>
                <option value="SPECIAL">Special (non-working) holiday</option>
              </select>
            </label>
            <button className="btn-secondary w-full" type="submit">Add / update holiday</button>
          </form>

          <div className="card max-h-96 divide-y divide-sand-100 overflow-y-auto">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <span className="font-medium text-cocoa-800">{h.name}</span>
                  <span className="block text-xs text-cocoa-400">{formatManila(h.date)}</span>
                </span>
                <StatusBadge status={h.type === 'REGULAR' ? 'OK' : 'WARN'} label={h.type.toLowerCase()} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
