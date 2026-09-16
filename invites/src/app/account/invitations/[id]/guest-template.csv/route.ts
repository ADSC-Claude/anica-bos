import { requireApi, ownInvitation, handle } from '@/lib/guard';
import { guestTemplateCsv } from '@/lib/guests';
import { contentOf } from '@/lib/invitations';
import { guestGroups } from '@/lib/sections';

/**
 * The blank guest list, carrying this invitation's own group names so the
 * Group column means something before it is filled in.
 */
export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireApi();
  const inv = await ownInvitation(user, id);
  const groups = guestGroups(inv.occasion, contentOf(inv.content).rsvp);
  return new Response(guestTemplateCsv(groups), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${inv.slug}-guest-list.csv"`,
    },
  });
});
