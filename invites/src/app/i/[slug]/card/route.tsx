import { ImageResponse } from 'next/og';
import { loadPublic, contentOf, resolveTheme } from '@/lib/invitations';
import { eventInstant, str, displayTitle } from '@/lib/sections';
import { formatDate, formatTime } from '@/lib/datetime';
import { qrDataUrl } from '@/lib/qr';
import { absoluteUrl } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

/**
 * A 1080×1350 PNG of the essentials — names, date, venue, and a QR code that
 * opens the full invitation — for the lola who wants something to keep, and
 * for the tita who forwards images rather than links.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const invitation = await loadPublic(slug, { preview: true });
  if (!invitation) return new Response('Not found', { status: 404 });

  const content = contentOf(invitation.content);
  const { palette } = resolveTheme(invitation.template, content);
  const when = eventInstant(content);
  const main = str(content.ceremony, 'venue') ? content.ceremony : content.reception;
  const venue = str(main, 'venue');
  const address = str(main, 'address');
  const title = displayTitle(invitation.occasion, content);
  const url = absoluteUrl(`/i/${slug}`);
  const cover = str(content.cover, 'coverPhoto');
  const photo = cover.startsWith('http') ? cover : cover ? absoluteUrl(cover) : '';
  const intro = str(content.cover, 'intro');

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1350, display: 'flex', flexDirection: 'column', background: palette.bg, color: palette.ink, fontFamily: 'serif', padding: 72 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center', textAlign: 'center' }}>
          {photo && <img src={photo} width={520} height={520} style={{ objectFit: 'cover', borderRadius: 260, marginBottom: 48, border: `8px solid ${palette.surface}` }} alt="" />}
          <div style={{ fontSize: 96, color: palette.accent, lineHeight: 1.05, display: 'flex' }}>{title}</div>
          {intro && <div style={{ fontSize: 30, marginTop: 28, maxWidth: 800, color: palette.muted, display: 'flex' }}>{intro.slice(0, 160)}</div>}
          {when && (
            <div style={{ fontSize: 44, marginTop: 48, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span>{formatDate(when, 'weekday')}</span>
              <span style={{ fontSize: 34, color: palette.muted }}>{formatTime(str(content.cover, 'time'))}</span>
            </div>
          )}
          {venue && (
            <div style={{ fontSize: 36, marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span>{venue}</span>
              {address && <span style={{ fontSize: 26, color: palette.muted }}>{address}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `2px solid ${palette.accent2}`, paddingTop: 36 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 26, color: palette.muted }}>
            <span style={{ color: palette.ink, fontSize: 30 }}>Scan for details and RSVP</span>
            <span>{url.replace(/^https?:\/\//, '')}</span>
          </div>
          <img src={qrDataUrl(url, 220)} width={220} height={220} alt="" />
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
