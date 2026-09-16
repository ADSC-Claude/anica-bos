import { requireApi, ownInvitation, handle } from '@/lib/guard';
import { guestSeatSheetCsv } from '@/lib/guests';

/**
 * The guest list as it stands, with a Seats column to settle and each guest's
 * personal link to find them by on the way back in.
 *
 * Its notes are in the file rather than here, because the page is not what the
 * couple has open when they are actually filling it in.
 */
export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireApi();
  const inv = await ownInvitation(user, id);
  return new Response(await guestSeatSheetCsv(inv), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${inv.slug}-seats.csv"`,
    },
  });
});
