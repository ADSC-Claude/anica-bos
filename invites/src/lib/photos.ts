import 'server-only';
import { z } from 'zod';
import { prisma } from './db';
import { HttpError } from './errors';
import { contentOf, loadPublic } from './invitations';
import { guestByToken } from './guests';
import { entitled } from './tiers';
import type { Tier } from '@prisma/client';
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

/**
 * The four ceilings, and who each one is really counting.
 *
 * The first version counted one thing: twelve photos an hour from an address,
 * across every invitation on the site. At a reception that is wrong twice over.
 * A venue's wifi is a single public address for the whole room, so the twelve
 * were the room's, not a guest's — the thirteenth photo of the evening, from
 * whoever happened to send it, was refused and the guest was told they had sent
 * too many. And because the count ignored which invitation it was for, two
 * weddings at the same hotel shared the allowance.
 *
 * So the address is counted per invitation now, and sized as what it is: a
 * room. A guest who came through their own personal link is counted as
 * themselves and not as the room at all — they are a name on the couple's list,
 * not a stranger. Above both sits a ceiling on the album itself, because the
 * flood worth stopping is one album filling in minutes, and beneath everything
 * the total that has always been there.
 *
 * None of these is the real defence against a bot. That is moderation: an
 * unapproved photo is never served, so the worst a flood does is give the
 * couple a page of rejections to tap through, not a defaced invitation.
 */

/** One guest, through their own personal link, in an hour. */
const PER_GUEST_PER_HOUR = 40;

/** One address, on one invitation, in an hour — a room's worth, not a person's. */
const PER_IP_PER_HOUR = 120;

/** One album in an hour, however many phones are sending to it. */
const PER_INVITATION_PER_HOUR = 200;

/** One album, ever. */
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
  tier: Tier;
  addOns: string[];
  content: unknown;
}): string | null {
  if (!entitled(invitation, 'photoSharing')) return 'This invitation does not have a shared album.';
  if (!bool(contentOf(invitation.content).photos, 'enabled')) return 'The album is closed.';
  return null;
}

/** What each window has already seen when a photo arrives. */
export type PhotoCounts = {
  /** This guest's own uploads in the window, or null when no personal link was used. */
  guest: number | null;
  /** Uploads from this address to this invitation in the window. */
  ip: number;
  /** Uploads to this invitation in the window, from every address. */
  invitationHour: number;
  /** Uploads to this invitation, ever. */
  invitationTotal: number;
};

/**
 * Whether this photo is one too many, and what to tell the person holding the
 * phone.
 *
 * Pure, so the thresholds can be tested without filling a database, and so the
 * wording is in one place. What it says matters as much as what it refuses: the
 * old single message told a guest they had sent too many when the truth was
 * that the room had, which reads as an accusation and leaves them nothing to
 * do. Each of these says whose allowance ran out and whether waiting helps.
 */
export function photoLimit(counts: PhotoCounts): { status: number; message: string } | null {
  // The permanent one first: waiting will not help, so say so instead of
  // offering "in a few minutes".
  if (counts.invitationTotal >= PER_INVITATION) {
    return { status: 400, message: 'This album is full. Please send your photos to the hosts directly.' };
  }
  // A guest who came through their own link is counted as themselves, and the
  // address they share with the room is not counted against them at all.
  if (counts.guest !== null) {
    if (counts.guest >= PER_GUEST_PER_HOUR) {
      return { status: 429, message: 'That is a lot of photos at once. Please try again in a little while.' };
    }
  } else if (counts.ip >= PER_IP_PER_HOUR) {
    return { status: 429, message: 'Lots of photos are coming in from this network right now. Please try again in a few minutes.' };
  }
  if (counts.invitationHour >= PER_INVITATION_PER_HOUR) {
    return { status: 429, message: 'This album is receiving a lot of photos right now. Please try again in a few minutes.' };
  }
  return null;
}

export async function submitGuestPhoto(input: GuestPhotoInput, file: File, ip: string) {
  const invitation = await loadPublic(input.slug);
  if (!invitation || invitation.expired) throw new HttpError(404, 'That invitation is no longer available.');

  const closed = albumProblem(invitation);
  if (closed) throw new HttpError(400, closed);

  // A personal link is not required, but if one is given it must be this
  // invitation's — the same rule the RSVP applies. Who it belongs to is kept:
  // it is what lets a named invitee be counted as themselves below rather than
  // as everybody else on the venue's wifi.
  let guestId: string | null = null;
  if (input.token) {
    const guest = await guestByToken(input.token);
    if (!guest || guest.invitationId !== invitation.id) throw new HttpError(404, 'That personal link is not valid.');
    guestId = guest.id;
  }

  const since = new Date(Date.now() - WINDOW_MS);
  const mine = { invitationId: invitation.id, kind: 'GUEST_PHOTO' as const };
  const [guest, fromThisIp, thisHour, onThisInvitation] = await Promise.all([
    guestId ? prisma.media.count({ where: { ...mine, guestId, createdAt: { gte: since } } }) : Promise.resolve(0),
    prisma.media.count({ where: { ...mine, ip, createdAt: { gte: since } } }),
    prisma.media.count({ where: { ...mine, createdAt: { gte: since } } }),
    prisma.media.count({ where: mine }),
  ]);

  const problem = photoLimit({
    guest: guestId ? guest : null,
    ip: fromThisIp,
    invitationHour: thisHour,
    invitationTotal: onThisInvitation,
  });
  if (problem) throw new HttpError(problem.status, problem.message);

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
      guestId,
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

/**
 * What one photograph is called inside the downloaded album.
 *
 * Numbered first, so a folder sorted by name is the evening in order however
 * the computer sorts it, then whoever sent it, so the couple can see at a
 * glance who took what. The caption is left out: it can be a paragraph, it can
 * be emoji, and it is already on the page.
 *
 * Everything outside letters, digits and spaces goes. A guest types their own
 * name here, and a name with a slash or a colon in it is a file that will not
 * open on somebody's laptop — or, on an unlucky unzipper, a file written
 * somewhere it was not meant to go.
 */
export function albumFilename(n: number, photo: { uploadedBy: string; contentType: string; storagePath: string }): string {
  const who = (photo.uploadedBy || 'a guest')
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number} ]/gu, '')
    .trim()
    .slice(0, 40) || 'a guest';
  const ext = (photo.storagePath.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
    || (photo.contentType.split('/').pop() ?? 'jpg');
  return `${String(n).padStart(3, '0')} ${who}.${ext}`;
}

/** The prompt shown above the upload form, with the couple's wording if set. */
export function albumPrompt(content: unknown, fallback: string): string {
  return str(contentOf(content).photos, 'prompt') || fallback;
}
