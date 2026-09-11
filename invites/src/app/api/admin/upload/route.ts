import { handle, requireApi, HttpError } from '@/lib/guard';
import { storeFile, designFolder } from '@/lib/storage';
import { VIDEO_MAX_BYTES } from '@/lib/clips';

/**
 * A design's own files, uploaded from the admin's template editor and from
 * the studio: a background, a night background, the strand, a clip. The file
 * lands in storage under the design and its URL goes back to the form. Staff
 * with the templates permission only.
 *
 * `kind=video` takes a clip instead of a picture. A clip usually goes the
 * direct way — ./sign then ./commit — because a request to a serverless
 * function may only carry 4.5 MB; this route is what a machine with no
 * bucket falls back to, and what a small clip can use without the two extra
 * round trips.
 */
export const POST = handle(async (req) => {
  await requireApi('templates.edit');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file.');
  const templateId = designFolder(form.get('templateId'));
  const video = String(form.get('kind') ?? '') === 'video';
  const stored = await storeFile({
    file,
    entityType: 'design',
    entityId: templateId,
    visibility: 'public',
    accept: video ? 'video' : 'images',
    maxBytes: video ? VIDEO_MAX_BYTES : undefined,
  });
  return { ok: true, url: stored.url };
});
