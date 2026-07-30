import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { minutesToLabel } from '@/lib/datetime';
import { PageHeader, StatusBadge, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { BranchForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Branches' };

export default async function BranchesPage() {
  const user = await requirePage('branches.manage');

  const branches = await prisma.branch.findMany({
    include: {
      _count: { select: { employees: true, clients: true, resources: true, items: true, sales: true } },
      receiptSeries: true,
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return (
    <div>
      <PageHeader
        title="Branches"
        subtitle="Adding a branch is a Settings action. Everything else already carries a branch."
      />
      <SettingsNav role={user.role} current="/portal/settings/branches" />

      <div className="mb-4 max-w-3xl">
        <Alert tone="info">
          Each branch keeps its own staff, rooms, inventory, receipt series, EOD closings and
          payroll. Once there is more than one, the Dashboard, Reports and KPI pages gain a branch
          selector with a consolidated all-branches view, and the public booking form asks the
          client which branch they want.
        </Alert>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {branches.map((b) => (
            <div key={b.id} className="card-pad">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-moss-800">
                    {b.name} <span className="num text-xs text-moss-400">({b.code})</span>
                  </p>
                  <p className="text-xs text-moss-400">{b.address}</p>
                </div>
                <span className="flex items-center gap-2">
                  {b.isDefault && <StatusBadge status="OK" label="default" />}
                  <StatusBadge status={b.active ? 'ACTIVE' : 'CANCELLED'} label={b.active ? 'open' : 'closed'} />
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
                <Row label="Hours" value={`${minutesToLabel(b.openMinute)}–${minutesToLabel(b.closeMinute)}`} />
                <Row label="Employees" value={String(b._count.employees)} />
                <Row label="Clients" value={String(b._count.clients)} />
                <Row label="Rooms / beds" value={String(b._count.resources)} />
                <Row label="Inventory items" value={String(b._count.items)} />
                <Row label="Receipts issued" value={String(b._count.sales)} />
              </dl>
              {b.receiptSeries.length > 0 && (
                <p className="mt-2 text-xs text-moss-400">
                  Receipt series: {b.receiptSeries.map((s) => `${s.prefix} (next ${s.next})`).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>

        <BranchForm
          branches={branches.map((b) => ({
            id: b.id, name: b.name, code: b.code, address: b.address, contact: b.contact,
            openMinute: b.openMinute, closeMinute: b.closeMinute, active: b.active,
          }))}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-moss-400">{label}</dt>
      <dd className="text-moss-700">{value}</dd>
    </div>
  );
}
