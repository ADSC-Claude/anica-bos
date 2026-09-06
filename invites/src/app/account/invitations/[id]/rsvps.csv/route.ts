import { requireApi, ownInvitation, handle, HttpError } from '@/lib/guard';
import { rsvpsCsv } from '@/lib/guests';
import { hasFeature } from '@/lib/tiers';

export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireApi();
  const inv = await ownInvitation(user, id);
  if (!hasFeature(inv.tier, 'rsvp.export')) throw new HttpError(403, 'Exports are included from the Standard tier.');
  return new Response(await rsvpsCsv(inv.id), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${inv.slug}-rsvps.csv"` } });
});
