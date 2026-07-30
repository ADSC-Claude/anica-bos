'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { EmployeeRole, PayType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit, diff } from '@/lib/audit';
import { can } from '@/lib/rbac';
import { dateKeyToBusinessDate, manilaDateKey, manilaMinuteOfDay } from '@/lib/datetime';
import { buildPayslipDrafts, finalizePayroll, savePayslips } from '@/lib/payroll';
import { formatPeso } from '@/lib/money';
import { getSettings } from '@/lib/settings';

export type FormState = { error?: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const cents = (fd: FormData, k: string) => Math.round(Number(fd.get(k) ?? 0) * 100);

export async function saveEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('employees.edit');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (name.length < 2) return { error: 'Enter the employee’s name.' };

  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const employeeRole = (str(formData, 'employeeRole') || 'THERAPIST') as EmployeeRole;

  // Receptionist and Manager pay structures are Owner-only.
  const ownerOnlyRole = employeeRole === 'RECEPTIONIST' || employeeRole === 'MANAGER';
  const mayEditPay = !ownerOnlyRole || can(user.role, 'payroll.ownerOnlyPay');

  const base = {
    name,
    branchId,
    employeeRole,
    mobile: str(formData, 'mobile'),
    email: str(formData, 'email'),
    address: str(formData, 'address'),
    emergencyName: str(formData, 'emergencyName'),
    emergencyMobile: str(formData, 'emergencyMobile'),
    hireDate: str(formData, 'hireDate')
      ? new Date(`${str(formData, 'hireDate')}T00:00:00Z`)
      : new Date(),
    active: formData.get('active') === 'on',
    sssNumber: str(formData, 'sssNumber'),
    philhealthNumber: str(formData, 'philhealthNumber'),
    pagibigNumber: str(formData, 'pagibigNumber'),
    tin: str(formData, 'tin'),
    sssMonthlyCents: cents(formData, 'sssMonthly'),
    philhealthMonthlyCents: cents(formData, 'philhealthMonthly'),
    pagibigMonthlyCents: cents(formData, 'pagibigMonthly'),
    payOwnerOnly: ownerOnlyRole,
  };

  const payFields = mayEditPay
    ? {
        payType: (str(formData, 'payType') || 'DAILY_ALLOWANCE') as PayType,
        payRateCents: cents(formData, 'payRate'),
      }
    : {};

  let employeeId = id;
  if (id) {
    const before = await prisma.employee.findUnique({ where: { id } });
    if (!before) return { error: 'That employee no longer exists.' };
    const after = await prisma.employee.update({
      where: { id },
      data: { ...base, ...payFields },
    });
    await audit(user, {
      module: 'employees', action: 'update', entityType: 'Employee', entityId: id,
      summary: `Updated ${after.name}`, sensitive: true,
      ...diff(before as never, after as never),
    });
  } else {
    const created = await prisma.employee.create({
      data: {
        ...base,
        payType: (str(formData, 'payType') || 'DAILY_ALLOWANCE') as PayType,
        payRateCents: cents(formData, 'payRate'),
      },
    });
    employeeId = created.id;
    // Sensible default: works every day except Sunday.
    for (let d = 0; d < 7; d++) {
      await prisma.employeeSchedule.create({
        data: { employeeId: created.id, dayOfWeek: d, isDayOff: d === 0 },
      });
    }
    await audit(user, {
      module: 'employees', action: 'create', entityType: 'Employee', entityId: created.id,
      summary: `Added ${created.name} (${employeeRole.toLowerCase()})`, sensitive: true,
    });
  }

  // Skills
  const skillIds = formData.getAll('skillIds').map(String).filter(Boolean);
  if (skillIds.length || formData.has('skillsSubmitted')) {
    await prisma.employeeSkill.deleteMany({ where: { employeeId } });
    await prisma.employeeSkill.createMany({
      data: skillIds.map((serviceId) => ({ employeeId, serviceId })),
    });
  }

  revalidatePath('/portal/employees');
  redirect(`/portal/employees/${employeeId}`);
}

/* -------------------------------------------------------------- attendance */

