import type { Occasion, Tier } from '@prisma/client';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { t, type Lang, INTRO_PRESETS, preset } from '@/lib/copy';
import { lookLine, lookTitle, type Look, type LineKey, type TitleKey } from '@/lib/looks';
import { contentOf, resolveTheme, rsvpOpen, type PublicInvitation } from '@/lib/invitations';
import { OCCASION_SECTIONS, sectionOrder, sectionOffered, sectionUnlocked, sectionFilled, str, bool, num, rows, personOf, formatPerson, eventInstant, ordinal, displayTitle, coverImage, type Content, type SectionKey, type SectionData } from '@/lib/sections';
import { OPENING_BY_KEY, resolveOpening, openingAssets } from '@/lib/openings';
import { resolveBackdrop } from '@/lib/backdrops';
import { galleryLimit, hasFeature } from '@/lib/tiers';
import { cssVars, googleFontsUrl, isLayout } from '@/lib/theme';
import { formatDate, formatTime } from '@/lib/datetime';
import { qrSvg } from '@/lib/qr';
import { invitationUrl, invitationPath } from '@/lib/app-url';
import { Shell, Countdown, RsvpForm, GuestbookForm, GuestPhotoForm, PrintButton, VideoFacade } from './client';
import { imageUrl, IMAGE } from '@/lib/images';

/**
 * The invitation, rendered on the server from its JSON. The template decides
 * the palette, the fonts and the hero layout; this file decides what each
 * section says. A section that the tier does not include, or that the
 * customer left empty, simply does not appear.
 */

export type GuestForPage = {
  id: string;
  name: string;
  salutation: string;
  seatsAllotted: number;
  plusOneAllowed: boolean;
  token: string;
  table: { name: string } | null;
  rsvps: { response: 'ACCEPT' | 'DECLINE'; seats: number; attendees: unknown; mealChoice: string; dietary: string; message: string }[];
};

export type RenderProps = {
  invitation: PublicInvitation;
  guest?: GuestForPage | null;
  preview?: boolean;
  print?: boolean;
  /** The page alone: no opening, no music. For a showcase that sets several side by side. */
  bare?: boolean;
  /** "phone": lay the page out as a phone would whatever the screen, for a showcase column. */
  shape?: 'phone';
  /** A look to set the page in, over the design's and the customer's. For the showcase. */
  look?: Look;
  businessName: string;
};

function nonEmpty(s: string): boolean {
  return s.trim() !== '';
}

