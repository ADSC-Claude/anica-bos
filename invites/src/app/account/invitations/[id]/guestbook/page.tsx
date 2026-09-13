import { notFound, redirect } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { hasFeature } from '@/lib/tiers';
import { formatDateTime } from '@/lib/datetime';
import { contentOf } from '@/lib/invitations';
import { bool, sectionOnCard } from '@/lib/sections';
import { whyLocked } from '@/lib/progress';
import { PageHeader, Stat, Empty, Card } from '@/components/ui';
import { SectionSwitches } from '@/components/account/section-switches';
import { ModerateButtons } from './buttons';

export const dynamic = 'force-dynamic';

export default async function GuestbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (!hasFeature(inv.tier, 'guestbook')) redirect(`/account/invitations/${inv.id}/upgrade`);
  const entries = await prisma.guestbookEntry.findMany({ where: { invitationId: inv.id }, orderBy: [{ approved: 'asc' }, { createdAt: 'desc' }] });

  const section = contentOf(inv.content).guestbook ?? {};
  const on = bool(section, 'enabled');
  const moderated = bool(section, 'moderated');
  const shown = entries.filter((e) => e.approved).length;
  const waiting = entries.length - shown;

  // The switches save the section, and saveSection refuses a customer's save
  // when the section is not on this card at all (the tab is by package, the
  // page by occasion). The guestbook is one of the parts that stay theirs on
  // a live page and inside the window — whyLocked says so — because the wall
  // is opened for the day, not before it. A switch that always fails is worse
  // than one that says why it is off.
  const locked = !sectionOnCard('guestbook', inv.occasion, Boolean(inv.saveTheDateOfId))
    ? 'There is no guestbook page on this invitation, so there is nothing to switch on here.'
    : whyLocked(inv, 'guestbook');

  return (
    <>
      <PageHeader
        title="Guestbook"
        subtitle={
          !on
            ? 'The guestbook is off, so nothing shows on your page and nobody can write.'
            : moderated
              ? 'The wall is on your page, and each new wish waits here for your approval.'
              : 'The wall is on your page, and wishes go straight onto it.'
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Shown" value={shown} hint={on ? 'on the wall' : 'once the guestbook is on'} />
        <Stat label="Waiting for you" value={waiting} tone={waiting ? 'warn' : undefined} hint={waiting ? 'approve or delete below' : undefined} />
      </div>

      <Card title="Guestbook" className="mb-4">
        <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">
          A wall of wishes on your page, written by your guests. Switch it on here, and choose whether you read each wish before it shows. Anything you delete is gone.
        </p>
        <SectionSwitches
          invitationId={inv.id}
          section="guestbook"
          data={section}
          disabled={locked}
          switches={[
            { field: 'enabled', label: 'Guests can write in the guestbook', on: 'The wall is on your page and guests can leave a wish.', off: 'The guestbook is off. Nothing shows on your page and nobody can write.' },
            { field: 'moderated', label: 'Approve each wish before it shows', on: 'New wishes wait here for you; approve the ones you want on the wall.', off: 'Wishes go straight onto the wall; delete anything you would rather not show.' },
          ]}
        />
      </Card>

      {entries.length === 0 ? (
        <Empty>{on ? 'No wishes yet. They will appear here as guests write them.' : 'The guestbook is off — switch it on above and wishes will appear here.'}</Empty>
      ) : (
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
