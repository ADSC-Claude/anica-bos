import type { Occasion, Tier } from '@prisma/client';
import type { CSSProperties, ReactNode } from 'react';
import { t, type Lang, INTRO_PRESETS, preset } from '@/lib/copy';
import { contentOf, resolveTheme, rsvpOpen, type PublicInvitation } from '@/lib/invitations';
import { OCCASION_SECTIONS, sectionUnlocked, sectionFilled, str, bool, num, rows, personOf, formatPerson, eventInstant, ordinal, type Content, type SectionKey, type SectionData } from '@/lib/sections';
import { galleryLimit, hasFeature } from '@/lib/tiers';
import { cssVars, googleFontsUrl, isLayout } from '@/lib/theme';
import { formatDate, formatTime } from '@/lib/datetime';
import { qrSvg } from '@/lib/qr';
import { invitationUrl } from '@/lib/app-url';
import { Shell, Countdown, RsvpForm, GuestbookForm, PrintButton } from './client';

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

function videoEmbed(url: string): { src: string } | null {
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url);
  if (yt) return { src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}` };
  return null;
}

function Section({ id, eyebrow, title, children, className = '' }: { id: string; eyebrow?: string; title?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`inv-section ${className}`}>
      {eyebrow && <p className="inv-eyebrow">{eyebrow}</p>}
      {title && <h2 className="inv-title">{title}</h2>}
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

function Hero({ occasion, content, lang }: { occasion: Occasion; content: Content; lang: Lang }) {
  const cover = content.cover;
  const copy = heroCopy(occasion, cover, lang);
  const photo = str(cover, 'coverPhoto') || str(cover, 'logo');
  const date = str(cover, 'date');
  const time = str(cover, 'time');
  const monogram = str(cover, 'monogram');
  return (
    <header className="inv-hero" id="top">
      {photo && <img src={photo} alt="" className="inv-hero-photo" />}
      <div className="inv-hero-scrim" />
      <div className="inv-hero-body">
        {monogram && <p className="inv-display mb-3 text-3xl opacity-90">{monogram}</p>}
        {copy.eyebrow && <p className="inv-eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>{copy.eyebrow}</p>}
        <h1 className="inv-names">
          {copy.names.map((n, i) => (
            <span key={i}>
              {i > 0 && <span className="inv-amp">&amp;</span>}
              {n}
            </span>
          ))}
        </h1>
        {copy.sub && <p className="mt-3 text-sm opacity-90">{copy.sub}</p>}
        {copy.intro && <p className="mx-auto mt-5 max-w-md text-base leading-relaxed opacity-95">{copy.intro}</p>}
        {date && (
          <p className="mt-6 text-lg">
            <span className="inv-display block text-2xl">{formatDate(date, 'weekday')}</span>
            {time && <span className="mt-1 block text-sm opacity-90">{formatTime(time)}</span>}
          </p>
        )}
      </div>
    </header>
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

function EventBlock({ id, title, data, lang, fallbackDate, calendarHref }: { id: string; title: string; data: SectionData; lang: Lang; fallbackDate: string; calendarHref?: string }) {
  const venue = str(data, 'venue');
  if (!venue) return null;
  const date = str(data, 'date') || fallbackDate;
  const time = str(data, 'time');
  const maps = mapsHref(data);
  const waze = wazeHref(data);
  const photo = str(data, 'photo');
  return (
    <Section id={id} title={title}>
      <div className="inv-card text-center">
        {photo && <img src={photo} alt="" className="inv-photo mb-4 aspect-[3/2]" loading="lazy" />}
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

function Entourage({ data, lang }: { data: SectionData; lang: Lang }) {
  const principal = rows<{ ninong: string; ninang: string }>(data, 'principalSponsors').filter((p) => p.ninong || p.ninang);
  const secondary = rows<{ role: string; first: string; second: string }>(data, 'secondarySponsors').filter((p) => p.first || p.second);
  const namesOf = (k: string) => rows<{ name: string }>(data, k).map((r) => r.name);
  const honor = str(data, 'honorTitle') === 'matron' ? t(lang, 'entourage.matronOfHonor') : t(lang, 'entourage.maidOfHonor');
  return (
    <Section id="entourage" title={t(lang, 'entourage.title')}>
      <div className="space-y-8">
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

function DressCode({ data, lang }: { data: SectionData; lang: Lang }) {
  const colors = rows<string>(data, 'colors');
  const attire = ATTIRE[str(data, 'attire')] ?? '';
  return (
    <Section id="dress-code" title={t(lang, 'dressCode.title')}>
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
          <div className="inv-two mt-4 text-sm">
            {str(data, 'sponsorsAttire') && <p><span className="inv-eyebrow">{t(lang, 'dressCode.sponsors')}</span>{str(data, 'sponsorsAttire')}</p>}
            {str(data, 'entourageAttire') && <p><span className="inv-eyebrow">{t(lang, 'dressCode.entourage')}</span>{str(data, 'entourageAttire')}</p>}
          </div>
        )}
        {str(data, 'note') && <p className="mt-3 whitespace-pre-line text-sm">{str(data, 'note')}</p>}
      </div>
    </Section>
  );
}

function Gift({ data, lang, title }: { data: SectionData; lang: Lang; title: string }) {
  const registry = rows<{ label: string; url: string }>(data, 'registry');
  const qr = str(data, 'gcashQr');
  return (
    <Section id="gift" title={title}>
      {str(data, 'text') && <p className="mx-auto max-w-md whitespace-pre-line text-center">{str(data, 'text')}</p>}
      {(qr || str(data, 'gcashNumber')) && (
        <div className="inv-card mt-5 text-center">
          <p className="inv-eyebrow">{t(lang, 'gift.gcash')}</p>
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

function Rsvp({ inv, data, lang, guest, personal, hostsNoun, slug, token }: { inv: PublicInvitation; data: SectionData; lang: Lang; guest: GuestForPage | null | undefined; personal: boolean; hostsNoun: string; slug: string; token?: string }) {
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
    <Section id="rsvp" title={t(lang, 'rsvp.title')}>
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
            attendees: t(lang, 'rsvp.attendees'),
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

function Story({ data, lang, title }: { data: SectionData; lang: Lang; title: string }) {
  const timeline = rows<{ date: string; title: string; text: string; photo: string }>(data, 'timeline');
  return (
    <Section id="story" title={title}>
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
      {timeline.length > 0 && (
        <ol className="inv-timeline">
          {timeline.map((m, i) => (
            <li key={i}>
              {m.date && <p className="inv-muted text-xs uppercase tracking-widest">{m.date}</p>}
              <p className="inv-display text-xl">{m.title}</p>
              {m.text && <p className="mt-1 whitespace-pre-line text-sm">{m.text}</p>}
              {m.photo && <img src={m.photo} alt="" className="inv-photo mt-2 max-w-xs" loading="lazy" />}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function Gallery({ data, lang, tier }: { data: SectionData; lang: Lang; tier: Tier }) {
  const limit = galleryLimit(tier);
  const photos = rows<{ url: string; caption: string }>(data, 'photos').filter((p) => p.url).slice(0, limit === Infinity ? undefined : limit);
  const video = hasFeature(tier, 'video') ? str(data, 'videoUrl') : '';
  if (!photos.length && !video) return null;
  const embed = video ? videoEmbed(video) : null;
  return (
    <Section id="gallery" title={t(lang, 'gallery.title')}>
      {photos.length > 0 && (
        <div className="inv-gallery">
          {photos.map((p, i) => (
            <figure key={i}>
              <img src={p.url} alt={p.caption || ''} loading="lazy" />
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

function Program({ data, title }: { data: SectionData; title: string }) {
  const items = rows<{ time: string; title: string; note: string }>(data, 'items');
  const activities = str(data, 'activities');
  return (
    <Section id="program" title={title}>
      {items.length > 0 && (
        <ol className="inv-timeline">
          {items.map((it, i) => (
            <li key={i}>
              {it.time && <p className="inv-muted text-xs uppercase tracking-widest">{it.time}</p>}
              <p className="inv-display text-xl">{it.title}</p>
              {it.note && <p className="text-sm">{it.note}</p>}
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

function Social({ data, lang }: { data: SectionData; lang: Lang }) {
  const hashtag = str(data, 'hashtag');
  return (
    <Section id="social" title={t(lang, 'social.title')}>
      {hashtag && (
        <p className="text-center">
          <span className="inv-eyebrow">{t(lang, 'social.hashtag')}</span>
          <span className="inv-display text-3xl">{hashtag.startsWith('#') ? hashtag : `#${hashtag}`}</span>
        </p>
      )}
      <p className="inv-muted mt-2 text-center text-sm">
        {[str(data, 'instagram') && `IG ${str(data, 'instagram')}`, str(data, 'facebook') && `FB ${str(data, 'facebook')}`].filter(Boolean).join(' · ')}
      </p>
      {bool(data, 'unplugged') && (
        <div className="inv-card mt-4 text-center">
          <p className="inv-eyebrow">{t(lang, 'social.unplugged')}</p>
          <p className="text-sm">{str(data, 'unpluggedText')}</p>
        </div>
      )}
    </Section>
  );
}

