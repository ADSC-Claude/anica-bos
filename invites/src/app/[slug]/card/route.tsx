import { ImageResponse } from 'next/og';
import { loadPublic, contentOf, resolveTheme } from '@/lib/invitations';
import { eventInstant, str, displayTitle } from '@/lib/sections';
import { formatDate, formatTime } from '@/lib/datetime';
import { qrDataUrl } from '@/lib/qr';
import { absoluteUrl, invitationUrl } from '@/lib/app-url';
import { cardTitleSize, CARD_INTRO_MAX } from '@/lib/card';
import { imageUrl, IMAGE } from '@/lib/images';

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
  const url = invitationUrl(slug);
  const cover = str(content.cover, 'coverPhoto');
  // Fetched by Satori while rendering, so the transformed version is both
  // fewer bytes over the wire and less work to decode into a 400px circle.
  const photo = imageUrl(cover.startsWith('http') ? cover : cover ? absoluteUrl(cover) : '', IMAGE.card);
  const intro = str(content.cover, 'intro');
  const titleSize = cardTitleSize(title);

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1350, display: 'flex', flexDirection: 'column', background: palette.bg, color: palette.ink, fontFamily: 'serif', padding: 72 }}>
        {/*
          Everything here carries flexShrink: 0. Satori lays this column out
          with the same rules as a browser, which means a column whose content
          is taller than the space available shrinks its items — and a shrunk
          text box does not clip, it overlaps the one below it. That is how a
          96px pair of names came to be printed through the sentence beneath
          them on every card this app has ever made.

          The photo is the one thing allowed to give: it is the only element
          whose exact size nobody will miss, and the text budget below it is
          sized so the two together fit 1350px.
        */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center', textAlign: 'center' }}>
          {photo && <img src={photo} width={400} height={400} style={{ objectFit: 'cover', borderRadius: 200, marginBottom: 40, border: `8px solid ${palette.surface}`, flexShrink: 1 }} alt="" />}
          <div style={{ fontSize: titleSize, color: palette.accent, lineHeight: 1.2, display: 'block', flexShrink: 0 }}>{title}</div>
          {intro && <div style={{ fontSize: 30, marginTop: 24, maxWidth: 800, color: palette.muted, lineHeight: 1.4, display: 'block', flexShrink: 0 }}>{intro.slice(0, CARD_INTRO_MAX)}</div>}
          {when && (
            <div style={{ fontSize: 44, marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ lineHeight: 1.3 }}>{formatDate(when, 'weekday')}</span>
              <span style={{ fontSize: 34, color: palette.muted, lineHeight: 1.3 }}>{formatTime(str(content.cover, 'time'))}</span>
            </div>
          )}
          {venue && (
            <div style={{ fontSize: 36, marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ lineHeight: 1.3 }}>{venue}</span>
              {address && <span style={{ fontSize: 26, color: palette.muted, lineHeight: 1.3 }}>{address}</span>}
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
