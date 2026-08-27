import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { requirePublicSite } from '@/lib/public-site';
import { fromPrice } from '@/lib/pricing';
import { formatPesoShort } from '@/lib/money';
import { addDays, manilaDateKey } from '@/lib/datetime';
import { appUrl } from '@/lib/app-url';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { SearchBar, FeatureRow, SectionHead, StayCard, Icon } from '@/components/site-ui';

export const dynamic = 'force-dynamic';

/**
 * The landing page. The test it has to pass: a stranger arriving on a phone
 * knows where it is, what makes it nice, roughly what it costs, and how to
 * book — without scrolling past the fold to find the date picker.
 *
 * The five things below the hero are deliberately not resort amenities. This
 * business has no pool and no spa, and a landing page that implies otherwise
 * is a complaint waiting at check-in. Each one names something the system
 * actually does, and each is provable: door codes really are issued at
 * check-in, turnovers really are photographed before a unit is called ready.
 */
export default async function Home() {
  await requirePublicSite();
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

  const cityList = branches.map((b) => b.city).filter((c, i, a) => a.indexOf(c) === i);

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
      <SiteHeader settings={s} active="home" />

      {/* --- hero -------------------------------------------------------- */}
      <section>
        <div
          className="hero-scrim flex min-h-[26rem] items-center bg-cover bg-center sm:min-h-[32rem]"
          style={{ backgroundImage: `linear-gradient(rgba(28,34,30,.34), rgba(28,34,30,.58)), url('${s['business.heroImage']}')` }}
        >
          <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-16 sm:pb-28">
            <div className="max-w-2xl text-white">
              <h1 className="display text-balance text-[2.5rem] leading-[1.05] drop-shadow-[0_2px_26px_rgba(0,0,0,0.42)] sm:text-[3.75rem]">
                {s['business.tagline']}
              </h1>
              <p className="mt-5 max-w-lg text-[0.9375rem] text-white/95 drop-shadow-[0_1px_14px_rgba(0,0,0,0.5)] sm:text-base">
                {s['business.intro']}
              </p>
              <Link href="/stays" className="btn-brand tracked mt-8">
                Discover our stays
              </Link>
            </div>
          </div>
        </div>

        <SearchBar
          floating
          today={today}
          defaultCheckIn={addDays(today, 7)}
          defaultCheckOut={addDays(today, 10)}
        />
      </section>

      <main>
        {/* --- what you get ---------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <SectionHead
            eyebrow="More than a bed"
            title="Everything you'd want a host to have already thought of"
          />
          <FeatureRow
            items={[
              {
                icon: Icon.direct({ size: 30 }),
                title: 'Book direct',
                body: "The same place, without the platform's cut on top.",
              },
              {
                icon: Icon.pin({ size: 30 }),
                title: cityList.length > 1 ? `${cityList.length} neighbourhoods` : 'Where you need to be',
                body: cityList.length ? `${cityList.join(', ')} — pick by where you need to be.` : 'Chosen for the street they are on, not just the flat.',
              },
              {
                icon: Icon.key({ size: 30 }),
                title: 'Self check-in',
                body: 'Your door code arrives the morning you land.',
              },
              {
                icon: Icon.checklist({ size: 30 }),
                title: 'Cleaned to a checklist',
                body: "Every turnover photographed before it's called ready.",
              },
              {
                icon: Icon.person({ size: 30 }),
                title: 'A person, not a queue',
                body: 'Someone who has stood in the room you booked.',
              },
            ]}
          />
        </section>

        {/* --- promos, only when one is live ------------------------------ */}
        {promos.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 pb-4">
            <div className="border-l-[3px] border-[color:var(--accent)] bg-[color:var(--color-sand-100)] px-6 py-5">
              {promos.map((p) => (
                <p key={p.id} className="text-sm sm:text-base">
                  <strong>{p.name}</strong> — {p.description || `Use code ${p.code}`}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* --- the places -------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <SectionHead eyebrow="Where you'll stay" title="Our stays" align="left" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {withPrices.map((p) => (
              <StayCard
                key={p.id}
                p={{
                  slug: p.slug,
                  name: p.name,
                  shortDescription: p.shortDescription,
                  city: p.city || p.branch.city,
                  maxGuests: p.maxGuests,
                  bedrooms: p.bedrooms,
                  bathrooms: p.bathrooms,
                  fromCents: p.fromCents,
                  photoUrl: p.photos[0]?.url,
                }}
              />
            ))}
          </div>
        </section>

        {/* --- reviews ---------------------------------------------------- */}
        {reviews.length > 0 && (
          <section className="border-y border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-100)]">
            <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
              <SectionHead
                eyebrow={`★ ${Number(ratings._avg.rating ?? 0).toFixed(1)} from ${ratings._count._all} stays`}
                title="What guests say"
              />
              <div className="grid gap-6 sm:grid-cols-3">
                {reviews.map((r) => (
                  <blockquote key={r.id} className="card p-6">
                    <p className="display text-lg leading-relaxed">“{r.body}”</p>
                    <footer className="mt-4 text-xs text-[color:var(--color-ink-500)]">
                      — {r.guestName || 'Guest'}, {r.property.name}
                    </footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* --- where ------------------------------------------------------ */}
        {branches.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <SectionHead eyebrow="Find us" title="Where we are" align="left" />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((b) => (
                <li key={b.id} className="card p-5">
                  <p className="display text-lg">{b.name}</p>
                  <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">
                    {b.city}
                    {b.province ? `, ${b.province}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --- FAQ -------------------------------------------------------- */}
        {faqs.length > 0 && (
          <section id="faq" className="mx-auto max-w-3xl px-5 pb-20">
            <SectionHead eyebrow="Before you book" title="Questions" />
            <div className="space-y-2.5">
              {faqs.map((f) => (
                <details key={f.id} className="card p-5">
                  <summary className="cursor-pointer font-medium">{f.question}</summary>
                  <p className="mt-3 text-sm text-[color:var(--color-ink-500)]">{f.answer}</p>
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
