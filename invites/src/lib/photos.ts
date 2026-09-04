import 'server-only';
import { z } from 'zod';
import { prisma } from './db';
import { HttpError } from './errors';
import { contentOf, loadPublic } from './invitations';
import { guestByToken } from './guests';
import { hasFeature } from './tiers';
import { notify } from './notifications';
import { deleteFile, storeFile } from './storage';
import { bool, str } from './sections';

/**
 * The shared album. Guests add photos from their phones during and after the
 * day; the couple approves each one before it appears on the page.
 *
 * The defences are the guestbook's, for the same reason — there is no login
 * here — plus two of its own. Uploads are far more expensive than a line of
 * text, so the per-IP allowance is smaller and every invitation has a ceiling;
 * and an unapproved photo is never served, so a page cannot be defaced while
 * the couple sleeps.
 */

const WINDOW_MS = 60 * 60 * 1000;
const PER_IP_PER_HOUR = 12;
const PER_INVITATION = 500;

export const guestPhotoSchema = z.object({
  slug: z.string().min(1).max(80),
  token: z.string().max(80).optional(),
  name: z.string().trim().min(1, 'Please tell us your name.').max(120),
  caption: z.string().trim().max(280).optional(),
  /** Honeypot. Bots fill it; people never see it. */
  website: z.string().max(0).optional(),
});

export type GuestPhotoInput = z.infer<typeof guestPhotoSchema>;

/** Whether the album is open, and why not when it is closed. */
export function albumProblem(invitation: {
  tier: Parameters<typeof hasFeature>[0];
  content: unknown;
}): string | null {
  if (!hasFeature(invitation.tier, 'photoSharing')) return 'This invitation does not have a shared album.';
  if (!bool(contentOf(invitation.content).photos, 'enabled')) return 'The album is closed.';
  return null;
}

export async function submitGuestPhoto(input: GuestPhotoInput, file: File, ip: string) {
  const invitation = await loadPublic(input.slug);
  if (!invitation || invitation.expired) throw new HttpError(404, 'That invitation is no longer available.');

  const closed = albumProblem(invitation);
  if (closed) throw new HttpError(400, closed);

  // A personal link is not required, but if one is given it must be this
  // invitation's — the same rule the RSVP applies.
  if (input.token) {
    const guest = await guestByToken(input.token);
    if (!guest || guest.invitationId !== invitation.id) throw new HttpError(404, 'That personal link is not valid.');
  }

  const since = new Date(Date.now() - WINDOW_MS);
  const [fromThisIp, onThisInvitation] = await Promise.all([
    prisma.media.count({ where: { ip, kind: 'GUEST_PHOTO', createdAt: { gte: since } } }),
    prisma.media.count({ where: { invitationId: invitation.id, kind: 'GUEST_PHOTO' } }),
  ]);
  if (fromThisIp >= PER_IP_PER_HOUR) {
    throw new HttpError(429, 'That is a lot of photos at once. Please try again in a little while.');
  }
  if (onThisInvitation >= PER_INVITATION) {
    throw new HttpError(400, 'This album is full. Please send your photos to the hosts directly.');
  }

  const photos = contentOf(invitation.content).photos;
  const moderated = bool(photos, 'moderated');

  const stored = await storeFile({
    file,
    entityType: 'guest',
    entityId: invitation.id,
    visibility: 'public',
    accept: 'images',
  });

  const media = await prisma.media.create({
    data: {
      invitationId: invitation.id,
      kind: 'GUEST_PHOTO',
      url: stored.url,
      storagePath: stored.storagePath,
      contentType: stored.contentType,
      caption: input.caption ?? '',
      uploadedBy: input.name,
      approved: !moderated,
      sortOrder: onThisInvitation,
      ip,
    },
  });

  await notify(
    invitation.userId,
    `${input.name} added a photo`,
    moderated ? 'Waiting for your approval.' : (input.caption ?? ''),
    `/account/invitations/${invitation.id}/photos`,
  );

  return { media, pending: moderated };
}

/**
 * The owner's side. Each of these is scoped by the invitation id as well as
 * the photo id, so the caller's ownInvitation() check on the invitation is the
 * whole authorisation — a photo id belonging to somebody else's album simply
 * matches nothing.
 */

/** Everything a guest has sent, approved or not, newest first. */
export async function guestPhotos(invitationId: string) {
  return prisma.media.findMany({
    where: { invitationId, kind: 'GUEST_PHOTO' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function setPhotoApproval(invitationId: string, photoId: string, approved: boolean) {
  const { count } = await prisma.media.updateMany({
    where: { id: photoId, invitationId, kind: 'GUEST_PHOTO' },
    data: { approved },
  });
  if (!count) throw new HttpError(404, 'No such photo.');
}

export async function deleteGuestPhoto(invitationId: string, photoId: string) {
  const photo = await prisma.media.findFirst({
    where: { id: photoId, invitationId, kind: 'GUEST_PHOTO' },
  });
  if (!photo) throw new HttpError(404, 'No such photo.');
  // The row goes first: a file left behind is untidy, a row pointing at a file
  // that is already gone is a broken image on the guest page.
  await prisma.media.delete({ where: { id: photo.id } });
  await deleteFile(photo.storagePath);
}

/** The prompt shown above the upload form, with the couple's wording if set. */
export function albumPrompt(content: unknown, fallback: string): string {
  return str(contentOf(content).photos, 'prompt') || fallback;
}
