import { z } from 'zod';
import { handle, requireApi, HttpError } from '@/lib/guard';
import { signedUpload, storageConfigured, designFolder } from '@/lib/storage';
import { VIDEO_TYPES, VIDEO_MAX_BYTES } from '@/lib/clips';
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from '@/lib/album';

const Body = z.object({
  templateId: z.string().min(1).max(40),
  contentType: z.string().max(100),
  size: z.number().int().positive(),
});

/**
 * The first step of a direct upload from the studio — the admin twin of
 * /api/account/upload/sign.
 *
 * A request to a serverless function may carry 4.5 MB, and the two things a
 * design uploads that go past it are a clip and a page background exported
 * at full size. So the browser puts the file into storage itself: this hands
 * it a signed address, and ../commit records it once it is there.
 *
 * Without cloud storage — development, CI — there is no signed address, and
 * `direct: true` sends the browser back to /api/admin/upload, which writes
 * to public/uploads. That path is still bounded by the function's own body
 * limit, which is the honest answer for a machine with no bucket rather than
 * a promise it cannot keep.
 */
export const POST = handle(async (req) => {
  await requireApi('templates.edit');
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, 'Bad request.');
  const { templateId, contentType, size } = parsed.data;

  const video = (VIDEO_TYPES as readonly string[]).includes(contentType);
  if (!video && !(PHOTO_TYPES as readonly string[]).includes(contentType)) {
    throw new HttpError(400, 'Only MP4 and WebM clips, and JPEG, PNG and WebP pictures, are accepted here.');
  }
  const max = video ? VIDEO_MAX_BYTES : PHOTO_MAX_BYTES;
  if (size > max) {
    throw new HttpError(400, video
      ? `A clip must be ${Math.round(max / 1024 / 1024)} MB or smaller. Every guest downloads it whole.`
      : `A picture must be ${Math.round(max / 1024 / 1024)} MB or smaller.`);
  }

  const id = designFolder(templateId);
  if (!storageConfigured()) return { ok: true, direct: true };
  const signed = await signedUpload({ entityType: 'design', entityId: id, contentType });
  return { ok: true, direct: false, ...signed };
});
