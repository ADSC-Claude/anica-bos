import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { DFY_COLUMNS } from '@/lib/dfy';
import { occasionLabel } from '@/lib/occasions';
import { formatDate } from '@/lib/datetime';
import { PageHeader } from '@/components/ui';
import { Flash, type FlashParams } from '../flash';

export const dynamic = 'force-dynamic';

export default async function DfyBoard({ searchParams }: { searchParams: Promise<FlashParams & { mine?: string }> }) {
  const user = await requireStaffPage('dfy.view');
  const sp = await searchParams;
  const jobs = await prisma.dfyJob.findMany({
    where: sp.mine ? { assigneeId: user.id } : {},
    include: { order: { select: { reference: true, serviceMode: true, tier: true, user: { select: { name: true } } } }, invitation: { select: { title: true, occasion: true } }, assignee: { select: { name: true } } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
  });
  const now = Date.now();
  return (
    <>
      <PageHeader title="Done-For-You queue" subtitle="Left to right. Cards turn red past their SLA." actions={<Link href={sp.mine ? '/admin/dfy' : '/admin/dfy?mine=1'} className="btn btn-secondary btn-sm">{sp.mine ? 'Show all' : 'Only mine'}</Link>} />
      <Flash {...sp} />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {DFY_COLUMNS.map((col) => {
          const cards = jobs.filter((j) => j.status === col.key && (col.key !== 'PUBLISHED' || Date.now() - j.updatedAt.getTime() < 14 * 86_400_000));
          return (
            <section key={col.key} className="w-64 shrink-0">
              <h2 className="mb-2 text-sm font-semibold">{col.label} <span className="text-[color:var(--color-ink-500)]">({cards.length})</span><span className="block text-xs font-normal text-[color:var(--color-ink-500)]">{col.hint}</span></h2>
              <div className="space-y-2">
                {cards.map((j) => {
                  const late = j.dueAt && j.dueAt.getTime() < now && !['PREVIEW_SENT', 'APPROVED', 'PUBLISHED'].includes(j.status);
                  return (
                    <Link key={j.id} href={`/admin/dfy/${j.id}`} className={`card block p-3 text-sm hover:bg-[color:var(--color-sand-100)] ${late ? 'border-[color:var(--bad)]' : ''}`}>
                      <p className="font-semibold">{j.invitation.title}</p>
                      <p className="text-xs text-[color:var(--color-ink-500)]">{j.order.reference} · {occasionLabel(j.invitation.occasion)} · {j.order.tier}{j.order.serviceMode === 'CONCIERGE' ? ' · Concierge' : ''}</p>
                      <p className="text-xs text-[color:var(--color-ink-500)]">{j.order.user.name}</p>
                      <p className="mt-1 flex justify-between text-xs"><span>{j.assignee?.name ?? <i>unassigned</i>}</span><span className={late ? 'text-[color:var(--bad)]' : ''}>{j.dueAt ? `due ${formatDate(j.dueAt, 'short')}` : ''}</span></p>
                      {j.revisionsUsed > 0 && <p className="text-xs text-[color:var(--color-ink-500)]">Revision {j.revisionsUsed}/{j.revisionsAllowed}</p>}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
