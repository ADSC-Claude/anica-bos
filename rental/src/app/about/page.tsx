import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PageHero, SectionHead, FeatureRow, Icon } from '@/components/site-ui';

export const metadata = { title: 'About us' };
export const dynamic = 'force-dynamic';

/**
 * Who runs this.
 *
 * The numbers are counted, not claimed. A page that says "hundreds of happy
 * guests" over an empty database is the kind of thing a guest checks and then
 * stops trusting the rest of the page — so anything with no evidence behind it
 * simply doesn't render.
 */
export default async function AboutPage() {
  const settings = await getSettings();

  const [propertyCount, branches, ratings, completedStays] = await Promise.all([
    prisma.property.count({ where: { status: 'ACTIVE' } }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.review.aggregate({
      where: { published: true },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.reservation.count({ where: { status: 'COMPLETED' } }),
  ]);

  const stats = [
    propertyCount > 0 && { value: String(propertyCount), label: propertyCount === 1 ? 'place to stay' : 'places to stay' },
    branches.length > 0 && {
      value: String(branches.length),
      label: branches.length === 1 ? 'neighbourhood' : 'neighbourhoods',
    },
    completedStays > 0 && { value: String(completedStays), label: 'stays completed' },
    ratings._count._all > 0 && {
      value: Number(ratings._avg.rating ?? 0).toFixed(1),
      label: `average of ${ratings._count._all} review${ratings._count._all === 1 ? '' : 's'}`,
    },
  ].filter(Boolean) as { value: string; label: string }[];

  return (
    <>
      <SiteHeader settings={settings} active="about" />

      <PageHero
        eyebrow="About us"
        title={settings['business.tagline']}
        intro={settings['business.intro']}
      />

      <main>
        {stats.length > 0 && (
          <section className="border-b border-[color:var(--color-sand-200)]">
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-5 py-12 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="px-4 text-center">
                  <p className="display text-4xl text-[color:var(--color-clay-600)] tabular-nums">{s.value}</p>
                  <p className="mt-1 text-[0.8125rem] text-[color:var(--color-ink-500)]">{s.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
          <SectionHead eyebrow="Why we do it this way" title="A small business, run like one" align="left" />
          <div className="space-y-5 text-[color:var(--color-ink-700)]">
            <p className="whitespace-pre-line">{settings['business.story']}</p>
          </div>
        </section>

        <section className="border-y border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-100)]">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <SectionHead
              eyebrow="How we work"
              title="What we promise, and how you can check"
              intro="Four things we hold ourselves to. Each one is something our own system enforces, not a slogan."
            />
            <FeatureRow
              items={[
                {
                  icon: Icon.checklist({ size: 30 }),
                  title: 'Nothing is ready until it is',
                  body: 'A unit cannot be marked ready while any cleaning or inspection is still open.',
                },
                {
                  icon: Icon.camera({ size: 30 }),
                  title: 'Turnovers are photographed',
                  body: 'The cleaner cannot tick an item without the photo it asks for.',
                },
                {
                  icon: Icon.direct({ size: 30 }),
                  title: 'The price is the price',
                  body: 'Every booking shows a full breakdown before you pay. No fee appears later.',
                },
                {
                  icon: Icon.key({ size: 30 }),
                  title: 'Your codes are yours',
                  body: 'Door codes and wifi are released to you at check-in and never leave our system.',
                },
                {
                  icon: Icon.person({ size: 30 }),
                  title: 'You get a name',
                  body: 'Every stay has someone responsible for it who you can reach directly.',
                },
              ]}
            />
          </div>
        </section>

        {branches.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <SectionHead eyebrow="Find us" title="Where we operate" align="left" />
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

        <section className="border-t border-[color:var(--color-sand-200)]">
          <div className="mx-auto max-w-3xl px-5 py-16 text-center sm:py-20">
            <h2 className="display text-balance text-[1.75rem] leading-tight sm:text-[2.125rem]">
              Come and see for yourself.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[color:var(--color-ink-500)]">
              {settings['booking.cancellationPolicy']}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/stays" className="btn-brand tracked">
                See our stays
              </Link>
              <Link
                href="/contact"
                className="tracked inline-flex items-center justify-center border border-[color:var(--color-sand-300)] px-7 py-[0.95rem] hover:bg-[color:var(--color-sand-100)]"
              >
                Talk to us
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter settings={settings} />
    </>
  );
}
