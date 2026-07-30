import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { minutesToLabel } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const settings = await getSettings();

  const [categories, promos, packages] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: { sortRank: 'asc' },
      include: {
        services: {
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
  ]);

  const hours = `${minutesToLabel(settings['business.openMinute'])} – ${minutesToLabel(
    settings['business.closeMinute'],
  )} daily`;

  return (
    <div className="min-h-dvh bg-sand-50">
      {/* ---------------------------------------------------------- nav */}
      <header className="sticky top-0 z-40 border-b border-sand-200 bg-sand-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-moss-600 text-lg text-white">
              ✿
            </span>
            <span className="font-display text-base font-semibold text-moss-800">
              ANICA Wellness Spa
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#services" className="hidden px-3 py-2 text-moss-600 sm:block">
              Services
            </a>
            <a href="#visit" className="hidden px-3 py-2 text-moss-600 sm:block">
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
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-moss-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-moss-600">
              Quezon City · Open {hours}
            </p>
            <h1 className="font-display text-3xl font-semibold leading-tight text-moss-800 sm:text-5xl">
              {settings['business.tagline']}
            </h1>
            <p className="mt-4 max-w-md text-moss-600">
              Massage, body scrub, foot spa and sauna in the heart of Quezon City. Reserve
              your slot online in under a minute — pick your therapist, your room, and your
              time.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/book" className="btn-primary">
                Book your slot
              </Link>
              <a href="#services" className="btn-secondary">
                See services &amp; prices
              </a>
            </div>
            <p className="mt-4 text-xs text-moss-400">
              A {settings['booking.depositPercent']}% reservation fee secures your booking
              and is deducted from your final bill.
            </p>
          </div>

          {/* Photo placeholder — swap for a real image in /public */}
          <div className="relative aspect-4/3 overflow-hidden rounded-3xl border border-sand-200 bg-gradient-to-br from-moss-200 via-sand-200 to-sand-300">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-moss-700">
              <span className="text-5xl">✿</span>
              <p className="text-sm font-medium">Spa photo placeholder</p>
              <p className="px-6 text-center text-xs text-moss-600">
                Replace with a photo of your reception or treatment room
                (<code>/public/hero.jpg</code>).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ promos */}
      {promos.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-4">
          <h2 className="font-display text-xl font-semibold text-moss-800">
            What&apos;s on right now
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {promos.map((p) => (
              <div key={p.id} className="card-pad border-moss-200 bg-moss-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-moss-800">{p.name}</p>
                    <p className="muted mt-1">{p.description}</p>
                  </div>
                  <span className="badge bg-moss-600 text-white">
                    {p.type === 'PERCENT' ? `${p.value}% off` : `${formatPeso(p.value)} off`}
                  </span>
                </div>
                {p.code && (
                  <p className="mt-3 text-xs text-moss-500">
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
      <section id="services" className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="font-display text-2xl font-semibold text-moss-800">
          Services &amp; price list
        </h2>
        <p className="muted mt-1">
          All treatments are performed by trained therapists. Prices in Philippine pesos.
        </p>

        <div className="mt-6 space-y-8">
          {categories
            .filter((c) => c.services.length)
            .map((cat) => (
              <div key={cat.id}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-moss-500">
                  {cat.name}
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {cat.services.map((s) => (
                    <li
                      key={s.id}
                      className="card flex items-start justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-moss-800">{s.name}</p>
                        {s.description && (
                          <p className="mt-0.5 text-xs text-moss-500">{s.description}</p>
                        )}
                        <p className="mt-1 text-xs text-moss-400">{s.durationMinutes} minutes</p>
                      </div>
                      <p className="shrink-0 font-semibold num text-moss-700">
                        {formatPeso(s.priceCents)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>

        {packages.length > 0 && (
          <div className="mt-10">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-moss-500">
              Packages &amp; membership
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {packages.map((p) => (
                <div key={p.id} className="card-pad">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-moss-800">{p.name}</p>
                    <p className="shrink-0 font-semibold num text-moss-700">
                      {formatPeso(p.priceCents)}
                    </p>
                  </div>
                  <p className="muted mt-1">{p.description}</p>
                  <p className="mt-2 text-xs text-moss-400">
                    Valid for {Math.round(p.validityDays / 30)} months. Ask at reception to
                    avail.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link href="/book" className="btn-primary">
            Book now
          </Link>
        </div>
      </section>

      {/* --------------------------------------------------- about/visit */}
      <section id="visit" className="border-t border-sand-200 bg-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-semibold text-moss-800">
              About ANICA
            </h2>
            <p className="mt-3 text-moss-600">
              ANICA Wellness Spa is a neighbourhood wellness spa in Quezon City. We keep it
              simple: skilled therapists, clean rooms, honest prices, and enough time to
              actually unwind. Whether you need an hour between shifts or a long evening
              reset, there&apos;s a slot for you — we&apos;re open until midnight, every day.
            </p>

            <dl className="mt-6 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-moss-700">Opening hours</dt>
                <dd className="text-moss-600">{hours}</dd>
              </div>
              <div>
                <dt className="font-semibold text-moss-700">Address</dt>
                <dd className="text-moss-600">{settings['business.address']}</dd>
              </div>
              <div>
                <dt className="font-semibold text-moss-700">Contact</dt>
                <dd className="text-moss-600">
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
                <dt className="font-semibold text-moss-700">Facebook</dt>
                <dd>
                  <a
                    className="text-moss-600 underline underline-offset-4"
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
            <h2 className="font-display text-2xl font-semibold text-moss-800">Find us</h2>
            <div className="mt-3 aspect-video overflow-hidden rounded-2xl border border-sand-200 bg-sand-100">
              {settings['business.mapEmbedUrl'] ? (
                <iframe
                  title="Map to ANICA Wellness Spa"
                  src={settings['business.mapEmbedUrl']}
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center text-sm text-moss-500">
                  <span className="text-3xl">📍</span>
                  <p className="font-medium">Map embed placeholder</p>
                  <p className="text-xs">
                    Paste a Google Maps embed URL in Settings → Business profile.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- footer */}
      <footer className="border-t border-sand-200 bg-sand-100">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-moss-500">
          <p>
            © {new Date().getFullYear()} {settings['business.name']} · {settings['business.address']}
          </p>
          <Link href="/login" className="underline underline-offset-4">
            Staff sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
