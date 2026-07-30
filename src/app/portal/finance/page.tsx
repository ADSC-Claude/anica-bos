import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/** Receptionists only reach the expense submission screen. */
export default async function FinanceIndex() {
  const user = await requirePage('finance.submitExpense');
  redirect(can(user.role, 'finance.view') ? '/portal/finance/pl' : '/portal/finance/expenses');
}
