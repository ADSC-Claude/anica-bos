import { z } from 'zod';
import { handle, requireApi, ownInvitation, HttpError } from '@/lib/guard';
import { signedUpload, storageConfigured, AUDIO_TYPES, AUDIO_MAX_BYTES } from '@/lib/storage';
import { prisma } from '@/lib/db';

const Body = z.object({ invitationId: z.string().min(1), contentType: z.string(), size: z.number().int().positive() });

/**
 * The first step of a direct upload. A song file is often bigger than a
 * request to a serverless function may carry (4.5 MB), so the browser sends
 * it to storage itself: this hands it a signed address to put the file at,
 * and ../commit records the file once it is there. Without cloud storage
 * (development, CI) there is no such address; the browser then sends the
 * file through /api/account/upload, the way a photo goes.
 */
export const POST = handle(async (req) => {
  const user = await requireApi();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, 'Bad request.');
  const body = parsed.data;
  if (!AUDIO_TYPES.includes(body.contentType)) throw new HttpError(400, 'Only MP3 and M4A audio files are accepted.');
  if (body.size > AUDIO_MAX_BYTES) throw new HttpError(400, `Songs must be ${Math.round(AUDIO_MAX_BYTES / 1024 / 1024)} MB or smaller.`);

  const invitation = await ownInvitation(user, body.invitationId);
  const count = await prisma.media.count({ where: { invitationId: invitation.id } });
  if (count >= 300) throw new HttpError(400, 'This invitation has reached its upload limit.');

  if (!storageConfigured()) return { ok: true, direct: true };
  const signed = await signedUpload({ entityType: 'inv', entityId: invitation.id, contentType: body.contentType });
  return { ok: true, direct: false, ...signed };
});
