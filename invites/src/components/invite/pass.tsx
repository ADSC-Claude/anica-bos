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
 * Two states, and the split is the design. Before the scan the pass has one
 * job — be the thing that gets held up — so it carries the names and the code
 * and nothing else. Not the table, not the hashtag: a guest in a queue holding
 * a gift is not reading, and every line beside the code competes with it.
 * After the scan the queue is behind them and the same phone becomes the day,
 * and that is where the details belong.
 *
 * Three fronts on top of that. The photograph is never washed out, never
 * darkened, and never has type laid over it — the words and the code sit on
 * paper, which is what makes all of that unnecessary. See PASS_LOOKS.
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
  // The pass has a section of its own. An invitation filled in before it did
  // keeps whatever it set on the RSVP section's old backdrop field, which
  // passLookFrom() reads as one of these.
  const own = content.checkin ?? {};
  const rsvp = content.rsvp ?? {};
  const photo = str(own, 'photo') || str(rsvp, 'qrPhoto') || coverImage(content);
  const wanted: PassLook = passLookFrom(str(own, 'look') || str(rsvp, 'qrBackdrop'));
  // A front that wants a photograph and has not been given one falls back to
  // the design rather than leaving a blank rectangle.
  const look: PassLook = wanted !== 'ground' && !photo ? 'ground' : wanted;
  const note = str(own, 'note') || copy.note;

  const ink = qrColours(palette);
  const date = str(content.cover ?? {}, 'date');
  const time = str(content.cover ?? {}, 'time');
  const venue = str(content.ceremony ?? {}, 'venue') || str(content.reception ?? {}, 'venue');
  const greeting = guest.salutation || guest.name;
  const arrival = arrivalLine(greeting, guest.checkedIn, guest.declined);
  const style = cssVars(palette, fonts) as CSSProperties;
  const links = guest.checkedIn ? arrivedLinks(url, { table: guest.table?.name ?? '', ...features }) : [];
  // The links already say the table, and say it as somewhere to go. A detail
  // row repeating it underneath is the same fact twice.
  const spoken = new Set(links.map((l) => l.label));
  const details = passDetails(occasion, content, guest).filter((d) => !spoken.has(d.value));

  // Two lines, not one run of separators: in a card this narrow the single
  // line broke as "… 3:30 PM / · San Agustin Church, / Intramuros", with the
  // separator orphaned at the head of the second line. The venue has its own
  // line on printed stationery regardless.
  const when = [date ? formatDate(date, 'long') : '', time ? formatTime(time) : ''].filter(Boolean).join(' · ');
  const intro = passIntro(occasion, content);
  const names = passSubject(occasion, content, displayTitle(occasion, content));

  const monogram = str(content.cover ?? {}, 'monogram');

  const head: ReactNode = (
    <header className="pass-head">
      {monogram && <p className="pass-monogram" aria-hidden="true">{monogram}</p>}
      <p className="pass-intro">{intro}</p>
      <h1 className="pass-names">{names}</h1>
      <span className="pass-rule" aria-hidden="true" />
      {when && <p className="pass-when">{when}</p>}
      {venue && <p className="pass-where">{venue}</p>}
      {/*
       * Whose pass this is. It was missing from the front entirely, which is
       * absurd for a page that exists to be held up by one named person — and
       * it is the line a coordinator reads off the screen before they scan.
       */}
      <p className="pass-for">for <em>{greeting}</em></p>
    </header>
  );

  const codeBlock = (
    <section className="pass-code">
      <p className="pass-cta"><span>{copy.cta}</span></p>
      <span className="pass-plate">
        <span
          className="pass-code-art"
          dangerouslySetInnerHTML={{ __html: qrSvg(url, { size: 232, dark: ink.dark, light: ink.light, eye: 'rounded' }) }}
        />
      </span>
      <p className="pass-note">{guest.declined ? arrival.body : note}</p>
    </section>
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
      {/* The threshold questions, now that there is time to read them. */}
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
      {/* Kept, smaller: a pass somebody may be asked for twice. */}
      <details className="pass-again">
        <summary>Show my code again</summary>
        <span className="pass-code-art pass-code-small" dangerouslySetInnerHTML={{ __html: qrSvg(url, { size: 168, dark: ink.dark, light: ink.light, eye: 'rounded' }) }} />
      </details>
    </div>
  );

  const foot = (
    <footer className="pass-foot">
      <a href={url} className="pass-back">Open the full invitation →</a>
    </footer>
  );

  const body = guest.checkedIn ? arrived : <>{codeBlock}{foot}</>;

  // ── the photograph fills the pass, everything sits on a card over it ──
  if (look === 'photo') {
    return (
      <main className="pass" data-look="photo" style={style}>
        <div className="pass-picture" style={{ backgroundImage: `url(${photo})` }} role="img" aria-label={`${hostsTitle} photograph`} />
        <div className="pass-sheet">
          {head}
          {body}
        </div>
      </main>
    );
  }

  // ── the photograph in an arch cut into the card ──────────────────────
  if (look === 'arch') {
    return (
      <main className="pass" data-look="arch" style={style}>
        <div className="pass-sheet">
          <div className="pass-arch" style={{ backgroundImage: `url(${photo})` }} role="img" aria-label={`${hostsTitle} photograph`} />
          {head}
          {body}
        </div>
      </main>
    );
  }

  // ── the invitation's own background, carried to the door ─────────────
  return (
    <main className="pass" data-look="ground" data-art={ground ? 'yes' : 'no'} style={style}>
      {ground && <div className="pass-picture" style={{ backgroundImage: `url(${ground})` }} aria-hidden="true" />}
      <div className="pass-sheet">
        {head}
        {body}
      </div>
    </main>
  );
}
