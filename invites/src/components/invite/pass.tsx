import { qrSvg, qrColours } from '@/lib/qr';
import { PASS_COPY, passIntro, passSubject, passDetails, passLookFrom, arrivalLine, arrivedLinks, type PassLook } from '@/lib/pass';
import { str, displayTitle, coverImage } from '@/lib/sections';
import { formatDate, formatTime } from '@/lib/datetime';
import { cssVars } from '@/lib/theme';
import type { Occasion } from '@prisma/client';
import type { Content } from '@/lib/sections';
import type { Palette, Fonts } from '@/lib/theme';
import type { CSSProperties, ReactNode } from 'react';

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
 * The photograph is the design — full bleed, never washed out, with the words
 * living on it. See PASS_LOOKS for why there is no card here.
 *
 * Two states, and the split is the design. Before the scan the pass is the
 * picture, the names and the code, because a guest in a queue holding a gift
 * is not reading. After the scan the queue is behind them and the paper comes
 * up over the picture to carry the day.
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
  ground = '',
}: {
  occasion: Occasion;
  content: Content;
  palette: Palette;
  fonts: Fonts;
  guest: PassGuest;
  url: string;
  hostsTitle: string;
  features: PassFeatures;
  /** The design's own artwork, where it has any. See templateGround(). */
  ground?: string;
}) {
  const copy = PASS_COPY[occasion];
  const own = content.checkin ?? {};
  const rsvp = content.rsvp ?? {};
  const photo = str(own, 'photo') || str(rsvp, 'qrPhoto') || coverImage(content);
  const wanted: PassLook = passLookFrom(str(own, 'look') || str(rsvp, 'qrBackdrop'));
  const look: PassLook = wanted !== 'ground' && !photo ? 'ground' : wanted;
  const picture = look === 'ground' ? ground : photo;
  const note = str(own, 'note') || copy.note;

  const ink = qrColours(palette);
  const date = str(content.cover ?? {}, 'date');
  const time = str(content.cover ?? {}, 'time');
  const venue = str(content.ceremony ?? {}, 'venue') || str(content.reception ?? {}, 'venue');
  const greeting = guest.salutation || guest.name;
  const arrival = arrivalLine(greeting, guest.checkedIn, guest.declined);
  const style = cssVars(palette, fonts) as CSSProperties;
  const links = guest.checkedIn ? arrivedLinks(url, { table: guest.table?.name ?? '', ...features }) : [];
  const spoken = new Set(links.map((l) => l.label));
  const details = passDetails(occasion, content, guest).filter((d) => !spoken.has(d.value));

  const when = [date ? formatDate(date, 'long') : '', time ? formatTime(time) : ''].filter(Boolean).join(' · ');
  const intro = passIntro(occasion, content);
  const names = passSubject(occasion, content, displayTitle(occasion, content));

  /*
   * The words, on the picture. The names are the biggest thing on the screen
   * by a long way — a guest holding this up is not reading a list, and three
   * lines of the same size is what made every earlier attempt read as stiff.
   */
  const words: ReactNode = (
    <div className="pass-words">
      <p className="pass-intro">{intro}</p>
      <h1 className="pass-names">{names}</h1>
      {/* Two lines. As one flex row the venue wrapped and left the separator
          dangling at the end of the date — "3:30 PM ·" with nothing after it. */}
      {when && <p className="pass-when">{when}</p>}
      {venue && <p className="pass-venue">{venue}</p>}
    </div>
  );

  /*
   * The code, carried the way a magazine carries its barcode: small, in the
   * corner, on its own paper. The desk scans it; the guest does not look at
   * it, and it has no business being the largest thing on a photograph of
   * somebody's wedding.
   */
  const codeBlock = (
    <div className="pass-strip">
      <div className="pass-who">
        <p className="pass-for">{greeting}</p>
        <p className="pass-note">{guest.declined ? arrival.body : note}</p>
      </div>
      <div className="pass-mark">
        <span
          className="pass-code-art"
          dangerouslySetInnerHTML={{ __html: qrSvg(url, { size: 232, dark: ink.dark, light: ink.light, eye: 'rounded' }) }}
        />
        <p className="pass-cta">{copy.cta}</p>
      </div>
    </div>
  );

  const arrived = (
    <div className="pass-after">
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
      <details className="pass-again">
        <summary>Show my code again</summary>
        <span className="pass-code-art pass-code-small" dangerouslySetInnerHTML={{ __html: qrSvg(url, { size: 168, dark: ink.dark, light: ink.light, eye: 'rounded' }) }} />
      </details>
      <footer className="pass-foot">
        <a href={url} className="pass-back">Open the full invitation →</a>
      </footer>
    </div>
  );

  return (
    <main className="pass" data-look={look} style={style}>
      <div
        className="pass-picture"
        style={picture ? { backgroundImage: `url(${picture})` } : undefined}
        role={look === 'ground' ? undefined : 'img'}
        aria-label={look === 'ground' ? undefined : `${hostsTitle} photograph`}
      />
      <div className="pass-fall" aria-hidden="true" />
      {guest.checkedIn ? arrived : (
        <div className="pass-stage">
          {words}
          {codeBlock}
        </div>
      )}
    </main>
  );
}
