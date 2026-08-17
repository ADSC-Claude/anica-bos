import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPesoMenu } from '@/lib/money';
import { minutesToLabel } from '@/lib/datetime';
import { buildServiceMenu } from '@/lib/service-menu';
import { normaliseMapEmbed } from '@/lib/map-embed';
import { assetUrl } from '@/lib/asset-url';
import { publishableFeedback, shortName } from '@/lib/testimonials';
import { SiteHeader } from '@/components/landing/site-header';
import { HeroRotator, type HeroSlide } from '@/components/landing/hero-rotator';
import { PriceMenu } from '@/components/landing/price-menu';

export const dynamic = 'force-dynamic';

/** The four shelves the hero cards advertise, and the wash behind each. */
const SHELVES = [
  { name: 'Massage', art: 'ph-massage', blurb: 'Hilot, Swedish, Shiatsu and our own signature blend.' },
  { name: 'Body Treatments', art: 'ph-body', blurb: 'Scrubs and rituals that polish, nourish and restore.' },
  { name: 'Foot Spa & Reflexology', art: 'ph-foot', blurb: 'Soak, scrub and targeted pressure for tired feet.' },
  { name: 'Add-ons & Sauna', art: 'ph-sauna', blurb: 'Dry heat, hot stone and ventosa to extend your visit.' },
];

