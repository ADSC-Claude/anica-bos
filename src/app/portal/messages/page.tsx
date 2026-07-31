import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatManila, businessDate, manilaDateKey } from '@/lib/datetime';
import { PageHeader, Tabs, EmptyState } from '@/components/ui';
import { MessageComposer } from './composer';
import { markMessagesReadAction, postAnnouncementAction, acknowledgeAnnouncementAction, postShiftNoteAction, commentShiftNoteAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Messages' };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; with?: string }>;
}) {
  const user = await requirePage('messages.use');
  const params = await searchParams;
  const tab = params.tab ?? 'dm';

  const tabs = [
    { href: '/portal/messages', label: 'Direct messages' },
    { href: '/portal/messages?tab=announcements', label: 'Announcements' },
    { href: '/portal/messages?tab=logbook', label: 'Shift notes' },
  ];

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Internal only — clients never see any of this."
      />
      <Tabs
        tabs={tabs}
        current={tab === 'dm' ? '/portal/messages' : `/portal/messages?tab=${tab}`}
      />
      {tab === 'dm' && <DirectMessages userId={user.id} withId={params.with} />}
      {tab === 'announcements' && <Announcements userId={user.id} canPost={can(user.role, 'announcements.post')} />}
      {tab === 'logbook' && <Logbook userId={user.id} branchId={user.branchId} />}
    </div>
  );
}

async function DirectMessages({ userId, withId }: { userId: string; withId?: string }) {
  const users = await prisma.user.findMany({
    where: { active: true, id: { not: userId } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
  const partnerId = withId ?? users[0]?.id;

  const messages = partnerId
    ? await prisma.directMessage.findMany({
        where: {
          OR: [
            { fromUserId: userId, toUserId: partnerId },
            { fromUserId: partnerId, toUserId: userId },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      })
    : [];

  const unreadByUser = await prisma.directMessage.groupBy({
    by: ['fromUserId'],
    where: { toUserId: userId, readAt: null },
    _count: { _all: true },
  });
  const unread = new Map(unreadByUser.map((u) => [u.fromUserId, u._count._all]));

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="card p-2">
        <ul className="space-y-0.5">
          {users.map((u) => (
            <li key={u.id}>
              <a
                href={`/portal/messages?with=${u.id}`}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                  u.id === partnerId ? 'bg-cocoa-100 font-medium' : 'hover:bg-sand-100'
                }`}
              >
                <span>
                  {u.name}
                  <span className="block text-[11px] capitalize text-cocoa-400">
                    {u.role.toLowerCase()}
                  </span>
                </span>
                {unread.get(u.id) ? (
                  <span className="rounded-full bg-clay-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unread.get(u.id)}
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="card flex min-h-96 flex-col">
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="muted py-8 text-center">No messages yet. Say hello.</p>
          ) : (
            messages.map((m) => {
              const mine = m.fromUserId === userId;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? 'bg-cocoa-600 text-white' : 'bg-sand-100 text-cocoa-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-cocoa-400'}`}>
                      {formatManila(m.createdAt, { time: true })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {partnerId && (
          <div className="border-t border-sand-200 p-3">
            <form action={markMessagesReadAction} className="hidden">
              <input type="hidden" name="fromUserId" value={partnerId} />
            </form>
            <MessageComposer toUserId={partnerId} />
          </div>
        )}
      </div>
    </div>
  );
}

async function Announcements({ userId, canPost }: { userId: string; canPost: boolean }) {
  const announcements = await prisma.announcement.findMany({
    include: {
      author: { select: { name: true } },
      reads: { include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {announcements.length === 0 ? (
          <EmptyState title="No announcements yet" />
        ) : (
          announcements.map((a) => {
            const readByMe = a.reads.some((r) => r.userId === userId);
            return (
              <div key={a.id} className={`card-pad ${readByMe ? '' : 'border-cocoa-400'}`}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-cocoa-800">{a.title}</p>
                  <span className="text-xs text-cocoa-400">
                    {a.author.name} · {formatManila(a.createdAt, { time: true })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-cocoa-700">{a.body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-cocoa-400">
                    Read by: {a.reads.length ? a.reads.map((r) => r.user.name).join(', ') : 'nobody yet'}
                  </p>
                  {!readByMe && (
                    <form action={acknowledgeAnnouncementAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn-secondary btn-sm" type="submit">
                        Acknowledge
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {canPost && (
        <form action={postAnnouncementAction} className="card-pad space-y-3">
          <p className="section-title">Post an announcement</p>
          <p className="muted">It pins to everyone&apos;s dashboard until they acknowledge it.</p>
          <label className="block">
            <span className="label">Title *</span>
            <input name="title" className="input" required />
          </label>
          <label className="block">
            <span className="label">Message *</span>
            <textarea name="body" className="textarea" rows={5} required />
          </label>
          <button className="btn-primary w-full" type="submit">Post</button>
        </form>
      )}
    </div>
  );
}

async function Logbook({ userId, branchId }: { userId: string; branchId: string | null }) {
  const notes = await prisma.shiftNote.findMany({
    where: branchId ? { branchId } : {},
    include: {
      author: { select: { name: true } },
      client: { select: { id: true, name: true } },
      comments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
    take: 40,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {notes.length === 0 ? (
          <EmptyState
            title="The logbook is empty"
            hint="Note incidents, client remarks and reminders for the next shift."
          />
        ) : (
          notes.map((n) => (
            <div key={n.id} className="card-pad">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-cocoa-500">
                  {n.noteDate.toISOString().slice(0, 10)}
                </p>
                <span className="text-xs text-cocoa-400">
                  {n.author.name} · {formatManila(n.createdAt, { time: true })}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-cocoa-700">{n.body}</p>
              {n.client && (
                <p className="mt-1 text-xs text-cocoa-400">
                  Client:{' '}
                  <a href={`/portal/clients/${n.client.id}`} className="underline underline-offset-4">
                    {n.client.name}
                  </a>
                </p>
              )}

              {n.comments.length > 0 && (
                <ul className="mt-3 space-y-1 border-l-2 border-sand-200 pl-3">
                  {n.comments.map((c) => (
                    <li key={c.id} className="text-sm">
                      <span className="font-medium text-cocoa-700">{c.user.name}:</span>{' '}
                      <span className="text-cocoa-600">{c.body}</span>
                      <span className="ml-1 text-[10px] text-cocoa-400">
                        {formatManila(c.createdAt, { time: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <form action={commentShiftNoteAction} className="mt-2 flex gap-1.5">
                <input type="hidden" name="noteId" value={n.id} />
                <input name="body" className="input min-h-9 py-1 text-sm" placeholder="Add a comment…" />
                <button className="btn-secondary btn-sm" type="submit">Reply</button>
              </form>
            </div>
          ))
        )}
      </div>

      <form action={postShiftNoteAction} className="card-pad space-y-3">
        <p className="section-title">New shift note</p>
        <input type="hidden" name="userId" value={userId} />
        <label className="block">
          <span className="label">Date</span>
          <input name="noteDate" type="date" className="input" defaultValue={manilaDateKey()} />
        </label>
        <label className="block">
          <span className="label">Note *</span>
          <textarea name="body" className="textarea" rows={5} required
            placeholder="e.g. Bed 3 squeaks — maintenance coming Thursday. Use Bed 5 for hot stone." />
        </label>
        <button className="btn-primary w-full" type="submit">Save note</button>
        <p className="text-[11px] text-cocoa-400">
          Notes cannot be deleted by the receptionist and are covered by the activity log.
        </p>
      </form>
    </div>
  );
}
