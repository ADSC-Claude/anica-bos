import { notFound } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { listRevisions } from '@/lib/revisions';
import { KEEP_RECENT, KEEP_DAYS } from '@/lib/revision-keep';
import { whyLocked } from '@/lib/progress';
import { sectionLabel, type SectionKey } from '@/lib/sections';
import { formatDateTime, relative } from '@/lib/datetime';
import { PageHeader, Empty, Notice } from '@/components/ui';
import { RestoreButton } from './restore';

export const dynamic = 'force-dynamic';

/**
 * Every save that changed something, newest first, with a way back to each.
 * The list is the safety net under auto-save: nothing on the form asks
 * "are you sure", because this page is where a wrong keystroke and a wrong
 * week are both undone.
 */
export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const revisions = await listRevisions(inv.id);
  // a restore changes the words and pictures, so it is locked exactly as they are
  const locked = whyLocked(inv, 'cover');
  const what = (section: string) => (section === 'restore' ? 'before a restore' : `before a change to ${sectionLabel(section as SectionKey, inv.occasion)}`);

  return (
    <>
      <PageHeader title="History" subtitle={`Every save that changed something is kept here: the last ${KEEP_RECENT}, and one a day for ${KEEP_DAYS} days.`} />
      <p className="mb-4 max-w-2xl text-sm text-[color:var(--color-ink-500)]">
        Each version is your whole invitation as it was at that moment. Restore puts everything back to it — and saves how things are now first, so a restore can itself be undone from the top of this list.
      </p>
      {locked && <Notice tone="warn">{locked}</Notice>}
      {revisions.length === 0 ? (
        <Empty>Nothing to go back to yet. Versions appear here as you make changes on the Invitation tab.</Empty>
      ) : (
        <ol className="card divide-y divide-[color:var(--color-sand-100)]">
          {revisions.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{relative(r.createdAt)}{i === 0 ? ' · the latest' : ''}</p>
                <p className="text-xs text-[color:var(--color-ink-500)]">{formatDateTime(r.createdAt)} · {what(r.section)} · {r.title}</p>
              </div>
              <RestoreButton invitationId={inv.id} revisionId={r.id} when={formatDateTime(r.createdAt)} disabled={Boolean(locked)} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
