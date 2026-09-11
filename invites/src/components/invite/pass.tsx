import { qrSvg, qrOnPhoto, qrColours, qrBackdropFrom, QR_VEIL, QR_SAFE, type QrBackdrop } from '@/lib/qr';
import { PASS_COPY, passIntro, passSubject, passDetails, arrivalLine } from '@/lib/pass';
import { str, displayTitle, coverImage, eventInstant } from '@/lib/sections';
import { formatDate, formatTime } from '@/lib/datetime';
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
  declined: boolean;
};

/**
 * The screen a guest holds up at the door.
 *
 * A page of its own rather than a block on the invitation, because the two are
 * read in different places by different people in different moods. The
 * invitation is read at home with a cup of coffee; this is read in a doorway,
 * one-handed, holding a gift, with somebody behind you. So it is one screen,
 * it does not scroll on a phone if it can help it, and the largest thing on it
 * is the code.
 */
export function Pass({
  occasion,
  content,
  palette,
  fonts,
  guest,
  url,
  hostsTitle,
}: {
  occasion: Occasion;
  content: Content;
  palette: Palette;
  fonts: Fonts;
  guest: PassGuest;
  url: string;
  hostsTitle: string;
}) {
  const copy = PASS_COPY[occasion];
  const rsvp = content.rsvp ?? {};
  const backdrop: QrBackdrop = qrBackdropFrom(str(rsvp, 'qrBackdrop'));
  const photo = str(rsvp, 'qrPhoto') || coverImage(content);
  const ink = qrColours(palette);
  const when = eventInstant(content);
  const date = str(content.cover ?? {}, 'date');
  const time = str(content.cover ?? {}, 'time');
  const venue = str(content.ceremony ?? {}, 'venue') || str(content.reception ?? {}, 'venue');
  const details = passDetails(occasion, content, guest);
  const greeting = guest.salutation || guest.name;
  const arrival = arrivalLine(greeting, guest.checkedIn, guest.declined);
  const style = cssVars(palette, fonts) as CSSProperties;

  // The photograph is only behind the code where the couple asked for it. On
  // the pass the picture at the top is the cover, whatever they chose.
  const codeOnPhoto = backdrop === 'photoBehind' && Boolean(photo);

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

        <section className="pass-greet">
          <h2 className="pass-greet-title">{arrival.title}</h2>
          <p className="pass-greet-body">{arrival.body}</p>
        </section>

        <section
          className={`pass-code${codeOnPhoto ? ' pass-code-photo' : ''}`}
          style={codeOnPhoto ? { backgroundImage: `url(${photo})`, ['--inv-veil' as string]: String(QR_VEIL), color: QR_SAFE.dark } : undefined}
        >
          <div className="pass-code-body">
            <p className="pass-cta">{guest.checkedIn ? 'Your pass' : copy.cta}</p>
            <span
              className="pass-code-art"
              dangerouslySetInnerHTML={{
                __html: codeOnPhoto ? qrOnPhoto(url, 232) : qrSvg(url, { size: 232, dark: ink.dark, light: ink.light, eye: 'rounded' }),
              }}
            />
            <p className="pass-note">{copy.note}</p>
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

        <footer className="pass-foot">
          <a href={url} className="pass-back">Open the full invitation →</a>
        </footer>
      </div>
    </main>
  );
}
