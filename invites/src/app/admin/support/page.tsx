import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, Empty } from '@/components/ui';
import { Flash, type FlashParams } from '../flash';
import { supportReplyAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SupportInbox({ searchParams }: { searchParams: Promise<FlashParams & { user?: string }> }) {
  const user = await requireStaffPage('support.view');
  const sp = await searchParams;
  const s = await getSettings();
  const latest = await prisma.supportMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 500, include: { user: { select: { id: true, name: true, email: true, messenger: true, viber: true, phone: true } } } });
  const threads = new Map<string, { user: (typeof latest)[number]['user']; last: (typeof latest)[number]; unread: number }>();
  for (const m of latest) {
    const t = threads.get(m.userId) ?? { user: m.user, last: m, unread: 0 };
    if (!m.fromStaff && !m.readAt) t.unread++;
    threads.set(m.userId, t);
  }
  const selected = sp.user ? latest.filter((m) => m.userId === sp.user).reverse() : [];
  const selectedUser = sp.user ? threads.get(sp.user)?.user : null;
  return (
    <>
      <PageHeader title="Support inbox" subtitle="In-app messages. For anything urgent, customers usually reach us on Messenger or Viber — the links below jump to their thread." />
      <Flash {...sp} />
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="card divide-y divide-[color:var(--color-sand-100)]">
          {threads.size === 0 && <p className="p-4 text-sm text-[color:var(--color-ink-500)]">No messages.</p>}
          {[...threads.values()].map((t) => (
            <Link key={t.user.id} href={`/admin/support?user=${t.user.id}`} className={`block p-3 text-sm hover:bg-[color:var(--color-sand-100)] ${sp.user === t.user.id ? 'bg-[color:var(--color-sand-100)]' : ''}`}>
              <div className="flex justify-between"><span className="font-semibold">{t.user.name}</span>{t.unread > 0 && <span className="pill pill-bad">{t.unread}</span>}</div>
              <p className="truncate text-xs text-[color:var(--color-ink-500)]">{t.last.body}</p>
            </Link>
          ))}
        </div>
        <div className="card p-4">
          {!selectedUser ? <Empty>Pick a conversation.</Empty> : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><Link href={`/admin/customers/${selectedUser.id}`} className="font-semibold underline">{selectedUser.name}</Link> · {selectedUser.email}{selectedUser.phone && ` · ${selectedUser.phone}`}</span>
                <span className="flex gap-2 text-xs">{selectedUser.messenger && <a href={selectedUser.messenger} className="underline" target="_blank" rel="noopener">Their Messenger</a>}<a href={s['contact.messenger']} className="underline" target="_blank" rel="noopener">Our Messenger</a></span>
              </div>
              <ul className="space-y-2">{selected.map((m) => <li key={m.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${m.fromStaff ? 'ml-auto bg-[#e3edf7]' : 'bg-[color:var(--color-sand-100)]'}`}><p className="whitespace-pre-line">{m.body}</p><p className="mt-1 text-xs text-[color:var(--color-ink-500)]">{formatDateTime(m.createdAt)}</p></li>)}</ul>
              {can(user.role, 'support.reply') && <form action={supportReplyAction.bind(null, selectedUser.id, `/admin/support?user=${selectedUser.id}`)} className="mt-3 flex gap-2"><input name="body" className="field" placeholder="Reply…" required /><button className="btn btn-primary" type="submit">Send</button></form>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
