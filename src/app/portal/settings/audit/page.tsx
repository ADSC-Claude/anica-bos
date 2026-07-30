import Link from 'next/link';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

const MODULES = ['', 'auth', 'clients', 'appointments', 'sales', 'employees', 'inventory', 'finance', 'marketing', 'settings', 'messages', 'reports', 'jobs'];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; user?: string; action?: string; sensitive?: string; page?: string }>;
}) {
  const user = await requirePage('audit.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const perPage = 100;

  const where = {
    ...(params.module ? { module: params.module } : {}),
    ...(params.user ? { userId: params.user } : {}),
    ...(params.action ? { action: { contains: params.action } } : {}),
    ...(params.sensitive === '1' ? { sensitive: true } : {}),
  };

  const [entries, total, users, sensitiveCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.auditLog.count({ where: { sensitive: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit &amp; activity log"
        subtitle="Append-only. Nobody — including you — can edit or delete an entry."
        actions={
          <Link href="/api/portal/audit-export" className="btn-secondary btn-sm">
            Export CSV
          </Link>
        }
      />
      <SettingsNav role={user.role} current="/portal/settings/audit" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Entries (filtered)" value={String(total)} />
        <StatCard label="Sensitive actions" value={String(sensitiveCount)} hint="voids, refunds, price and pay changes" />
        <StatCard label="Page" value={`${page} of ${Math.max(1, Math.ceil(total / perPage))}`} />
        <StatCard label="Retention" value="10 years" hint="never pruned automatically" />
      </div>

      <div className="mb-4">
        <Alert tone="info">
          Every create, edit, void and status change is recorded with the user, timestamp,
          device/IP and before/after values — alongside the login history in Settings → Users.
        </Alert>
      </div>

      <form className="mb-4 flex flex-wrap gap-2" action="/portal/settings/audit">
        <select name="module" className="select w-auto" defaultValue={params.module ?? ''}>
          {MODULES.map((m) => (
            <option key={m || 'all'} value={m}>{m || 'All modules'}</option>
          ))}
        </select>
        <select name="user" className="select w-auto" defaultValue={params.user ?? ''}>
          <option value="">All users</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input name="action" className="input w-auto" placeholder="Action contains…"
          defaultValue={params.action ?? ''} />
        <label className="flex items-center gap-2 text-sm text-moss-700">
          <input type="checkbox" name="sensitive" value="1" className="h-5 w-5 accent-[#345a3e]"
            defaultChecked={params.sensitive === '1'} />
          Sensitive only
        </label>
        <button className="btn-secondary" type="submit">Filter</button>
      </form>

      {entries.length === 0 ? (
        <EmptyState title="No log entries match" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Module</th>
                <th>Action</th>
                <th>What happened</th>
                <th>Before → after</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={e.sensitive ? 'bg-clay-500/5' : ''}>
                  <td className="whitespace-nowrap text-xs">{formatManila(e.createdAt, { time: true })}</td>
                  <td className="text-xs">
                    {e.userName}
                    <span className="block text-[10px] uppercase text-moss-400">{e.role}</span>
                  </td>
                  <td className="text-xs">{e.module}</td>
                  <td className="text-xs">
                    {e.action}
                    {e.sensitive && <StatusBadge status="BAD" label="sensitive" />}
                  </td>
                  <td className="max-w-72 text-xs text-moss-600">{e.summary}</td>
                  <td className="max-w-64 text-[10px] text-moss-400">
                    {e.before || e.after ? (
                      <details>
                        <summary className="cursor-pointer">view</summary>
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify({ before: e.before, after: e.after }, null, 1)}
                        </pre>
                      </details>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num text-[10px] text-moss-400">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-between">
        {page > 1 ? (
          <Link href={`/portal/settings/audit?page=${page - 1}`} className="btn-secondary btn-sm">
            ← Newer
          </Link>
        ) : <span />}
        {page * perPage < total && (
          <Link href={`/portal/settings/audit?page=${page + 1}`} className="btn-secondary btn-sm">
            Older →
          </Link>
        )}
      </div>
    </div>
  );
}
