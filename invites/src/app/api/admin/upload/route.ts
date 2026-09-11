import { z } from 'zod';
import { handle, requireApi, HttpError } from '@/lib/guard';
import { storeFile, designFolder } from '@/lib/storage';
import { VIDEO_MAX_BYTES } from '@/lib/clips';
import { prisma } from '@/lib/db';

/** What the browser read off the clip before it posted it. Bounded rather than trusted: a wrong number is a wrong warning, not a wrong file. */
const Measured = z.object({
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
  durationMs: z.number().int().min(0).max(3600_000).optional(),
});

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
  const user = await requireApi('templates.edit');
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
  /*
   * A clip gets its row here as well as on the direct road, because the
   * checklist reads a clip's weight and length off the row — and this is the
   * only road there is on a machine with no bucket. Without it the studio
   * would warn about heavy clips in production and say nothing in
   * development, which is the wrong way round for a rule somebody is trying
   * to learn. The pictures this route also takes keep their old behaviour:
   * the studio's own uploads are recorded by /api/admin/design-upload, and
   * the template editor's have never been.
   */
  if (video) {
    const num = (key: string) => { const n = Number(form.get(key)); return Number.isFinite(n) ? Math.round(n) : undefined; };
    const measured = Measured.safeParse({ width: num('width'), height: num('height'), durationMs: num('durationMs') });
    const m = measured.success ? measured.data : {};
    await prisma.media.create({
      data: {
        userId: user.id,
        templateId: templateId === 'shared' ? null : templateId,
        kind: 'DESIGN_VIDEO',
        url: stored.url,
        storagePath: stored.storagePath,
        contentType: stored.contentType,
        width: m.width ?? null,
        height: m.height ?? null,
        durationMs: m.durationMs ?? null,
        bytes: file.size,
      },
    });
  }
  return { ok: true, url: stored.url };
});
