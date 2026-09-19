import { requireApi, ownInvitation, handle, HttpError } from '@/lib/guard';
import { guestbookCsv } from '@/lib/guests';
import { hasFeature } from '@/lib/tiers';

/**
 * The guestbook, downloaded. Gated on the guestbook itself rather than on
 * the RSVP export: a family who has the wall has the messages on it, and
 * charging again to keep what their guests wrote would be a strange line to
 * draw.
 */
export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireApi();
  const inv = await ownInvitation(user, id);
  if (!hasFeature(inv.tier, 'guestbook')) throw new HttpError(403, 'The guestbook is included from the Complete package.');
  return new Response(await guestbookCsv(inv.id), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${inv.slug}-guestbook.csv"` } });
});
