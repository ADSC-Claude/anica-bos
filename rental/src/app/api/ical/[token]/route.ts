import { buildExportFeed } from '@/lib/sync/ical';

/**
 * The outbound feed Airbnb pulls. The token in the path is the whole
 * authentication — which is why it is 32 unguessable characters, and why the
 * feed carries no guest names.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // Airbnb appends .ics to the URL it is given; accept it either way.
  const feed = await buildExportFeed(token.replace(/\.ics$/i, ''));

  if (!feed) return new Response('Not found', { status: 404 });

  return new Response(feed, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="calendar.ics"',
      // A cached feed is a feed that sells a night twice.
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