function Guestbook({ inv, data, lang, hostsNoun, slug }: { inv: PublicInvitation; data: SectionData; lang: Lang; hostsNoun: string; slug: string }) {
  if (!bool(data, 'enabled')) return null;
  return (
    <Section id="guestbook" title={t(lang, 'guestbook.title')}>
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

function Closing({ data, lang, hashtag }: { data: SectionData; lang: Lang; hashtag: string }) {
  return (
    <Section id="closing" title={t(lang, 'closing.title')}>
      {str(data, 'photo') && <img src={str(data, 'photo')} alt="" className="inv-photo mb-4 aspect-[4/3]" loading="lazy" />}
      {str(data, 'message') && <p className="mx-auto max-w-md whitespace-pre-line text-center">{str(data, 'message')}</p>}
      {str(data, 'signature') && <p className="inv-display mt-4 text-center text-3xl" style={{ color: 'var(--inv-accent)' }}>{str(data, 'signature')}</p>}
      {hashtag && <p className="inv-muted mt-2 text-center text-sm">{hashtag.startsWith('#') ? hashtag : `#${hashtag}`}</p>}
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
            {s.photo && <img src={s.photo} alt="" className="mx-auto mb-2 h-20 w-20 rounded-full object-cover" loading="lazy" />}
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

function Contact({ data, lang }: { data: SectionData; lang: Lang }) {
  return (
    <Section id="contact" title={t(lang, 'contact.title')}>
      <div className="inv-card text-center">
        {str(data, 'name') && <p className="font-semibold">{str(data, 'name')}</p>}
        {str(data, 'phone') && <p><a href={`tel:${str(data, 'phone').replace(/\s/g, '')}`} className="underline">{str(data, 'phone')}</a></p>}
        {str(data, 'email') && <p><a href={`mailto:${str(data, 'email')}`} className="underline">{str(data, 'email')}</a></p>}
        {str(data, 'messenger') && <p><a href={str(data, 'messenger')} target="_blank" rel="noopener" className="underline">Messenger</a></p>}
        {str(data, 'registrationNote') && <p className="mt-2 whitespace-pre-line text-sm">{str(data, 'registrationNote')}</p>}
      </div>
    </Section>
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

export function Invitation({ invitation: inv, guest, preview = false, print = false, businessName }: RenderProps) {
  const content = contentOf(inv.content);
  const lang: Lang = inv.language === 'tl' ? 'tl' : 'en';
  const occasion = inv.occasion;
  const { palette, fonts } = resolveTheme(inv.template, content);
  const layout = isLayout(inv.template.layout) ? inv.template.layout : 'classic';
  const style = cssVars(palette, fonts) as CSSProperties;
  const personal = Boolean(guest) && hasFeature(inv.tier, 'rsvp.personalLinks');
  const hostsNoun = lang === 'tl' ? HOSTS[occasion]?.tl ?? 'sa host' : HOSTS[occasion]?.en ?? 'the hosts';
  const coverDate = str(content.cover, 'date');
  const templateSections = new Set(inv.template.sections);

  const visible = (key: SectionKey) =>
    OCCASION_SECTIONS[occasion].includes(key) &&
    (templateSections.size === 0 || templateSections.has(key)) &&
    sectionUnlocked(key, occasion, inv.tier) &&
    (key === 'rsvp' || key === 'cover' || sectionFilled(key, occasion, content[key]));

  const eventAt = eventInstant(content);
  const calendarHref = eventAt ? `/i/${inv.slug}/calendar.ics` : undefined;
  const musicUrl = visible('music') ? str(content.music, 'url') : '';
  const hashtag = str(content.social, 'hashtag');
  const rsvpVisible = visible('rsvp');

  const order = OCCASION_SECTIONS[occasion];
  const body = order.map((key) => {
    if (!visible(key)) return null;
    const data = content[key] ?? {};
    switch (key) {
      case 'cover':
        return <Hero key={key} occasion={occasion} content={content} lang={lang} />;
      case 'countdown':
        return bool(data, 'enabled') && eventAt ? (
          <Section key={key} id="countdown" eyebrow={str(data, 'label') || t(lang, 'countdown.title')}>
            <Countdown target={eventAt.toISOString()} labels={[t(lang, 'countdown.days'), t(lang, 'countdown.hours'), t(lang, 'countdown.minutes'), t(lang, 'countdown.seconds')]} today={t(lang, 'countdown.today')} />
          </Section>
        ) : null;
      case 'parents':
        return <Parents key={key} occasion={occasion} data={data} lang={lang} />;
      case 'ceremony':
        return <EventBlock key={key} id="ceremony" title={sectionTitle('ceremony', occasion, lang)} data={data} lang={lang} fallbackDate={coverDate} calendarHref={calendarHref} />;
      case 'reception':
        return <EventBlock key={key} id="reception" title={sectionTitle('reception', occasion, lang)} data={data} lang={lang} fallbackDate={str(content.ceremony, 'venue') ? '' : coverDate} calendarHref={str(content.ceremony, 'venue') ? undefined : calendarHref} />;
      case 'entourage':
        return <Entourage key={key} data={data} lang={lang} />;
      case 'sponsors':
        return <Sponsors key={key} data={data} lang={lang} />;
      case 'eighteen':
        return <Eighteen key={key} data={data} lang={lang} />;
      case 'dressCode':
        return <DressCode key={key} data={data} lang={lang} />;
      case 'gift':
        return <Gift key={key} data={data} lang={lang} title={occasion === 'MEMORIAL' ? t(lang, 'memorial.inLieu') : t(lang, 'gift.title')} />;
      case 'rsvp':
        return <Rsvp key={key} inv={inv} data={data} lang={lang} guest={guest} personal={personal} hostsNoun={hostsNoun} slug={inv.slug} token={guest?.token} />;
      case 'story':
        return <Story key={key} data={data} lang={lang} title={t(lang, 'story.title')} />;
      case 'gallery':
        return <Gallery key={key} data={data} lang={lang} tier={inv.tier} />;
      case 'program':
        return <Program key={key} data={data} title={occasion === 'CORPORATE' ? t(lang, 'program.agenda') : t(lang, 'program.title')} />;
      case 'faq':
        return <Faq key={key} data={data} lang={lang} />;
      case 'travel':
        return <Travel key={key} data={data} lang={lang} />;
      case 'social':
        return <Social key={key} data={data} lang={lang} />;
      case 'music':
        return null;
      case 'guestbook':
        return <Guestbook key={key} inv={inv} data={data} lang={lang} hostsNoun={hostsNoun} slug={inv.slug} />;
      case 'closing':
        return <Closing key={key} data={data} lang={lang} hashtag={hashtag} />;
      case 'speakers':
        return <Speakers key={key} data={data} lang={lang} />;
      case 'family':
        return <Family key={key} data={data} lang={lang} />;
      case 'contact':
        return <Contact key={key} data={data} lang={lang} />;
    }
  });

  const guestPhotos = hasFeature(inv.tier, 'photoSharing') ? inv.media : [];

  return (
    <div className="inv" data-layout={layout} style={style} lang={lang}>
      <link rel="stylesheet" href={googleFontsUrl(fonts)} precedence="default" />
      {preview && (
        <div className="no-print sticky top-0 z-40 bg-[#1f1d1a] px-4 py-2 text-center text-xs text-white">
          Preview — {inv.status === 'PUBLISHED' ? 'this is how guests see it' : 'not published yet, only you can see this'}
        </div>
      )}
      <Shell envelope={!print && bool(content.cover, 'envelope')} monogram={str(content.cover, 'monogram')} hint={t(lang, 'envelope.open')} music={print ? '' : musicUrl} autoplay={bool(content.music, 'autoplay')} playLabel={t(lang, 'music.play')} pauseLabel={t(lang, 'music.pause')}>
        {body}
        {guestPhotos.length > 0 && (
          <Section id="guest-photos" title={lang === 'tl' ? 'Mga larawan mula sa mga bisita' : 'Photos from our guests'}>
            <div className="inv-gallery">
              {guestPhotos.map((m) => (
                <figure key={m.id}><img src={m.url} alt={m.caption} loading="lazy" /></figure>
              ))}
            </div>
          </Section>
        )}
        <footer className="inv-section text-center text-xs" style={{ color: 'var(--inv-muted)' }}>
          {!print && (
            <div className="no-print mb-4 flex flex-wrap justify-center gap-2">
              <a href={`/i/${inv.slug}/card`} className="inv-btn inv-btn-outline" download={`${inv.slug}.png`}>{t(lang, 'share.download')}</a>
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

function sectionTitle(key: 'ceremony' | 'reception', occasion: Occasion, lang: Lang): string {
  if (key === 'ceremony') {
    if (occasion === 'MEMORIAL') return t(lang, 'memorial.mass');
    if (occasion === 'HOUSEWARMING') return lang === 'tl' ? 'Bendisyon' : 'House blessing';
    return t(lang, 'ceremony.title');
  }
  if (occasion === 'WEDDING' || occasion === 'CHRISTENING' || occasion === 'COMMUNION' || occasion === 'ANNIVERSARY') return t(lang, 'reception.title');
  return t(lang, 'venue.title');
}
