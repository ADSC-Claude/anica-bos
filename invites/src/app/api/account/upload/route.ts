import { z } from 'zod';
import { handle, requireApi, ownInvitation, HttpError } from '@/lib/guard';
import { storeFile } from '@/lib/storage';
import { prisma } from '@/lib/db';

const KINDS = ['COVER', 'GALLERY', 'VENUE', 'QR', 'INTAKE', 'OTHER'] as const;

/**
 * Photo uploads from the builder and the intake form. The file lands in
 * storage under the invitation's id, a Media row records it, and the URL
 * goes back to the browser to be written into the section. Only the owner
 * (or staff) of the invitation may upload to it.
 */
export const POST = handle(async (req) => {
  const user = await requireApi();
  const form = await req.formData();
  const invitationId = String(form.get('invitationId') ?? '');
  const kindRaw = String(form.get('kind') ?? 'OTHER');
  const kind = z.enum(KINDS).catch('OTHER').parse(kindRaw);
  const file = form.get('file');
  if (!invitationId) throw new HttpError(400, 'Missing invitation.');
  if (!(file instanceof File)) throw new HttpError(400, 'No file.');

  const invitation = await ownInvitation(user, invitationId);
  const count = await prisma.media.count({ where: { invitationId: invitation.id } });
  if (count >= 300) throw new HttpError(400, 'This invitation has reached its upload limit.');

  const stored = await storeFile({ file, entityType: 'inv', entityId: invitation.id, visibility: 'public', accept: kind === 'INTAKE' ? 'intake' : 'images' });
  const media = await prisma.media.create({
    data: { userId: user.id, invitationId: invitation.id, kind, url: stored.url, storagePath: stored.storagePath, contentType: stored.contentType, sortOrder: count },
  });
  return { ok: true, url: media.url, id: media.id };
});
