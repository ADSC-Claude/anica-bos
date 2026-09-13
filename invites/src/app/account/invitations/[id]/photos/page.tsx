import { notFound, redirect } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { entitled } from '@/lib/tiers';
import { guestPhotos } from '@/lib/photos';
import { contentOf } from '@/lib/invitations';
import { bool, sectionOnCard } from '@/lib/sections';
import { whyLocked } from '@/lib/progress';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, Stat, Empty, Card } from '@/components/ui';
import { SectionSwitches } from '@/components/account/section-switches';
import { imageUrl, IMAGE } from '@/lib/images';
import { PhotoButtons } from './buttons';

export const dynamic = 'force-dynamic';

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const invitation = await ownInvitation(user, id).catch((e) => {
    if (e instanceof HttpError) notFound();
    throw e;
  });
  const media = await guestPhotos(invitation.id);
  if (!entitled(invitation, 'photoSharing')) redirect(`/account/invitations/${invitation.id}/upgrade`);

  const section = contentOf(invitation.content).photos ?? {};
  const open = bool(section, 'enabled');
  const moderated = bool(section, 'moderated');
  const shown = media.filter((m) => m.approved).length;
  const waiting = media.length - shown;

  // The switches save the section, and saveSection refuses a customer's save
  // when the section is not on this card at all (a Save the Date carries no
  // album). The album is one of the parts that stay theirs on a live page and
  // inside the window — whyLocked says so — because it is switched on at the
  // reception, which is inside both. A switch that always fails is worse than
  // one that says why it is off.
  const locked = !sectionOnCard('photos', invitation.occasion, Boolean(invitation.saveTheDateOfId))
    ? 'There is no album on this card, so there is nothing to switch on here.'
    : whyLocked(invitation, 'photos');

  return (
    <>
      <PageHeader
        title="Guest photos"
        subtitle={
          !open
            ? 'The album is off, so nothing shows on your page and guests cannot add photos.'
            : moderated
              ? 'Guests can add photos, and each one waits here for your approval.'
              : 'Guests can add photos, and they go straight onto your page.'
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Shown" value={shown} hint={open ? 'in the album' : 'once the album is on'} />
        <Stat label="Waiting for you" value={waiting} tone={waiting ? 'warn' : undefined} hint={waiting ? 'approve or hide below' : undefined} />
      </div>

      <Card title="Guest photos" className="mb-4">
        <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">
          A shared album your guests add to from their phones — no app, no login. Switch it on here, and choose whether you see each photo before it shows. When the day is over, download the whole album in one file.
        </p>
        <SectionSwitches
          invitationId={invitation.id}
          section="photos"
          data={section}
          disabled={locked}
          switches={[
            { field: 'enabled', label: 'Guests can add photos', on: 'The album is on your page and guests can add photos from their phones.', off: 'The album is off. Nothing shows on your page and nobody can add photos.' },
            { field: 'moderated', label: 'Approve each photo before it shows', on: 'New photos wait here for you; approve the ones you want in the album.', off: 'Photos go straight into the album; hide or delete anything you would rather not show.' },
          ]}
        />
      </Card>

      {media.length > 0 && (
        <p className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>{media.length} {media.length === 1 ? 'photo' : 'photos'} from your guests.</span>
          {/* A plain link, not a fetch: the browser saves the stream as it
              arrives, so an album of several gigabytes never sits in a tab. */}
          <a href={`/account/invitations/${invitation.id}/photos.zip`} className="btn btn-secondary btn-sm" download>
            Download all
          </a>
        </p>
      )}

      {media.length === 0 ? (
        <Empty>{open ? 'No photos yet. They will appear here as your guests add them.' : 'The album is off — switch it on above and the photos your guests add will appear here.'}</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <li key={m.id} className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(m.url, IMAGE.thumb)} alt={m.caption || `Photo from ${m.uploadedBy}`} className="aspect-square w-full object-cover" />
              <div className="space-y-2 p-3">
                {m.caption && <p className="text-sm">{m.caption}</p>}
                <p className="text-xs text-[color:var(--color-ink-500)]">
                  — {m.uploadedBy || 'a guest'} · {formatDateTime(m.createdAt)} · {m.approved ? 'shown' : 'waiting for approval'}
                </p>
                <PhotoButtons invitationId={invitation.id} photoId={m.id} approved={m.approved} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
