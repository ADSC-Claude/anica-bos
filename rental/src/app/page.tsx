import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fromPrice } from '@/lib/pricing';
import { formatPesoShort } from '@/lib/money';
import { addDays, manilaDateKey } from '@/lib/datetime';
import { appUrl } from '@/lib/app-url';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';

export const dynamic = 'force-dynamic';

/**
 * The landing page. The test it has to pass: a stranger arriving on a phone
 * knows where it is, what makes it nice, roughly what it costs, and how to
 * book — without scrolling past the fold to find the date picker.
 */
export default async function Home() {
  const s = await getSettings();
  const today = manilaDateKey();

  const [properties, reviews, faqs, promos, branches] = await Promise.all([
    prisma.property.findMany({
      where: { status: 'ACTIVE' },
      include: {
        photos: { orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 1 },
        branch: { select: { name: true, city: true } },
        amenities: { include: { amenity: true }, where: { highlight: true }, take: 4 },
      },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
    }),
    prisma.review.findMany({
      where: { published: true },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      include: { property: { select: { name: true } } },
    }),
    prisma.propertyFaq.findMany({
      where: { propertyId: null, active: true },
      orderBy: { sortOrder: 'asc' },
      take: 4,
    }),
    prisma.promotion.findMany({ where: { active: true, autoApply: true }, take: 2 }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const withPrices = await Promise.all(
    properties.map(async (p) => ({ ...p, fromCents: await fromPrice(p.id) })),
  );

  const ratings = await prisma.review.aggregate({
    where: { published: true },
    _avg: { rating: true },
    _count: { _all: true },
  });

  // schema.org so a stay shows up properly in search results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': withPrices.map((p) => ({
      '@type': 'VacationRental',
      name: p.name,
      description: p.shortDescription,
      url: `${appUrl()}/stays/${p.slug}`,
      image: p.photos[0]?.url ? `${appUrl()}${p.photos[0].url}` : undefined,
      address: {
        '@type': 'PostalAddress',
        addressLocality: p.city || p.branch.city,
        addressRegion: p.province,
        addressCountry: 'PH',
      },
      numberOfRooms: p.bedrooms,
      occupancy: { '@type': 'QuantitativeValue', maxValue: p.maxGuests },
      priceRange: `${formatPesoShort(p.fromCents)}+`,
      ...(ratings._count._all > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(ratings._avg.rating ?? 0).toFixed(1),
              reviewCount: ratings._count._all,
            },
          }
        : {}),
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader settings={s} overlay />

      {/* --- hero, with the search widget above the fold ------------------ */}
      <section className="relative isolate">
        <div
          className="h-[62vh] min-h-[420px] w-full bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(rgba(36,29,23,.42), rgba(36,29,23,.52)), url('${s['business.heroImage']}')`,
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center text-white">
          <h1 className="display max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">
            {s['business.tagline']}
          </h1>
          <p className="mt-3 max-w-xl text-sm sm:text-base">{s['business.intro']}</p>
        </div>

        <form
          action="/book"
          className="card mx-auto -mt-10 grid max-w-3xl gap-3 p-4 shadow-lg sm:grid-cols-4 sm:-mt-8"
          style={{ position: 'relative', width: 'calc(100% - 2rem)' }}
        >
          <label className="block">
            <span className="label">Check in</span>
            <input className="field" type="date" name="checkIn" defaultValue={addDays(today, 7)} min={today} required />
          </label>
          <label className="block">
            <span className="label">Check out</span>
            <input className="field" type="date" name="checkOut" defaultValue={addDays(today, 10)} min={today} required />
          </label>
          <label className="block">
            <span className="label">Guests</span>
            <select className="field" name="adults" defaultValue="2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} guest{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="btn btn-primary w-full" type="submit">
              Search stays
            </button>
          </div>
        </form>
      </section>

      <main className="mx-auto max-w-5xl px-5 py-12">
        {/* --- why direct ------------------------------------------------- */}
        <section className="mb-14 text-center">
          <h2 className="display text-2xl font-bold">Book direct and keep the difference</h2>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <li className="card p-4">
              <strong>Best rate, guaranteed.</strong>
              <p className="mt-1 text-[color:var(--color-ink-500)]">
                The same place, without the platform's cut on top.
              </p>
            </li>
            <li className="card p-4">
              <strong>No platform fees.</strong>
              <p className="mt-1 text-[color:var(--color-ink-500)]">
                What you see in the breakdown is what you pay.
              </p>
            </li>
            <li className="card p-4">
              <strong>You talk to us.</strong>
              <p className="mt-1 text-[color:var(--color-ink-500)]">
                A person who knows the flat, not a call centre.
              </p>
            </li>
          </ul>
        </section>

        {/* --- promos, only when one is live ------------------------------ */}
        {promos.length > 0 && (
          <section className="mb-14 rounded-xl bg-[color:var(--color-clay-600)] p-5 text-center text-white">
            {promos.map((p) => (
              <p key={p.id} className="text-sm sm:text-base">
                <strong>{p.name}</strong> — {p.description || `Use code ${p.code}`}
              </p>
            ))}
          </section>
        )}

        {/* --- the places -------------------------------------------------- */}
        <section className="mb-14">
          <h2 className="display mb-5 text-2xl font-bold">Our places</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {withPrices.map((p) => (
              <Link key={p.id} href={`/stays/${p.slug}`} className="card overflow-hidden hover:shadow-md">
                <div
                  className="h-44 w-full bg-cover bg-center bg-[color:var(--color-sand-200)]"
                  style={p.photos[0] ? { backgroundImage: `url('${p.photos[0].url}')` } : undefined}
                />
                <div className="p-4">
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="text-xs text-[color:var(--color-ink-500)]">
                    {p.city || p.branch.city} · sleeps {p.maxGuests} · {p.bedrooms} bed
                    {p.bedrooms === 1 ? '' : 's'} · {p.bathrooms} bath
                  </p>
                  <p className="mt-2 text-sm">{p.shortDescription}</p>
                  <p className="mt-3 font-bold">
                    from {formatPesoShort(p.fromCents)}
                    <span className="text-xs font-normal text-[color:var(--color-ink-500)]"> / night</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* --- reviews ---------------------------------------------------- */}
        {reviews.length > 0 && (
          <section className="mb-14">
            <h2 className="display mb-1 text-2xl font-bold">What guests say</h2>
            <p className="mb-5 text-sm text-[color:var(--color-ink-500)]">
              ★ {Number(ratings._avg.rating ?? 0).toFixed(1)} from {ratings._count._all} stays
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {reviews.map((r) => (
                <blockquote key={r.id} className="card p-4 text-sm">
                  <p className="italic">“{r.body}”</p>
                  <footer className="mt-2 text-xs text-[color:var(--color-ink-500)]">
                    — {r.guestName || 'Guest'}, {r.property.name}
                  </footer>
                </blockquote>
              ))}
            </div>
          </section>
        )}

        {/* --- where ------------------------------------------------------ */}
        <section className="mb-14">
          <h2 className="display mb-3 text-2xl font-bold">Where we are</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {branches.map((b) => (
              <li key={b.id} className="card p-4">
                <strong>{b.name}</strong>
                <p className="text-sm text-[color:var(--color-ink-500)]">
                  {b.city}
                  {b.province ? `, ${b.province}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* --- FAQ -------------------------------------------------------- */}
        {faqs.length > 0 && (
          <section className="mb-4">
            <h2 className="display mb-3 text-2xl font-bold">Questions</h2>
            <div className="space-y-2">
              {faqs.map((f) => (
                <details key={f.id} className="card p-4">
                  <summary className="cursor-pointer font-medium">{f.question}</summary>
                  <p className="mt-2 text-sm text-[color:var(--color-ink-500)]">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter settings={s} />
    </>
  );
}
