import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPesoMenu } from '@/lib/money';
import { minutesToLabel } from '@/lib/datetime';
import { buildServiceMenu } from '@/lib/service-menu';
import { normaliseMapEmbed } from '@/lib/map-embed';
import { assetUrl } from '@/lib/asset-url';
import { publishableFeedback, shortName } from '@/lib/testimonials';
import { landingPromoWhere, isUpcoming } from '@/lib/promos';
import { SiteHeader } from '@/components/landing/site-header';
import { PriceMenu } from '@/components/landing/price-menu';
import { Wordmark } from '@/components/landing/wordmark';

export const dynamic = 'force-dynamic';

/**
 * The four cards under "Crafted for your well-being" — shopfront, not index.
 *
 * These were briefly generated from the catalogue, one card per category. It
 * seemed the more honest arrangement and it was the wrong one: the catalogue
 * has seven headings kept in the order the price list and the booking form
 * need, and the first four of those are whatever happens to sort first. It
 * also cannot say "Foot Spa & Reflexology", because those are two headings and
 * a card is one.
 *
 * So the cards are written here, on purpose. They are the window display —
 * four photographs and the words a guest recognises. Nothing about them is a
 * promise the catalogue has to keep, which is why they carry no counts and no
 * prices; everything exact lives in the menu directly below.
 *
 * To change a photograph, upload a file of the same name to `public`. The
 * address stays put and the deployment stamp makes browsers fetch it again.
 */
const SHELVES = [
  {
    name: 'Massage',
    photo: '/massage.jpg',
    art: 'ph-massage',
    blurb: 'Hilot, Swedish, Shiatsu and our own signature blend.',
  },
  {
    name: 'Body Treatments',
    photo: '/body-treatment.jpg',
    art: 'ph-body',
    blurb: 'Scrubs and rituals that polish, nourish and restore.',
  },
  {
    name: 'Foot Spa & Reflexology',
    photo: '/foot-spa.jpg',
    art: 'ph-foot',
    blurb: 'Soak, scrub and targeted pressure for tired feet.',
  },
  {
    name: 'Add-ons & Sauna',
    photo: '/sauna.jpg',
    art: 'ph-sauna',
    blurb: 'Dry heat, hot stone and ventosa to extend your visit.',
  },
];

