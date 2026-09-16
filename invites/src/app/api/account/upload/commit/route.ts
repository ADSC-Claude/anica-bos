import { z } from 'zod';
import { handle, requireApi, ownInvitation, HttpError } from '@/lib/guard';
import { directUploadUrl, publicObjectExists, AUDIO_TYPES } from '@/lib/storage';
import { prisma } from '@/lib/db';

const Body = z.object({ invitationId: z.string().min(1), storagePath: z.string().min(1).max(500), contentType: z.string() });

/**
 * The second step of a direct upload (see ../sign): the browser has put the
 * song file at the signed address, and this records it — after checking the
 * object is really there, under this invitation's own path.
 */
export const POST = handle(async (req) => {
  const user = await requireApi();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, 'Bad request.');
  const body = parsed.data;
  if (!AUDIO_TYPES.includes(body.contentType)) throw new HttpError(400, 'Only MP3 and M4A audio files are accepted.');

  const invitation = await ownInvitation(user, body.invitationId);
  const url = directUploadUrl(body.storagePath, 'inv', invitation.id);
  if (!url) throw new HttpError(400, 'That is not one of this invitation’s uploads.');
  if (!(await publicObjectExists(url))) throw new HttpError(400, 'The file did not arrive. Please try again.');

  const count = await prisma.media.count({ where: { invitationId: invitation.id } });
  const media = await prisma.media.create({
    data: { userId: user.id, invitationId: invitation.id, kind: 'AUDIO', url, storagePath: body.storagePath, contentType: body.contentType, sortOrder: count },
  });
  return { ok: true, url: media.url, id: media.id };
});
