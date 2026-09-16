import { loadPublic } from '@/lib/invitations';
import { getSession } from '@/lib/auth';
import { isStaff } from '@/lib/rbac';
import { qrSvg } from '@/lib/qr';
import { invitationUrl } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

/**
 * The QR code on its own, as a file to print: for the card in the box, the
 * tarpaulin at the gate. The code is a link to the invitation, so it is
 * given out only where the invitation itself would be — a live page to
 * anybody, a draft to its owner and to staff.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const invitation = await loadPublic(slug, { preview: true });
  if (!invitation) return new Response('Not found', { status: 404 });
  const live = invitation.status === 'PUBLISHED' && !invitation.expired;
  if (!live) {
    const session = await getSession();
    const previewer = session && (session.id === invitation.userId || isStaff(session.role));
    if (!previewer) return new Response('Not found', { status: 404 });
  }
  return new Response(qrSvg(invitationUrl(slug), { size: 1024, margin: 4 }), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-qr.svg"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
