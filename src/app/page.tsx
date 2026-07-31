import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPesoMenu } from '@/lib/money';
import { minutesToLabel } from '@/lib/datetime';
import { buildServiceMenu } from '@/lib/service-menu';
import { normaliseMapEmbed } from '@/lib/map-embed';
import { BrandMark } from '@/components/brand-mark';
import { publishableFeedback, shortName } from '@/lib/testimonials';

export const dynamic = 'force-dynamic';

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

  const menu = buildServiceMenu(categories);

  // Normalised on the way out as well as on the way in. Validating only on save
  // leaves whatever was stored before the validation existed rendering as-is —
  // and a pasted <iframe> tag resolves as a relative path, so the frame fills
  // with this site's own 404 rather than a map.
  // Photo or video, decided by the file extension rather than a second
  // setting — the Owner should not have to tell the system what they just
  // uploaded.
  const heroMedia = settings['business.heroImageUrl'].trim();
  const heroIsVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(heroMedia);

  const mapEmbed = normaliseMapEmbed(settings['business.mapEmbedUrl']);
  const mapUrl = 'url' in mapEmbed ? mapEmbed.url : '';

  const hours = `${minutesToLabel(settings['business.openMinute'])} – ${minutesToLabel(
    settings['business.closeMinute'],
  )} daily`;

  const openLabel = minutesToLabel(settings['business.openMinute']);
  const closeLabel = minutesToLabel(settings['business.closeMinute']);

  // The latest a booking can still start, derived from closing time so it
  // cannot drift out of date the way a hardcoded string would.
  //
  // One hour, not the shortest thing on the menu: the booking engine refuses
  // any slot that would run past closing, so a 15-minute hot compress could
  // technically start at 11:45 — but "last booking 11:45 PM" would promise a
  // massage that cannot be had. An hour is the honest headline, and it is what
  // a full-length treatment actually needs.
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

  return (
    <div className="min-h-dvh bg-sand-50">
      {/* ---------------------------------------------------------- nav */}
      <header className="sticky top-0 z-40 border-b border-sand-200 bg-sand-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark logoUrl={settings['business.logoUrl']} size={36} />
            <span className="font-display text-base font-semibold text-cocoa-800">
              {settings['business.name']}
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#services" className="hidden px-3 py-2 text-cocoa-600 sm:block">
              Services
            </a>
            <a href="#visit" className="hidden px-3 py-2 text-cocoa-600 sm:block">
              Visit us
            </a>
            <Link href="/book" className="btn-primary btn-sm">
              Book now
            </Link>
          </nav>
        </div>
      </header>

      {/* -------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            {/* "Open 12:00 PM – 12:00 MN daily" is a data field. "Open until
                midnight" is a reason to come — same fact, read by a person
                deciding at 9pm rather than by a form. */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cocoa-400">
              Quezon City · Open until {closeLabel}, daily
            </p>
            <span aria-hidden className="mt-6 block h-px w-14 bg-gilt-500/70" />
            <h1 className="mt-6 font-display text-[2.75rem] leading-[1.02] text-cocoa-800 sm:text-6xl">
              {taglineHead}
              {taglineTail && <em className="italic text-gilt-600">{taglineTail}</em>}
            </h1>
            <p className="mt-6 max-w-lg leading-relaxed text-cocoa-600">
              Your wellness escape in Quezon City awaits. Enjoy massage, body scrubs, foot
              spas, and sauna treatments, then book your preferred therapist, room, and time
              in just a few clicks.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="btn-primary rounded-full px-7">
                Book your slot
              </Link>
              <a href="#services" className="btn-secondary rounded-full px-7">
                See services &amp; prices
              </a>
            </div>
          </div>

          {/* Photo placeholder — swap for a real image in /public.
              The arch is deliberate: it reads as a spa rather than a dashboard. */}
          {/* Capped on small screens: at full width the arch is taller than the
              viewport and pushes the price list off the page. */}
          <div className="relative mx-auto aspect-4/5 w-full max-w-xs overflow-hidden rounded-t-full rounded-b-3xl bg-gradient-to-br from-sand-100 via-sand-300 to-sand-400 ring-1 ring-inset ring-gilt-500/40 sm:max-w-sm lg:max-w-none">
            {heroMedia && heroIsVideo ? (
              // Muted and looping: a hero video is decoration, and anything
              // with sound that starts on its own is a reason to leave. Muted
              // is also what lets it autoplay at all on iOS.
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
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-cocoa-700">
                <span className="font-display text-4xl">✿</span>
                <p className="text-sm font-medium">Spa photo</p>
                <p className="text-xs text-cocoa-600">
                  Add one in Settings → Business → Photo or video on the landing page.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ promos */}
      {promos.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cocoa-400">
            What&apos;s on right now
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {promos.map((p) => (
              <div key={p.id} className="card-pad border-cocoa-200 bg-cocoa-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-cocoa-800">{p.name}</p>
                    <p className="muted mt-1">{p.description}</p>
                  </div>
                  <span className="badge shrink-0 whitespace-nowrap bg-cocoa-600 text-white">
                    {p.type === 'PERCENT' ? `${p.value}% off` : `${formatPesoMenu(p.value)} off`}
                  </span>
                </div>
                {p.code && (
                  <p className="mt-3 text-xs text-cocoa-500">
                    Mention code <strong className="tracking-wide">{p.code}</strong> when you
                    book.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- services */}
      <section id="services" className="border-t border-sand-200 bg-sand-100">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cocoa-400">
              The menu
            </p>
            <h2 className="mt-3 font-display text-3xl text-cocoa-800 sm:text-4xl">
              Services &amp; Price List
            </h2>
            <div
              aria-hidden
              className="mt-5 flex items-center justify-center gap-4 text-cocoa-300"
            >
              <span className="h-px w-10 bg-sand-300" />
              <span className="font-display text-lg">✿</span>
              <span className="h-px w-10 bg-sand-300" />
            </div>
          </div>

          {/* Leader dots, as on a printed spa menu — the one structural device
              here that encodes something true about the content. */}
          <div className="mt-12 space-y-11">
            {menu.map((cat) => (
                <div key={cat.id}>
                  <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-cocoa-400">
                    {cat.name}
                  </h3>
                  <ul className="mt-6 space-y-5">
                    {cat.services.map((s) => (
                      <li key={s.id}>
                        <div className="flex items-baseline gap-3">
                          <span className="font-medium text-cocoa-800">{s.name}</span>
                          <span
                            aria-hidden
                            className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-sand-300"
                          />
                          <span className="num shrink-0 font-display text-lg font-semibold text-gilt-600">
                            {formatPesoMenu(s.priceCents)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-cocoa-500">
                          {s.description}
                          {/* Most catalogues already carry the length in the
                              name — "Swedish Massage (60 min)" — so only add it
                              when the name has not said it already. */}
                          {!/\d\s*min/i.test(s.name) && (
                            <>
                              {s.description && ' · '}
                              {s.durationMinutes} minutes
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>

          {packages.length > 0 && (
            <div className="mt-14">
              <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-cocoa-400">
                Packages &amp; membership
              </h3>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {packages.map((p) => (
                  <div key={p.id} className="card-pad">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-cocoa-800">{p.name}</p>
                      <p className="num shrink-0 font-display text-lg font-semibold text-gilt-600">
                        {formatPesoMenu(p.priceCents)}
                      </p>
                    </div>
                    <p className="muted mt-1">{p.description}</p>
                    <p className="mt-2 text-xs text-cocoa-400">
                      Valid for {Math.round(p.validityDays / 30)} months. Ask at reception to
                      avail.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-14 text-center">
            <Link href="/book" className="btn-primary rounded-full px-7">
              Book now
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- late hours */}
      {/* The one dark band on the page, and the only place gold is used at
          size. Gold measures 3.4:1 on sand-50 — a hairline of contrast — but
          reads properly on cocoa-800, so the accent finally does the job it
          was picked for. It also breaks a page that is otherwise cream from
          top to bottom. */}
      <section className="relative overflow-hidden border-t border-sand-200 bg-cocoa-800">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_78%_15%,rgba(168,130,60,0.20),transparent_68%)]"
        />
        <div className="relative mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sand-300">
            Why we stay open late
          </p>
          <h2 className="mt-3 font-display text-3xl leading-tight text-sand-50 sm:text-4xl">
            The city closes at six. <em className="italic text-gilt-500">We don&apos;t.</em>
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-sand-200">
            Most spas in Quezon City have locked up by the time you finish work. We take our
            last booking at {lastBookingLabel}, so a day that ran long can still end on a warm
            bed with the lights low.
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

      {/* -------------------------------------------------- testimonials */}
      {/* Absent entirely when there is nothing released — an empty "what guests
          say" heading above three blank cards says something worse than
          silence. */}
      {testimonials.length > 0 && (
        <section className="border-t border-sand-200 bg-sand-100">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
            <div className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cocoa-400">
                In their words
              </p>
              <h2 className="mt-3 font-display text-3xl text-cocoa-800 sm:text-4xl">
                What guests say
              </h2>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {testimonials.map((t) => (
                <figure key={t.id} className="card-pad">
                  <p aria-label={`${t.rating} out of 5`} className="tracking-[0.12em] text-gilt-500">
                    {'★'.repeat(t.rating)}
                    <span className="text-sand-300">{'★'.repeat(5 - t.rating)}</span>
                  </p>
                  <blockquote className="mt-3 font-display text-[15px] italic leading-relaxed text-cocoa-700">
                    &ldquo;{t.comment}&rdquo;
                  </blockquote>
                  <figcaption className="mt-3 text-xs text-cocoa-400">
                    {shortName(t.client.name)}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* --------------------------------------------------- about/visit */}
      <section id="visit" className="border-t border-sand-200 bg-sand-50">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl text-cocoa-800 sm:text-3xl">About ANICA</h2>
            <p className="mt-3 text-cocoa-600">
              ANICA Wellness Spa is a neighbourhood wellness spa in Quezon City. We keep it
              simple: skilled therapists, clean rooms, honest prices, and enough time to
              actually unwind. Whether you need an hour between shifts or a long evening
              reset, there&apos;s a slot for you — we&apos;re open until midnight, every day.
            </p>

            <dl className="mt-6 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-cocoa-700">Opening hours</dt>
                <dd className="text-cocoa-600">{hours}</dd>
              </div>
              <div>
                <dt className="font-semibold text-cocoa-700">Address</dt>
                <dd className="text-cocoa-600">{settings['business.address']}</dd>
              </div>
              <div>
                <dt className="font-semibold text-cocoa-700">Contact</dt>
                <dd className="text-cocoa-600">
                  {settings['business.contact']}
                  <br />
                  <a
                    className="underline underline-offset-4"
                    href={`mailto:${settings['business.email']}`}
                  >
                    {settings['business.email']}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-cocoa-700">Facebook</dt>
                <dd>
                  <a
                    className="text-cocoa-600 underline underline-offset-4"
                    href={settings['business.facebook']}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    facebook.com/ANICAWellnessSpa
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="font-display text-2xl text-cocoa-800 sm:text-3xl">Find us</h2>
            <div className="mt-3 aspect-video overflow-hidden rounded-2xl border border-sand-200 bg-sand-100">
              {mapUrl ? (
                <iframe
                  title="Map to ANICA Wellness Spa"
                  src={mapUrl}
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center text-sm text-cocoa-500">
                  <span className="text-3xl">📍</span>
                  <p className="font-medium">Map goes here</p>
                  <p className="text-xs">
                    Settings → Business → Map for the landing page. In Google Maps: Share →
                    Embed a map → Copy HTML.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------- sticky booking (mobile) */}
      {/* On a phone the header's "Book now" scrolls away within a screen and
          never returns, so the moment someone decides — halfway down the price
          list — there is nothing to tap. Desktop keeps the sticky header and
          does not need this. The padding below keeps the bar from covering the
          last line of the footer. */}
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

      {/* ------------------------------------------------------- footer */}
      <footer className="border-t border-sand-200 bg-sand-100">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-cocoa-500">
          <p>
            © {new Date().getFullYear()} {settings['business.name']} · {settings['business.address']}
          </p>
          {/*
            No staff door on the customer's page. Staff reach the system at /login
            directly — bookmarked, or through the installed app. This keeps the
            landing page for clients only; it does not make /login secret, and is
            not a substitute for strong passwords.
          */}
        </div>
      </footer>
    </div>
  );
}
