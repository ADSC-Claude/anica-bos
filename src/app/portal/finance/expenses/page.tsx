import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatManila, manilaMonthKey, monthBounds, dateKeyToBusinessDate } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState } from '@/components/ui';
import { FinanceTabs } from '@/components/finance-tabs';
import { ExpenseForm } from './form';
import { decideExpenseAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Expenses' };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; month?: string }>;
}) {
  const user = await requirePage('finance.submitExpense');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const monthKey = params.month ?? manilaMonthKey();
  const { fromKey, toKey } = monthBounds(monthKey);
  const canApprove = can(user.role, 'finance.approve');
  const canSeeAll = can(user.role, 'finance.view');

  const expenses = await prisma.expense.findMany({
    where: {
      branchId,
      expenseDate: { gte: dateKeyToBusinessDate(fromKey), lte: dateKeyToBusinessDate(toKey) },
      // A receptionist only sees what she submitted.
      ...(canSeeAll ? {} : { submittedById: user.id }),
    },
    include: {
      category: true,
      submittedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
  });

  const categories = await prisma.expenseCategory.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  });

  const approved = expenses.filter((e) => e.status === 'APPROVED' && !e.voided);
  const pending = expenses.filter((e) => e.status === 'PENDING');
  const operating = approved.filter((e) => !e.category.capitalized);

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={
          canSeeAll
            ? 'Everything the business spent, by category.'
            : 'Expenses you submitted. The Owner or Manager approves them.'
        }
        actions={
          <form className="flex gap-2" action="/portal/finance/expenses">
            <input type="month" name="month" defaultValue={monthKey} className="input w-auto" />
            <button className="btn-secondary btn-sm" type="submit">Go</button>
          </form>
        }
      />
      <FinanceTabs role={user.role} current="/portal/finance/expenses" />

      {canSeeAll && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Operating expenses" value={formatPeso(operating.reduce((a, e) => a + e.amountCents, 0))} />
          <StatCard
            label="Inventory purchases"
            value={formatPeso(approved.filter((e) => e.category.capitalized).reduce((a, e) => a + e.amountCents, 0))}
            hint="capitalised, hits P&L as COGS"
          />
          <StatCard label="Pending approval" value={String(pending.length)} tone={pending.length ? 'warn' : 'default'} />
          <StatCard label="Entries" value={String(expenses.length)} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          {expenses.length === 0 ? (
            <EmptyState title="No expenses this month" />
          ) : (
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Method</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    {canApprove && <th />}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className={e.voided ? 'opacity-50' : ''}>
                      <td className="whitespace-nowrap text-xs">
                        {e.expenseDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="text-sm">
                        {e.description}
                        <span className="block text-[11px] text-cocoa-400">
                          by {e.submittedBy.name}
                          {e.approvedBy && ` · approved by ${e.approvedBy.name}`}
                          {e.voided && ` · VOIDED: ${e.voidReason}`}
                          {e.rejectReason && ` · ${e.rejectReason}`}
                        </span>
                      </td>
                      <td className="text-xs text-cocoa-500">
                        {e.category.name}
                        {e.category.capitalized && (
                          <span className="block text-[10px] text-cocoa-400">capitalised</span>
                        )}
                      </td>
                      <td className="text-xs capitalize">
                        {e.method.replaceAll('_', ' ').toLowerCase()}
                      </td>
                      <td className="num text-right">{formatPeso(e.amountCents)}</td>
                      <td><StatusBadge status={e.voided ? 'VOIDED' : e.status} /></td>
                      {canApprove && (
                        <td className="whitespace-nowrap">
                          {e.status === 'PENDING' && (
                            <>
                              <form action={decideExpenseAction} className="inline">
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="decision" value="approve" />
                                <button className="btn-ghost btn-sm text-cocoa-600" type="submit">
                                  Approve
                                </button>
                              </form>
                              <form action={decideExpenseAction} className="inline">
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="decision" value="reject" />
                                <button className="btn-ghost btn-sm text-clay-500" type="submit">
                                  Reject
                                </button>
                              </form>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ExpenseForm
          branchId={branchId}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          autoApproves={canApprove}
        />
      </div>
    </div>
  );
}
