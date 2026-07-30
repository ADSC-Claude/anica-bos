import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatusBadge, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { UserForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'User accounts' };

export default async function UsersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('users.manage');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);

  const [users, employees, branches, loginEvents] = await Promise.all([
    prisma.user.findMany({
      include: { branch: { select: { name: true } }, employee: { select: { name: true } } },
      orderBy: [{ active: 'desc' }, { role: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true, employeeRole: true },
      orderBy: { name: 'asc' },
    }),
    prisma.branch.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.loginEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
  ]);

  return (
    <div>
      <PageHeader
        title="User accounts"
        subtitle="Only three roles log in. Therapists are records, not accounts."
      />
      <SettingsNav role={user.role} current="/portal/settings/users" />

      <div className="mb-4 max-w-3xl">
        <Alert tone="info">
          <strong>Owner</strong> sees everything. <strong>Admin</strong> (the Manager) does
          everything except deleting financial records, managing accounts and changing
          system-critical settings — they can approve voids, refunds and purchase orders.{' '}
          <strong>Receptionist</strong> handles day-to-day work and never sees profit, payroll or
          full reports. These limits are enforced on the server, not just hidden in the interface.
        </Alert>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-moss-800">{u.name}</td>
                    <td className="text-xs">{u.email}</td>
                    <td className="text-xs capitalize">{u.role.toLowerCase()}</td>
                    <td className="text-xs text-moss-500">{u.branch?.name ?? '—'}</td>
                    <td className="text-xs text-moss-500">
                      {u.lastLoginAt ? formatManila(u.lastLoginAt, { time: true }) : 'never'}
                    </td>
                    <td className="whitespace-nowrap">
                      <StatusBadge status={u.active ? 'ACTIVE' : 'CANCELLED'} label={u.active ? 'active' : 'disabled'} />
                      {u.mustChangePassword && <StatusBadge status="WARN" label="must change password" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="section-title mb-3">Recent sign-in attempts</h2>
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Email</th>
                    <th>Result</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {loginEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-xs">{formatManila(e.createdAt, { time: true })}</td>
                      <td className="text-xs">{e.email}</td>
                      <td className="text-xs">
                        {e.success ? (
                          <span className="text-moss-600">success</span>
                        ) : (
                          <span className="text-clay-500">failed — {e.reason}</span>
                        )}
                      </td>
                      <td className="num text-xs text-moss-400">{e.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <UserForm
          branchId={branchId}
          users={users.map((u) => ({
            id: u.id, name: u.name, email: u.email, role: u.role,
            branchId: u.branchId ?? '', employeeId: u.employeeId ?? '', active: u.active,
          }))}
          employees={employees}
          branches={branches}
        />
      </div>
    </div>
  );
}
