import { qrSvg, qrOnPhoto, qrColours, qrBackdropFrom, QR_VEIL, QR_SAFE, type QrBackdrop } from '@/lib/qr';
import { PASS_COPY, passIntro, passSubject, passDetails, arrivalLine, arrivedLinks } from '@/lib/pass';
import { str, displayTitle, coverImage, eventInstant } from '@/lib/sections';
import { formatDate, formatTime, formatDateTime } from '@/lib/datetime';
import { cssVars } from '@/lib/theme';
import type { Occasion } from '@prisma/client';
import type { Content } from '@/lib/sections';
import type { Palette, Fonts } from '@/lib/theme';
import type { CSSProperties } from 'react';

export type PassGuest = {
  name: string;
  salutation: string;
  groupName: string;
  token: string;
  table: { name: string } | null;
  checkedIn: boolean;
  checkedInAt: string;
  declined: boolean;
};

/** What the couple bought, as far as the pass is concerned. */
export type PassFeatures = { seating: boolean; guestbook: boolean; programme: boolean; photos: boolean };

/**
 * The screen a guest holds up at the door, and what it becomes afterwards.
 *
 * Two states, and the split is the whole design. Before the scan the pass has
 * one job — be the thing that gets scanned — so it carries the names, the
 * code, and the two or three details a guest asks on a threshold. Nothing
 * else: a screen offering a guestbook and a photo album to somebody standing
 * in a queue is a screen that gets read instead of held up.
 *
 * After the scan the queue is behind them, and the same phone becomes the
 * thing they use for the rest of the day — their table, the programme, the
 * guestbook, the album. Each gated on what the couple actually bought.
 */
export function Pass({
  occasion,
  content,
  palette,
  fonts,
  guest,
  url,
  hostsTitle,
  features,
}: {
  occasion: Occasion;
  content: Content;
  palette: Palette;
  fonts: Fonts;
  guest: PassGuest;
  url: string;
  hostsTitle: string;
  features: PassFeatures;
}) {
  const copy = PASS_COPY[occasion];
  const rsvp = content.rsvp ?? {};
  const backdrop: QrBackdrop = qrBackdropFrom(str(rsvp, 'qrBackdrop'));
  const photo = str(rsvp, 'qrPhoto') || coverImage(content);
  const ink = qrColours(palette);
  const date = str(content.cover ?? {}, 'date');
  const time = str(content.cover ?? {}, 'time');
  const venue = str(content.ceremony ?? {}, 'venue') || str(content.reception ?? {}, 'venue');
  const details = passDetails(occasion, content, guest);
  const greeting = guest.salutation || guest.name;
  const arrival = arrivalLine(greeting, guest.checkedIn, guest.declined);
  const style = cssVars(palette, fonts) as CSSProperties;
  const codeOnPhoto = backdrop === 'photoBehind' && Boolean(photo);
  const links = guest.checkedIn
    ? arrivedLinks(url, { table: guest.table?.name ?? '', ...features })
    : [];

  return (
    <main className="pass" style={style}>
      <div className="pass-sheet">
        <header className="pass-head">
          <p className="pass-intro">{passIntro(occasion, content)}</p>
          <h1 className="pass-names">{passSubject(occasion, content, displayTitle(occasion, content))}</h1>
          {(date || venue) && (
            <p className="pass-when">
              {[date ? formatDate(date, 'long') : '', time ? formatTime(time) : '', venue].filter(Boolean).join(' · ')}
            </p>
          )}
        </header>

        {photo && backdrop !== 'photoBehind' && (
          <div className="pass-photo" style={{ backgroundImage: `url(${photo})` }} role="img" aria-label={`${hostsTitle} photograph`} />
        )}

        {/* Before the scan: the code, and nothing competing with it. */}
        {!guest.checkedIn && (
          <>
            <section
              className={`pass-code${codeOnPhoto ? ' pass-code-photo' : ''}`}
              style={codeOnPhoto ? { backgroundImage: `url(${photo})`, ['--inv-veil' as string]: String(QR_VEIL), color: QR_SAFE.dark } : undefined}
            >
              <div className="pass-code-body">
                <p className="pass-cta">{copy.cta}</p>
                <span
                  className="pass-code-art"
                  dangerouslySetInnerHTML={{
                    __html: codeOnPhoto ? qrOnPhoto(url, 232) : qrSvg(url, { size: 232, dark: ink.dark, light: ink.light, eye: 'rounded' }),
                  }}
                />
                <p className="pass-note">{guest.declined ? arrival.body : copy.note}</p>
              </div>
            </section>

            {details.length > 0 && (
              <dl className="pass-details">
                {details.map((d) => (
                  <div key={d.label} className="pass-detail">
                    <dt>{d.label}</dt>
                    <dd>{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}

        {/* After it: the welcome, then whatever they were sold. */}
        {guest.checkedIn && (
          <>
            <section className="pass-arrived">
              <p className="pass-tick" aria-hidden="true">✓</p>
              <h2 className="pass-greet-title">{arrival.title}</h2>
              <p className="pass-greet-body">{arrival.body}</p>
              {guest.checkedInAt && <p className="pass-stamp">Checked in {guest.checkedInAt}</p>}
            </section>

            {links.length > 0 && (
              <nav className="pass-links" aria-label="Your day">
                {links.map((l) => (
                  <a key={l.note} href={l.href} className="pass-link">
                    <span className="pass-link-note">{l.note}</span>
                    <span className="pass-link-label">{l.label}</span>
                  </a>
                ))}
              </nav>
            )}

            {/* Kept, smaller: a pass somebody may be asked for twice. */}
            <details className="pass-again">
              <summary>Show my code again</summary>
              <span
                className="pass-code-art pass-code-small"
                dangerouslySetInnerHTML={{ __html: qrSvg(url, { size: 168, dark: ink.dark, light: ink.light, eye: 'rounded' }) }}
              />
            </details>
          </>
        )}

        <footer className="pass-foot">
          <a href={url} className="pass-back">Open the full invitation →</a>
        </footer>
      </div>
    </main>
  );
}
