import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { requirePublicSite } from '@/lib/public-site';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PageHero, Icon } from '@/components/site-ui';

export const metadata = { title: 'Experiences' };
export const dynamic = 'force-dynamic';

/**
 * What to do once you've dropped your bag.
 *
 * Built from `nearbyAttractions`, `transportNotes` and `parkingNotes` — three
 * fields already filled in per property and already shown on each stay's own
 * page. Grouping them by area turns three scattered paragraphs into the page
 * a guest actually wants: not "what is in the flat" but "what is around it".
 *
 * This is the one thing a direct site can do that a listing platform cannot.
 * Airbnb will not tell someone which place in Malolos does the good pancit.
 *
 * Areas with nothing written are skipped rather than rendered empty — a
 * heading over blank space reads as neglect, and it is better to show two
 * good areas than three with one hollow.
 */
export default async function ExperiencesPage() {
  await requirePublicSite();
  const settings = await getSettings();

  const branches = await prisma.branch.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      properties: {
        where: { status: 'ACTIVE' },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          nearbyAttractions: true,
          transportNotes: true,
          parkingNotes: true,
        },
      },
    },
  });

  const areas = branches
    .map((b) => ({
      ...b,
      properties: b.properties.filter(
        (p) => p.nearbyAttractions.trim() || p.transportNotes.trim() || p.parkingNotes.trim(),
      ),
    }))
    .filter((b) => b.properties.length > 0);

  return (
    <>
      <SiteHeader settings={settings} active="experiences" />

      <PageHero
        eyebrow="Beyond the front door"
        title="What's worth doing, from where you're staying"
        intro="Written by the people who look after each place, about the streets they actually walk. Not a list of the city's top ten."
      />

      <main className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        {areas.length === 0 ? (
          <div className="card mx-auto max-w-xl p-8 text-center">
            <p className="display text-xl">We&rsquo;re still writing these up.</p>
            <p className="mt-3 text-sm text-[color:var(--color-ink-500)]">
              In the meantime, ask us what&rsquo;s good near the place you&rsquo;re booking — we&rsquo;ll
              tell you honestly, including when the answer is &ldquo;order in&rdquo;.
            </p>
            <Link href="/contact" className="btn-brand tracked mt-6">
              Ask us
            </Link>
          </div>
        ) : (
          <div className="space-y-16">
            {areas.map((area) => (
              <section key={area.id}>
                <div className="mb-8 flex items-baseline gap-3 border-b border-[color:var(--color-sand-200)] pb-3">
                  <h2 className="display text-[1.75rem]">{area.name}</h2>
                  <p className="text-sm text-[color:var(--color-ink-500)]">
                    {area.city}
                    {area.province ? `, ${area.province}` : ''}
                  </p>
                </div>

                <div className="grid gap-8 lg:grid-cols-2">
                  {area.properties.map((p) => (
                    <article key={p.id} className="card p-6">
                      <p className="eyebrow mb-2">From</p>
                      <h3 className="display mb-5 text-xl">
                        <Link href={`/stays/${p.slug}`} className="hover:underline">
                          {p.name}
                        </Link>
                      </h3>

                      {p.nearbyAttractions.trim() && (
                        <div className="mb-5">
                          <p className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                            <span className="text-[color:var(--color-clay-600)]">{Icon.pin({ size: 18 })}</span>
                            Nearby
                          </p>
                          <p className="whitespace-pre-line text-sm leading-relaxed text-[color:var(--color-ink-700)]">
                            {p.nearbyAttractions}
                          </p>
                        </div>
                      )}

                      {p.transportNotes.trim() && (
                        <div className="mb-5">
                          <p className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                            <span className="text-[color:var(--color-clay-600)]">{Icon.direct({ size: 18 })}</span>
                            Getting around
                          </p>
                          <p className="whitespace-pre-line text-sm leading-relaxed text-[color:var(--color-ink-700)]">
                            {p.transportNotes}
                          </p>
                        </div>
                      )}

                      {p.parkingNotes.trim() && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                            <span className="text-[color:var(--color-clay-600)]">{Icon.key({ size: 18 })}</span>
                            Parking
                          </p>
                          <p className="whitespace-pre-line text-sm leading-relaxed text-[color:var(--color-ink-700)]">
                            {p.parkingNotes}
                          </p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <SiteFooter settings={settings} />
    </>
  );
}
