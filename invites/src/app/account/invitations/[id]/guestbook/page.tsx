import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { hasFeature } from '@/lib/tiers';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, Empty } from '@/components/ui';
import { ModerateButtons } from './buttons';

export const dynamic = 'force-dynamic';

export default async function GuestbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (!hasFeature(inv.tier, 'guestbook')) redirect(`/account/invitations/${inv.id}/upgrade`);
  const entries = await prisma.guestbookEntry.findMany({ where: { invitationId: inv.id }, orderBy: [{ approved: 'asc' }, { createdAt: 'desc' }] });
  return (
    <>
      <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
      <PageHeader title="Guestbook" subtitle="Approve the wishes you want on the wall. Anything you delete is gone." />
      {entries.length === 0 ? <Empty>No wishes yet.</Empty> : (
        <ul className="card divide-y divide-[color:var(--color-sand-100)]">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div>
                <p className="whitespace-pre-line text-sm">{e.message}</p>
                <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">— {e.name} · {formatDateTime(e.createdAt)} · {e.approved ? 'shown' : 'waiting for approval'}</p>
              </div>
              <ModerateButtons invitationId={inv.id} entryId={e.id} approved={e.approved} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
