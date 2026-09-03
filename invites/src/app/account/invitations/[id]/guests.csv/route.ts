import { requireApi, ownInvitation, handle } from '@/lib/guard';
import { guestsCsv } from '@/lib/guests';

export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireApi();
  const inv = await ownInvitation(user, id);
  return new Response(await guestsCsv(inv), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${inv.slug}-guests.csv"` } });
});
