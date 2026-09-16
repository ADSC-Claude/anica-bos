import { requireApi, ownInvitation, handle, HttpError } from '@/lib/guard';
import { entitled } from '@/lib/tiers';
import { guestPhotos, albumFilename } from '@/lib/photos';
import { openFile } from '@/lib/storage';
import { zipStream, type ZipEntry } from '@/lib/zip';

/**
 * The album, as one file the couple can keep.
 *
 * Until this existed the photographs their guests sent could be looked at and
 * not kept: the page shows a resized thumbnail, so even saving one by hand
 * gave them a small copy rather than the picture that was taken. This hands
 * over the originals.
 *
 * Streamed, one photograph at a time — see src/lib/zip.ts. An album may be
 * five hundred files and several gigabytes, and neither this server nor the
 * couple's phone should have to hold that anywhere.
 *
 * Everything is in it, approved or not. The couple own all of it, a photo they
 * have not got round to approving is still theirs, and a download that quietly
 * omitted some would be worse than useless — they would not know what was
 * missing.
 */
export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireApi();
  const inv = await ownInvitation(user, id);
  if (!entitled(inv, 'photoSharing')) throw new HttpError(403, 'This invitation does not have a shared album.');

  const photos = await guestPhotos(inv.id);
  if (!photos.length) throw new HttpError(404, 'There are no photos to download yet.');

  // Oldest first, so the numbering runs the way the evening did.
  const ordered = [...photos].reverse();

  async function* entries(): AsyncGenerator<ZipEntry> {
    for (const [i, photo] of ordered.entries()) {
      const body = await openFile(photo.storagePath);
      // A row whose file has gone is skipped rather than fatal: it should not
      // cost the couple the rest of the album. Said out loud, because a live
      // row pointing at a missing object is storage trouble and the couple
      // cannot see it — all they get is an album quietly short of photographs.
      if (!body) {
        console.warn(`photos.zip: ${inv.slug} has no file at ${photo.storagePath}`);
        continue;
      }
      yield { name: albumFilename(i + 1, photo), body };
    }
  }

  return new Response(zipStream(entries()), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${inv.slug}-guest-photos.zip"`,
      // Nothing here is worth a cache: the album grows all evening.
      'Cache-Control': 'no-store',
    },
  });
});