function mapsHref(data: SectionData | undefined): string {
  const given = str(data, 'mapsUrl');
  if (given) return given;
  const q = [str(data, 'venue'), str(data, 'address')].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

function wazeHref(data: SectionData | undefined): string {
  const given = str(data, 'wazeUrl');
  if (given) return given;
  const q = [str(data, 'venue'), str(data, 'address')].filter(Boolean).join(', ');
  return q ? `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes` : '';
}

function videoEmbed(url: string): { src: string; poster?: string } | null {
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url);
  if (yt) return { src: `https://www.youtube-nocookie.com/embed/${yt[1]}`, poster: `https://i.ytimg.com/vi/${yt[1]}/maxresdefault.jpg` };
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}` };
  return null;
}

function Section({ id, eyebrow, title, tagline, children, className = '' }: { id: string; eyebrow?: string; title?: string; tagline?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`inv-section ${className}`}>
      {eyebrow && <p className="inv-eyebrow">{eyebrow}</p>}
      {title && <h2 className="inv-title">{title}</h2>}
      {tagline && <p className="inv-tagline">{tagline}</p>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function heroCopy(occasion: Occasion, cover: SectionData | undefined, lang: Lang): { eyebrow: string; names: string[]; sub: string; intro: string } {
  const s = (k: string) => str(cover, k);
  const introRaw = s('intro');
  switch (occasion) {
    case 'WEDDING': {
      const kind = s('kind');
      const a = s('brideNick') || s('brideFirst');
      const b = s('groomNick') || s('groomFirst');
      const intro = introRaw || preset(INTRO_PRESETS, s('introPreset') || 'families', lang).replace('{a}', a).replace('{b}', b);
      return {
        eyebrow: kind === 'saveTheDate' ? t(lang, 'cover.saveTheDate') : kind === 'thanksgiving' ? (lang === 'tl' ? 'Misa ng Pasasalamat' : 'Thanksgiving Mass') : lang === 'tl' ? 'Ikakasal na sina' : 'The wedding of',
        names: [s('brideFirst') || 'Bride', s('groomFirst') || 'Groom'],
        sub: [s('brideFull'), s('groomFull')].filter(Boolean).join(' · '),
        intro,
      };
    }
    case 'DEBUT':
      return { eyebrow: lang === 'tl' ? 'Ang ika-18 kaarawan ni' : 'The 18th birthday of', names: [s('celebrantFirst') || 'Debutante'], sub: [s('celebrantFull'), s('theme')].filter(Boolean).join(' · '), intro: introRaw };
    case 'CHRISTENING':
      return { eyebrow: bool(cover, 'combined') ? (lang === 'tl' ? 'Binyag at Unang Kaarawan ni' : 'The Christening & 1st Birthday of') : lang === 'tl' ? 'Ang Binyag ni' : 'The Christening of', names: [s('childNick') || s('childFull') || 'Baby'], sub: s('childNick') ? s('childFull') : s('theme'), intro: introRaw };
    case 'COMMUNION':
      return { eyebrow: lang === 'tl' ? 'Ang Unang Komunyon ni' : 'The First Holy Communion of', names: [s('childNick') || s('childFull') || 'Child'], sub: s('childNick') ? s('childFull') : '', intro: introRaw };
    case 'KIDS_BIRTHDAY':
    case 'MILESTONE_BIRTHDAY': {
      const age = num(cover, 'age');
      return { eyebrow: age ? (lang === 'tl' ? `Ika-${age} kaarawan ni` : `The ${ordinal(age)} birthday of`) : lang === 'tl' ? 'Kaarawan ni' : 'The birthday of', names: [s('celebrantFirst') || 'Celebrant'], sub: s('theme'), intro: introRaw };
    }
    case 'BABY_SHOWER':
      return { eyebrow: s('kind') === 'reveal' ? 'Gender reveal' : 'Baby shower', names: [s('momName') || 'Mom', ...(s('dadName') ? [s('dadName')] : [])], sub: s('theme'), intro: introRaw };
    case 'ANNIVERSARY': {
      const years = num(cover, 'years');
      return { eyebrow: years ? `${years} years` : 'Anniversary', names: [s('partnerA') || 'A', s('partnerB') || 'B'], sub: bool(cover, 'renewal') ? 'Renewal of vows' : '', intro: introRaw };
    }
    case 'ENGAGEMENT':
      return { eyebrow: s('kind') === 'pamamanhikan' ? 'Pamamanhikan' : 'Engagement', names: [s('partnerA') || 'A', s('partnerB') || 'B'], sub: '', intro: introRaw };
    case 'GRADUATION':
      return { eyebrow: lang === 'tl' ? 'Pasasalamat para kay' : 'In celebration of', names: [s('honoree') || 'Graduate'], sub: s('achievement'), intro: introRaw };
    case 'CORPORATE':
      return { eyebrow: s('company'), names: [s('eventName') || 'Event'], sub: s('tagline'), intro: introRaw };
    case 'HOUSEWARMING':
      return { eyebrow: lang === 'tl' ? 'Bendisyon ng Bahay' : 'House blessing', names: [s('familyName') || 'Our home'], sub: '', intro: introRaw };
    case 'REUNION':
      return { eyebrow: s('kind') === 'despedida' ? 'Despedida' : s('kind') === 'welcome' ? 'Welcome home' : 'Reunion', names: [s('groupName') || 'Reunion'], sub: '', intro: introRaw };
    case 'MEMORIAL':
      return { eyebrow: lang === 'tl' ? 'Sa mapagmahal na alaala ni' : 'In loving memory of', names: [s('name') || ''], sub: [s('bornDate') ? formatDate(s('bornDate')) : '', s('diedDate') ? formatDate(s('diedDate')) : ''].filter(Boolean).join(' — '), intro: introRaw };
  }
}

/** "08 · 24 · 2026" — the date set the way a card sets it. */
function dottedDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return m ? `${m[2]} · ${m[3]} · ${m[1]}` : '';
}

function Hero({ occasion, content, lang, layout, format, look, eyebrow: lookEyebrow }: { occasion: Occasion; content: Content; lang: Lang; layout: string; format?: boolean; look?: Look; eyebrow?: string }) {
  const cover = content.cover;
  const copy = heroCopy(occasion, cover, lang);
  const eyebrow = lookEyebrow ?? (layout === 'capiz' && occasion === 'WEDDING' ? t(lang, 'cover.invited') : copy.eyebrow);
  const photo = str(cover, 'coverPhoto') || str(cover, 'logo');
  const date = str(cover, 'date');
  const time = str(cover, 'time');
  const monogram = str(cover, 'monogram');
  const joiner = look?.joiner ?? '&';
  // The format's cover carries the place and the moment's three lines; the
  // sentence that does the inviting waits for the invitation block.
  const place = content.ceremony && str(content.ceremony, 'venue') ? content.ceremony : content.reception;
  const placeLines = format ? [str(place, 'venue'), str(place, 'address')].filter(Boolean) : [];
  const momentLines = format && !str(content.moment, 'backdrop') ? ['line1', 'line2', 'line3'].map((k) => str(content.moment, k)).filter(Boolean) : [];
  return (
    <header className="inv-hero" id="top">
      {photo && <img src={imageUrl(photo, IMAGE.hero)} alt="" className="inv-hero-photo" />}
      <div className="inv-hero-scrim" />
      <div className="inv-hero-body">
        {/* Two groups, so a design can set the names apart from the rest —
            Capiz holds them between the two strands of its plate. */}
        <div className="inv-hero-names">
          {monogram && <p className="inv-display mb-3 text-3xl opacity-90">{monogram}</p>}
          {eyebrow && <p className="inv-eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>{eyebrow}</p>}
          <h1 className="inv-names">
            {copy.names.map((n, i) => (
              <span key={i}>
                {i > 0 && (joiner === 'and' ? <span className="inv-amp" data-word="">{lang === 'tl' ? 'at' : 'and'}</span> : <span className="inv-amp">&amp;</span>)}
                {n}
              </span>
            ))}
          </h1>
        </div>
        <div className="inv-hero-details">
          {format ? (
            <>
              {date && <p className="inv-hero-date">{dottedDate(date)}</p>}
              {placeLines.map((l, i) => <p key={i} className="inv-eyebrow inv-hero-place">{l}</p>)}
              {momentLines.length > 0 && (
                <div className="inv-hero-lines">
                  {momentLines.map((l, i) => <p key={i}>{l}</p>)}
                </div>
              )}
              <p className="inv-scroll" aria-hidden>{t(lang, 'cover.scroll')}</p>
            </>
          ) : (
            <>
              {copy.sub && <p className="mt-3 text-sm opacity-90">{copy.sub}</p>}
              {copy.intro && <p className="mx-auto mt-5 max-w-md text-base leading-relaxed opacity-95">{copy.intro}</p>}
              {date && (
                <p className="mt-6 text-lg">
                  <span className="inv-display block text-2xl">{formatDate(date, 'weekday')}</span>
                  {time && <span className="mt-1 block text-sm opacity-90">{formatTime(time)}</span>}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** The couple's verse or quotation, set in capitals after the cover. */
function Verse({ text, source }: { text: string; source: string }) {
  return (
    <section id="verse" className="inv-section inv-verse">
      <p className="inv-verse-text">{text}</p>
      {source && <p className="inv-eyebrow inv-verse-ref">{source}</p>}
      <span className="inv-rule" aria-hidden />
    </section>
  );
}

/** A line or two in script between chapters — the look's, or the couple's own. */
function Interlude({ id, text }: { id: string; text: string }) {
  return (
    <section id={id} className="inv-section inv-interlude">
      <p className="inv-tagline">{text}</p>
    </section>
  );
}

/** A line icon for the format's rows and headings. */
function Ico({ name, className = '' }: { name: string; className?: string }) {
  return (
    <svg className={`inv-ico ${className}`} viewBox="0 0 24 24" aria-hidden>
      <path d={ICON_PATHS[name] ?? ICON_PATHS.clock} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Parents({ occasion, data, lang }: { occasion: Occasion; data: SectionData; lang: Lang }) {
  const late = t(lang, 'parents.late');
  if (occasion === 'WEDDING') {
    const phrasing = str(data, 'phrasing') === 'blessing' ? t(lang, 'parents.blessing') : t(lang, 'parents.together');
    const side = (father: string, mother: string, note: string, title: string) => {
      const lines = [formatPerson(personOf(data, father), late), formatPerson(personOf(data, mother), late), str(data, note)].filter(nonEmpty);
      if (!lines.length) return null;
      return (
        <div className="text-center">
          <p className="inv-eyebrow">{title}</p>
          {lines.map((l, i) => (
            <p key={i} className="text-lg">{l}</p>
          ))}
        </div>
      );
    };
    return (
      <Section id="parents" eyebrow={phrasing}>
        <div className="inv-two">
          {side('brideFather', 'brideMother', 'brideNote', t(lang, 'parents.bride'))}
          {side('groomFather', 'groomMother', 'groomNote', t(lang, 'parents.groom'))}
        </div>
      </Section>
    );
  }
  const persons = ['father', 'mother', 'father2', 'mother2'].map((k) => formatPerson(personOf(data, k), late)).filter(nonEmpty);
  const hosts = rows<{ name: string; relation: string }>(data, 'hosts');
  const note = str(data, 'note');
  if (!persons.length && !hosts.length && !note) return null;
  return (
    <Section id="parents" eyebrow={t(lang, 'parents.hosts')}>
      <div className="inv-list text-lg">
        {persons.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {hosts.map((h, i) => (
          <p key={i}>
            {h.name}
            {h.relation && <span className="inv-muted text-sm"> · {h.relation}</span>}
          </p>
        ))}
        {note && <p className="inv-muted text-base">{note}</p>}
      </div>
    </Section>
  );
}

type EventFormat = {
  /** "ceremony": the invitation block with its rows; "reception": the venue page — both venues and the way to each. */
  role: 'ceremony' | 'reception';
  /** The ceremony's own data, for the venue page. */
  ceremony?: SectionData;
  /** The sentence that does the inviting, and the full names over it. */
  intro?: string;
  sub?: string;
  /** The attire, for the last row of the invitation block. */
  attire?: string;
  /** Ceremony and reception in one place: the venue block says so, and the invitation block skips the map. */
  sameVenue: boolean;
  /** No venue block follows, so the invitation block carries the map itself. */
  mapHere: boolean;
  gettingTitle: string;
};

function EventBlock({ id, title, tagline, data, lang, fallbackDate, calendarHref, format }: { id: string; title: string; tagline?: string; data: SectionData; lang: Lang; fallbackDate: string; calendarHref?: string; format?: EventFormat }) {
  const venue = str(data, 'venue');
  if (!venue) return null;
  const date = str(data, 'date') || fallbackDate;
  const time = str(data, 'time');
  const maps = mapsHref(data);
  const waze = wazeHref(data);
  const photo = str(data, 'photo');
  const address = str(data, 'address');
  if (format?.role === 'ceremony') {
    const weekday = date ? formatDate(date, 'weekday').split(',')[0] : '';
    return (
      <Section id={id} title={title} tagline={tagline}>
        {format.sub && <p className="inv-eyebrow inv-invite-sub">{format.sub}</p>}
        {format.intro && <p className="inv-invite-intro">{format.intro}</p>}
        <ul className="inv-rows">
          {date && <li><Ico name="calendar" /><div><b>{weekday}</b><span>{formatDate(date)}</span></div></li>}
          {time && <li><Ico name="clock" /><div><b>{formatTime(time)}</b><span>{t(lang, 'invitation.ceremony')}</span></div></li>}
          <li><Ico name="pin" /><div><b>{venue}</b>{address && <span>{address}</span>}</div></li>
          {format.attire && <li><Ico name="dress" /><div><b>{format.attire}</b></div></li>}
        </ul>
        {str(data, 'seatedBy') && <p className="inv-muted mt-4 text-center text-sm">{t(lang, 'ceremony.seatedBy')} {str(data, 'seatedBy')}</p>}
        {str(data, 'note') && <p className="mt-2 whitespace-pre-line text-center text-sm">{str(data, 'note')}</p>}
        {(format.mapHere || calendarHref) && (
          <div className="no-print mt-5 flex flex-wrap justify-center gap-2">
            {format.mapHere && maps && <a href={maps} target="_blank" rel="noopener" className="inv-btn inv-btn-outline">{t(lang, 'map.google')}</a>}
            {format.mapHere && waze && <a href={waze} target="_blank" rel="noopener" className="inv-btn inv-btn-outline">{t(lang, 'map.waze')}</a>}
            {calendarHref && <a href={calendarHref} className="inv-btn inv-btn-outline">{t(lang, 'calendar.add')}</a>}
          </div>
        )}
      </Section>
    );
  }
  if (format?.role === 'reception') {
    // One page for where it all happens: the ceremony's venue and the
    // reception's when they differ, one heading when they are the same, and
    // the way to each.
    const cer = format.ceremony;
    const cerVenue = cer ? str(cer, 'venue') : '';
    const places = format.sameVenue || !cerVenue
      ? [{ label: format.sameVenue ? t(lang, 'venue.both') : t(lang, 'venue.reception'), data, time: format.sameVenue ? '' : time }]
      : [
          { label: t(lang, 'invitation.ceremony'), data: cer as SectionData, time: str(cer, 'time') },
          { label: t(lang, 'venue.reception'), data, time },
        ];
    const photoUrl = photo || (cer ? str(cer, 'photo') : '');
    return (
      <Section id={id} title={title} tagline={tagline}>
        {photoUrl && <img src={imageUrl(photoUrl, IMAGE.feature)} alt="" className="inv-photo inv-venue-photo aspect-[4/3]" loading="lazy" />}
        <div className="inv-venues">
          {places.map((p, i) => (
            <div key={i}>
              <p className="inv-eyebrow">{p.label}</p>
              <p className="inv-venue-name">{str(p.data, 'venue')}</p>
              {str(p.data, 'address') && <p className="inv-venue-addr">{str(p.data, 'address')}</p>}
              {p.time && <p className="mt-1 text-center">{formatTime(p.time)}</p>}
            </div>
          ))}
        </div>
        {str(data, 'parkingNote') && <p className="mt-3 text-center text-sm">{str(data, 'parkingNote')}</p>}
        {str(data, 'note') && <p className="mt-2 whitespace-pre-line text-center text-sm">{str(data, 'note')}</p>}
        <h3 className="inv-title inv-title-sub">{format.gettingTitle}</h3>
        {places.map((p, i) => {
          const m = mapsHref(p.data);
          const w = wazeHref(p.data);
          return (
            <div key={i} className="inv-getting-block">
              <div className="inv-card inv-getting">
                <Ico name="pin" />
                <div>
                  <b>{str(p.data, 'venue')}</b>
                  {str(p.data, 'address') && <span>{str(p.data, 'address')}</span>}
                </div>
              </div>
              <div className="no-print">
                {m && <a href={m} target="_blank" rel="noopener" className="inv-btn inv-btn-outline inv-btn-wide"><Ico name="pin" className="inv-ico-sm" />{t(lang, 'map.openGoogle')}</a>}
                {w && <a href={w} target="_blank" rel="noopener" className="inv-btn inv-btn-outline inv-btn-wide"><Ico name="pin" className="inv-ico-sm" />{t(lang, 'map.openWaze')}</a>}
              </div>
            </div>
          );
        })}
      </Section>
    );
  }
  return (
    <Section id={id} title={title} tagline={tagline}>
      <div className="inv-card text-center">
        {photo && <img src={imageUrl(photo, IMAGE.feature)} alt="" className="inv-photo mb-4 aspect-[3/2]" loading="lazy" />}
        <p className="inv-display text-2xl">{venue}</p>
        {str(data, 'address') && <p className="inv-muted mt-1">{str(data, 'address')}</p>}
        {(date || time) && (
          <p className="mt-3 text-lg">
            {date && formatDate(date, 'weekday')}
            {time && <span className="block">{formatTime(time)}</span>}
          </p>
        )}
        {str(data, 'seatedBy') && <p className="inv-muted mt-2 text-sm">{t(lang, 'ceremony.seatedBy')} {str(data, 'seatedBy')}</p>}
        {str(data, 'parkingNote') && <p className="mt-2 text-sm">{str(data, 'parkingNote')}</p>}
        {str(data, 'note') && <p className="mt-2 whitespace-pre-line text-sm">{str(data, 'note')}</p>}
        <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
          {maps && <a href={maps} target="_blank" rel="noopener" className="inv-btn inv-btn-outline">{t(lang, 'map.google')}</a>}
          {waze && <a href={waze} target="_blank" rel="noopener" className="inv-btn inv-btn-outline">{t(lang, 'map.waze')}</a>}
          {calendarHref && <a href={calendarHref} className="inv-btn inv-btn-outline">{t(lang, 'calendar.add')}</a>}
        </div>
      </div>
    </Section>
  );
}

function NameList({ title, items }: { title: string; items: string[] }) {
  const clean = items.filter(nonEmpty);
  if (!clean.length) return null;
  return (
    <div className="text-center">
      <p className="inv-eyebrow">{title}</p>
      <div className="inv-list">
        {clean.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </div>
    </div>
  );
}

function Entourage({ data, lang, tagline, title }: { data: SectionData; lang: Lang; tagline?: string; title?: string }) {
  const principal = rows<{ ninong: string; ninang: string }>(data, 'principalSponsors').filter((p) => p.ninong || p.ninang);
  const secondary = rows<{ role: string; first: string; second: string }>(data, 'secondarySponsors').filter((p) => p.first || p.second);
  const namesOf = (k: string) => rows<{ name: string }>(data, k).map((r) => r.name);
  const honor = str(data, 'honorTitle') === 'matron' ? t(lang, 'entourage.matronOfHonor') : t(lang, 'entourage.maidOfHonor');
  return (
    <Section id="entourage" title={title ?? t(lang, 'entourage.title')} tagline={tagline}>
      <div className="space-y-8">
        {(namesOf('brideParents').some(nonEmpty) || namesOf('groomParents').some(nonEmpty)) && (
          <div className="space-y-6">
            <NameList title={t(lang, 'entourage.brideParents')} items={namesOf('brideParents')} />
            <NameList title={t(lang, 'entourage.groomParents')} items={namesOf('groomParents')} />
          </div>
        )}
        {principal.length > 0 && (
          <div>
            <p className="inv-eyebrow">{t(lang, 'entourage.principal')}</p>
            <div className="inv-two text-center">
              <div className="inv-list">{principal.map((p, i) => <p key={i}>{p.ninong}</p>)}</div>
              <div className="inv-list">{principal.map((p, i) => <p key={i}>{p.ninang}</p>)}</div>
            </div>
          </div>
        )}
        {secondary.length > 0 && (
          <div>
            <p className="inv-eyebrow">{t(lang, 'entourage.secondary')}</p>
            <div className="inv-list">
              {secondary.map((p, i) => (
                <p key={i}>
                  <span className="inv-muted text-xs uppercase tracking-widest">{t(lang, (`entourage.${p.role || 'candle'}`) as 'entourage.candle')}</span>
                  <br />
                  {[p.first, p.second].filter(Boolean).join(' & ')}
                </p>
              ))}
            </div>
          </div>
        )}
        <div className="inv-two">
          <NameList title={t(lang, 'entourage.bestMan')} items={[str(data, 'bestMan')]} />
          <NameList title={honor} items={[str(data, 'maidOfHonor')]} />
          <NameList title={t(lang, 'entourage.groomsmen')} items={namesOf('groomsmen')} />
          <NameList title={t(lang, 'entourage.bridesmaids')} items={namesOf('bridesmaids')} />
          <NameList title={t(lang, 'entourage.juniorGroomsmen')} items={namesOf('juniorGroomsmen')} />
          <NameList title={t(lang, 'entourage.juniorBridesmaids')} items={namesOf('juniorBridesmaids')} />
          <NameList title={t(lang, 'entourage.littleGroom')} items={[str(data, 'littleGroom')]} />
          <NameList title={t(lang, 'entourage.littleBride')} items={[str(data, 'littleBride')]} />
          <NameList title={t(lang, 'entourage.ringBearer')} items={[str(data, 'ringBearer')]} />
          <NameList title={t(lang, 'entourage.coinBearer')} items={[str(data, 'coinBearer')]} />
          <NameList title={t(lang, 'entourage.bibleBearer')} items={[str(data, 'bibleBearer')]} />
          <NameList title={t(lang, 'entourage.flowerGirls')} items={namesOf('flowerGirls')} />
        </div>
        {str(data, 'officiant') && <NameList title={t(lang, 'entourage.officiant')} items={[str(data, 'officiant')]} />}
      </div>
    </Section>
  );
}

function Sponsors({ data, lang }: { data: SectionData; lang: Lang }) {
  const ninongs = rows<{ name: string }>(data, 'ninongs').map((r) => r.name);
  const ninangs = rows<{ name: string }>(data, 'ninangs').map((r) => r.name);
  return (
    <Section id="sponsors" title={t(lang, 'sponsors.title')}>
      <div className="inv-two">
        <NameList title={t(lang, 'sponsors.ninongs')} items={ninongs} />
        <NameList title={t(lang, 'sponsors.ninangs')} items={ninangs} />
      </div>
    </Section>
  );
}

function Eighteen({ data, lang }: { data: SectionData; lang: Lang }) {
  const group = (key: string, title: string) => {
    const items = rows<{ name: string; relation?: string; item?: string; partner?: string }>(data, key);
    if (!items.length) return null;
    return (
      <div className="text-center">
        <p className="inv-eyebrow">{title}</p>
        <ol className="inv-list">
          {items.map((r, i) => (
            <li key={i}>
              <span className="inv-muted mr-2 text-xs">{i + 1}.</span>
              {r.name}
              {r.partner && <span> &amp; {r.partner}</span>}
              {(r.relation || r.item) && <span className="inv-muted text-sm"> · {[r.relation, r.item].filter(Boolean).join(' · ')}</span>}
            </li>
          ))}
        </ol>
      </div>
    );
  };
  return (
    <Section id="eighteen" title={t(lang, 'eighteen.title')}>
      <div className="space-y-8">
        {group('roses', t(lang, 'eighteen.roses'))}
        {group('candles', t(lang, 'eighteen.candles'))}
        {group('treasures', t(lang, 'eighteen.treasures'))}
        {group('blueBills', t(lang, 'eighteen.blueBills'))}
        {group('balloons', t(lang, 'eighteen.balloons'))}
        {group('shots', t(lang, 'eighteen.shots'))}
        {group('cotillion', t(lang, 'eighteen.cotillion'))}
      </div>
    </Section>
  );
}

const ATTIRE: Record<string, string> = { formal: 'Formal', semiFormal: 'Semi-formal', smartCasual: 'Smart casual', filipiniana: 'Filipiniana & Barong', cocktail: 'Cocktail', themed: 'Themed', casual: 'Casual' };

function DressCode({ data, lang, tagline, layout, title, format, note }: { data: SectionData; lang: Lang; tagline?: string; layout?: string; title?: string; format?: boolean; note?: string }) {
  const colors = rows<string>(data, 'colors');
  const attire = ATTIRE[str(data, 'attire')] ?? '';
  const line = format ? attire || tagline : tagline || (layout === 'capiz' ? attire || undefined : undefined);
  if (format) {
    return (
      <Section id="dress-code" title={title ?? t(lang, 'dressCode.title')} tagline={line}>
        {colors.length > 0 && <DressFigures colors={colors} />}
        <div className="inv-dress-notes">
          {str(data, 'attireText') && <p>{str(data, 'attireText')}</p>}
          {colors.length > 0 && (
            <div className="inv-swatches">
              {colors.map((c) => <span key={c} className="inv-swatch" style={{ background: c }} title={c} />)}
            </div>
          )}
          {note && <p className="inv-eyebrow inv-dress-note">{note}</p>}
          {bool(data, 'avoidWhite') && <p className="inv-muted text-sm">{t(lang, 'dressCode.avoidWhite')}</p>}
          {(str(data, 'sponsorsAttire') || str(data, 'entourageAttire')) && (
            <div className="inv-two inv-attire text-sm">
              {str(data, 'sponsorsAttire') && <p><span className="inv-eyebrow block">{t(lang, 'dressCode.sponsors')}</span>{str(data, 'sponsorsAttire')}</p>}
              {str(data, 'entourageAttire') && <p><span className="inv-eyebrow block">{t(lang, 'dressCode.entourage')}</span>{str(data, 'entourageAttire')}</p>}
            </div>
          )}
          {str(data, 'note') && <p className="whitespace-pre-line text-sm">{str(data, 'note')}</p>}
        </div>
      </Section>
    );
  }
  return (
    <Section id="dress-code" title={title ?? t(lang, 'dressCode.title')} tagline={line}>
      {layout === 'capiz' && colors.length > 0 && <DressFigures colors={colors} />}
      <div className="inv-card text-center">
        {(attire || str(data, 'attireText')) && (
          <p className="text-lg">
            {attire}
            {str(data, 'attireText') && <span className="inv-muted block text-base">{str(data, 'attireText')}</span>}
          </p>
        )}
        {colors.length > 0 && (
          <div className="mt-4">
            <p className="inv-eyebrow">{t(lang, 'dressCode.motif')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {colors.map((c) => (
                <span key={c} className="inv-swatch" style={{ background: c }} title={c} />
              ))}
            </div>
          </div>
        )}
        {bool(data, 'avoidWhite') && <p className="inv-muted mt-3 text-sm">{t(lang, 'dressCode.avoidWhite')}</p>}
        {(str(data, 'sponsorsAttire') || str(data, 'entourageAttire')) && (
          <div className="inv-two inv-attire mt-4 text-sm">
            {str(data, 'sponsorsAttire') && <p><span className="inv-eyebrow block">{t(lang, 'dressCode.sponsors')}</span>{str(data, 'sponsorsAttire')}</p>}
            {str(data, 'entourageAttire') && <p><span className="inv-eyebrow block">{t(lang, 'dressCode.entourage')}</span>{str(data, 'entourageAttire')}</p>}
          </div>
        )}
        {str(data, 'note') && <p className="mt-3 whitespace-pre-line text-sm">{str(data, 'note')}</p>}
      </div>
    </Section>
  );
}

function Gift({ data, lang, title, tagline, format, thanks }: { data: SectionData; lang: Lang; title: string; tagline?: string; format?: boolean; thanks?: string }) {
  const registry = rows<{ label: string; url: string }>(data, 'registry');
  const qr = str(data, 'gcashQr');
  return (
    <Section id="gift" title={title} tagline={tagline}>
      {format && <Ico name="gift" className="inv-ico-lg" />}
      {str(data, 'text') && <p className="mx-auto max-w-md whitespace-pre-line text-center">{str(data, 'text')}</p>}
      {(qr || str(data, 'gcashNumber')) && (
        <div className="inv-card mt-5 text-center">
          <p className="inv-eyebrow">{t(lang, 'gift.gcash')}</p>
          {/*
            Deliberately not resized. Everything else on this page goes through
            imageUrl(), but a QR code re-encoded as lossy WebP is a QR code that
            might not scan, and this one is how the couple gets paid. It is a
            single small image; the bytes are not worth the risk.
          */}
          {qr && <img src={qr} alt="GCash QR" className="mx-auto mb-3 w-48 rounded-lg" loading="lazy" />}
          {str(data, 'gcashName') && <p className="font-semibold">{str(data, 'gcashName')}</p>}
          {str(data, 'gcashNumber') && <p className="tabular-nums">{str(data, 'gcashNumber')}</p>}
        </div>
      )}
      {str(data, 'bankDetails') && (
        <div className="inv-card mt-3 text-center">
          <p className="inv-eyebrow">{t(lang, 'gift.bank')}</p>
          <p className="whitespace-pre-line text-sm">{str(data, 'bankDetails')}</p>
        </div>
      )}
      {registry.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {registry.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noopener" className="inv-btn inv-btn-outline">{r.label}</a>
          ))}
        </div>
      )}
      {thanks && <p className="inv-tagline inv-gift-thanks">{thanks}</p>}
    </Section>
  );
}

function stripReservedSentence(note: string): string {
  return note
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !s.includes('{n}'))
    .join(' ')
    .trim();
}

function Rsvp({ inv, data, lang, guest, personal, hostsNoun, slug, token, tagline, title }: { inv: PublicInvitation; data: SectionData; lang: Lang; guest: GuestForPage | null | undefined; personal: boolean; hostsNoun: string; slug: string; token?: string; tagline?: string; title?: string }) {
  const deadline = str(data, 'deadline');
  const open = rsvpOpen(inv);
  const seatsCap = personal && guest ? guest.seatsAllotted + (guest.plusOneAllowed ? 1 : 0) : 10;
  let note = str(data, 'note');
  if (personal && guest) note = note.replace('{n}', String(seatsCap)).replace('{date}', deadline ? formatDate(deadline) : '');
  else note = stripReservedSentence(note).replace('{date}', deadline ? formatDate(deadline) : '');
  const policy = str(data, 'policy') !== 'none' ? str(data, 'policyText') : '';
  const existing = personal && guest?.rsvps[0] ? { ...guest.rsvps[0], attendees: Array.isArray(guest.rsvps[0].attendees) ? (guest.rsvps[0].attendees as string[]) : [] } : null;
  const mealChoices = hasFeature(inv.tier, 'rsvp.meal') ? rows<{ label: string }>(data, 'mealChoices').map((m) => m.label) : [];
  const greeting = personal && guest ? guest.salutation || guest.name : '';

  return (
    <Section id="rsvp" title={title ?? t(lang, 'rsvp.title')} tagline={tagline}>
      {greeting && (
        <p className="inv-display mb-3 text-center text-2xl">
          {t(lang, 'rsvp.dear')} {greeting},
        </p>
      )}
      {personal && guest && !note && <p className="text-center">{t(lang, 'rsvp.reserved', { n: seatsCap })}</p>}
      {note && <p className="mx-auto max-w-md text-center">{note}</p>}
      {!note && deadline && <p className="text-center">{t(lang, 'rsvp.lead')} {t(lang, 'rsvp.deadline')} {formatDate(deadline)}.</p>}
      {policy && <p className="inv-muted mx-auto mt-2 max-w-md text-center text-sm">{policy}</p>}
      {personal && guest?.table && (
        <p className="mt-3 text-center">
          <span className="inv-eyebrow">{t(lang, 'seating.title')}</span>
          <span className="inv-display text-xl">{guest.table.name}</span>
        </p>
      )}
      <div className="mt-5">
        <RsvpForm
          slug={slug}
          token={token}
          open={open}
          defaultName={personal && guest ? guest.name : ''}
          maxSeats={seatsCap}
          showSeats={bool(data, 'showSeats')}
          collectAttendees={bool(data, 'collectAttendees')}
          askDietary={bool(data, 'askDietary')}
          askDepartment={bool(data, 'askDepartment')}
          mealChoices={mealChoices}
          existing={existing}
          labels={{
            name: t(lang, 'rsvp.name'),
            accept: t(lang, 'rsvp.accept'),
            decline: t(lang, 'rsvp.decline'),
            seats: t(lang, 'rsvp.seats'),
            companions: t(lang, 'rsvp.companions'),
            companion: t(lang, 'rsvp.companion'),
            meal: t(lang, 'rsvp.meal'),
            dietary: t(lang, 'rsvp.dietary'),
            message: t(lang, 'rsvp.message', { hosts: hostsNoun }),
            phone: t(lang, 'rsvp.phone'),
            submit: t(lang, 'rsvp.submit'),
            update: t(lang, 'rsvp.update'),
            thanks: t(lang, 'rsvp.thanks'),
            closed: t(lang, 'rsvp.closed'),
            seeYou: t(lang, 'rsvp.seeYou'),
            sorry: t(lang, 'rsvp.sorry'),
            department: 'Department / company',
          }}
        />
      </div>
      {str(data, 'contactPhone') && (
        <p className="inv-muted mt-3 text-center text-sm">
          {lang === 'tl' ? 'O mag-text sa' : 'Or text'} <a href={`sms:${str(data, 'contactPhone').replace(/\s/g, '')}`} className="underline">{str(data, 'contactPhone')}</a>
        </p>
      )}
      {personal && guest && hasFeature(inv.tier, 'checkin') && (
        <div className="inv-card mt-6 text-center">
          <p className="inv-eyebrow">{t(lang, 'checkin.title')}</p>
          <div className="mx-auto w-36" dangerouslySetInnerHTML={{ __html: qrSvg(invitationUrl(slug, guest.token), { size: 144 }) }} />
          <p className="inv-muted mt-2 text-xs">{t(lang, 'checkin.hint')}</p>
        </div>
      )}
    </Section>
  );
}

const STORY_FRAMES = ['arch', 'polaroid', 'polaroid', 'plain', 'circle'] as const;

function Story({ data, lang, title, tagline, layout, signoff }: { data: SectionData; lang: Lang; title: string; tagline?: string; layout?: string; signoff?: { names: string; date: string } }) {
  const timeline = rows<{ date: string; title: string; text: string; photo: string }>(data, 'timeline');
  const beside = layout === 'capiz';
  return (
    <Section id="story" title={title} tagline={tagline}>
      {str(data, 'howWeMet') && (
        <div className="mb-6">
          <p className="inv-eyebrow">{t(lang, 'story.howWeMet')}</p>
          <p className="whitespace-pre-line text-center">{str(data, 'howWeMet')}</p>
        </div>
      )}
      {str(data, 'proposal') && (
        <div className="mb-6">
          <p className="inv-eyebrow">{t(lang, 'story.proposal')}</p>
          <p className="whitespace-pre-line text-center">{str(data, 'proposal')}</p>
        </div>
      )}
      {timeline.length > 0 && beside && (
        // The photographs run down one side in their own frames, the years
        // down the other — the way an album is laid out, rather than a list.
        <div className="inv-story">
          <div className="inv-story-photos">
            {timeline.filter((m) => m.photo).map((m, i) => (
              <figure key={i} data-frame={STORY_FRAMES[i % STORY_FRAMES.length]} data-tilt={i % 2 ? 'r' : undefined}>
                <img src={imageUrl(m.photo, IMAGE.story)} alt="" loading="lazy" />
              </figure>
            ))}
          </div>
          <ol className="inv-story-line">
            {timeline.map((m, i) => (
              <li key={i}>
                {m.date && <div className="y">{m.date}</div>}
                <div className="t">{m.title}</div>
                {m.text && <p className="x whitespace-pre-line">{m.text}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {signoff && (
        <div className="inv-story-sign">
          <span className="inv-rule" aria-hidden />
          <p className="inv-eyebrow">{signoff.names}</p>
          {signoff.date && <p className="inv-eyebrow inv-eyebrow-date">{signoff.date}</p>}
        </div>
      )}
      {timeline.length > 0 && !beside && (
        <ol className="inv-timeline">
          {timeline.map((m, i) => (
            <li key={i}>
              {m.date && <p className="inv-muted text-xs uppercase tracking-widest">{m.date}</p>}
              <p className="inv-display text-xl">{m.title}</p>
              {m.text && <p className="mt-1 whitespace-pre-line text-sm">{m.text}</p>}
              {m.photo && <img src={imageUrl(m.photo, IMAGE.story)} alt="" className="inv-photo mt-2 max-w-xs" loading="lazy" />}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

type PrenupFormat = { note: string; video: string; close: string; watch: string; sides: string[] };

function Gallery({ data, lang, tier, tagline, title, format }: { data: SectionData; lang: Lang; tier: Tier; tagline?: string; title?: string; format?: PrenupFormat }) {
  const limit = galleryLimit(tier);
  const photos = rows<{ url: string; caption: string }>(data, 'photos').filter((p) => p.url).slice(0, limit === Infinity ? undefined : limit);
  const video = hasFeature(tier, 'video') ? str(data, 'videoUrl') : '';
  if (!photos.length && !video) return null;
  const embed = video ? videoEmbed(video) : null;
  if (format) return <Prenup photos={photos} video={video} embed={embed} lang={lang} title={title ?? t(lang, 'gallery.title')} tagline={tagline} format={format} />;
  return (
    <Section id="gallery" title={title ?? t(lang, 'gallery.title')} tagline={tagline}>
      {photos.length > 0 && (
        <div className="inv-gallery">
          {photos.map((p, i) => (
            <figure key={i}>
              <img src={imageUrl(p.url, IMAGE.grid)} alt={p.caption || ''} loading="lazy" />
              {p.caption && <figcaption className="inv-muted mt-1 text-center text-xs">{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {video && (
        <div className="mt-5">
          {embed ? (
            <iframe src={embed.src} title="Video" className="aspect-video w-full rounded-xl" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
          ) : (
            <p className="text-center"><a href={video} target="_blank" rel="noopener" className="inv-btn">{t(lang, 'gallery.video')}</a></p>
          )}
        </div>
      )}
    </Section>
  );
}

/**
 * The prenup page of the Capiz format. One large photograph feathered into the
 * page, a strand of shell beneath it, a line, the next three photographs under
 * arches with their captions, whatever is left as the mosaic, the film with its
 * title written over it, and a last word. The side notes are the Moment's lines.
 */
function Prenup({ photos, video, embed, lang, title, tagline, format }: { photos: { url: string; caption: string }[]; video: string; embed: { src: string; poster?: string } | null; lang: Lang; title: string; tagline?: string; format: PrenupFormat }) {
  // The first photograph, then three under arches; the page shows no more than that.
  const [hero, ...rest] = photos;
  const arches = rest.slice(0, 3);
  const still = arches[arches.length - 1] ?? hero;
  const fallback = still ? imageUrl(still.url, IMAGE.feature) : '';
  return (
    <section id="gallery" className="inv-section inv-prenup">
      <header className="inv-prenup-head">
        <p className="inv-eyebrow">{title}</p>
        <span className="inv-rule-sm" aria-hidden="true" />
        {tagline && <h2 className="inv-prenup-title">{tagline}</h2>}
        {format.sides[0] && <p className="inv-prenup-side inv-prenup-side-l">{format.sides[0]}</p>}
        {format.sides[1] && <p className="inv-prenup-side inv-prenup-side-r">{format.sides.slice(1).join(' ')}</p>}
      </header>
      {hero && (
        <>
          <figure className="inv-prenup-hero">
            <img src={imageUrl(hero.url, IMAGE.hero)} alt={hero.caption || ''} loading="lazy" />
          </figure>
          <div className="inv-prenup-strand" aria-hidden="true" />
        </>
      )}
      {format.note && <p className="inv-prenup-note">{format.note}</p>}
      {arches.length > 0 && (
        <div className="inv-arches" data-count={arches.length}>
          {arches.map((p, i) => (
            <figure key={i}>
              <img src={imageUrl(p.url, IMAGE.grid)} alt={p.caption || ''} loading="lazy" />
              {p.caption && <figcaption>{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {video &&
        (embed ? (
          <VideoFacade src={embed.src} poster={embed.poster ?? fallback} fallback={fallback} title={format.video} cta={format.watch} label={t(lang, 'gallery.video')} />
        ) : (
          <p className="mt-5 text-center"><a href={video} target="_blank" rel="noopener" className="inv-btn">{t(lang, 'gallery.video')}</a></p>
        ))}
      {format.close && (
        <>
          <p className="inv-prenup-close">{format.close}</p>
          <span className="inv-rule-sm" aria-hidden="true" />
        </>
      )}
    </section>
  );
}

function Program({ data, title, tagline }: { data: SectionData; title: string; tagline?: string }) {
  const items = rows<{ time: string; title: string; note: string }>(data, 'items');
  const activities = str(data, 'activities');
  return (
    <Section id="program" title={title} tagline={tagline}>
      {items.length > 0 && (
        <ol className="inv-timeline">
          {items.map((it, i) => (
            <li key={i}>
              <ProgramIcon title={it.title} />
              <div>
                {it.time && <p className="inv-muted text-xs uppercase tracking-widest">{it.time}</p>}
                <p className="inv-display text-xl">{it.title}</p>
                {it.note && <p className="text-sm">{it.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {activities && <p className="mt-4 whitespace-pre-line text-center">{activities}</p>}
    </Section>
  );
}

function Faq({ data, lang }: { data: SectionData; lang: Lang }) {
  const items = rows<{ q: string; a: string }>(data, 'items');
  return (
    <Section id="faq" title={t(lang, 'faq.title')}>
      <div className="space-y-2">
        {items.map((it, i) => (
          <details key={i} className="inv-card">
            <summary className="cursor-pointer font-semibold">{it.q}</summary>
            <p className="mt-2 whitespace-pre-line text-sm">{it.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Travel({ data, lang }: { data: SectionData; lang: Lang }) {
  const hotels = rows<{ name: string; address: string; note: string; url: string }>(data, 'hotels');
  return (
    <Section id="travel" title={t(lang, 'travel.title')}>
      {hotels.length > 0 && (
        <div className="space-y-2">
          <p className="inv-eyebrow">{t(lang, 'travel.hotels')}</p>
          {hotels.map((h, i) => (
            <div key={i} className="inv-card">
              <p className="font-semibold">{h.url ? <a href={h.url} target="_blank" rel="noopener" className="underline">{h.name}</a> : h.name}</p>
              {h.address && <p className="inv-muted text-sm">{h.address}</p>}
              {h.note && <p className="text-sm">{h.note}</p>}
            </div>
          ))}
        </div>
      )}
      {str(data, 'directions') && (
        <div className="mt-5">
          <p className="inv-eyebrow">{t(lang, 'travel.directions')}</p>
          <p className="whitespace-pre-line text-sm">{str(data, 'directions')}</p>
        </div>
      )}
      {str(data, 'tips') && <p className="mt-4 whitespace-pre-line text-sm">{str(data, 'tips')}</p>}
    </Section>
  );
}

function socialHref(network: 'instagram' | 'tiktok' | 'facebook', handle: string): string {
  if (/^https?:\/\//.test(handle)) return handle;
  const name = handle.replace(/^@/, '');
  return network === 'instagram' ? `https://instagram.com/${name}` : network === 'tiktok' ? `https://www.tiktok.com/@${name}` : `https://facebook.com/${name}`;
}

