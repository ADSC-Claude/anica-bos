import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { requirePublicSite } from '@/lib/public-site';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PageHero } from '@/components/site-ui';

export const metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

/**
 * Every photograph we have, in one place.
 *
 * The filter is a link with a query parameter rather than a JavaScript tab
 * strip: each view gets its own URL that can be sent to someone, the back
 * button does what it should, and the page works before the bundle lands.
 *
 * Photos carry a caption when one was written and fall back to the property
 * name — an `alt` of "" on a photograph of the room someone is deciding to
 * book is not a decorative image, it is the content.
 */
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ stay?: string }>;
}) {
  await requirePublicSite();
  const settings = await getSettings();
  const { stay } = await searchParams;

  const properties = await prisma.property.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true, name: true, slug: true, city: true, _count: { select: { photos: true } } },
  });

  const selected = stay && properties.some((p) => p.slug === stay) ? stay : null;

  const photos = await prisma.propertyPhoto.findMany({
    where: {
      property: { status: 'ACTIVE', ...(selected ? { slug: selected } : {}) },
    },
    orderBy: [{ propertyId: 'asc' }, { isCover: 'desc' }, { sortOrder: 'asc' }],
    include: { property: { select: { name: true, slug: true } } },
  });

  const chip = 'rounded-full border px-4 py-2 text-sm transition-colors';
  const chipOn = `${chip} border-[color:var(--color-clay-600)] bg-[color:var(--color-clay-600)] text-white`;
  const chipOff = `${chip} border-[color:var(--color-sand-300)] hover:bg-[color:var(--color-sand-100)]`;

  return (
    <>
      <SiteHeader settings={settings} active="gallery" />

      <PageHero
        eyebrow="Have a look"
        title="Every room, as it actually is"
        intro="Photographed on ordinary days, not staged for a listing. If something has changed since, tell us and we'll reshoot it."
      />

      <main className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        {properties.length > 1 && (
          <nav aria-label="Filter by stay" className="mb-10 flex flex-wrap gap-2.5">
            <Link href="/gallery" className={selected ? chipOff : chipOn} aria-current={selected ? undefined : 'true'}>
              Everything
            </Link>
            {properties
              .filter((p) => p._count.photos > 0)
              .map((p) => (
                <Link
                  key={p.id}
                  href={`/gallery?stay=${p.slug}`}
                  className={selected === p.slug ? chipOn : chipOff}
                  aria-current={selected === p.slug ? 'true' : undefined}
                >
                  {p.name}
                </Link>
              ))}
          </nav>
        )}

        {photos.length === 0 ? (
          <div className="card mx-auto max-w-xl p-8 text-center">
            <p className="display text-xl">No photographs here yet.</p>
            <p className="mt-3 text-sm text-[color:var(--color-ink-500)]">
              {selected
                ? 'This one has not been shot yet. The other places have photos.'
                : 'We are shooting these now. In the meantime, each place has a full description.'}
            </p>
            <Link href="/stays" className="btn-brand tracked mt-6">
              See our stays
            </Link>
          </div>
        ) : (
          <>
            {/* A masonry-ish grid: the first of each property is given double
                width so the eye has somewhere to land between places. */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {photos.map((ph, i) => (
                <Link
                  key={ph.id}
                  href={`/stays/${ph.property.slug}`}
                  className={`group relative block overflow-hidden bg-[color:var(--color-sand-200)] ${
                    ph.isCover ? 'col-span-2 row-span-2' : ''
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ph.url}
                    alt={ph.caption || `${ph.property.name} — photograph ${i + 1}`}
                    loading={i < 4 ? 'eager' : 'lazy'}
                    className={`w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
                      ph.isCover ? 'aspect-square' : 'aspect-[4/3]'
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-3 pt-8 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {ph.caption || ph.property.name}
                  </span>
                </Link>
              ))}
            </div>

            <p className="mt-8 text-sm text-[color:var(--color-ink-500)]">
              {photos.length} photograph{photos.length === 1 ? '' : 's'}
              {selected ? ` of ${properties.find((p) => p.slug === selected)?.name}` : ' across all our places'}.
              Tap any one to see the stay it belongs to.
            </p>
          </>
        )}
      </main>

      <SiteFooter settings={settings} />
    </>
  );
}
