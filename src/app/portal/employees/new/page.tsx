import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui';
import { EmployeeForm } from '@/components/employee-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Add employee' };

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('employees.edit');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const settings = await getSettings(branchId);

  const services = await prisma.service.findMany({
    where: { active: true },
    include: { category: { select: { name: true, sortRank: true } } },
    orderBy: [{ category: { sortRank: 'asc' } }, { sortRank: 'asc' }],
  });

  return (
    <div className="max-w-2xl">
      <PageHeader title="Add employee" subtitle="Therapists do not log in — they are managed as records." />
      <EmployeeForm
        branchId={branchId}
        values={{ active: true }}
        canSeePay
        canSeeGov={can(user.role, 'employees.govNumbers')}
        defaultAllowancePesos={settings['payroll.dailyAllowanceCents'] / 100}
        services={services.map((s) => ({ id: s.id, name: s.name, categoryName: s.category.name }))}
      />
    </div>
  );
}
