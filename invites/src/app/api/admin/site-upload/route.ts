import { handle, requireApi, HttpError } from '@/lib/guard';
import { storeFile } from '@/lib/storage';

/**
 * The site's own photographs — the logo, the hero, the closing band — uploaded
 * from admin settings. They belong to the business rather than to any one
 * design, so they land under `site/brand` and need `settings.edit` rather than
 * `templates.edit`.
 *
 * This exists because the alternative is committing a JPEG to the repository
 * and waiting on a deploy every time the owner wants a different picture on
 * the front page, which is not a thing a shop owner should have to do.
 */
export const POST = handle(async (req) => {
  await requireApi('settings.edit');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file.');
  const stored = await storeFile({
    file,
    entityType: 'site',
    entityId: 'brand',
    visibility: 'public',
    accept: 'images',
  });
  return { ok: true, url: stored.url };
});