function Social({ data, lang, tagline, title, format, cta }: { data: SectionData; lang: Lang; tagline?: string; title?: string; format?: boolean; cta?: string }) {
  const hashtag = str(data, 'hashtag');
  const tag = hashtag ? (hashtag.startsWith('#') ? hashtag : `#${hashtag}`) : '';
  const networks = (['instagram', 'tiktok', 'facebook'] as const).filter((n) => str(data, n));
  return (
    <Section id="social" title={title ?? t(lang, 'social.title')} tagline={format ? undefined : tagline}>
      {format && (
        <>
          <Ico name="camera" className="inv-ico-lg" />
          {tagline && <p className="inv-tagline">{tagline}</p>}
          {tag && cta && <p className="text-center">{cta}</p>}
          {tag && <p className="inv-hashtag">{tag}</p>}
          {networks.length > 0 && (
            <p className="inv-social-icons">
              {networks.map((n) => (
                <a key={n} href={socialHref(n, str(data, n))} target="_blank" rel="noopener" aria-label={n} title={str(data, n)}><Ico name={n} /></a>
              ))}
            </p>
          )}
        </>
      )}
      {!format && tag && (
        <p className="text-center">
          <span className="inv-eyebrow">{t(lang, 'social.hashtag')}</span>
          <span className="inv-display text-3xl">{tag}</span>
        </p>
      )}
      {!format && (
        <p className="inv-muted mt-2 text-center text-sm">
          {[str(data, 'instagram') && `IG ${str(data, 'instagram')}`, str(data, 'tiktok') && `TikTok ${str(data, 'tiktok')}`, str(data, 'facebook') && `FB ${str(data, 'facebook')}`].filter(Boolean).join(' · ')}
        </p>
      )}
      {bool(data, 'unplugged') && (
        <div className="inv-card mt-4 text-center">
          <p className="inv-eyebrow">{t(lang, 'social.unplugged')}</p>
          <p className="text-sm">{str(data, 'unpluggedText')}</p>
        </div>
      )}
    </Section>
  );
}

