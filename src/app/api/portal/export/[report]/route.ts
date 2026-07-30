import { handle, requireApi, resolveBranchId, assert } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { csvResponse } from '@/lib/csv';
import { centsToDecimalString } from '@/lib/money';
import {
  dateKeyToBusinessDate,
  manilaDateKey,
  manilaMonthKey,
  monthBounds,
  formatManila,
} from '@/lib/datetime';
import { profitAndLoss, monthRange, kpiScorecard, therapistUtilisation } from '@/lib/metrics';
import { audit } from '@/lib/audit';
import { retentionWatch } from '@/lib/retention';

export const dynamic = 'force-dynamic';

/**
 * CSV export endpoint for every report. Exports never happen automatically —
 * they run only when a signed-in Owner/Admin requests one, and BIR-format
 * journals deliberately exclude payroll, incentives, KPIs and client data.
 */
export const GET = handle(async (req, ctx) => {
  const user = await requireApi('reports.ownDailySummary');
  const { report } = await ctx.params;
  const url = new URL(req.url);
  const branchId = await resolveBranchId(user, url.searchParams.get('branchId'));

  const monthKey = url.searchParams.get('month') ?? manilaMonthKey();
  const { fromKey, toKey } = monthBounds(monthKey);
  const from = dateKeyToBusinessDate(url.searchParams.get('from') ?? fromKey);
  const to = dateKeyToBusinessDate(url.searchParams.get('to') ?? toKey);
  const range = { fromKey: url.searchParams.get('from') ?? fromKey, toKey: url.searchParams.get('to') ?? toKey };

  const needsReports = report !== 'daily-sales';
  if (needsReports) {
    assert(
      user.role !== 'RECEPTIONIST',
      403,
      'Your role can only export your own daily sales summary.',
    );
  }

  await audit(user, {
    module: 'reports',
    action: 'export',
    entityType: 'Report',
    entityId: report,
    summary: `Exported "${report}" for ${range.fromKey} – ${range.toKey}`,
    sensitive: report === 'journal' || report === 'payroll' || report === 'backup',
    branchId,
  });

  switch (report) {
    /* ------------------------------------------------------- daily sales */
    case 'daily-sales': {
      const dateKey = url.searchParams.get('date') ?? manilaDateKey();
      const sales = await prisma.sale.findMany({
        where: { branchId, businessDate: dateKeyToBusinessDate(dateKey) },
        include: {
          client: { select: { name: true } },
          cashier: { select: { name: true } },
          payments: true,
          lines: true,
        },
        orderBy: { sequence: 'asc' },
      });
      return csvResponse(
        `daily-sales-${dateKey}.csv`,
        ['Receipt No', 'Time', 'Client', 'Cashier', 'Items', 'Subtotal', 'Discount', 'Tip', 'Total', 'Payment methods', 'Status'],
        sales.map((s) => [
          s.receiptNo,
          formatManila(s.createdAt, { time: true }),
          s.client?.name ?? 'Walk-in',
          s.cashier.name,
          s.lines.map((l) => `${l.description} x${l.quantity}`).join('; '),
          centsToDecimalString(s.subtotalCents),
          centsToDecimalString(s.discountCents),
          centsToDecimalString(s.tipCents),
          centsToDecimalString(s.totalCents),
          s.payments.map((p) => `${p.method}:${centsToDecimalString(p.amountCents)}`).join('; '),
          s.status,
        ]),
      );
    }

    /* -------------------------------------------------------- sales by X */
    case 'sales-by-service':
    case 'sales-by-therapist':
    case 'sales-by-category': {
      const lines = await prisma.saleLine.findMany({
        where: { sale: { branchId, status: 'PAID', businessDate: { gte: from, lte: to } } },
        include: {
          service: { include: { category: true } },
          item: true,
          employee: { select: { name: true } },
        },
      });
      const key = (l: (typeof lines)[number]) =>
        report === 'sales-by-therapist'
          ? (l.employee?.name ?? 'Unassigned')
          : report === 'sales-by-category'
            ? (l.service?.category.name ?? (l.item ? 'Retail products' : 'Other'))
            : (l.description);

      const grouped = new Map<string, { qty: number; revenue: number; base: number }>();
      for (const l of lines) {
        const k = key(l);
        const prev = grouped.get(k) ?? { qty: 0, revenue: 0, base: 0 };
        grouped.set(k, {
          qty: prev.qty + l.quantity,
          revenue: prev.revenue + l.lineTotalCents,
          base: prev.base + l.basePriceCents * l.quantity,
        });
      }
      return csvResponse(
        `${report}-${range.fromKey}_${range.toKey}.csv`,
        [report === 'sales-by-therapist' ? 'Therapist' : report === 'sales-by-category' ? 'Category' : 'Service/Product', 'Quantity', 'Revenue charged', 'Revenue at list price'],
        [...grouped.entries()]
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .map(([k, v]) => [k, v.qty, centsToDecimalString(v.revenue), centsToDecimalString(v.base)]),
      );
    }

    case 'sales-by-payment': {
      const rows = await prisma.payment.groupBy({
        by: ['method'],
        where: { sale: { branchId, status: 'PAID', businessDate: { gte: from, lte: to } } },
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      return csvResponse(
        `sales-by-payment-${range.fromKey}_${range.toKey}.csv`,
        ['Payment method', 'Transactions', 'Amount'],
        rows.map((r) => [r.method, r._count._all, centsToDecimalString(r._sum.amountCents ?? 0)]),
      );
    }

    case 'sales-by-hour': {
      const sales = await prisma.sale.findMany({
        where: { branchId, status: 'PAID', businessDate: { gte: from, lte: to } },
        select: { createdAt: true, totalCents: true },
      });
      const buckets = new Map<number, { count: number; total: number }>();
      for (const s of sales) {
        const hour = new Date(s.createdAt.getTime() + 8 * 3600_000).getUTCHours();
        const prev = buckets.get(hour) ?? { count: 0, total: 0 };
        buckets.set(hour, { count: prev.count + 1, total: prev.total + s.totalCents });
      }
      return csvResponse(
        `sales-by-hour-${range.fromKey}_${range.toKey}.csv`,
        ['Hour (Manila)', 'Receipts', 'Revenue'],
        [...buckets.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([h, v]) => [`${String(h).padStart(2, '0')}:00`, v.count, centsToDecimalString(v.total)]),
      );
    }

    /* ------------------------------------------------------- appointments */
    case 'appointments': {
      const appts = await prisma.appointment.findMany({
        where: {
          branchId,
          startAt: {
            gte: new Date(`${range.fromKey}T00:00:00+08:00`),
            lt: new Date(new Date(`${range.toKey}T00:00:00+08:00`).getTime() + 86_400_000),
          },
        },
        include: {
          client: { select: { name: true, mobile: true } },
          resource: { select: { name: true } },
          services: { include: { service: true, employee: { select: { name: true } } } },
        },
        orderBy: { startAt: 'asc' },
      });
      return csvResponse(
        `appointments-${range.fromKey}_${range.toKey}.csv`,
        ['Reference', 'Start', 'End', 'Client', 'Mobile', 'Services', 'Therapist', 'Room', 'Source', 'Status', 'Deposit', 'Deposit status'],
        appts.map((a) => [
          a.reference,
          formatManila(a.startAt, { time: true }),
          formatManila(a.endAt, { time: true }),
          a.client.name,
          a.client.mobile,
          a.services.map((s) => s.service.name).join('; '),
          a.services[0]?.employee?.name ?? '',
          a.resource?.name ?? '',
          a.source,
          a.status,
          centsToDecimalString(a.depositAmountCents),
          a.depositStatus,
        ]),
      );
    }

    /* ------------------------------------------------------------ clients */
    case 'clients': {
      const clients = await prisma.client.findMany({
        where: { branchId },
        include: { sales: { where: { status: 'PAID' }, select: { totalCents: true, businessDate: true } } },
        orderBy: { name: 'asc' },
      });
      // Health information is deliberately excluded from every export except
      // the Owner's full backup.
      return csvResponse(
        'clients.csv',
        ['Name', 'Mobile', 'Email', 'Birthday', 'City', 'Visits', 'Lifetime spend', 'Last visit', 'Loyalty points', 'Tags'],
        clients.map((c) => [
          c.name, c.mobile, c.email,
          c.birthday?.toISOString().slice(0, 10) ?? '',
          c.addressCity,
          c.sales.length,
          centsToDecimalString(c.sales.reduce((a, s) => a + s.totalCents, 0)),
          c.sales.length ? c.sales.map((s) => s.businessDate).sort().at(-1)!.toISOString().slice(0, 10) : '',
          c.loyaltyPoints,
          c.tags.join('; '),
        ]),
      );
    }

    case 'lapsed-clients': {
      const rows = await retentionWatch([branchId], { fallbackDays: 60, onlyOverdue: true });
      return csvResponse(
        'lapsed-clients.csv',
        ['Name', 'Mobile', 'Email', 'Visits', 'Last visit', 'Days since', 'Usual interval (days)', 'Lifetime spend'],
        rows.map((r) => [
          r.name, r.mobile, r.email, r.visits,
          r.lastVisit?.toISOString().slice(0, 10) ?? '',
          r.daysSinceLastVisit,
          r.averageIntervalDays ?? '',
          centsToDecimalString(r.lifetimeSpendCents),
        ]),
      );
    }

    /* ---------------------------------------------------------- employees */
    case 'attendance': {
      const rows = await prisma.attendance.findMany({
        where: { branchId, workDate: { gte: from, lte: to } },
        include: { employee: { select: { name: true, employeeRole: true } } },
        orderBy: [{ workDate: 'asc' }, { rotationRank: 'asc' }],
      });
      return csvResponse(
        `attendance-${range.fromKey}_${range.toKey}.csv`,
        ['Date', 'Employee', 'Role', 'Time in', 'Time out', 'Queue #', 'Late', 'Late minutes', 'Absent'],
        rows.map((a) => [
          a.workDate.toISOString().slice(0, 10),
          a.employee.name, a.employee.employeeRole,
          a.timeIn ? formatManila(a.timeIn, { time: true }) : '',
          a.timeOut ? formatManila(a.timeOut, { time: true }) : '',
          a.rotationRank || '',
          a.isLate ? 'yes' : 'no', a.lateMinutes,
          a.isAbsent ? 'yes' : 'no',
        ]),
      );
    }

    case 'commissions': {
      const rows = await prisma.commission.findMany({
        where: { businessDate: { gte: from, lte: to }, sale: { branchId } },
        include: {
          employee: { select: { name: true } },
          sale: { select: { receiptNo: true, status: true } },
          saleLine: { select: { description: true } },
        },
        orderBy: { businessDate: 'asc' },
      });
      return csvResponse(
        `commissions-${range.fromKey}_${range.toKey}.csv`,
        ['Date', 'Employee', 'Receipt', 'Service', 'Basis (list price)', 'Rate', 'Commission', 'Sale status', 'Paid out'],
        rows.map((c) => [
          c.businessDate.toISOString().slice(0, 10),
          c.employee.name, c.sale.receiptNo, c.saleLine.description,
          centsToDecimalString(c.basisCents),
          c.rateType === 'PERCENT' ? `${c.rateValue}%` : centsToDecimalString(c.rateValue),
          centsToDecimalString(c.amountCents),
          c.sale.status,
          c.payslipId ? 'yes' : 'no',
        ]),
      );
    }

    case 'payroll': {
      assert(user.role !== 'RECEPTIONIST', 403, 'Payroll is not available to your role.');
      const periodId = url.searchParams.get('periodId');
      assert(periodId, 400, 'A payroll period is required.');
      const period = await prisma.payrollPeriod.findUnique({
        where: { id: periodId },
        include: {
          payslips: {
            include: { employee: true, lines: { orderBy: { sortRank: 'asc' } } },
            orderBy: { employee: { name: 'asc' } },
          },
        },
      });
      assert(period, 404, 'Payroll period not found.');
      // The Manager cannot export the Owner-only payslips.
      const slips = period.payslips.filter(
        (p) => user.role === 'OWNER' || !p.employee.payOwnerOnly,
      );
      return csvResponse(
        `payroll-${period.startDate.toISOString().slice(0, 10)}.csv`,
        ['Employee', 'Role', 'Days worked', 'Holiday days', 'Base pay', 'Commissions', 'Tips', 'Deductions', 'Net pay', 'Breakdown'],
        slips.map((p) => [
          p.employee.name, p.employee.employeeRole,
          p.daysWorked, p.holidayDays,
          centsToDecimalString(p.basePayCents),
          centsToDecimalString(p.commissionCents),
          centsToDecimalString(p.tipsCents),
          centsToDecimalString(p.deductionsCents),
          centsToDecimalString(p.netPayCents),
          p.lines.map((l) => `${l.label}: ${centsToDecimalString(l.amountCents)}`).join('; '),
        ]),
      );
    }

    case 'utilisation': {
      const util = await therapistUtilisation([branchId], range);
      return csvResponse(
        `therapist-utilisation-${range.fromKey}_${range.toKey}.csv`,
        ['Therapist', 'On-duty minutes', 'Booked minutes', 'Utilisation %'],
        util.rows.map((r) => [r.name, r.availableMinutes, r.bookedMinutes, r.utilisation]),
      );
    }

    /* ---------------------------------------------------------- inventory */
    case 'inventory': {
      const items = await prisma.item.findMany({
        where: { branchId },
        include: { category: true, unit: true, supplier: { select: { name: true } } },
        orderBy: { name: 'asc' },
      });
      return csvResponse(
        'inventory-stock-levels.csv',
        ['Item', 'Category', 'Unit', 'Stock', 'Reorder level', 'Cost', 'Retail price', 'Stock value', 'Supplier', 'Archived'],
        items.map((i) => [
          i.name, i.category.name, i.unit.name, i.stockQty, i.reorderLevel,
          centsToDecimalString(i.costCents), centsToDecimalString(i.retailPriceCents),
          centsToDecimalString(Math.round(i.costCents * i.stockQty)),
          i.supplier?.name ?? '', i.archived ? 'yes' : 'no',
        ]),
      );
    }

    case 'stock-movements': {
      const rows = await prisma.stockMovement.findMany({
        where: { branchId, createdAt: { gte: new Date(`${range.fromKey}T00:00:00+08:00`) } },
        include: { item: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return csvResponse(
        `stock-movements-${range.fromKey}_${range.toKey}.csv`,
        ['When', 'Item', 'Type', 'Quantity', 'Unit cost', 'Reason', 'Reference', 'User'],
        rows.map((m) => [
          formatManila(m.createdAt, { time: true }), m.item.name, m.type, m.quantity,
          centsToDecimalString(m.unitCostCents), m.reason, `${m.refType} ${m.refId}`.trim(), m.userName,
        ]),
      );
    }

    case 'purchases': {
      const rows = await prisma.purchaseOrder.findMany({
        where: { branchId },
        include: { supplier: true, lines: { include: { item: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return csvResponse(
        'purchase-history.csv',
        ['PO number', 'Date', 'Supplier', 'Status', 'Items', 'Total', 'Approved by', 'Received'],
        rows.map((p) => [
          p.number, p.createdAt.toISOString().slice(0, 10), p.supplier.name, p.status,
          p.lines.map((l) => `${l.item.name} x${l.quantity}`).join('; '),
          centsToDecimalString(p.totalCents), p.approvedBy ?? '',
          p.receivedAt?.toISOString().slice(0, 10) ?? '',
        ]),
      );
    }

    /* ------------------------------------------------------------ finance */
    case 'pl': {
      const pl = await profitAndLoss([branchId], monthRange(monthKey));
      return csvResponse(
        `profit-and-loss-${monthKey}.csv`,
        ['Line', 'Amount'],
        [
          ['Gross sales (list price)', centsToDecimalString(pl.revenueCents)],
          ['Less: discounts', centsToDecimalString(-pl.discountCents)],
          ['Net revenue', centsToDecimalString(pl.netRevenueCents)],
          ['Less: cost of goods sold', centsToDecimalString(-pl.cogsCents)],
          ['Gross profit', centsToDecimalString(pl.grossProfitCents)],
          ...pl.expenseByCategory.map((c) => [`Less: ${c.name}`, centsToDecimalString(-c.amountCents)]),
          ['Total operating expenses', centsToDecimalString(-pl.expenseCents)],
          ['NET PROFIT', centsToDecimalString(pl.netProfitCents)],
        ],
      );
    }

    case 'expenses': {
      const rows = await prisma.expense.findMany({
        where: { branchId, expenseDate: { gte: from, lte: to } },
        include: {
          category: true,
          submittedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
        },
        orderBy: { expenseDate: 'asc' },
      });
      return csvResponse(
        `expenses-${range.fromKey}_${range.toKey}.csv`,
        ['Date', 'Description', 'Category', 'Amount', 'Method', 'Status', 'Submitted by', 'Approved by', 'Voided'],
        rows.map((e) => [
          e.expenseDate.toISOString().slice(0, 10), e.description, e.category.name,
          centsToDecimalString(e.amountCents), e.method, e.status,
          e.submittedBy.name, e.approvedBy?.name ?? '', e.voided ? `yes: ${e.voidReason}` : 'no',
        ]),
      );
    }

    /* ---------------------------------------------- BIR journals & ledger */
    case 'journal': {
      assert(user.role !== 'RECEPTIONIST', 403, 'Journals are Owner/Manager only.');
      const source = url.searchParams.get('source') ?? 'SALES';

      if (source === 'LEDGER') {
        const lines = await prisma.journalLine.findMany({
          where: { entry: { branchId, entryDate: { gte: from, lte: to } } },
          include: { account: true, entry: true },
          orderBy: [{ account: { code: 'asc' } }, { entry: { entryDate: 'asc' } }],
        });
        let runningCode = '';
        let balance = 0;
        const rows: unknown[][] = [];
        for (const l of lines) {
          if (l.account.code !== runningCode) {
            runningCode = l.account.code;
            balance = 0;
          }
          balance += l.debitCents - l.creditCents;
          rows.push([
            l.account.code, l.account.name,
            l.entry.entryDate.toISOString().slice(0, 10),
            l.entry.reference, l.memo || l.entry.memo,
            centsToDecimalString(l.debitCents), centsToDecimalString(l.creditCents),
            centsToDecimalString(balance),
          ]);
        }
        return csvResponse(
          `general-ledger-${monthKey}.csv`,
          ['Account code', 'Account', 'Date', 'Reference', 'Memo', 'Debit', 'Credit', 'Running balance'],
          rows,
        );
      }

      const entries = await prisma.journalEntry.findMany({
        where: { branchId, source: source as never, entryDate: { gte: from, lte: to } },
        include: { lines: { include: { account: true } } },
        orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      });
      return csvResponse(
        `${source.toLowerCase()}-journal-${monthKey}.csv`,
        ['Date', 'Reference', 'Memo', 'Account code', 'Account', 'Debit', 'Credit'],
        entries.flatMap((e) =>
          e.lines.map((l) => [
            e.entryDate.toISOString().slice(0, 10), e.reference, l.memo || e.memo,
            l.account.code, l.account.name,
            centsToDecimalString(l.debitCents), centsToDecimalString(l.creditCents),
          ]),
        ),
      );
    }

    /* ---------------------------------------------------------------- KPI */
    case 'kpi': {
      const board = await kpiScorecard([branchId], monthKey);
      return csvResponse(
        `kpi-scorecard-${monthKey}.csv`,
        ['KPI', 'Value', 'Previous month', 'Target', 'Status'],
        board.rows.map((r) => {
          const fmt = (v: number) =>
            r.format === 'money'
              ? centsToDecimalString(v)
              : r.format === 'percent'
                ? `${v}%`
                : r.format === 'rating'
                  ? (v / 10).toFixed(1)
                  : String(v);
          const status =
            r.target === null
              ? 'no target'
              : r.invert
                ? r.value <= r.target ? 'on target' : 'above target'
                : r.value >= r.target ? 'on target' : 'below target';
          return [r.label, fmt(r.value), fmt(r.previous), r.target === null ? '' : fmt(r.target), status];
        }),
      );
    }

    default:
      assert(false, 404, `Unknown report "${report}".`);
  }
});
