import { handle, requireApi, HttpError } from '@/lib/guard';
import { storeFile } from '@/lib/storage';

/**
 * A design's pictures, uploaded from the admin's template editor: a
 * background, a night background, the strand. The file lands in storage
 * under the design and its URL goes back to the form. Staff with the
 * templates permission only; images only.
 */
export const POST = handle(async (req) => {
  await requireApi('templates.edit');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file.');
  const templateId = String(form.get('templateId') ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40) || 'shared';
  const stored = await storeFile({ file, entityType: 'design', entityId: templateId, visibility: 'public', accept: 'images' });
  return { ok: true, url: stored.url };
});
