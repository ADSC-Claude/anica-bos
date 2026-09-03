import Link from 'next/link';
import { requireCustomerPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { relative } from '@/lib/datetime';
import { PageHeader, Empty } from '@/components/ui';
import { markReadAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireCustomerPage();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return (
    <>
      <PageHeader title="Notifications" actions={<form action={markReadAction}><button type="submit" className="btn btn-secondary btn-sm">Mark all read</button></form>} />
      {items.length === 0 ? <Empty>Nothing yet. RSVPs, payment confirmations and DFY updates show up here.</Empty> : (
        <ul className="card divide-y divide-[color:var(--color-sand-100)]">
          {items.map((n) => (
            <li key={n.id} className={`p-4 ${n.readAt ? '' : 'bg-[color:var(--color-sand-100)]'}`}>
              <div className="flex justify-between gap-3">
                <p className="font-semibold">{n.title}</p>
                <span className="text-xs text-[color:var(--color-ink-500)]">{relative(n.createdAt)}</span>
              </div>
              {n.body && <p className="text-sm text-[color:var(--color-ink-700)]">{n.body}</p>}
              {n.href && <Link href={n.href} className="text-sm text-[color:var(--color-plum-600)] underline">Open</Link>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
