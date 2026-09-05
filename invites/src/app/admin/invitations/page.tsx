import Link from 'next/link';
import type { InvitationStatus } from '@prisma/client';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { occasionLabel } from '@/lib/occasions';
import { formatDate } from '@/lib/datetime';
import { PageHeader, InvitationPill, Empty } from '@/components/ui';
import { invitationPath } from '@/lib/app-url';

export const dynamic = 'force-dynamic';
const STATUSES: InvitationStatus[] = ['DRAFT', 'PUBLISHED', 'EXPIRED', 'ARCHIVED'];

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireStaffPage('invitations.view');
  const { q, status } = await searchParams;
  const rows = await prisma.invitation.findMany({
    where: { ...(status && STATUSES.includes(status as InvitationStatus) ? { status: status as InvitationStatus } : {}), ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { slug: { contains: q } }, { user: { email: { contains: q, mode: 'insensitive' } } }] } : {}) },
    include: { user: { select: { name: true } }, template: { select: { name: true } }, _count: { select: { rsvps: true, guests: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Invitations" subtitle={`${rows.length} shown`} />
      <form className="mb-4 flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Title, slug or email" className="field max-w-xs" /><select name="status" defaultValue={status ?? ''} className="field max-w-[10rem]"><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select><button className="btn btn-secondary" type="submit">Filter</button></form>
      {rows.length === 0 ? <Empty>Nothing matches.</Empty> : (
        <div className="card overflow-x-auto"><table className="data">
          <thead><tr><th>Title</th><th>Customer</th><th>Occasion</th><th>Tier</th><th>Status</th><th>Event</th><th>Views</th><th>RSVPs</th></tr></thead>
          <tbody>{rows.map((i) => <tr key={i.id}><td><Link href={`/admin/invitations/${i.id}`} className="underline">{i.title}</Link><span className="block text-xs text-[color:var(--color-ink-500)]">{invitationPath(i.slug)} · {i.template.name}</span></td><td>{i.user.name}</td><td>{occasionLabel(i.occasion)}</td><td>{i.tier}</td><td><InvitationPill status={i.status} /></td><td className="text-xs">{formatDate(i.eventAt, 'short')}</td><td>{i.viewCount}</td><td>{i._count.rsvps}{i._count.guests ? ` / ${i._count.guests}` : ''}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
