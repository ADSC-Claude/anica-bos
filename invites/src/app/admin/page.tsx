import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { overview } from '@/lib/reports';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, Stat, Money, OrderPill, DfyPill } from '@/components/ui';
import { Flash, type FlashParams } from './flash';

export const dynamic = 'force-dynamic';

export default async function AdminHome({ searchParams }: { searchParams: Promise<FlashParams & { denied?: string }> }) {
  const user = await requireStaffPage('admin.dashboard');
  const sp = await searchParams;
  const [o, recentOrders, jobs] = await Promise.all([
    overview(),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { name: true } }, package: { select: { name: true } } } }),
    prisma.dfyJob.findMany({ where: { status: { notIn: ['PUBLISHED'] } }, orderBy: { dueAt: 'asc' }, take: 8, include: { order: { select: { reference: true } }, invitation: { select: { title: true } }, assignee: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Overview" subtitle={`Good day, ${user.name.split(' ')[0]}.`} />
      <Flash {...sp} />
      {sp.denied && <p className="mb-4 text-sm text-[color:var(--bad)]">Your role cannot open that module ({sp.denied}).</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/admin/payments"><Stat label="Proofs to verify" value={o.pendingProofs} tone={o.pendingProofs ? 'warn' : undefined} /></Link>
        <Link href="/admin/dfy"><Stat label="Open DFY jobs" value={o.openJobs} hint={o.overdueJobs ? `${o.overdueJobs} overdue` : 'none overdue'} tone={o.overdueJobs ? 'bad' : undefined} /></Link>
        <Stat label="Orders this month" value={o.ordersThisMonth} />
        {can(user.role, 'reports.view') ? <Stat label="Revenue this month" value={<Money cents={o.revenueThisMonthCents} short />} /> : <Stat label="Published invites" value={o.publishedTotal} />}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {can(user.role, 'orders.view') && (
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Latest orders</h2><Link href="/admin/orders" className="text-sm underline">All orders</Link></div>
            <table className="data">
              <tbody>
                {recentOrders.map((r) => (
                  <tr key={r.id}><td><Link href={`/admin/orders/${r.id}`} className="font-mono underline">{r.reference}</Link><span className="block text-xs text-[color:var(--color-ink-500)]">{r.user.name} · {r.package.name}</span></td><td><Money cents={r.totalCents} short /></td><td><OrderPill status={r.status} /></td><td className="text-xs">{formatDateTime(r.createdAt)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {can(user.role, 'dfy.view') && (
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">DFY queue</h2><Link href="/admin/dfy" className="text-sm underline">Kanban</Link></div>
            <table className="data">
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}><td><Link href={`/admin/dfy/${j.id}`} className="underline">{j.invitation.title}</Link><span className="block text-xs text-[color:var(--color-ink-500)]">{j.order.reference} · {j.assignee?.name ?? 'unassigned'}</span></td><td><DfyPill status={j.status} /></td><td className={`text-xs ${j.dueAt && j.dueAt < new Date() ? 'text-[color:var(--bad)]' : ''}`}>{j.dueAt ? `due ${formatDateTime(j.dueAt)}` : ''}</td></tr>
                ))}
                {jobs.length === 0 && <tr><td className="text-[color:var(--color-ink-500)]">Nothing in the queue.</td></tr>}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </>
  );
}
