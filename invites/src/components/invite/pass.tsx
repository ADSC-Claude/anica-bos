import { qrSvg, qrOnPhoto, qrColours, QR_SAFE } from '@/lib/qr';
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
 * job — be the thing that gets held up — so it carries the names, the code and
 * nothing else. Not the table, not the hashtag: a guest in a queue holding a
 * gift is not reading, and every line beside the code is a line competing with
 * it. After the scan the queue is behind them and the same phone becomes the
 * day, and that is where the details belong.
 *
 * Two looks on top of that, and neither cuts the code out of the design it
 * belongs to — no tear, no border, no white card. See PASS_LOOKS.
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
  // passLookFrom() reads as one of these two.
  const own = content.checkin ?? {};
  const rsvp = content.rsvp ?? {};
  const photo = str(own, 'photo') || str(rsvp, 'qrPhoto') || coverImage(content);
  const wanted: PassLook = passLookFrom(str(own, 'look') || str(rsvp, 'qrBackdrop'));
  // A look that wants a photograph and has not been given one falls back to the
  // design rather than floating a code over nothing.
  const look: PassLook = wanted === 'silhouette' && !photo ? 'ground' : wanted;
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

  const when = [date ? formatDate(date, 'long') : '', time ? formatTime(time) : '', venue].filter(Boolean).join(' · ');
  const intro = passIntro(occasion, content);
  const names = passSubject(occasion, content, displayTitle(occasion, content));
  /*
   * Whenever there is a picture behind the code — the guest's photograph, or
   * the design's own artwork — the code needs pale paper under it, and the
   * bloom is how it gets it without a card. Only a design with no artwork
   * leaves the code on flat colour, where it can simply take the palette.
   */
  const bloomed = look === 'silhouette' || Boolean(ground);

  const code = (size: number): ReactNode => (
    <span
      className="pass-code-art"
      dangerouslySetInnerHTML={{
        __html: bloomed ? qrOnPhoto(url, size) : qrSvg(url, { size, dark: ink.dark, light: ink.light, eye: 'rounded' }),
      }}
    />
  );

  /*
   * The bloom is the whole of the silhouette look. It is a radial wash of
   * white with no edge: full strength across the code and its quiet zone, then
   * falling away into the photograph, so the code is not on a card — it is on
   * the picture, which has gone to light underneath it. The stops are measured
   * rather than chosen; see .pass-bloom in globals.css.
   */
  const codeBlock = (
    <section className={`pass-code${bloomed ? ' pass-bloom' : ''}`} style={bloomed ? { color: QR_SAFE.dark } : undefined}>
      <div className="pass-code-body">
        <p className="pass-cta">{copy.cta}</p>
        {code(232)}
        <p className="pass-note">{guest.declined ? arrival.body : note}</p>
        {/*
         * On the silhouette this line lives here rather than in the head, and
         * that is a legibility decision rather than a layout one: it is the
         * smallest type on the pass, and white at that size over an unknown
         * photograph needed a scrim so dark the head stopped being a shade and
         * became a black bar. Down here it is dark type on the bloom's light,
         * which measures 15:1 and needs nothing.
         */}
        {look === 'silhouette' && when && <p className="pass-where">{when}</p>}
      </div>
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

  const head = (
    <header className="pass-head">
      <p className="pass-intro">{intro}</p>
      <h1 className="pass-names">{names}</h1>
      {when && look !== 'silhouette' && <p className="pass-when">{when}</p>}
    </header>
  );

  const foot = (
    <footer className="pass-foot">
      <a href={url} className="pass-back">Open the full invitation →</a>
    </footer>
  );

  // ── the photograph, whole, with the code floating on it ──────────────
  if (look === 'silhouette') {
    return (
      <main className="pass" data-look="silhouette" data-art="yes" style={style}>
        <div className="pass-sheet" style={{ backgroundImage: `url(${photo})` }} role="img" aria-label={`${hostsTitle} photograph`}>
          <div className="pass-shade">{head}</div>
          {guest.checkedIn ? arrived : codeBlock}
          {foot}
        </div>
      </main>
    );
  }

  // ── the invitation's own background, carried to the door ─────────────
  return (
    <main className="pass" data-look="ground" data-art={ground ? 'yes' : 'no'} style={style}>
      <div className="pass-sheet" style={ground ? { backgroundImage: `url(${ground})` } : undefined}>
        {head}
        {guest.checkedIn ? arrived : codeBlock}
        {foot}
      </div>
    </main>
  );
}
