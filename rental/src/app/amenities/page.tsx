import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { requirePublicSite } from '@/lib/public-site';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PageHero } from '@/components/site-ui';

export const metadata = { title: 'Amenities' };
export const dynamic = 'force-dynamic';

/**
 * What's in each place, grouped by category.
 *
 * This page writes itself: it is the amenities already recorded against each
 * property in the portal, so it cannot drift from what a guest actually finds.
 * The alternative — a hand-written list — is the sort of page that still
 * promises a coffee machine two years after it broke.
 *
 * A guest's real question is not "do you have wifi" but "does the one I am
 * looking at have wifi", so every amenity names the places that have it, and
 * the ones every place has are marked as such.
 */
export default async function AmenitiesPage() {
  await requirePublicSite();
  const settings = await getSettings();

  const [amenities, activeCount] = await Promise.all([
    prisma.amenity.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        properties: {
          where: { property: { status: 'ACTIVE' } },
          include: { property: { select: { name: true, slug: true } } },
        },
      },
    }),
    prisma.property.count({ where: { status: 'ACTIVE' } }),
  ]);

  // An amenity nobody offers is portal bookkeeping, not something to advertise.
  const offered = amenities.filter((a) => a.properties.length > 0);

  const categories = [...new Set(offered.map((a) => a.category || 'General'))].sort();

  return (
    <>
      <SiteHeader settings={settings} active="amenities" />

      <PageHero
        eyebrow="What's inside"
        title="The things that make a stay easy"
        intro="Everything below is recorded against a specific place, so this list is what our team actually checks on turnover — not a wish list."
      />

      <main className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        {offered.length === 0 ? (
          <p className="text-[color:var(--color-ink-500)]">
            We&rsquo;re still writing this one up.{' '}
            <Link href="/stays" className="underline">
              Each place&rsquo;s own page
            </Link>{' '}
            lists what it comes with.
          </p>
        ) : (
          <div className="space-y-14">
            {categories.map((cat) => (
              <section key={cat}>
                <h2 className="display mb-6 border-b border-[color:var(--color-sand-200)] pb-3 text-2xl">
                  {cat}
                </h2>
                <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                  {offered
                    .filter((a) => (a.category || 'General') === cat)
                    .map((a) => {
                      const everywhere = a.properties.length === activeCount && activeCount > 0;
                      return (
                        <li key={a.id} className="border-l-2 border-[color:var(--accent)] pl-4">
                          <p className="font-medium">{a.name}</p>
                          <p className="mt-0.5 text-[0.8125rem] text-[color:var(--color-ink-500)]">
                            {everywhere ? (
                              'In every one of our places'
                            ) : (
                              <>
                                {a.properties.map((pa, i) => (
                                  <span key={pa.propertyId}>
                                    {i > 0 && ', '}
                                    <Link href={`/stays/${pa.property.slug}`} className="hover:underline">
                                      {pa.property.name}
                                    </Link>
                                  </span>
                                ))}
                              </>
                            )}
                          </p>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-16 border-t border-[color:var(--color-sand-200)] pt-8 text-sm text-[color:var(--color-ink-500)]">
          Need something that isn&rsquo;t here — a cot, an early check-in, a desk for a working week?{' '}
          <Link href="/contact" className="font-medium text-[color:var(--color-clay-600)] underline">
            Ask us
          </Link>
          . Most of it we can arrange.
        </p>
      </main>

      <SiteFooter settings={settings} />
    </>
  );
}
