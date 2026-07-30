/**
 * Payroll helper.
 *
 *   base pay (attendance × rate, 2× on regular holidays)
 * + commissions (25% of undiscounted service price by default)
 * + tips
 * + manual additions
 * − late / absence deductions
 * − loan & cash-advance installments
 * − SSS / PhilHealth / Pag-IBIG contributions
 * = net pay
 *
 * Incentives are deliberately NOT part of this: they are an Owner-only
 * rundown, never released through payroll and never printed on a payslip.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { dateKeyToBusinessDate } from './datetime';
import { DEFAULT_SETTINGS } from './settings-defaults';

export type PayslipLineDraft = {
  kind: string;
  label: string;
  amountCents: number; // positive = addition, negative = deduction
  sortRank: number;
  manual?: boolean;
};

export type PayslipDraft = {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  payOwnerOnly: boolean;
  daysWorked: number;
  holidayDays: number;
  basePayCents: number;
  commissionCents: number;
  tipsCents: number;
  additionsCents: number;
  deductionsCents: number;
  netPayCents: number;
  lines: PayslipLineDraft[];
};

type PayrollSettings = {
  dailyAllowanceCents: number;
  lateDeductionType: 'FIXED' | 'PERCENT';
  lateDeductionValue: number;
  absenceDeductionType: 'FIXED' | 'PERCENT';
  absenceDeductionValue: number;
  regularHolidayMultiplier: number;
  specialHolidayMultiplier: number;
  periodType: 'WEEKLY' | 'SEMI_MONTHLY';
};

export async function loadPayrollSettings(): Promise<PayrollSettings> {
  const keys = [
    'payroll.dailyAllowanceCents',
    'payroll.lateDeductionType',
    'payroll.lateDeductionValue',
    'payroll.absenceDeductionType',
    'payroll.absenceDeductionValue',
    'payroll.regularHolidayMultiplier',
    'payroll.specialHolidayMultiplier',
    'payroll.periodType',
  ];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys }, branchId: null } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const get = <T>(key: string): T => (map[key] ?? DEFAULT_SETTINGS[key as never]) as T;
  return {
    dailyAllowanceCents: Number(get('payroll.dailyAllowanceCents')),
    lateDeductionType: get('payroll.lateDeductionType'),
    lateDeductionValue: Number(get('payroll.lateDeductionValue')),
    absenceDeductionType: get('payroll.absenceDeductionType'),
    absenceDeductionValue: Number(get('payroll.absenceDeductionValue')),
    regularHolidayMultiplier: Number(get('payroll.regularHolidayMultiplier')),
    specialHolidayMultiplier: Number(get('payroll.specialHolidayMultiplier')),
    periodType: get('payroll.periodType'),
  };
}

/** Semi-monthly periods run 1–15 and 16–end; weekly periods run Mon–Sun. */
export function currentPeriod(
  periodType: 'WEEKLY' | 'SEMI_MONTHLY',
  reference: string,
): { fromKey: string; toKey: string } {
  const [y, m, d] = reference.split('-').map(Number);
  if (periodType === 'SEMI_MONTHLY') {
    if (d <= 15) {
      return { fromKey: `${reference.slice(0, 7)}-01`, toKey: `${reference.slice(0, 7)}-15` };
    }
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      fromKey: `${reference.slice(0, 7)}-16`,
      toKey: `${reference.slice(0, 7)}-${String(last).padStart(2, '0')}`,
    };
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  const monday = new Date(date.getTime() - ((dow + 6) % 7) * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const key = (x: Date) =>
    `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
  return { fromKey: key(monday), toKey: key(sunday) };
}

/**
 * Builds the draft payslips for a period. Nothing is written until the Owner
 * or Manager finalises them.
 */
export async function buildPayslipDrafts(opts: {
  branchId: string;
  fromKey: string;
  toKey: string;
  /** Owner sees every employee; Admin cannot see Owner-only pay structures. */
  includeOwnerOnlyPay: boolean;
}): Promise<PayslipDraft[]> {
  const settings = await loadPayrollSettings();
  const from = dateKeyToBusinessDate(opts.fromKey);
  const to = dateKeyToBusinessDate(opts.toKey);

  const employees = await prisma.employee.findMany({
    where: {
      branchId: opts.branchId,
      active: true,
      ...(opts.includeOwnerOnlyPay ? {} : { payOwnerOnly: false }),
      employeeRole: { not: 'OWNER' },
    },
    include: {
      attendances: { where: { workDate: { gte: from, lte: to } } },
      loans: { where: { status: 'ACTIVE' } },
    },
    orderBy: [{ employeeRole: 'asc' }, { name: 'asc' }],
  });

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: from, lte: to } },
  });
  const holidayByKey = new Map(
    holidays.map((h) => [h.date.toISOString().slice(0, 10), h.type]),
  );

  const commissions = await prisma.commission.groupBy({
    by: ['employeeId'],
    where: {
      employeeId: { in: employees.map((e) => e.id) },
      businessDate: { gte: from, lte: to },
      payslipId: null,
      sale: { status: 'PAID' },
    },
    _sum: { amountCents: true },
  });
  const commissionById = new Map(commissions.map((c) => [c.employeeId, c._sum.amountCents ?? 0]));

  // Tips are shared out across the therapists who served on each receipt.
  const tipSales = await prisma.sale.findMany({
    where: {
      branchId: opts.branchId,
      status: 'PAID',
      tipCents: { gt: 0 },
      businessDate: { gte: from, lte: to },
    },
    include: { lines: { select: { employeeId: true } } },
  });
  const tipsById = new Map<string, number>();
  for (const sale of tipSales) {
    const staff = [...new Set(sale.lines.map((l) => l.employeeId).filter(Boolean) as string[])];
    if (!staff.length) continue;
    const share = Math.floor(sale.tipCents / staff.length);
    let remainder = sale.tipCents - share * staff.length;
    for (const id of staff) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      tipsById.set(id, (tipsById.get(id) ?? 0) + share + extra);
    }
  }

  return employees.map((e) => {
    const lines: PayslipLineDraft[] = [];
    const dailyRate =
      e.payType === 'DAILY_ALLOWANCE' ? settings.dailyAllowanceCents : e.payRateCents;

    const worked = e.attendances.filter((a) => a.timeIn && !a.isAbsent);
    let regularDays = 0;
    let holidayDays = 0;
    let basePay = 0;

    if (e.payType === 'FIXED_SALARY') {
      basePay = e.payRateCents;
      regularDays = worked.length;
      lines.push({ kind: 'base', label: 'Fixed salary for the period', amountCents: basePay, sortRank: 0 });
    } else {
      for (const a of worked) {
        const key = a.workDate.toISOString().slice(0, 10);
        const holiday = holidayByKey.get(key);
        if (holiday) {
          const multiplier =
            holiday === 'REGULAR'
              ? settings.regularHolidayMultiplier
              : settings.specialHolidayMultiplier;
          basePay += Math.round((dailyRate * multiplier) / 100);
          holidayDays += 1;
        } else {
          basePay += dailyRate;
          regularDays += 1;
        }
      }
      lines.push({
        kind: 'base',
        label: `${regularDays} day(s) × ${(dailyRate / 100).toFixed(2)}`,
        amountCents: dailyRate * regularDays,
        sortRank: 0,
      });
      if (holidayDays > 0) {
        lines.push({
          kind: 'holiday',
          label: `${holidayDays} holiday day(s) at the holiday rate`,
          amountCents: basePay - dailyRate * regularDays,
          sortRank: 1,
        });
      }
    }

    const commission = commissionById.get(e.id) ?? 0;
    if (commission > 0) {
      lines.push({ kind: 'commission', label: 'Service commissions', amountCents: commission, sortRank: 2 });
    }
    const tips = tipsById.get(e.id) ?? 0;
    if (tips > 0) {
      lines.push({ kind: 'tips', label: 'Tips (shared)', amountCents: tips, sortRank: 3 });
    }

    // --- deductions ---
    let deductions = 0;
    const lateCount = e.attendances.filter((a) => a.isLate).length;
    if (lateCount > 0) {
      const per =
        settings.lateDeductionType === 'FIXED'
          ? settings.lateDeductionValue
          : Math.round((dailyRate * settings.lateDeductionValue) / 100);
      const amount = per * lateCount;
      deductions += amount;
      lines.push({ kind: 'late', label: `${lateCount} late arrival(s)`, amountCents: -amount, sortRank: 10 });
    }

    const absentCount = e.attendances.filter((a) => a.isAbsent).length;
    if (absentCount > 0) {
      const per =
        settings.absenceDeductionType === 'FIXED'
          ? settings.absenceDeductionValue
          : Math.round((dailyRate * settings.absenceDeductionValue) / 100);
      const amount = per * absentCount;
      deductions += amount;
      lines.push({ kind: 'absence', label: `${absentCount} absence(s)`, amountCents: -amount, sortRank: 11 });
    }

    for (const loan of e.loans) {
      const installment = Math.min(loan.installmentCents, loan.balanceCents);
      if (installment <= 0) continue;
      deductions += installment;
      lines.push({
        kind: 'loan',
        label: `${loan.type.replaceAll('_', ' ').toLowerCase()} installment`,
        amountCents: -installment,
        sortRank: 20,
      });
    }

    // Contributions are monthly; charge half on a semi-monthly period.
    const contributionFactor = settings.periodType === 'SEMI_MONTHLY' ? 0.5 : 0.25;
    const contributions: [string, number][] = [
      ['SSS', e.sssMonthlyCents],
      ['PhilHealth', e.philhealthMonthlyCents],
      ['Pag-IBIG', e.pagibigMonthlyCents],
    ];
    for (const [label, monthly] of contributions) {
      const amount = Math.round(monthly * contributionFactor);
      if (amount <= 0) continue;
      deductions += amount;
      lines.push({
        kind: 'contribution',
        label: `${label} contribution`,
        amountCents: -amount,
        sortRank: 30,
      });
    }

    const additions = commission + tips;
    const net = basePay + additions - deductions;

    return {
      employeeId: e.id,
      employeeName: e.name,
      employeeRole: e.employeeRole,
      payOwnerOnly: e.payOwnerOnly,
      daysWorked: regularDays + holidayDays,
      holidayDays,
      basePayCents: basePay,
      commissionCents: commission,
      tipsCents: tips,
      additionsCents: additions,
      deductionsCents: deductions,
      netPayCents: net,
      lines: lines.sort((a, b) => a.sortRank - b.sortRank),
    };
  });
}

/** Writes the drafts as DRAFT payslips (idempotent per period + employee). */
export async function savePayslips(opts: {
  periodId: string;
  drafts: PayslipDraft[];
}): Promise<void> {
  for (const d of opts.drafts) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.payslip.findUnique({
        where: { periodId_employeeId: { periodId: opts.periodId, employeeId: d.employeeId } },
      });
      if (existing?.status === 'FINALIZED') return;

      const payslip = existing
        ? await tx.payslip.update({
            where: { id: existing.id },
            data: {
              daysWorked: d.daysWorked,
              holidayDays: d.holidayDays,
              basePayCents: d.basePayCents,
              commissionCents: d.commissionCents,
              tipsCents: d.tipsCents,
              additionsCents: d.additionsCents,
              deductionsCents: d.deductionsCents,
              netPayCents: d.netPayCents,
            },
          })
        : await tx.payslip.create({
            data: {
              periodId: opts.periodId,
              employeeId: d.employeeId,
              daysWorked: d.daysWorked,
              holidayDays: d.holidayDays,
              basePayCents: d.basePayCents,
              commissionCents: d.commissionCents,
              tipsCents: d.tipsCents,
              additionsCents: d.additionsCents,
              deductionsCents: d.deductionsCents,
              netPayCents: d.netPayCents,
            },
          });

      // Regenerate the auto lines; manual adjustments the Owner added stay.
      await tx.payslipLine.deleteMany({ where: { payslipId: payslip.id, manual: false } });
      await tx.payslipLine.createMany({
        data: d.lines.map((l) => ({
          payslipId: payslip.id,
          kind: l.kind,
          label: l.label,
          amountCents: l.amountCents,
          sortRank: l.sortRank,
          manual: false,
        })),
      });
    });
  }
}

/**
 * Finalising locks the payslips, claims the commissions so they cannot be paid
 * twice, and posts the loan installments against each loan balance.
 */
export async function finalizePayroll(periodId: string, userName: string): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const period = await tx.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
      include: { payslips: { include: { lines: true, employee: true } } },
    });
    if (period.status === 'FINALIZED') return;

    for (const slip of period.payslips) {
      await tx.commission.updateMany({
        where: {
          employeeId: slip.employeeId,
          businessDate: { gte: period.startDate, lte: period.endDate },
          payslipId: null,
        },
        data: { payslipId: slip.id },
      });

      for (const line of slip.lines.filter((l) => l.kind === 'loan')) {
        const loan = await tx.employeeLoan.findFirst({
          where: { employeeId: slip.employeeId, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });
        if (!loan) continue;
        const amount = Math.min(-line.amountCents, loan.balanceCents);
        const balance = loan.balanceCents - amount;
        await tx.employeeLoan.update({
          where: { id: loan.id },
          data: { balanceCents: balance, status: balance <= 0 ? 'PAID' : 'ACTIVE' },
        });
        await tx.loanPayment.create({
          data: { loanId: loan.id, amountCents: amount, payslipId: slip.id, note: `Payroll ${periodId}` },
        });
      }

      await tx.payslip.update({ where: { id: slip.id }, data: { status: 'FINALIZED' } });
    }

    await tx.payrollPeriod.update({
      where: { id: periodId },
      data: { status: 'FINALIZED', finalizedAt: new Date(), finalizedBy: userName },
    });
  }, { timeout: 30_000 });
}
