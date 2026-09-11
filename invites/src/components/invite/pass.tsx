import { qrSvg, qrOnPhoto, qrColours, qrBackdropFrom, QR_VEIL, QR_SAFE, type QrBackdrop } from '@/lib/qr';
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
 * Two states, and the split is the design. Before the scan the pass has one
 * job — be the thing that gets held up — so it carries the names, the code, and
 * the two or three details a guest asks on a threshold. Nothing else: a screen
 * offering a guestbook and a photo album to somebody in a queue is a screen
 * that gets read instead of held up. After the scan the queue is behind them
 * and the same phone becomes the day.
 *
 * Three looks on top of that, and they are not skins. Each puts the photograph
 * somewhere different, so each reads as a different object: a sheet, a framed
 * portrait, a ticket that tears.
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
  // The pass has a section of its own now. An invitation filled in before it
  // did keeps whatever it set on the RSVP section.
  const own = content.checkin ?? {};
  const rsvp = content.rsvp ?? {};
  const look: PassLook = passLookFrom(str(own, 'look'));
  const backdrop: QrBackdrop = qrBackdropFrom(str(own, 'qrBackdrop') || str(rsvp, 'qrBackdrop'));
  const photo = str(own, 'photo') || str(rsvp, 'qrPhoto') || coverImage(content);
  const note = str(own, 'note') || copy.note;

  const ink = qrColours(palette);
  const date = str(content.cover ?? {}, 'date');
  const time = str(content.cover ?? {}, 'time');
  const venue = str(content.ceremony ?? {}, 'venue') || str(content.reception ?? {}, 'venue');
  const details = passDetails(occasion, content, guest);
  const greeting = guest.salutation || guest.name;
  const arrival = arrivalLine(greeting, guest.checkedIn, guest.declined);
  const style = cssVars(palette, fonts) as CSSProperties;
  const codeOnPhoto = backdrop === 'photoBehind' && Boolean(photo);
  const links = guest.checkedIn ? arrivedLinks(url, { table: guest.table?.name ?? '', ...features }) : [];

  const when = [date ? formatDate(date, 'long') : '', time ? formatTime(time) : '', venue].filter(Boolean).join(' · ');
  const intro = passIntro(occasion, content);
  const names = passSubject(occasion, content, displayTitle(occasion, content));

  const code = (size: number): ReactNode => (
    <span
      className="pass-code-art"
      dangerouslySetInnerHTML={{
        __html: codeOnPhoto ? qrOnPhoto(url, size) : qrSvg(url, { size, dark: ink.dark, light: ink.light, eye: 'rounded' }),
      }}
    />
  );

  const codeBlock = (
    <section
      className={`pass-code${codeOnPhoto ? ' pass-code-photo' : ''}`}
      style={codeOnPhoto ? { backgroundImage: `url(${photo})`, ['--inv-veil' as string]: String(QR_VEIL), color: QR_SAFE.dark } : undefined}
    >
      <div className="pass-code-body">
        <p className="pass-cta">{copy.cta}</p>
        {code(232)}
        <p className="pass-note">{guest.declined ? arrival.body : note}</p>
      </div>
    </section>
  );

  const detailList = details.length > 0 && (
    <dl className="pass-details">
      {details.map((d) => (
        <div key={d.label} className="pass-detail">
          <dt>{d.label}</dt>
          <dd>{d.value}</dd>
        </div>
      ))}
    </dl>
  );

  const arrived = (
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
        <span className="pass-code-art pass-code-small" dangerouslySetInnerHTML={{ __html: qrSvg(url, { size: 168, dark: ink.dark, light: ink.light, eye: 'rounded' }) }} />
      </details>
    </>
  );

  const foot = (
    <footer className="pass-foot">
      <a href={url} className="pass-back">Open the full invitation →</a>
    </footer>
  );

  // ── portrait: the photograph takes the top, the names sit on it ──────
  if (look === 'portrait' && photo) {
    return (
      <main className="pass" data-look="portrait" style={style}>
        <div className="pass-sheet">
          <div className="pass-hero" style={{ backgroundImage: `url(${photo})` }}>
            <div className="pass-hero-words">
              <p className="pass-intro">{intro}</p>
              <h1 className="pass-names">{names}</h1>
              {when && <p className="pass-when">{when}</p>}
            </div>
          </div>
          {guest.checkedIn ? arrived : <>{codeBlock}{detailList}</>}
          {foot}
        </div>
      </main>
    );
  }

  // ── ticket: the event above the tear, the code in the stub ───────────
  if (look === 'ticket') {
    return (
      <main className="pass" data-look="ticket" style={style}>
        <div className="pass-sheet">
          <header className="pass-head">
            <p className="pass-intro">{intro}</p>
            <h1 className="pass-names">{names}</h1>
            {when && <p className="pass-when">{when}</p>}
          </header>
          {photo && <div className="pass-strip" style={{ backgroundImage: `url(${photo})` }} role="img" aria-label={`${hostsTitle} photograph`} />}
          {detailList}
          <div className="pass-tear" aria-hidden="true" />
          <div className="pass-stub">
            <p className="pass-stub-name">{greeting}</p>
            {guest.checkedIn ? arrived : codeBlock}
          </div>
          {foot}
        </div>
      </main>
    );
  }

  // ── card: a plain sheet, and the quietest of the three ───────────────
  return (
    <main className="pass" data-look="card" style={style}>
      <div className="pass-sheet">
        <header className="pass-head">
          <p className="pass-intro">{intro}</p>
          <h1 className="pass-names">{names}</h1>
          {when && <p className="pass-when">{when}</p>}
        </header>
        {photo && backdrop !== 'photoBehind' && (
          <div className="pass-photo" style={{ backgroundImage: `url(${photo})` }} role="img" aria-label={`${hostsTitle} photograph`} />
        )}
        {guest.checkedIn ? arrived : <>{codeBlock}{detailList}</>}
        {foot}
      </div>
    </main>
  );
}
