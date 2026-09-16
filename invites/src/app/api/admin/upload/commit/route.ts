import { z } from 'zod';
import { handle, requireApi, HttpError } from '@/lib/guard';
import { directUploadUrl, publicObjectExists, designFolder } from '@/lib/storage';
import { VIDEO_TYPES } from '@/lib/clips';
import { prisma } from '@/lib/db';

const Body = z.object({
  templateId: z.string().min(1).max(40),
  storagePath: z.string().min(1).max(500),
  contentType: z.string().max(100),
  /*
   * Read from the file in the browser, never typed: a clip's length is what
   * the checklist warns about, and a picture's proportions are what place
   * every element on a drawn page. The server has no ffmpeg to find either
   * out, so the browser that already decoded the file to draw its poster
   * reports them. They are bounded here rather than trusted — a wrong number
   * is a wrong warning, not a wrong file.
   */
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
  durationMs: z.number().int().min(0).max(3600_000).optional(),
  bytes: z.number().int().min(1).optional(),
});

/**
 * The second step of a direct upload from the studio (see ../sign): the
 * browser has put the file at the signed address, and this records it —
 * after checking the object is really there, under this design's own path.
 *
 * The row is what the checklist reads afterwards: `bytes` is how it knows a
 * background is too heavy for a phone, and `durationMs` is how it knows a
 * clip is longer than a page should hold.
 */
export const POST = handle(async (req) => {
  const user = await requireApi('templates.edit');
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, 'Bad request.');
  const body = parsed.data;

  const id = designFolder(body.templateId);
  const url = directUploadUrl(body.storagePath, 'design', id);
  if (!url) throw new HttpError(400, 'That is not one of this design’s uploads.');
  if (!(await publicObjectExists(url))) throw new HttpError(400, 'The file did not arrive. Please try again.');

  const video = (VIDEO_TYPES as readonly string[]).includes(body.contentType);
  // A design's own uploads belong to the design, not to a couple — which is
  // what `templateId` on the row is for. 'shared' is not a design, so a file
  // uploaded before a design exists is recorded without one.
  const templateId = id === 'shared' ? null : id;
  const media = await prisma.media.create({
    data: {
      userId: user.id,
      templateId,
      kind: video ? 'DESIGN_VIDEO' : 'DESIGN_IMAGE',
      url,
      storagePath: body.storagePath,
      contentType: body.contentType,
      width: body.width ?? null,
      height: body.height ?? null,
      bytes: body.bytes ?? null,
      durationMs: body.durationMs ?? null,
    },
  });
  return { ok: true, url: media.url, id: media.id };
});