export default async function LandingPage() {
  const settings = await getSettings();

  const [categories, promos, packages, testimonials] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { active: true },
      // Name breaks ties, so two categories sharing a rank keep a stable order
      // between loads instead of coming back however Postgres feels.
      orderBy: [{ sortRank: 'asc' }, { name: 'asc' }],
      include: {
        services: {
          where: { active: true, showOnLanding: true },
          orderBy: { sortRank: 'asc' },
        },
        // A treatment that spans two categories is listed under both here, and
        // only here — the POS and the revenue report still read the primary.
        alsoListed: {
          where: { active: true, showOnLanding: true },
          orderBy: { sortRank: 'asc' },
        },
      },
    }),
    prisma.promo.findMany({
      where: {
        active: true,
        showOnLanding: true,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      orderBy: { endDate: 'asc' },
    }),
    prisma.package.findMany({ where: { active: true, showOnLanding: true } }),
    publishableFeedback(prisma, 3),
  ]);

  const menu = buildServiceMenu(categories).map((cat) => ({
    id: cat.id,
    name: cat.name,
    services: cat.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      durationMinutes: s.durationMinutes,
      price: formatPesoMenu(s.priceCents),
    })),
  }));

  // Normalised on the way out as well as on the way in. Validating only on save
  // leaves whatever was stored before the validation existed rendering as-is —
  // and a pasted <iframe> tag resolves as a relative path, so the frame fills
  // with this site's own 404 rather than a map.
  const mapEmbed = normaliseMapEmbed(settings['business.mapEmbedUrl']);
  const mapUrl = 'url' in mapEmbed ? mapEmbed.url : '';

  // Photo or video, decided by the file extension rather than a second setting
  // — the Owner should not have to tell the system what they just uploaded.
  const heroMedia = assetUrl(settings['business.heroImageUrl']);
  const heroIsVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(heroMedia);

  const openLabel = minutesToLabel(settings['business.openMinute']);
  const closeLabel = minutesToLabel(settings['business.closeMinute']);
  const hours = `${openLabel} – ${closeLabel} daily`;

  // The latest a booking can still start, derived from closing time so it
  // cannot drift out of date the way a hardcoded string would.
  //
  // One hour, not the shortest thing on the menu: the booking engine refuses
  // any slot that would run past closing, so a 15-minute hot compress could
  // technically start at 11:45 — but "last booking 11:45 PM" would promise a
  // massage that cannot be had.
  const STANDARD_TREATMENT_MINUTES = 60;
  const lastBookingLabel = minutesToLabel(
    settings['business.closeMinute'] - STANDARD_TREATMENT_MINUTES,
  );

  // The tagline's last sentence is set in italic gilt — the eye should land on
  // the promise, not on the middle of a list of verbs. Falls back gracefully
  // when the Owner writes a one-word tagline in Settings.
  const tagline = settings['business.tagline'];
  const splitAt = tagline.trimEnd().lastIndexOf(' ');
  const taglineHead = splitAt > 0 ? tagline.slice(0, splitAt + 1) : tagline;
  const taglineTail = splitAt > 0 ? tagline.slice(splitAt + 1) : '';

  const slides: HeroSlide[] = [
    {
      head: taglineHead,
      tail: taglineTail,
      body:
        `Your wellness escape in ${settings['business.locality']} awaits. ` +
        'Enjoy massage, body scrubs, foot spas, and sauna treatments, then book your ' +
        'preferred therapist, room, and time in just a few clicks.',
    },
    {
      head: `Open ${openLabel}`,
      tail: `till ${closeLabel}.`,
      body: 'Every day of the week, for the hours you are actually free.',
    },
  ];
  // Only promised when it is true: with booking switched off there is no
  // two-minute booking to advertise.
  if (settings['booking.enabled']) {
    slides.push({
      head: 'Book it',
      tail: 'in two minutes.',
      body:
        'Pick your treatment, pick your hour, and hold it with ' +
        `${settings['booking.depositPercent']}% down.`,
    });
  }

  // Built here, where it is known which sections actually rendered, so the nav
  // never offers a link that scrolls nowhere.
  const navLinks = [
    { href: '#services', label: 'Services' },
    { href: '#about', label: 'About' },
    ...(packages.length > 0 ? [{ href: '#membership', label: 'Membership' }] : []),
    ...(testimonials.length > 0 ? [{ href: '#guests', label: 'Guests' }] : []),
    { href: '#visit', label: 'Visit us' },
  ];

  return (
    <div className="min-h-dvh bg-sand-50">
      <SiteHeader
        name={settings['business.name']}
        logoUrl={settings['business.logoUrl']}
        links={navLinks}
      />

      {/* ---------------------------------------------------------- hero */}
      <section className="relative grid min-h-[min(84vh,720px)] items-center">
        <div className="ph ph-room absolute inset-0">
          {heroMedia && heroIsVideo ? (
            // Muted and looping: a hero video is decoration, and anything with
            // sound that starts on its own is a reason to leave. Muted is also
            // what lets it autoplay at all on iOS.
            <video
              src={heroMedia}
              autoPlay
              muted
              loop
              playsInline
              aria-label={`Inside ${settings['business.name']}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : heroMedia ? (
            // Plain <img>: the source is whatever the Owner typed into
            // Settings, and next/image would need every possible host declared
            // in advance.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={heroMedia}
              alt={`Inside ${settings['business.name']}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
        </div>
        {/* Scrim, heaviest where the words sit. */}
        <div
          aria-hidden
          className="absolute inset-0 z-10 bg-[linear-gradient(95deg,rgba(74,54,38,0.9)_0%,rgba(74,54,38,0.6)_45%,rgba(74,54,38,0.15)_78%)]"
        />
        <div className="relative z-20 mx-auto w-full max-w-6xl px-4 py-20 sm:py-24">
          <p className="text-[11px] uppercase tracking-[0.2em] text-sand-300">
            {settings['business.locality']} · Open until {closeLabel}, daily
          </p>
          <div className="mt-6">
            <HeroRotator slides={slides} />
          </div>
          <Link href="/book" className="btn-primary mt-9 rounded-full px-7">
            Book your escape
          </Link>
        </div>
      </section>

      {/* -------------------------------------------------------- promos */}
      {promos.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gilt-600">
            What&apos;s on right now
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {promos.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-4 border border-sand-200
                           border-l-[3px] border-l-gilt-600 bg-white p-5"
              >
                <div>
                  <p className="font-semibold text-cocoa-800">{p.name}</p>
                  <p className="muted mt-1">{p.description}</p>
                  {p.code && (
                    <p className="mt-3 text-xs text-cocoa-500">
                      Mention code <strong className="tracking-wide">{p.code}</strong> when you
                      book.
                    </p>
                  )}
                </div>
                <span className="badge shrink-0 whitespace-nowrap rounded-none bg-cocoa-800 px-2.5 py-1 text-white">
                  {p.type === 'PERCENT' ? `${p.value}% off` : `${formatPesoMenu(p.value)} off`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ services */}
      {/* The cards and the price list are one section, because "Services" in
          the nav has to mean both. Splitting them is what made an earlier
          draft need a "Packages" item that opened the prices. */}
      <section id="services" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[0.85fr_2fr] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gilt-600">
              Our services
            </p>
            <h2 className="mt-3 font-display text-3xl leading-tight text-cocoa-800 sm:text-4xl">
              Crafted for
              <br />
              your well-being
            </h2>
            <p className="mt-4 text-cocoa-600">
              From therapeutic massage to full body rituals, every treatment is chosen to leave
              you lighter than you arrived.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {SHELVES.map((s) => (
              <div
                key={s.name}
                className={`ph ${s.art} flex aspect-4/5 flex-col justify-end p-4 text-white`}
              >
                <div
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(to_top,rgba(74,54,38,0.94)_8%,rgba(74,54,38,0.34)_55%,rgba(74,54,38,0.12)_100%)]"
                />
                <div className="relative">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-sand-100">{s.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-sand-200">{s.blurb}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {menu.length > 0 && (
          <div className="mt-20 border-t border-sand-200 bg-sand-100 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl px-4">
              <div className="mb-10 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gilt-600">
                  The menu
                </p>
                <h2 className="mt-3 font-display text-3xl text-cocoa-800 sm:text-4xl">
                  Every treatment, every price
                </h2>
              </div>
              <PriceMenu categories={menu} />
              <div className="mt-14 text-center">
                <Link href="/book" className="btn-primary rounded-full px-7">
                  Book now
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- late hours */}
      {/* The one dark band on the page, and the only place gold is used at
          size. Gold measures 3.4:1 on sand-50 — a hairline of contrast — but
          reads properly on cocoa-800, so the accent finally does the job it
          was picked for. */}
      <section className="relative overflow-hidden border-t border-sand-200 bg-cocoa-800">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_78%_15%,rgba(168,130,60,0.22),transparent_68%)]"
        />
        <div className="relative mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sand-300">
            Why we stay open late
          </p>
          <h2 className="mt-3 font-display text-3xl leading-tight text-sand-50 sm:text-4xl">
            The city closes at six. <em className="italic text-gilt-500">We don&apos;t.</em>
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-sand-200">
            Most spas in {settings['business.locality']} have locked up by the time
            you finish work. We take our last booking at {lastBookingLabel}, so a day that ran
            long can still end on a warm bed with the lights low.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-5 border-t border-sand-200/20 pt-6">
            <div>
              <dd className="num font-display text-2xl text-gilt-500">{openLabel}</dd>
              <dt className="text-[11px] uppercase tracking-wider text-sand-300">Doors open</dt>
            </div>
            <div>
              <dd className="num font-display text-2xl text-gilt-500">{lastBookingLabel}</dd>
              <dt className="text-[11px] uppercase tracking-wider text-sand-300">Last booking</dt>
            </div>
            <div>
              <dd className="num font-display text-2xl text-gilt-500">{closeLabel}</dd>
              <dt className="text-[11px] uppercase tracking-wider text-sand-300">We close</dt>
            </div>
            <div>
              <dd className="num font-display text-2xl text-gilt-500">7 days</dd>
              <dt className="text-[11px] uppercase tracking-wider text-sand-300">Every week</dt>
            </div>
          </dl>
        </div>
      </section>

      {/* --------------------------------------------------------- about */}
      <section id="about" className="scroll-mt-20 border-t border-sand-200 bg-white">
        <div className="mx-auto grid max-w-6xl lg:grid-cols-2">
          <div className="ph ph-lounge min-h-64 lg:min-h-[26rem]" />
          <div className="px-4 py-14 sm:px-10 sm:py-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gilt-600">
              About us
            </p>
            <h2 className="mt-3 font-display text-3xl leading-tight text-cocoa-800 sm:text-4xl">
              A sanctuary
              <br />
              of tranquility
            </h2>
            <p className="mt-5 max-w-lg text-cocoa-600">
              {settings['business.name']} is a neighbourhood wellness spa. We keep it simple:
              skilled therapists, clean rooms, honest prices, and enough time to actually unwind.
              Whether you need an hour between shifts or a long evening reset, there&apos;s a slot
              for you — we&apos;re open until {closeLabel}, every day.
            </p>
            <dl className="mt-9 grid grid-cols-2 gap-5 sm:grid-cols-3">
              {[
                ['Professional therapists', 'M5 21c0-4 3-6 7-6s7 2 7 6'],
                ['Hygienic & safe space', 'M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3Z'],
                ['Personalized care', 'M6 4h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 2-2Z'],
              ].map(([label, path]) => (
                <div key={label} className="flex gap-2.5">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="mt-0.5 h-5 w-5 shrink-0 stroke-gilt-600"
                    fill="none"
                    strokeWidth={1.3}
                  >
                    <path d={path} />
                  </svg>
                  <dt className="text-[13px] leading-snug text-cocoa-700">{label}</dt>
                </div>
              ))}
            </dl>
            <a href="#visit" className="btn-secondary mt-9 rounded-full px-6">
              Hours, address &amp; map
            </a>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- membership */}
      {/* Whatever the Owner has published, rendered as it stands. No tiers are
          invented here: an empty list means the band does not appear. */}
      {packages.length > 0 && (
        <section
          id="membership"
          className="relative scroll-mt-20 overflow-hidden border-t border-sand-200 bg-cocoa-700"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[0.9fr_2fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sand-300">
                Exclusive for members
              </p>
              <h2 className="mt-3 font-display text-3xl leading-tight text-sand-50 sm:text-4xl">
                More benefits,
                <br />
                more reasons to relax
              </h2>
              <p className="mt-4 text-sand-200">
                Ask at reception to avail, or mention it when you book.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => {
                // A membership is a list of perks, and the owner writes it as
                // one per line. HTML collapses those newlines, which ran the
                // perks together into a single unreadable sentence.
                const perks = p.description
                  .split('\n')
                  .map((line) => line.replace(/^[-•*·]\s*/, '').trim())
                  .filter(Boolean);

                return (
                  <div
                    key={p.id}
                    className="flex flex-col bg-cocoa-800/70 p-6 shadow-[inset_0_0_0_1px_rgba(214,194,162,0.22)]"
                  >
                    <p className="font-display text-2xl italic text-sand-50">{p.name}</p>
                    <p className="num mt-1 text-[15px] text-gilt-500">
                      {formatPesoMenu(p.priceCents)}
                    </p>
                    {perks.length > 1 ? (
                      <ul className="mt-4 space-y-1.5">
                        {perks.map((perk) => (
                          <li key={perk} className="flex gap-2.5">
                            <span
                              aria-hidden
                              className="mt-[0.55rem] h-1 w-1 shrink-0 rotate-45 bg-gilt-500/80"
                            />
                            <span className="text-sm text-sand-200">{perk}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 text-sm text-sand-200">{p.description}</p>
                    )}
                    <p className="mt-4 text-xs text-sand-300">
                      Valid for {Math.round(p.validityDays / 30)} months.
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* -------------------------------------------------- testimonials */}
      {/* Absent entirely when there is nothing released — an empty "what guests
          say" heading above three blank cards says something worse than
          silence. */}
      {testimonials.length > 0 && (
        <section id="guests" className="scroll-mt-20 border-t border-sand-200 bg-sand-50 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[0.8fr_2.4fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gilt-600">
                What our guests say
              </p>
              <h2 className="mt-3 font-display text-3xl leading-tight text-cocoa-800 sm:text-4xl">
                Moments of peace,
                <br />
                remembered
              </h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              {testimonials.map((t) => (
                <figure key={t.id}>
                  <p
                    aria-label={`${t.rating} out of 5`}
                    className="tracking-[0.12em] text-gilt-600"
                  >
                    {'★'.repeat(t.rating)}
                    <span className="text-sand-300">{'★'.repeat(5 - t.rating)}</span>
                  </p>
                  <blockquote className="mt-3 text-[15px] leading-relaxed text-cocoa-700">
                    &ldquo;{t.comment}&rdquo;
                  </blockquote>
                  <figcaption className="mt-4 text-sm text-cocoa-500">
                    {shortName(t.client.name)}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------- visit / footer */}
      {/* One closing block. An earlier draft said where we are twice: an
          "About ANICA" section, and the footer directly beneath repeating the
          same hours and address. */}
      <footer id="visit" className="scroll-mt-20 border-t border-sand-200 bg-sand-100 pt-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gilt-600">
              Find us
            </p>
            <div className="mt-5 aspect-4/3 overflow-hidden border border-sand-200 bg-sand-50">
              {mapUrl ? (
                <iframe
                  title={`Map to ${settings['business.name']}`}
                  src={mapUrl}
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center text-sm text-cocoa-500">
                  <span className="text-2xl text-gilt-600">●</span>
                  <p className="font-medium text-cocoa-700">Map goes here</p>
                  <p className="text-xs">
                    Settings → Business → Map for the landing page. In Google Maps: Share → Embed
                    a map → Copy HTML.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-9">
            <div>
              <p className="font-display text-xl font-bold uppercase tracking-[0.22em] text-cocoa-800">
                {settings['business.name']}
              </p>
              {/* The initials spell ANICA, so the line breaks carry meaning and
                  must not be reflowed into a paragraph. */}
              <p className="mt-4 font-display text-[15px] leading-[1.7] text-cocoa-700">
                A quiet room.
                <br />
                Noon till midnight.
                <br />
                In careful hands.
                <br />
                Close to home.
                <br />
                Always here.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cocoa-800">
                  Visit us
                </h3>
                <p className="mt-4 text-sm text-cocoa-500">{hours}</p>
                <p className="mt-3 text-sm text-cocoa-500">{settings['business.address']}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cocoa-800">
                  Contact
                </h3>
                <p className="mt-4 text-sm text-cocoa-500">{settings['business.contact']}</p>
                <p className="mt-3 text-sm">
                  <a
                    className="text-cocoa-500 underline underline-offset-4 hover:text-gilt-600"
                    href={`mailto:${settings['business.email']}`}
                  >
                    {settings['business.email']}
                  </a>
                </p>
                <p className="mt-3 text-sm">
                  <a
                    className="text-cocoa-500 underline underline-offset-4 hover:text-gilt-600"
                    href={settings['business.facebook']}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Facebook
                  </a>
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cocoa-800">
                  Quick links
                </h3>
                <ul className="mt-4 grid gap-2 text-sm text-cocoa-500">
                  <li>
                    <a className="hover:text-gilt-600" href="#services">
                      Services &amp; prices
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-gilt-600" href="#about">
                      About us
                    </a>
                  </li>
                  <li>
                    <Link className="hover:text-gilt-600" href="/book">
                      Book a slot
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-6xl px-4">
          <div className="border-t border-sand-200 py-6 text-xs text-cocoa-500">
            {/*
              No staff door on the customer's page. Staff reach the system at
              /login directly — bookmarked, or through the installed app. This
              keeps the landing page for clients only; it does not make /login
              secret, and is not a substitute for strong passwords.
            */}
            © {new Date().getFullYear()} {settings['business.name']} ·{' '}
            {settings['business.address']}
          </div>
        </div>
      </footer>

      {/* ------------------------------------------- sticky booking (mobile) */}
      {/* On a phone the header's "Book now" scrolls away within a screen and
          never returns, so the moment someone decides — halfway down the price
          list — there is nothing to tap. Desktop keeps the sticky header and
          does not need this. The spacer below keeps the bar off the last line
          of the footer. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-sand-200 bg-sand-50/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <p className="shrink-0 text-[11px] leading-tight text-cocoa-500">
            Open until
            <br />
            <span className="font-semibold text-cocoa-700">{closeLabel}</span>
          </p>
          <Link href="/book" className="btn-primary flex-1 justify-center rounded-full text-center">
            Book a slot
          </Link>
        </div>
      </div>
      <div aria-hidden className="h-20 lg:hidden" />
    </div>
  );
}
