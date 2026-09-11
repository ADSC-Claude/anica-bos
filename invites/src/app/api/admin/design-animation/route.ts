import { handle, requireApi, HttpError } from '@/lib/guard';
import { storeFile } from '@/lib/storage';
import { prisma } from '@/lib/db';
import { readLottie, zipLike, LOTTIE_MAX_BYTES, LOTTIE_MAX_LABEL } from '@/lib/lottie';

/**
 * A vector animation uploaded in the Design Studio: a Lottie JSON.
 *
 * Its own door, and the reason is the refusals. A Lottie has no magic bytes
 * — it is JSON — so the generic path can only say "this is JSON" and would
 * have accepted somebody's spreadsheet export as an animation. Worse, the
 * export button most people press first gives a `.lottie` bundle, which is a
 * zip, which `sniff()` reads as an Excel file: without this route she would
 * be told her animation is not a spreadsheet.
 *
 * So the file is read here, by the same function the browser read it with,
 * and every refusal names the button to press instead. The poster is not
 * this route's business: it is a picture and goes through the picture door,
 * exactly as a clip's poster does.
 */
export const POST = handle(async (req) => {
  const user = await requireApi('templates.edit');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file.');
  const templateId = String(form.get('templateId') ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
  if (!templateId) throw new HttpError(400, 'Which design is this for?');
  const exists = await prisma.template.findUnique({ where: { id: templateId }, select: { id: true } });
  if (!exists) throw new HttpError(404, 'No such design.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (zipLike(bytes)) {
    throw new HttpError(400, 'That is a .lottie bundle, which is a zip. Export the animation as Lottie JSON instead — on LottieFiles it is the “Lottie JSON” download, and in After Effects it is Bodymovin’s .json.');
  }
  if (bytes.length > LOTTIE_MAX_BYTES) {
    throw new HttpError(400, `A vector animation must be ${LOTTIE_MAX_LABEL} or smaller; this one is ${Math.round(bytes.length / 1024)} kB. One that big is usually a picture embedded inside the animation, which belongs in a frame of its own.`);
  }
  const read = readLottie(Buffer.from(bytes).toString('utf8'));
  if (!read.ok) throw new HttpError(400, read.why);

  const stored = await storeFile({
    file, entityType: 'design', entityId: templateId, visibility: 'public',
    accept: 'lottie', maxBytes: LOTTIE_MAX_BYTES,
  });
  const row = await prisma.media.create({
    data: {
      userId: user.id,
      templateId,
      kind: 'DESIGN_ANIM',
      url: stored.url,
      storagePath: stored.storagePath,
      contentType: stored.contentType,
      width: read.facts.width,
      height: read.facts.height,
      bytes: file.size,
      // the checklist reads a length the same way for a clip and an animation
      durationMs: read.facts.ms,
    },
  });
  return { ok: true, id: row.id, url: stored.url, ...read.facts, bytes: file.size };
});