export async function attendanceAction(formData: FormData) {
  const user = await requirePage('employees.attendance');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const employeeId = str(formData, 'employeeId');
  const action = str(formData, 'action');
  const dateKey = str(formData, 'dateKey') || manilaDateKey();
  const workDate = dateKeyToBusinessDate(dateKey);
  if (!employeeId) return;

  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
  const grace = (await getSettings(branchId))['payroll.lateGraceMinutes'];

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
  });

  if (action === 'time_in') {
    const now = new Date();
    const minute = manilaMinuteOfDay(now);
    const isLate = minute > branch.openMinute + grace;

    // Rotation rank = order of time-in for the day.
    const alreadyIn = await prisma.attendance.count({
      where: { branchId, workDate, timeIn: { not: null } },
    });

    await prisma.attendance.upsert({
      where: { employeeId_workDate: { employeeId, workDate } },
      create: {
        branchId, employeeId, workDate,
        timeIn: now,
        isLate,
        lateMinutes: isLate ? minute - branch.openMinute - grace : 0,
        rotationRank: alreadyIn + 1,
        recordedBy: user.name,
      },
      update: {
        timeIn: existing?.timeIn ?? now,
        isAbsent: false,
        isLate,
        lateMinutes: isLate ? minute - branch.openMinute - grace : 0,
        rotationRank: existing?.rotationRank || alreadyIn + 1,
      },
    });
  } else if (action === 'time_out') {
    await prisma.attendance.update({
      where: { employeeId_workDate: { employeeId, workDate } },
      data: { timeOut: new Date(), onBreak: false },
    });
  } else if (action === 'break') {
    await prisma.attendance.update({
      where: { employeeId_workDate: { employeeId, workDate } },
      data: { onBreak: !existing?.onBreak },
    });
  } else if (action === 'absent') {
    await prisma.attendance.upsert({
      where: { employeeId_workDate: { employeeId, workDate } },
      create: { branchId, employeeId, workDate, isAbsent: true, recordedBy: user.name },
      update: { isAbsent: true, timeIn: null, timeOut: null, rotationRank: 0 },
    });
  } else if (action === 'clear') {
    await prisma.attendance.deleteMany({ where: { employeeId, workDate } });
  }

  await audit(user, {
    module: 'employees',
    action: `attendance_${action}`,
    entityType: 'Attendance',
    entityId: employeeId,
    summary: `${action.replace('_', ' ')} on ${dateKey}`,
    branchId,
  });

  revalidatePath('/portal/employees/attendance');
  revalidatePath('/portal');
}

/* -------------------------------------------------------------------- loans */

export async function saveLoanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('employees.loans');
  const employeeId = str(formData, 'employeeId');
  const principal = cents(formData, 'principal');
  const installment = cents(formData, 'installment');
  if (!employeeId || principal <= 0) return { error: 'Enter the loan amount.' };
  if (installment <= 0) return { error: 'Enter the per-payroll installment.' };

  const loan = await prisma.employeeLoan.create({
    data: {
      employeeId,
      type: (str(formData, 'type') || 'COMPANY_LOAN') as never,
      principalCents: principal,
      installmentCents: installment,
      balanceCents: principal,
      startDate: str(formData, 'startDate')
        ? new Date(`${str(formData, 'startDate')}T00:00:00Z`)
        : new Date(),
      note: str(formData, 'note'),
    },
  });

  await audit(user, {
    module: 'employees', action: 'create_loan', entityType: 'EmployeeLoan', entityId: loan.id,
    summary: `Recorded a ${formatPeso(principal)} ${loan.type.replaceAll('_', ' ').toLowerCase()}`,
    sensitive: true,
  });
  revalidatePath(`/portal/employees/${employeeId}`);
  return { ok: 'Loan recorded. Installments deduct automatically each payroll.' };
}

/* ------------------------------------------------------------------ payroll */

export async function generatePayrollAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('payroll.view');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const fromKey = str(formData, 'fromKey');
  const toKey = str(formData, 'toKey');
  if (!fromKey || !toKey) return { error: 'Choose the period start and end.' };
  if (fromKey > toKey) return { error: 'The start date must be before the end date.' };

  const period = await prisma.payrollPeriod.upsert({
    where: {
      branchId_startDate_endDate: {
        branchId,
        startDate: dateKeyToBusinessDate(fromKey),
        endDate: dateKeyToBusinessDate(toKey),
      },
    },
    create: {
      branchId,
      startDate: dateKeyToBusinessDate(fromKey),
      endDate: dateKeyToBusinessDate(toKey),
    },
    update: {},
  });
  if (period.status === 'FINALIZED') {
    return { error: 'That period is already finalised and can no longer be regenerated.' };
  }

  const drafts = await buildPayslipDrafts({
    branchId,
    fromKey,
    toKey,
    includeOwnerOnlyPay: can(user.role, 'payroll.ownerOnlyPay'),
  });
  await savePayslips({ periodId: period.id, drafts });

  await audit(user, {
    module: 'employees', action: 'generate_payroll', entityType: 'PayrollPeriod', entityId: period.id,
    summary: `Generated ${drafts.length} draft payslip(s) for ${fromKey} – ${toKey}`,
    branchId,
  });

  revalidatePath('/portal/employees/payroll');
  redirect(`/portal/employees/payroll?periodId=${period.id}`);
}