/**
 * The shared album: what guests have already sent, and the form to add to it.
 * The wall shows only approved photos — `loadPublic` never loads the others —
 * so a page cannot be defaced between the upload and the couple seeing it.
 */
function GuestPhotos({
  inv,
  data,
  lang,
  slug,
  token,
  print,
  tagline,
  title,
  format,
  intro,
}: {
  inv: PublicInvitation;
  data: SectionData;
  lang: Lang;
  slug: string;
  token?: string;
  print?: boolean;
  tagline?: string;
  title?: string;
  format?: boolean;
  intro?: string;
}) {
  const photos = inv.media;
  if (!photos.length && print) return null;
  return (
    <Section id="guest-photos" title={title ?? t(lang, 'photos.title')} tagline={tagline}>
      {format && <Ico name="upload" className="inv-ico-lg" />}
      {format && intro && <p className="mx-auto mb-4 max-w-sm text-center">{intro}</p>}
      {photos.length > 0 ? (
        <div className="inv-gallery">
          {photos.map((m) => (
            <figure key={m.id}>
              <img src={imageUrl(m.url, IMAGE.grid)} alt={m.caption || ''} loading="lazy" />
              {(m.caption || m.uploadedBy) && (
                <figcaption className="inv-muted mt-1 text-center text-xs">
                  {m.caption}
                  {m.caption && m.uploadedBy ? ' — ' : ''}
                  {m.uploadedBy}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      ) : (
        <p className="inv-muted mb-4 text-center text-sm">{t(lang, 'photos.empty')}</p>
      )}
      {!print && (
        <div className="mt-5">
          <p className="mb-3 text-center">{str(data, 'prompt') || t(lang, 'photos.prompt')}</p>
          <GuestPhotoForm
            slug={slug}
            token={token}
            labels={{
              name: t(lang, 'rsvp.name'),
              choose: t(lang, 'photos.choose'),
              caption: t(lang, 'photos.caption'),
              submit: t(lang, 'photos.submit'),
              sending: t(lang, 'photos.sending'),
              pending: t(lang, 'photos.pending'),
              thanks: t(lang, 'photos.thanks'),
              another: t(lang, 'photos.another'),
            }}
          />
        </div>
      )}
    </Section>
  );
}

function Guestbook({ inv, data, lang, hostsNoun, slug, tagline, title }: { inv: PublicInvitation; data: SectionData; lang: Lang; hostsNoun: string; slug: string; tagline?: string; title?: string }) {
  if (!bool(data, 'enabled')) return null;
  return (
    <Section id="guestbook" title={title ?? t(lang, 'guestbook.title')} tagline={tagline}>
      {inv.guestbook.length > 0 && (
        <ul className="mb-5 space-y-2">
          {inv.guestbook.map((g) => (
            <li key={g.id} className="inv-card">
              <p className="whitespace-pre-line text-sm">{g.message}</p>
              <p className="inv-muted mt-1 text-xs">— {g.name}</p>
            </li>
          ))}
        </ul>
      )}
      <GuestbookForm slug={slug} labels={{ name: t(lang, 'rsvp.name'), prompt: str(data, 'prompt') || t(lang, 'guestbook.prompt', { hosts: hostsNoun }), submit: t(lang, 'guestbook.submit'), pending: t(lang, 'guestbook.pending'), thanks: t(lang, 'rsvp.thanks') }} />
    </Section>
  );
}

function Closing({ data, lang, hashtag, tagline, names, date }: { data: SectionData; lang: Lang; hashtag: string; tagline?: string; names?: string; date?: string }) {
  return (
    <Section id="closing" title={tagline ? undefined : t(lang, 'closing.title')} tagline={tagline}>
      {str(data, 'photo') && <img src={imageUrl(str(data, 'photo'), IMAGE.feature)} alt="" className="inv-photo mb-4 aspect-[4/3]" loading="lazy" />}
      {str(data, 'message') && <p className="mx-auto max-w-md whitespace-pre-line text-center">{str(data, 'message')}</p>}
      {str(data, 'signature') && <p className="inv-display mt-4 text-center text-3xl" style={{ color: 'var(--inv-accent)' }}>{str(data, 'signature')}</p>}
      {hashtag && <p className="inv-muted mt-2 text-center text-sm">{hashtag.startsWith('#') ? hashtag : `#${hashtag}`}</p>}
      {names && <p className="inv-eyebrow mt-6">{names}</p>}
      {date && <p className="inv-eyebrow" style={{ letterSpacing: '0.42em', textIndent: '0.42em' }}>{date}</p>}
    </Section>
  );
}

function Speakers({ data, lang }: { data: SectionData; lang: Lang }) {
  const items = rows<{ name: string; title: string; topic: string; photo: string }>(data, 'items');
  return (
    <Section id="speakers" title={t(lang, 'speakers.title')}>
      <div className="grid grid-cols-2 gap-3">
        {items.map((s, i) => (
          <div key={i} className="inv-card text-center">
            {s.photo && <img src={imageUrl(s.photo, IMAGE.avatar)} alt="" className="mx-auto mb-2 h-20 w-20 rounded-full object-cover" loading="lazy" />}
            <p className="font-semibold">{s.name}</p>
            {s.title && <p className="inv-muted text-xs">{s.title}</p>}
            {s.topic && <p className="mt-1 text-sm">{s.topic}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Family({ data, lang }: { data: SectionData; lang: Lang }) {
  const members = rows<{ name: string; relation: string }>(data, 'members');
  return (
    <Section id="family" title={t(lang, 'family.title')}>
      <div className="inv-list">
        {members.map((m, i) => (
          <p key={i}>
            {m.name}
            {m.relation && <span className="inv-muted text-sm"> · {m.relation}</span>}
          </p>
        ))}
        {str(data, 'lines') && <p className="inv-muted mt-2 whitespace-pre-line text-sm">{str(data, 'lines')}</p>}
      </div>
    </Section>
  );
}

function Contact({ data, lang, tagline, title, format, note }: { data: SectionData; lang: Lang; tagline?: string; title?: string; format?: boolean; note?: string }) {
  if (format) {
    const people = [
      { name: str(data, 'name'), phone: str(data, 'phone') },
      { name: str(data, 'name2'), phone: str(data, 'phone2') },
    ].filter((p) => p.name || p.phone);
    return (
      <Section id="contact" title={title ?? t(lang, 'contact.title')}>
        <div className="inv-contact-head">
          <Ico name="phone" />
          <div>
            {tagline && <p className="inv-eyebrow">{tagline}</p>}
            {note && <p>{note}</p>}
          </div>
        </div>
        {people.length > 0 && (
          <div className={`inv-contact-cols ${people.length > 1 ? 'inv-two' : ''}`}>
            {people.map((p, i) => (
              <div key={i} className="text-center">
                {p.name && <p className="inv-eyebrow">{p.name}</p>}
                {p.phone && <p><a href={`tel:${p.phone.replace(/\s/g, '')}`}>{p.phone}</a></p>}
              </div>
            ))}
          </div>
        )}
        {(str(data, 'chatNote') || str(data, 'messenger')) && (
          <p className="inv-muted mt-4 text-center text-sm">
            {str(data, 'messenger') ? <a href={str(data, 'messenger')} target="_blank" rel="noopener" className="underline">{str(data, 'chatNote') || t(lang, 'contact.chat')}</a> : str(data, 'chatNote')}
          </p>
        )}
        {str(data, 'email') && <p className="mt-1 text-center text-sm"><a href={`mailto:${str(data, 'email')}`} className="underline">{str(data, 'email')}</a></p>}
        {str(data, 'registrationNote') && <p className="mt-3 whitespace-pre-line text-center text-sm">{str(data, 'registrationNote')}</p>}
      </Section>
    );
  }
  return (
    <Section id="contact" title={title ?? t(lang, 'contact.title')} tagline={tagline}>
      <div className="inv-card text-center">
        {str(data, 'name') && <p className="font-semibold">{str(data, 'name')}</p>}
        {str(data, 'phone') && <p><a href={`tel:${str(data, 'phone').replace(/\s/g, '')}`} className="underline">{str(data, 'phone')}</a></p>}
        {str(data, 'name2') && <p className="mt-2 font-semibold">{str(data, 'name2')}</p>}
        {str(data, 'phone2') && <p><a href={`tel:${str(data, 'phone2').replace(/\s/g, '')}`} className="underline">{str(data, 'phone2')}</a></p>}
        {str(data, 'email') && <p><a href={`mailto:${str(data, 'email')}`} className="underline">{str(data, 'email')}</a></p>}
        {str(data, 'messenger') && <p><a href={str(data, 'messenger')} target="_blank" rel="noopener" className="underline">Messenger</a></p>}
        {str(data, 'registrationNote') && <p className="mt-2 whitespace-pre-line text-sm">{str(data, 'registrationNote')}</p>}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Capiz: the pieces laid over the page
// ---------------------------------------------------------------------------

/**
 * The Capiz format is a stack of pages. Each carries the couple's frame as
 * its own background — the top of it at the top of the page, the bottom at
 * the bottom, solid ground between — so the shell and the drapes scroll with
 * the words they belong to, and one page ends where the next begins the way
 * the reference does. A "page" fills the screen; a "connector" is the short
 * panel between two pages, strung between the two strands.
 */
/**
 * `row` is the strung row of shell that opens the page — the join with the
 * page before it. The deep rows from the band image ("a" with its drape,
 * "b") open the big chapters; the thin strands from the two-strand image
 * ("s1" with its cluster at the left, "s2" mirrored) join the rest. The
 * cover has none: it carries the whole frame instead.
 */
/**
 * A page stands on one of the designer's numbered backgrounds (1 to 8, drawn
 * for this format in this order); 'last' is 8, set to the page's foot. A page
 * with none, and the part of a long page below its background, stands on the
 * filler — a quiet band cut from the designer's earlier pieces.
 */
type PageDef = { key: string; kind: 'page' | 'connector'; sections: (SectionKey | 'verse')[]; bg?: number | 'last' };
const CAPIZ_PAGES: PageDef[] = [
  { key: 'cover', kind: 'page', sections: ['cover', 'verse'], bg: 1 },
  { key: 'moment', kind: 'page', sections: ['moment'] },
  { key: 'story', kind: 'page', sections: ['story'], bg: 2 },
  { key: 'invitation', kind: 'page', sections: ['ceremony'], bg: 3 },
  { key: 'entourage', kind: 'page', sections: ['entourage'], bg: 4 },
  { key: 'prenup', kind: 'page', sections: ['gallery'], bg: 5 },
  { key: 'venue', kind: 'page', sections: ['reception'], bg: 6 },
  { key: 'dress-code', kind: 'page', sections: ['dressCode'], bg: 7 },
  { key: 'gift', kind: 'page', sections: ['gift'], bg: 5 },
  { key: 'program', kind: 'page', sections: ['program', 'social'], bg: 6 },
  { key: 'guestbook', kind: 'page', sections: ['guestbook'], bg: 5 },
  { key: 'photos', kind: 'page', sections: ['photos'], bg: 6 },
  { key: 'rsvp', kind: 'page', sections: ['rsvp'], bg: 5 },
  { key: 'countdown', kind: 'connector', sections: ['countdown'] },
  { key: 'closing', kind: 'page', sections: ['contact', 'closing'], bg: 'last' },
];

/** Which line icon a program entry gets, from the words in its title. */
function programIcon(title: string): string {
  const s = title.toLowerCase();
  if (/ceremon|church|mass|vow|wedding|kasal|misa/.test(s)) return 'church';
  if (/cocktail|drink|toast|wine|inuman/.test(s) && !/speech/.test(s)) return 'glasses';
  if (/dinner|lunch|reception|meal|food|salu|hapunan|tanghalian|merienda/.test(s)) return 'cutlery';
  if (/speech|talumpati|message|program|remarks/.test(s)) return 'mic';
  if (/danc|party|music|sayaw|band|dj/.test(s)) return 'music';
  if (/photo|picture|litrato/.test(s)) return 'camera';
  if (/arriv|welcome|dating|registration|entrance/.test(s)) return 'rings';
  return 'clock';
}

const ICON_PATHS: Record<string, string> = {
  church: 'M12 3v4M10 5h4M5 21V12l7-5 7 5v9M5 21h14M10 21v-5h4v5',
  glasses: 'M5 4h6l-1 6a2.5 2.5 0 0 1-4 0zM13 4h6l-1 6a2.5 2.5 0 0 1-4 0zM8 12v8M16 12v8M5.5 20h5M13.5 20h5',
  cutlery: 'M7 3v18M5 3v5a2 2 0 0 0 4 0V3M17 3c-2 0-3 3-3 6 0 2 1 3 3 3v9',
  mic: 'M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  camera: 'M4 8h3l2-3h6l2 3h3v12H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  rings: 'M14.5 13a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0zM20.5 13a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0zM12 4l-2 2 2 2 2-2z',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h1',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  dress: 'M9 3l3 3 3-3M9 3l-1 6h8l-1-6M8 9l-3 11h14L16 9',
  gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-2 0-4-1-4-3s3-2 4 3c1-5 4-5 4-3s-2 3-4 3',
  phone: 'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z',
  upload: 'M7 18a4 4 0 0 1-1-7.9A6 6 0 0 1 17.6 8 4 4 0 0 1 17 18H7zM12 12v9M9 15l3-3 3 3',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01',
  tiktok: 'M13 3v12a3.5 3.5 0 1 1-3.5-3.5M13 3a5 5 0 0 0 5 5',
  facebook: 'M14 3h3v4h-2c-.6 0-1 .4-1 1v3h3l-.5 4H14v6h-4v-6H7v-4h3V8a5 5 0 0 1 5-5z',
};

function ProgramIcon({ title }: { title: string }) {
  return (
    <svg className="inv-picon" viewBox="0 0 24 24" aria-hidden>
      <path d={ICON_PATHS[programIcon(title)]} />
    </svg>
  );
}

/**
 * Four figures in the motif: a barong, a terno with butterfly sleeves, a
 * sleeved gown and a strapless gown. Garments take the motif colours in
 * order, so the block recolours itself when the couple changes their palette.
 */
function DressFigures({ colors }: { colors: string[] }) {
  const m = (i: number) => colors[i % colors.length];
  const skin = '#d8b596';
  const hair = '#2b211b';
  const vars = { '--m1': m(0), '--m2': m(1), '--m3': m(2), '--m4': m(3), '--m5': m(4) } as CSSProperties;
  return (
    <div className="inv-dress" style={vars} aria-hidden>
      <svg viewBox="0 0 120 300">
        <ellipse cx="60" cy="30" rx="12" ry="14" fill={skin} />
        <path d="M47 27c1-14 25-14 26 0c-4-6-21-6-26 0z" fill={hair} />
        <path d="M55 42h10v8H55z" fill="#cda283" />
        <path d="M42 52c8-4 28-4 36 0l7 10 3 70H32l3-70z" fill="#f4efe3" />
        <path d="M42 52c8-4 28-4 36 0l7 10 3 70H32l3-70z" fill="var(--m1)" opacity="0.55" />
        <path d="M60 52v80" stroke="var(--m5)" strokeOpacity="0.25" />
        <path d="M52 52l8 6 8-6" stroke="var(--m5)" strokeOpacity="0.35" fill="none" />
        <path d="M35 62l-4 62h10l2-58z M85 62l4 62H79l-2-58z" fill="var(--m1)" opacity="0.75" />
        <path d="M39 132h42l3 92H68l-6-70-6 70H36z" fill="var(--m5)" />
        <path d="M36 224h14l1 6H35z M68 224h14l2 6H67z" fill={hair} />
      </svg>
      <svg viewBox="0 0 120 300">
        <ellipse cx="60" cy="30" rx="12" ry="14" fill={skin} />
        <path d="M46 24c2-16 26-16 28 0 3 10-2 22-4 30-3-8-5-14-10-14s-7 6-10 14c-2-8-7-20-4-30z" fill={hair} />
        <path d="M55 42h10v8H55z" fill="#cda283" />
        <path d="M44 52c6-2 26-2 32 0l3 44H41z" fill="var(--m2)" />
        <path d="M44 52c-14 2-22 16-14 26 6-4 10-14 14-26z M76 52c14 2 22 16 14 26-6-4-10-14-14-26z" fill="var(--m2)" opacity="0.7" />
        <path d="M41 96h38l14 132H27z" fill="var(--m2)" />
        <path d="M41 96h38l14 132H27z" fill="#fff" opacity="0.18" />
        <path d="M42 100h36" stroke="#fff" strokeOpacity="0.5" />
      </svg>
      <svg viewBox="0 0 120 300">
        <ellipse cx="60" cy="30" rx="12" ry="14" fill={skin} />
        <path d="M46 24c2-16 26-16 28 0 2 14-2 30-3 44-3-10-5-24-11-24s-8 14-11 24c-1-14-5-30-3-44z" fill={hair} />
        <path d="M55 42h10v8H55z" fill="#cda283" />
        <path d="M45 52c6-3 24-3 30 0l4 40H41z" fill="var(--m3)" />
        <path d="M45 52l-10 4-6 40 10 2 6-30z M75 52l10 4 6 40-10 2-6-30z" fill="var(--m3)" opacity="0.8" />
        <path d="M41 92h38l16 136H25z" fill="var(--m3)" />
        <path d="M41 92h38l16 136H25z" fill="#fff" opacity="0.14" />
        <path d="M52 90c4 2 12 2 16 0" stroke="#fff" strokeOpacity="0.6" fill="none" />
        <path d="M52 96h16l2 8H50z" fill={skin} />
      </svg>
      <svg viewBox="0 0 120 300">
        <ellipse cx="60" cy="30" rx="12" ry="14" fill={skin} />
        <path d="M47 26c1-15 25-15 26 0 1 6-2 12-3 14-4-6-16-6-20 0-1-2-4-8-3-14z" fill={hair} />
        <path d="M55 42h10v8H55z M47 50l3 34h20l3-34z" fill="#cda283" />
        <path d="M45 58c4 4 26 4 30 0l4 34H41z" fill="var(--m4)" />
        <path d="M45 58c-6 4-9 20-9 32l6-2z M75 58c6 4 9 20 9 32l-6-2z" fill={skin} />
        <path d="M41 92h38l18 136H23z" fill="var(--m4)" />
        <path d="M41 92h38l18 136H23z" fill="#fff" opacity="0.14" />
        <path d="M41 92h38" stroke="#fff" strokeOpacity="0.5" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const HOSTS: Partial<Record<Occasion, { en: string; tl: string }>> = {
  WEDDING: { en: 'the couple', tl: 'sa ikakasal' },
  DEBUT: { en: 'the debutante', tl: 'sa debutante' },
  CHRISTENING: { en: 'the family', tl: 'sa pamilya' },
  ANNIVERSARY: { en: 'the couple', tl: 'sa mag-asawa' },
};

export function Invitation({ invitation: inv, guest, preview = false, print = false, bare = false, shape, look: lookOverride, businessName }: RenderProps) {
  const content = contentOf(inv.content);
  const lang: Lang = inv.language === 'tl' ? 'tl' : 'en';
  const occasion = inv.occasion;
  const theme = resolveTheme(inv.template, content);
  const { palette } = theme;
  const look = lookOverride ?? theme.look;
  const fonts = lookOverride ? lookOverride.fonts : theme.fonts;
  const layout = isLayout(inv.template.layout) ? inv.template.layout : 'classic';
  const style = cssVars(palette, fonts) as CSSProperties;
  // The format: the page structure the reference sets — the cover with its
  // place and lines, the verse, the invitation rows, the venue and the way
  // there, the interludes. Capiz is built to it; the look supplies the words.
  const format = layout === 'capiz';
  const personal = Boolean(guest) && hasFeature(inv.tier, 'rsvp.personalLinks');
  const hostsNoun = lang === 'tl' ? HOSTS[occasion]?.tl ?? 'sa host' : HOSTS[occasion]?.en ?? 'the hosts';
  const coverDate = str(content.cover, 'date');
  const templateSections = new Set(inv.template.sections);

  const visible = (key: SectionKey) =>
    OCCASION_SECTIONS[occasion].includes(key) &&
    sectionOffered(key) &&
    (templateSections.size === 0 || templateSections.has(key)) &&
    sectionUnlocked(key, occasion, inv.tier) &&
    (key === 'rsvp' || key === 'cover' || sectionFilled(key, occasion, content[key]));

  const eventAt = eventInstant(content);
  const calendarHref = eventAt ? `${invitationPath(inv.slug)}/calendar.ics` : undefined;
  const musicUrl = visible('music') ? str(content.music, 'url') : '';
  const hashtag = str(content.social, 'hashtag');
  const rsvpVisible = visible('rsvp');

  /**
   * What the opening shows. Printing skips it, and so does a design that
   * ships with none — a Save the Date wants to be read, not unwrapped.
   */
  function openingProps() {
    const assets = openingAssets(inv, inv.template);
    const style = print || bare
      ? 'none'
      : resolveOpening({
          chosen: str(content.cover, 'opening'),
          templateDefault: inv.template.opening,
          legacyEnvelope: bool(content.cover, 'envelope'),
          tier: inv.tier,
          cinematic: Boolean(assets.video),
        });
    const def = OPENING_BY_KEY[style];
    const gallery = rows<{ url: string }>(content.gallery, 'photos').map((r) => r.url).filter(Boolean);
    const photos = [coverImage(content), ...gallery].filter(Boolean).slice(0, def.photos);
    // The Capiz clip opens onto a blank card, and the words go on the card as
    // it opens rather than over the closed face.
    const clip = style === 'cinematic' && layout === 'capiz' ? 'capiz' : '';
    const wordsOnCard = Boolean(clip);
    return {
      style,
      clip,
      monogram: str(content.cover, 'monogram'),
      // A door, not a title page: this opening says only that an invitation is
      // here, and who it is from waits until it opens.
      names: def.lineOnly && !wordsOnCard ? '' : displayTitle(occasion, content),
      // "08 · 24 · 26" — month, day, year, the way a date is set on a
      // card rather than written into a sentence.
      date: def.lineOnly && !wordsOnCard ? '' : openingDate(coverDate),
      line: str(content.cover, 'openingLine') || def.line[lang],
      line2: str(content.cover, 'openingLine2'),
      caps: Boolean(def.caps),
      photos,
      video: style === 'cinematic' ? assets.video : '',
      poster: style === 'cinematic' ? assets.poster : '',
      hint: t(lang, 'envelope.open'),
    };
  }
  const opening = openingProps();

  const order = sectionOrder(occasion, layout);
  // The look's words: the line under each heading, and the headings it names.
  const line = (key: LineKey) => lookLine(look, lang, key);
  const named = (key: TitleKey, fallback: string) => lookTitle(look, lang, key) ?? fallback;
  const sameVenue = Boolean(str(content.ceremony, 'venue')) && str(content.ceremony, 'venue').trim().toLowerCase() === str(content.reception, 'venue').trim().toLowerCase();
  const hasReception = visible('reception') && Boolean(str(content.reception, 'venue'));
  const names = displayTitle(occasion, content);
  const verse = format && str(content.cover, 'verse') ? <Verse key="verse" text={str(content.cover, 'verse')} source={str(content.cover, 'verseRef')} /> : null;
  const body = format ? pages() : order.map((key) => section(key));
  function pages() {
    const drawn = new Map<string, ReactNode>();
    for (const key of order) {
      const el = section(key);
      if (el) drawn.set(key, el);
    }
    if (verse) drawn.set('verse', verse);
    const placed = new Set<string>();
    const out: ReactNode[] = [];
    // The page's ground: its background, and below it the same background turned
    // over, so a page longer than one background continues without a seam. The
    // column runs a little past the page's foot, under the next page, whose own
    // ground fades in over it. 'last' is set to the page's foot, its mirror above.
    const page = (key: string, kind: PageDef['kind'], parts: ReactNode[], bg?: number | 'last') => {
      const src = bg ? `/capiz/bg-${bg === 'last' ? 8 : bg}.webp` : '';
      const img = (mirror: boolean) => <img key={mirror ? 'm' : 'o'} className={mirror ? 'inv-page-bg-m' : undefined} src={src} alt="" loading={bg === 1 ? 'eager' : 'lazy'} decoding="async" />;
      return (
        <div key={key} className="inv-page" data-page={key} data-kind={kind} data-bg={bg}>
          {bg && (
            <div className={bg === 'last' ? 'inv-page-bg-col inv-page-bg-col-last' : 'inv-page-bg-col'} aria-hidden="true">
              {bg === 'last' ? [img(true), img(false)] : [img(false), img(true)]}
            </div>
          )}
          {parts}
        </div>
      );
    };
    for (const def of CAPIZ_PAGES) {
      const parts = def.sections.map((k) => drawn.get(k)).filter(Boolean) as ReactNode[];
      def.sections.forEach((k) => placed.add(k));
      if (parts.length) out.push(page(def.key, def.kind, parts, def.bg));
    }
    // a section the map does not name gets a page of its own, in its place, on 5 and 6 in turn
    let spare = 0;
    for (const key of order) if (!placed.has(key) && drawn.has(key)) out.push(page(key, 'page', [drawn.get(key)], spare++ % 2 ? 6 : 5));
    return out;
  }
  function section(key: SectionKey) {
    if (!visible(key)) return null;
    const data = content[key] ?? {};
    switch (key) {
      case 'cover':
        return <Hero key={key} occasion={occasion} content={content} lang={lang} layout={layout} format={format} look={look} eyebrow={look ? line('cover') : undefined} />;
      case 'countdown':
        return bool(data, 'enabled') && eventAt ? (
          <Section key={key} id="countdown" eyebrow={look ? undefined : str(data, 'label') || t(lang, 'countdown.title')} tagline={look ? str(data, 'label') || line('countdown') : undefined}>
            <Countdown target={eventAt.toISOString()} labels={[t(lang, 'countdown.days'), t(lang, 'countdown.hours'), t(lang, 'countdown.minutes'), t(lang, 'countdown.seconds')]} today={t(lang, 'countdown.today')} />
          </Section>
        ) : null;
      case 'parents':
        return <Parents key={key} occasion={occasion} data={data} lang={lang} />;
      case 'ceremony': {
        const block = (
          <EventBlock
            id="ceremony"
            title={named('invitation', sectionTitle('ceremony', occasion, lang))}
            tagline={line('invitation')}
            data={data}
            lang={lang}
            fallbackDate={coverDate}
            calendarHref={calendarHref}
            format={format ? { role: 'ceremony', intro: str(content.cover, 'intro'), sub: heroCopy(occasion, content.cover, lang).sub, attire: ATTIRE[str(content.dressCode, 'attire')], sameVenue, mapHere: !hasReception, gettingTitle: named('getting', t(lang, 'venue.getting')) } : undefined}
          />
        );
        return <Fragment key={key}>{block}</Fragment>;
      }
      case 'reception': {
        const block = (
          <EventBlock
            id="reception"
            title={named('venue', sectionTitle('reception', occasion, lang))}
            tagline={line('venue')}
            data={data}
            lang={lang}
            fallbackDate={str(content.ceremony, 'venue') ? '' : coverDate}
            calendarHref={str(content.ceremony, 'venue') ? undefined : calendarHref}
            format={format ? { role: 'reception', ceremony: content.ceremony, sameVenue, mapHere: true, gettingTitle: named('getting', t(lang, 'venue.getting')) } : undefined}
          />
        );
        const after = format && str(data, 'venue') ? str(content.cover, 'interlude2') || line('interlude2') : '';
        return after ? (
          <Fragment key={key}>
            {block}
            <Interlude id="interlude-2" text={after} />
          </Fragment>
        ) : (
          <Fragment key={key}>{block}</Fragment>
        );
      }
      case 'entourage':
        return <Entourage key={key} data={data} lang={lang} tagline={line('entourage')} title={lookTitle(look, lang, 'entourage')} />;
      case 'sponsors':
        return <Sponsors key={key} data={data} lang={lang} />;
      case 'eighteen':
        return <Eighteen key={key} data={data} lang={lang} />;
      case 'dressCode':
        return <DressCode key={key} data={data} lang={lang} layout={layout} title={lookTitle(look, lang, 'dressCode')} tagline={line('dressCode')} format={format} note={line('dressNote')} />;
      case 'gift':
        return <Gift key={key} data={data} lang={lang} title={occasion === 'MEMORIAL' ? t(lang, 'memorial.inLieu') : named('gift', t(lang, 'gift.title'))} format={format} thanks={line('giftThanks')} />;
      case 'rsvp':
        return <Rsvp key={key} inv={inv} data={data} lang={lang} guest={guest} personal={personal} hostsNoun={hostsNoun} slug={inv.slug} token={guest?.token} title={lookTitle(look, lang, 'rsvp')} />;
      case 'story':
        return <Story key={key} data={data} lang={lang} title={named('story', t(lang, 'story.title'))} tagline={line('story')} layout={layout} signoff={format ? { names, date: dottedDate(coverDate) } : undefined} />;
      case 'gallery': {
        if (!(rows<{ url: string }>(data, 'photos').some((r) => r.url) || str(data, 'videoUrl'))) return null;
        const sides = format ? ['line1', 'line2', 'line3'].map((k) => str(content.moment, k)).filter(Boolean) : [];
        const prenup = format ? { note: line('galleryNote') ?? '', video: line('galleryVideo') ?? '', close: line('galleryClose') ?? '', watch: t(lang, 'gallery.watchPrenup'), sides } : undefined;
        return <Gallery key={key} data={data} lang={lang} tier={inv.tier} tagline={line('gallery')} title={lookTitle(look, lang, 'gallery')} format={prenup} />;
      }
      case 'program':
        return <Program key={key} data={data} title={occasion === 'CORPORATE' ? t(lang, 'program.agenda') : named('program', t(lang, 'program.title'))} tagline={line('program')} />;
      case 'faq':
        return <Faq key={key} data={data} lang={lang} />;
      case 'moment':
        // on the format the three lines are on the cover, so without a photograph there is no page
        return format && !str(data, 'backdrop') ? null : <Moment key={key} data={data} format={format} />;
      case 'travel':
        return <Travel key={key} data={data} lang={lang} />;
      case 'social':
        return <Social key={key} data={data} lang={lang} tagline={line('social')} title={lookTitle(look, lang, 'social')} format={format} cta={line('socialCta')} />;
      case 'music':
        return null;
      case 'guestbook':
        return !bool(data, 'enabled') ? null : <Guestbook key={key} inv={inv} data={data} lang={lang} hostsNoun={hostsNoun} slug={inv.slug} tagline={line('guestbook')} title={lookTitle(look, lang, 'guestbook')} />;
      case 'photos':
        return hasFeature(inv.tier, 'photoSharing') ? (
          <GuestPhotos key={key} inv={inv} data={data} lang={lang} slug={inv.slug} token={guest?.token} print={print} tagline={line('photos')} title={lookTitle(look, lang, 'photos')} format={format} intro={line('photosIntro')} />
        ) : null;
      case 'closing':
        return <Closing key={key} data={data} lang={lang} hashtag={hashtag} tagline={line('closing')} names={format ? names : undefined} date={format ? dottedDate(coverDate) : undefined} />;
      case 'speakers':
        return <Speakers key={key} data={data} lang={lang} />;
      case 'family':
        return <Family key={key} data={data} lang={lang} />;
      case 'contact':
        return <Contact key={key} data={data} lang={lang} tagline={line('contact')} title={lookTitle(look, lang, 'contact')} format={format} note={line('contactNote')} />;
    }
  }

  return (
    <div className="inv" data-layout={layout} data-look={look?.key} data-shape={shape} style={style} lang={lang}>
      <link rel="stylesheet" href={googleFontsUrl(fonts)} precedence="default" />
      {preview && (
        <div className="no-print sticky top-0 z-40 bg-[#1f1d1a] px-4 py-2 text-center text-xs text-white">
          Preview — {inv.status === 'PUBLISHED' ? 'this is how guests see it' : 'not published yet, only you can see this'}
        </div>
      )}
      <Shell opening={opening} music={print || bare ? '' : musicUrl} autoplay={bool(content.music, 'autoplay')} playLabel={t(lang, 'music.play')} pauseLabel={t(lang, 'music.pause')}>
        {body}
        <footer className="inv-section text-center text-xs" style={{ color: 'var(--inv-muted)' }}>
          {!print && (
            <div className="no-print mb-4 flex flex-wrap justify-center gap-2">
              <a href={`${invitationPath(inv.slug)}/card`} className="inv-btn inv-btn-outline" download={`${inv.slug}.png`}>{t(lang, 'share.download')}</a>
              <PrintButton label={t(lang, 'share.print')} />
            </div>
          )}
          <p>{businessName}</p>
        </footer>
        {rsvpVisible && !print && (
          <a href="#rsvp" className="inv-btn inv-sticky no-print">{t(lang, 'nav.rsvp')}</a>
        )}
      </Shell>
    </div>
  );
}

/**
 * A framed view. The couple's own photograph if they gave one, else the
 * painted scene they chose, else the frame alone holding the page's colour —
 * which is a real answer, not a broken state, and is why nothing here is
 * required.
 *
 * The backdrop is deliberately its own layer behind the frame: an encoder can
 * swap the photograph for a client without touching the words, the frame or
 * anything else on the page.
 */
function Moment({ data, format }: { data: SectionData; format?: boolean }) {
  const frame = str(data, 'frame') || 'arch';
  const { url, kind } = resolveBackdrop(str(data, 'backdrop'), str(data, 'preset'));
  const lines = ['line1', 'line2', 'line3'].map((k) => str(data, k)).filter(Boolean);
  if (!url && lines.length === 0) return null;
  // The format sets the three lines on the cover, so without the couple's own
  // photograph behind the frame the block has nothing of its own to show.
  if (format && !str(data, 'backdrop')) return null;
  return (
    <section id="moment" className="inv-moment" data-frame={frame} data-kind={kind}>
      <div className="inv-moment-view">
        {url && <img className="inv-moment-back" src={url} alt="" loading="lazy" />}
        <div className="inv-moment-frame" aria-hidden />
        {lines.length > 0 && (
          <div className="inv-moment-copy">
            {lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}
      </div>
    </section>
  );
}

/** "2026-08-24" -> "08 · 24 · 26". Blank for anything else. */
function openingDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return m ? `${m[2]} · ${m[3]} · ${m[1].slice(2)}` : '';
}

function sectionTitle(key: 'ceremony' | 'reception', occasion: Occasion, lang: Lang): string {
  if (key === 'ceremony') {
    if (occasion === 'MEMORIAL') return t(lang, 'memorial.mass');
    if (occasion === 'HOUSEWARMING') return lang === 'tl' ? 'Bendisyon' : 'House blessing';
    return t(lang, 'ceremony.title');
  }
  if (occasion === 'WEDDING' || occasion === 'CHRISTENING' || occasion === 'COMMUNION' || occasion === 'ANNIVERSARY') return t(lang, 'reception.title');
  return t(lang, 'venue.title');
}
