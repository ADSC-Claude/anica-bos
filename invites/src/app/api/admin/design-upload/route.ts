import { handle, requireApi, HttpError } from '@/lib/guard';
import { cleanName, cleanTags } from '@/lib/library';
import { storeFile } from '@/lib/storage';
import { MOVING_MAX_BYTES } from '@/lib/moving';
import { prisma } from '@/lib/db';

/**
 * A picture uploaded in the Design Studio: a page's ground, a piece for the
 * library, a photograph the design supplies itself.
 *
 * The browser does the measuring and the re-encoding before it posts — the
 * proportions, the colour of the top and bottom edges, and a WebP no wider
 * than 1536 — because those are what place a drawn page's elements and what
 * fills the strips beyond a picture, and because a phone's four-thousand
 * pixel original has no business reaching storage. What arrives here is
 * stored and recorded against the design, so the studio's asset drawer can
 * list it and the checklist can say how heavy it is.
 */
export const POST = handle(async (req) => {
  const user = await requireApi('templates.edit');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file.');
  // A library piece belongs to no design: it is uploaded once and used
  // wherever she likes, so it is filed under the library rather than under
  // whichever design she happened to be looking at.
  const library = String(form.get('library') ?? '') === '1';
  const templateId = String(form.get('templateId') ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
  if (!library) {
    if (!templateId) throw new HttpError(400, 'Which design is this for?');
    const exists = await prisma.template.findUnique({ where: { id: templateId }, select: { id: true } });
    if (!exists) throw new HttpError(404, 'No such design.');
  }

  const int = (key: string) => { const n = Number(form.get(key)); return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n) : null; };
  const width = int('width');
  const height = int('height');
  /*
   * A moving picture: a GIF, an animated WebP, an animated PNG, sent whole.
   *
   * A different door rather than a flag on this one, because it is a
   * different promise: nothing resizes or re-encodes it — the browser's
   * canvas would keep one frame of it — so the types it accepts and the
   * weight it allows are its own. The browser has already read the chunk
   * inside the file that says it moves; the server checks the container it
   * arrives in, which is all a server without a decoder can check.
   */
  const moving = String(form.get('moving') ?? '') === '1';
  const where = library
    ? { entityType: 'library', entityId: 'pieces' }
    : { entityType: 'design', entityId: templateId };
  const stored = await storeFile({
    file, ...where, visibility: 'public',
    accept: moving ? 'moving' : 'images',
    ...(moving ? { maxBytes: MOVING_MAX_BYTES } : {}),
  });
  const row = await prisma.media.create({
    data: {
      userId: user.id,
      ...(library ? { kind: 'DESIGN_PIECE' as const } : { templateId, kind: 'DESIGN_IMAGE' as const }),
      url: stored.url, storagePath: stored.storagePath, contentType: stored.contentType,
      caption: String(form.get('caption') ?? '').slice(0, 120),
      ...(library ? { name: pieceName(form, file), tags: pieceTags(form) } : {}),
      width, height, bytes: file.size, animated: moving,
    },
  });
  return {
    ok: true,
    id: row.id,
    url: stored.url,
    animated: moving,
    width, height,
    ratio: width && height ? Math.round((height / width) * 1e4) / 1e4 : null,
    top: String(form.get('top') ?? '').slice(0, 9),
    bottom: String(form.get('bottom') ?? '').slice(0, 9),
    bytes: file.size,
  };
});

/** A piece's name: what she typed, or the file's own name, which is usually right. */
function pieceName(form: FormData, file: File): string {
  const typed = cleanName(String(form.get('name') ?? ''));
  return typed || cleanName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
}

function pieceTags(form: FormData): string[] {
  return cleanTags(String(form.get('tags') ?? ''));
}
