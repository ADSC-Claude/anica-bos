import { handle, parseWith, HttpError } from '@/lib/guard';
import { requestMeta } from '@/lib/auth';
import { guestPhotoSchema, submitGuestPhoto } from '@/lib/photos';

/**
 * A guest adding a photo to the shared album. Multipart rather than JSON,
 * because the file is the point; everything else rides along as form fields.
 */
export const POST = handle(async (req) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Please choose a photo.');

  const input = parseWith(guestPhotoSchema, {
    slug: String(form.get('slug') ?? ''),
    token: form.get('token') ? String(form.get('token')) : undefined,
    name: String(form.get('name') ?? ''),
    caption: form.get('caption') ? String(form.get('caption')) : undefined,
    website: String(form.get('website') ?? ''),
  });

  const { ip } = await requestMeta();
  const result = await submitGuestPhoto(input, file, ip);
  return { ok: true, pending: result.pending, url: result.pending ? null : result.media.url };
});
