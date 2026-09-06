import { loadPublic, contentOf } from '@/lib/invitations';
import { buildIcs } from '@/lib/ics';
import { eventInstant, str } from '@/lib/sections';
import { absoluteUrl, invitationUrl } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const invitation = await loadPublic(slug);
  if (!invitation || invitation.expired) return new Response('Not found', { status: 404 });
  const content = contentOf(invitation.content);
  const start = eventInstant(content);
  if (!start) return new Response('No date', { status: 404 });
  const main = str(content.ceremony, 'venue') ? content.ceremony : content.reception;
  const location = [str(main, 'venue'), str(main, 'address')].filter(Boolean).join(', ');
  const ics = buildIcs({
    uid: `${invitation.id}@invites`,
    title: invitation.title,
    start,
    location,
    description: str(content.cover, 'intro'),
    url: invitationUrl(slug),
  });
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