export default async function LandingPage() {
  const settings = await getSettings();
  const now = new Date();

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
      where: landingPromoWhere(now),
      orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }],
    }),
    prisma.package.findMany({
      where: { active: true, showOnLanding: true },
      // Memberships lead, cheapest first, so the tiers read as a ladder rather
      // than arriving in whatever order Postgres hands them back. Session
      // bundles follow.
      orderBy: [{ type: 'desc' }, { priceCents: 'asc' }],
    }),
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
  const aboutImage = assetUrl(settings['business.aboutImageUrl']);

  const socials = [
    { label: 'Facebook', href: settings['business.facebook'] },
    { label: 'Instagram', href: settings['business.instagram'] },
  ].filter((s) => s.href);
  const shelves = SHELVES.map((s) => ({ ...s, image: assetUrl(s.photo) }));

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

  // With online booking switched off in Settings, the page must stop offering
  // it. The wizard already refuses politely, but sending someone through three
  // taps to be told "call us" wastes their time and looks broken — so the call
  // to action becomes the phone number itself.
  const bookingOn = settings['booking.enabled'];
  const telHref = `tel:${settings['business.contact'].replace(/[^\d+]/g, '')}`;
  const cta = bookingOn
    ? { href: '/book', label: 'Book now' }
    : { href: telHref, label: 'Call to book' };

  // Selected quotes above, the whole listing's score beneath. Shown only when
  // every part is set: a rating without a link is a claim nobody can check.
  const google =
    settings['business.googleUrl'] &&
    settings['business.googleRating'] &&
    settings['business.googleReviewCount'] > 0
      ? {
          url: settings['business.googleUrl'],
          rating: settings['business.googleRating'],
          count: settings['business.googleReviewCount'],
        }
      : null;
  // Two different offers: a year of discount, and treatments bought in
  // advance. They read as one muddle when mixed into a single grid.
  const memberships = packages.filter((p) => p.type === 'MEMBERSHIP');
  const bundles = packages.filter((p) => p.type !== 'MEMBERSHIP');

  const hasGuests = testimonials.length > 0 || google !== null;

  // Built here, where it is known which sections actually rendered, so the nav
  // never offers a link that scrolls nowhere.
  const navLinks = [
    { href: '#services', label: 'Services' },
    { href: '#about', label: 'About' },
    ...(packages.length > 0 ? [{ href: '#membership', label: 'Membership' }] : []),
    ...(hasGuests ? [{ href: '#guests', label: 'Guests' }] : []),
    { href: '#visit', label: 'Visit us' },
  ];

  return (
    <div className="min-h-dvh bg-sand-50">
      <SiteHeader
        name={settings['business.name']}
        logoUrl={settings['business.logoUrl']}
        links={navLinks}
        cta={cta}
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
          <h1 className="mt-6 font-display text-[2.75rem] leading-[1.02] text-white sm:text-6xl">
            {taglineHead}
            {taglineTail && <em className="block italic text-gilt-500">{taglineTail}</em>}
          </h1>
          <p className="mt-6 max-w-xl leading-relaxed text-sand-100">
            Your wellness escape in {settings['business.locality']} awaits. Enjoy massage, body
            scrubs, foot spas, and sauna treatments, then book your preferred therapist, room,
            and time in just a few clicks.
          </p>
          {bookingOn ? (
            <Link href="/book" className="btn-primary mt-9 rounded-full px-7">
              Book your escape
            </Link>
          ) : (
            <div className="mt-9">
              <a href={telHref} className="btn-primary rounded-full px-7">
                Call to book
              </a>
              <p className="mt-3 text-sm text-sand-200">
                Online booking is paused. Call us and we&apos;ll set your appointment.
              </p>
            </div>
          )}
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
                  {/* Announced early, so it must say so — otherwise guests
                      arrive expecting it and the desk has to refuse them. */}
                  {isUpcoming(p, now) && (
                    <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-gilt-600">
                      Starts{' '}
                      {p.startDate.toLocaleDateString('en-PH', {
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'Asia/Manila',
                      })}
                    </p>
                  )}
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
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2 lg:items-center">
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
          {/* The wash behind each card is what shows if a photograph is ever
              missing — a warm panel rather than a broken frame. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {shelves.map((s) => (
              <div
                key={s.name}
                className={`ph ${s.art} flex aspect-4/5 flex-col justify-end p-4 text-white`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.image}
                  alt={s.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Two devices rather than one. The label and its line of copy
                    stand two thirds of the way up a narrow card, so a gradient
                    dark enough on its own to carry them there buries the
                    photograph it is sitting on — which is the whole point of
                    having a photograph. A moderate wash plus a shadow on the
                    type holds the words against a sunlit curtain and still
                    leaves the picture visible. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(to_top,rgba(74,54,38,0.94)_0%,rgba(74,54,38,0.70)_52%,rgba(74,54,38,0.28)_78%,rgba(74,54,38,0.06)_100%)]"
                />
                <div className="relative [text-shadow:0_1px_4px_rgba(38,25,15,0.9)]">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-sand-100">{s.name}</p>
                  <p className="mt-1 text-xs leading-snug text-sand-200">{s.blurb}</p>
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
                <a href={cta.href} className="btn-primary rounded-full px-7">
                  {cta.label}
                </a>
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
          {/* The wash is the fallback, not the design. It shipped as this
              panel's only state — a picture frame with no way to hang a
              picture in it — which reads as something failing to load rather
              than as a choice. */}
          <div className="ph ph-lounge min-h-64 lg:min-h-[26rem]">
            {aboutImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={aboutImage}
                alt={`Inside ${settings['business.name']}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </div>
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
                {
                  label: 'Professional therapists',
                  // Two strokes, because a person is a head and a pair of
                  // shoulders. This carried the shoulders alone and drew a
                  // headless arc — legible as a mistake from across the room.
                  paths: [
                    'M12 4.4a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z',
                    'M5 21c0-4 3-6 7-6s7 2 7 6',
                  ],
                },
                {
                  label: 'Hygienic & safe space',
                  paths: ['M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3Z'],
                },
                {
                  label: 'Personalized care',
                  paths: [
                    'M6 4h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 2-2Z',
                  ],
                },
              ].map(({ label, paths }) => (
                <div key={label} className="flex gap-2.5">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="mt-0.5 h-5 w-5 shrink-0 stroke-gilt-600"
                    fill="none"
                    strokeWidth={1.3}
                  >
                    {paths.map((d) => (
                      <path key={d} d={d} />
                    ))}
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
          invented here: an empty list means the band does not appear.

          Memberships and session bundles are two different offers — one is a
          year of discount, the other is treatments bought in advance — so they
          get a row each rather than being mixed into one grid where the eye
          has to sort them out. */}
      {packages.length > 0 && (
        <section
          id="membership"
          className="relative scroll-mt-20 overflow-hidden border-t border-sand-200 bg-cocoa-700"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <div className="max-w-xl">
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

            {[
              { key: 'MEMBERSHIP', heading: 'Memberships', rows: memberships },
              { key: 'SESSION_PACKAGE', heading: 'Packages', rows: bundles },
            ]
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <div key={group.key} className="mt-12">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gilt-500">
                    {group.heading}
                  </h3>
                  <span aria-hidden className="mt-3 block h-px w-12 bg-sand-200/25" />
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.rows.map((p) => {
                      // A membership is a list of perks, and the owner writes
                      // it as one per line. HTML collapses those newlines,
                      // which ran the perks together into one unreadable
                      // sentence.
                      const perks = p.description
                        .split('\n')
                        .map((line) => line.replace(/^[-•*·]\s*/, '').trim())
                        .filter(Boolean);

                      // A membership's headline is what it takes off every
                      // visit, not what it costs — that is the number someone
                      // joins for. It comes from the package's own
                      // memberDiscountPercent, so the tiers are whatever the
                      // Owner set up in Marketing → Packages and no percentage
                      // is ever typed in here.
                      const leadsWithDiscount =
                        p.type === 'MEMBERSHIP' && p.memberDiscountPercent > 0;
                      const card = assetUrl(p.imageUrl);

                      return (
                        <div
                          key={p.id}
                          className="flex flex-col overflow-hidden bg-cocoa-800/70 shadow-[inset_0_0_0_1px_rgba(214,194,162,0.22)]"
                        >
                          {/* The card itself, where the spa has photographed
                              one. A membership is a physical thing the guest is
                              handed, and it sells the tier better than a list
                              of perks does. */}
                          {card && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={card}
                              alt={`The ${p.name} card`}
                              className="aspect-[16/10] w-full object-cover"
                            />
                          )}
                          <div className="flex flex-1 flex-col p-6">
                            <p className="font-display text-2xl italic text-sand-50">{p.name}</p>
                            {leadsWithDiscount && (
                              <p className="mt-3">
                                <span className="num font-display text-3xl text-gilt-500">
                                  {p.memberDiscountPercent}%
                                </span>{' '}
                                <span className="text-xs uppercase tracking-[0.18em] text-sand-200">
                                  off every visit
                                </span>
                              </p>
                            )}
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------- testimonials */}
      {/* Absent entirely when there is nothing released — an empty "what guests
          say" heading above three blank cards says something worse than
          silence. */}
      {hasGuests && (
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
              {/* The quotes above are chosen; this is not. Putting the whole
                  listing's average and count beside them — linked, so anyone
                  can go and read the rest — is what keeps a curated selection
                  honest. */}
              {google && (
                <a
                  href={google.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-6 inline-flex items-baseline gap-2 border-b border-sand-300 pb-1
                             text-sm text-cocoa-600 transition hover:border-gilt-600 hover:text-gilt-600"
                >
                  <span className="text-gilt-600">★</span>
                  <span className="num font-semibold text-cocoa-800">{google.rating}</span>
                  <span>on Google</span>
                  <span className="text-cocoa-400">·</span>
                  <span className="num">{google.count.toLocaleString('en-PH')} reviews</span>
                </a>
              )}
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
              <Wordmark name={settings['business.name']} size="lg" />
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
                {/* Each social link appears only if there is one. An empty
                    setting used to render "Facebook" pointing at nothing,
                    which sends a guest to this site's own 404 — the worst
                    possible answer to "are these people real?". */}
                {socials.length > 0 && (
                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {socials.map((s) => (
                      <a
                        key={s.label}
                        className="text-cocoa-500 underline underline-offset-4 hover:text-gilt-600"
                        href={s.href}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {s.label}
                      </a>
                    ))}
                  </p>
                )}
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
                    <a className="hover:text-gilt-600" href={cta.href}>
                      {cta.label}
                    </a>
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
          <a
            href={cta.href}
            className="btn-primary flex-1 justify-center rounded-full text-center"
          >
            {bookingOn ? 'Book a slot' : 'Call to book'}
          </a>
        </div>
      </div>
      <div aria-hidden className="h-20 lg:hidden" />
    </div>
  );
}
