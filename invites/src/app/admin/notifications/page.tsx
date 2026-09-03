import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { markAllRead } from '@/lib/notifications';
import { relative } from '@/lib/datetime';
import { PageHeader, Empty } from '@/components/ui';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function readAll() {
  'use server';
  const user = await requireStaffPage();
  await markAllRead(user.id);
  revalidatePath('/admin/notifications');
}

export default async function AdminInbox() {
  const user = await requireStaffPage();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return (
    <>
      <PageHeader title="Inbox" actions={<form action={readAll}><button className="btn btn-secondary btn-sm" type="submit">Mark all read</button></form>} />
      {items.length === 0 ? <Empty>Nothing yet.</Empty> : (
        <ul className="card divide-y divide-[color:var(--color-sand-100)]">
          {items.map((n) => (
            <li key={n.id} className={`p-4 ${n.readAt ? '' : 'bg-[color:var(--color-sand-100)]'}`}>
              <div className="flex justify-between gap-3"><p className="font-semibold">{n.title}</p><span className="text-xs text-[color:var(--color-ink-500)]">{relative(n.createdAt)}</span></div>
              {n.body && <p className="text-sm">{n.body}</p>}
              {n.href && <Link href={n.href} className="text-sm underline">Open</Link>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
