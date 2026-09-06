import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, BackLink } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; sensitive?: string }> }) {
  await requireStaffPage('audit.view');
  const { q, sensitive } = await searchParams;
  const rows = await prisma.auditLog.findMany({ where: { ...(sensitive ? { sensitive: true } : {}), ...(q ? { OR: [{ entityId: { contains: q } }, { summary: { contains: q, mode: 'insensitive' } }, { userName: { contains: q, mode: 'insensitive' } }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 300 });
  return (
    <>
      <BackLink href="/admin/settings">Settings</BackLink>
      <PageHeader title="Audit trail" subtitle="Append-only. Every payment approval, refund, price change and permission change." actions={<Link href="/admin/settings/signins" className="btn btn-secondary btn-sm">Sign-ins</Link>} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search" className="field max-w-xs" /><label className="flex items-center gap-1 text-sm"><input type="checkbox" name="sensitive" value="1" defaultChecked={Boolean(sensitive)} /> Sensitive only</label><button className="btn btn-secondary" type="submit">Filter</button></form>
      <div className="card overflow-x-auto"><table className="data">
        <thead><tr><th>When</th><th>Who</th><th>Module</th><th>Action</th><th>Entity</th><th>Summary</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className={r.sensitive ? 'bg-[#fdf0dd]/40' : ''}><td className="text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</td><td className="text-xs">{r.userName}<br />{r.role}</td><td>{r.module}</td><td>{r.action}</td><td className="text-xs">{r.entityType} {r.entityId.slice(0, 12)}</td><td className="text-xs">{r.summary}</td></tr>)}</tbody>
      </table></div>
    </>
  );
}
