import { requireApi, ownInvitation, handle } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { absoluteUrl } from '@/lib/app-url';
import { detailsSheet, sheetFilename } from '@/lib/details-sheet';
import { detailsDocx } from '@/lib/details-docx';

/**
 * The details sheet for this invitation as a Word file: its own occasion,
 * its own package, so a Basic wedding downloads a Basic wedding's sheet and
 * nobody is handed pages for parts they did not buy.
 */
export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await requireApi();
  const inv = await ownInvitation(user, id);
  const s = await getSettings();
  const sheet = detailsSheet({ occasion: inv.occasion, tier: inv.tier, addOns: inv.addOns, layout: inv.template.layout });
  const file = await detailsDocx(sheet, {
    business: s['business.name'],
    title: inv.title,
    reference: inv.order?.reference ?? '',
    customer: user.name,
    dashboardUrl: absoluteUrl(`/account/invitations/${inv.id}`),
    messengerUrl: s['contact.messenger'],
  });
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${sheetFilename(inv.slug)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
