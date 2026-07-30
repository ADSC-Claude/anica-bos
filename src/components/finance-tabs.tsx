import type { Role } from '@prisma/client';
import { can } from '@/lib/rbac';
import { Tabs } from '@/components/ui';

export function FinanceTabs({ role, current }: { role: Role; current: string }) {
  const tabs = [
    ...(can(role, 'finance.view') ? [{ href: '/portal/finance/pl', label: 'Profit & Loss' }] : []),
    { href: '/portal/finance/expenses', label: 'Expenses' },
    ...(can(role, 'finance.view')
      ? [
          { href: '/portal/finance/cashflow', label: 'Cash flow' },
          { href: '/portal/finance/receivables', label: 'Receivables' },
          { href: '/portal/finance/journals', label: 'BIR journals' },
        ]
      : []),
  ];
  return <Tabs tabs={tabs} current={current} />;
}