export async function addPayslipLineAction(formData: FormData) {
  const user = await requirePage('payroll.finalize');
  const payslipId = str(formData, 'payslipId');
  const label = str(formData, 'label');
  const amount = cents(formData, 'amount');
  const isDeduction = str(formData, 'direction') === 'deduction';
  if (!payslipId || !label || amount === 0) return;

  const signed = isDeduction ? -Math.abs(amount) : Math.abs(amount);
  await prisma.payslipLine.create({
    data: { payslipId, kind: 'adjustment', label, amountCents: signed, sortRank: 40, manual: true },
  });

  const lines = await prisma.payslipLine.findMany({ where: { payslipId } });
  const additions = lines.filter((l) => l.amountCents > 0).reduce((a, l) => a + l.amountCents, 0);
  const deductions = lines.filter((l) => l.amountCents < 0).reduce((a, l) => a - l.amountCents, 0);
  await prisma.payslip.update({
    where: { id: payslipId },
    data: { netPayCents: additions - deductions, additionsCents: additions, deductionsCents: deductions },
  });

  await audit(user, {
    module: 'employees', action: 'payslip_adjustment', entityType: 'Payslip', entityId: payslipId,
    summary: `${isDeduction ? 'Deduction' : 'Addition'} "${label}" of ${formatPeso(Math.abs(amount))}`,
    sensitive: true,
  });
  revalidatePath('/portal/employees/payroll');
}

export async function finalizePayrollAction(formData: FormData) {
  const user = await requirePage('payroll.finalize');
  const periodId = str(formData, 'periodId');
  if (!periodId) return;

  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { payslips: { include: { employee: true } } },
  });
  if (!period) return;

  // Only the Owner may finalise a period containing Owner-only pay structures.
  const hasOwnerOnly = period.payslips.some((p) => p.employee.payOwnerOnly);
  if (hasOwnerOnly && !can(user.role, 'payroll.ownerOnlyPay')) {
    redirect('/portal/employees/payroll?error=owner-only');
  }

  await finalizePayroll(periodId, user.name);
  await audit(user, {
    module: 'employees', action: 'finalize_payroll', entityType: 'PayrollPeriod', entityId: periodId,
    summary: `Finalised payroll with ${period.payslips.length} payslip(s), net ${formatPeso(period.payslips.reduce((a, p) => a + p.netPayCents, 0))}`,
    sensitive: true,
    branchId: period.branchId,
  });
  revalidatePath('/portal/employees/payroll');
}

/* --------------------------------------------------------------- incentives */

export async function saveIncentiveSchemeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('incentives.view');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) return { error: 'Give the scheme a name.' };

  const data = {
    name,
    targetRole: (str(formData, 'targetRole') || 'THERAPIST') as EmployeeRole,
    formula: (str(formData, 'formula') || 'FIXED_AMOUNT') as never,
    value:
      str(formData, 'formula') === 'FIXED_AMOUNT'
        ? cents(formData, 'value')
        : Math.round(Number(formData.get('value') ?? 0)),
    targetValue: cents(formData, 'targetValue'),
    metric: str(formData, 'metric') || 'revenue',
    period: (str(formData, 'period') || 'MONTHLY') as never,
    active: formData.get('active') === 'on',
    note: str(formData, 'note'),
  };

  const scheme = id
    ? await prisma.incentiveScheme.update({ where: { id }, data })
    : await prisma.incentiveScheme.create({ data });

  await audit(user, {
    module: 'employees', action: id ? 'update_incentive' : 'create_incentive',
    entityType: 'IncentiveScheme', entityId: scheme.id,
    summary: `${id ? 'Updated' : 'Created'} incentive scheme "${scheme.name}"`,
    sensitive: true,
    after: data,
  });
  revalidatePath('/portal/employees/incentives');
  return { ok: 'Saved. Incentives are never released through payroll.' };
}
