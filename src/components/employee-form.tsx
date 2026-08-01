'use client';

import { useActionState, useState } from 'react';
import { saveEmployeeAction, type FormState } from '@/app/portal/employees/actions';
import { TITLES, displayName } from '@/lib/people';

export type EmployeeValues = {
  id?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nickname?: string;
  title?: string;
  employeeRole?: string;
  mobile?: string;
  email?: string;
  address?: string;
  emergencyName?: string;
  emergencyMobile?: string;
  hireDate?: string;
  active?: boolean;
  sssNumber?: string;
  philhealthNumber?: string;
  pagibigNumber?: string;
  tin?: string;
  sssMonthly?: number;
  philhealthMonthly?: number;
  pagibigMonthly?: number;
  payType?: string;
  payRate?: number;
  skillIds?: string[];
};

export function EmployeeForm({
  branchId,
  values,
  services,
  canSeePay,
  canSeeGov,
  defaultAllowancePesos,
}: {
  branchId: string;
  values: EmployeeValues;
  services: { id: string; name: string; categoryName: string }[];
  canSeePay: boolean;
  canSeeGov: boolean;
  defaultAllowancePesos: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveEmployeeAction, {});
  const [role, setRole] = useState(values.employeeRole ?? 'THERAPIST');
  // Shown back as you type, because "Ms." plus a nickname is the name clients
  // will see on the booking page and it should not be a surprise on save.
  const [called, setCalled] = useState({
    title: values.title ?? 'Ms.',
    firstName: values.firstName ?? '',
    nickname: values.nickname ?? '',
  });
  const [payType, setPayType] = useState(values.payType ?? 'DAILY_ALLOWANCE');
  const ownerOnlyRole = role === 'RECEPTIONIST' || role === 'MANAGER';

  const byCategory = new Map<string, typeof services>();
  for (const s of services) {
    byCategory.set(s.categoryName, [...(byCategory.get(s.categoryName) ?? []), s]);
  }

  return (
    <form action={action} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="skillsSubmitted" value="1" />

      <div className="card-pad space-y-3">
        <p className="section-title">Basics</p>
        {/* Legal name, in the parts SSS, PhilHealth and BIR ask for. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">First name *</span>
            <input
              name="firstName"
              className="input"
              defaultValue={values.firstName}
              required
              onChange={(e) => setCalled((c) => ({ ...c, firstName: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="label">Middle name</span>
            <input name="middleName" className="input" defaultValue={values.middleName} />
          </label>
          <label className="block">
            <span className="label">Surname *</span>
            <input name="lastName" className="input" defaultValue={values.lastName} required />
          </label>
        </div>
        <p className="text-[11px] text-cocoa-400">
          The full legal name, as it should appear on payslips and government forms.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Called</span>
            <select
              name="title"
              className="select"
              value={called.title}
              onChange={(e) => setCalled((c) => ({ ...c, title: e.target.value }))}
            >
              {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Nickname</span>
            <input
              name="nickname"
              className="input"
              defaultValue={values.nickname}
              placeholder={called.firstName || 'e.g. Jen'}
              onChange={(e) => setCalled((c) => ({ ...c, nickname: e.target.value }))}
            />
          </label>
        </div>
        <p className="text-[11px] text-cocoa-400">
          How clients and the desk address her. Leave the nickname blank to use her first
          name. She appears as{' '}
          <strong className="text-cocoa-700">{displayName(called) || 'Ms. —'}</strong>{' '}
          on the booking page, the schedule and the roster.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Role</span>
            <select name="employeeRole" className="select" value={role}
              onChange={(e) => setRole(e.target.value)}>
              <option value="THERAPIST">Therapist</option>
              <option value="RECEPTIONIST">Receptionist</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Mobile</span>
            <input name="mobile" className="input" defaultValue={values.mobile} />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" className="input" defaultValue={values.email} />
          </label>
        </div>
        <label className="block">
          <span className="label">Address</span>
          <input name="address" className="input" defaultValue={values.address} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Emergency contact</span>
            <input name="emergencyName" className="input" defaultValue={values.emergencyName} />
          </label>
          <label className="block">
            <span className="label">Emergency mobile</span>
            <input name="emergencyMobile" className="input" defaultValue={values.emergencyMobile} />
          </label>
          <label className="block">
            <span className="label">Hire date</span>
            <input name="hireDate" type="date" className="input" defaultValue={values.hireDate} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={values.active ?? true} />
          Currently employed
        </label>
      </div>

      {canSeeGov && (
        <div className="card-pad space-y-3">
          <p className="section-title">Government numbers &amp; contributions</p>
          <p className="muted">Visible to the Owner and Manager only. Used as payroll deductions.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">SSS number</span>
              <input name="sssNumber" className="input" defaultValue={values.sssNumber} />
            </label>
            <label className="block">
              <span className="label">SSS monthly contribution (₱)</span>
              <input name="sssMonthly" type="number" step="0.01" min={0} className="input"
                defaultValue={values.sssMonthly ?? 0} />
            </label>
            <label className="block">
              <span className="label">PhilHealth number</span>
              <input name="philhealthNumber" className="input" defaultValue={values.philhealthNumber} />
            </label>
            <label className="block">
              <span className="label">PhilHealth monthly (₱)</span>
              <input name="philhealthMonthly" type="number" step="0.01" min={0} className="input"
                defaultValue={values.philhealthMonthly ?? 0} />
            </label>
            <label className="block">
              <span className="label">Pag-IBIG number</span>
              <input name="pagibigNumber" className="input" defaultValue={values.pagibigNumber} />
            </label>
            <label className="block">
              <span className="label">Pag-IBIG monthly (₱)</span>
              <input name="pagibigMonthly" type="number" step="0.01" min={0} className="input"
                defaultValue={values.pagibigMonthly ?? 0} />
            </label>
            <label className="block">
              <span className="label">TIN</span>
              <input name="tin" className="input" defaultValue={values.tin} />
            </label>
          </div>
        </div>
      )}

      {canSeePay ? (
        <div className="card-pad space-y-3">
          <p className="section-title">Pay structure</p>
          {ownerOnlyRole && (
            <p className="rounded-xl bg-sand-100 px-3 py-2 text-xs text-cocoa-600">
              Receptionist and Manager pay is set and finalised by the Owner only. The Manager
              can still run therapist payroll but will not see these figures.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Pay type</span>
              <select name="payType" className="select" value={payType}
                onChange={(e) => setPayType(e.target.value)}>
                <option value="DAILY_ALLOWANCE">Daily allowance (therapist default)</option>
                <option value="DAILY_RATE">Daily rate</option>
                <option value="FIXED_SALARY">Fixed salary per payroll period</option>
              </select>
            </label>
            <label className="block">
              <span className="label">
                {payType === 'FIXED_SALARY' ? 'Salary per period (₱)' : 'Rate per day (₱)'}
              </span>
              <input name="payRate" type="number" step="0.01" min={0} className="input"
                defaultValue={values.payRate ?? defaultAllowancePesos} />
              {payType === 'DAILY_ALLOWANCE' && (
                <span className="mt-1 block text-[11px] text-cocoa-400">
                  Default is ₱{defaultAllowancePesos.toFixed(2)}/day, plus 25% commission on the
                  undiscounted service price and 2× on regular holidays.
                </span>
              )}
            </label>
          </div>
        </div>
      ) : (
        <div className="card-pad">
          <p className="muted">
            This employee&apos;s pay structure is Owner-only and is hidden from your view.
          </p>
        </div>
      )}

      {role === 'THERAPIST' && (
        <div className="card-pad space-y-3">
          <p className="section-title">Skills</p>
          <p className="muted">
            Only therapists with the right skill are offered for a service — on the booking form
            and in the portal.
          </p>
          {[...byCategory.entries()].map(([cat, list]) => (
            <fieldset key={cat}>
              <legend className="mb-1 text-xs font-semibold text-cocoa-500">{cat}</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {list.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-xl border border-sand-200 px-3 py-2 text-sm">
                    <input type="checkbox" name="skillIds" value={s.id} className="h-4 w-4 accent-[#6b4e35]"
                      defaultChecked={values.skillIds?.includes(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
          {state.error}
        </p>
      )}

      <button className="btn-primary" type="submit">
        {values.id ? 'Save changes' : 'Add employee'}
      </button>
    </form>
  );
}
