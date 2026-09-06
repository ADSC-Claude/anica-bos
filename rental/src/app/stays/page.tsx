import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { requirePublicSite } from '@/lib/public-site';
import { fromPrice } from '@/lib/pricing';
import { addDays, manilaDateKey } from '@/lib/datetime';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PageHero, SearchBar, StayCard } from '@/components/site-ui';

export const metadata = { title: 'Our stays' };
export const dynamic = 'force-dynamic';

export default async function StaysPage() {
  await requirePublicSite();
  const settings = await getSettings();
  const today = manilaDateKey();

  const properties = await prisma.property.findMany({
    where: { status: 'ACTIVE' },
    include: {
      photos: { orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      branch: { select: { name: true, city: true } },
    },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
  });

  const withPrices = await Promise.all(
    properties.map(async (p) => ({ ...p, fromCents: await fromPrice(p.id) })),
  );

  return (
    <>
      <SiteHeader settings={settings} active="stays" />

      <PageHero eyebrow="Where you'll stay" title="All our places" intro={settings['business.intro']} />

      <main className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <div className="mb-12">
          <SearchBar
            today={today}
            defaultCheckIn={addDays(today, 7)}
            defaultCheckOut={addDays(today, 10)}
          />
        </div>

        {withPrices.length === 0 ? (
          <p className="text-[color:var(--color-ink-500)]">
            Nothing is listed just yet. Do check back, or drop us a line.
          </p>
        ) : (
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
        )}
      </main>

      <SiteFooter settings={settings} />
    </>
  );
}
