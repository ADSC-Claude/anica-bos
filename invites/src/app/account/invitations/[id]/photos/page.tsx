import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { hasFeature } from '@/lib/tiers';
import { guestPhotos } from '@/lib/photos';
import { contentOf } from '@/lib/invitations';
import { bool } from '@/lib/sections';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, Empty } from '@/components/ui';
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
  if (!hasFeature(invitation.tier, 'photoSharing')) redirect(`/account/invitations/${invitation.id}/upgrade`);

  const section = contentOf(invitation.content).photos;
  const open = bool(section, 'enabled');
  const moderated = bool(section, 'moderated');
  const waiting = media.filter((m) => !m.approved).length;

  return (
    <>
      <Link href={`/account/invitations/${invitation.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {invitation.title}</Link>
      <PageHeader
        title="Guest photos"
        subtitle={
          open
            ? moderated
              ? 'Guests can add photos. Nothing appears on your page until you approve it.'
              : 'Guests can add photos, and they appear on your page straight away. Hide anything you would rather not show.'
            : 'The album is switched off. Turn it on in the builder under Guest photos.'
        }
      />

      {waiting > 0 && (
        <p className="card mb-4 p-4 text-sm">
          <strong>{waiting}</strong> {waiting === 1 ? 'photo is' : 'photos are'} waiting for you.
        </p>
      )}

      {media.length === 0 ? (
        <Empty>No photos yet. They will show up here as your guests send them.</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <li key={m.id} className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.caption || `Photo from ${m.uploadedBy}`} className="aspect-square w-full object-cover" />
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
