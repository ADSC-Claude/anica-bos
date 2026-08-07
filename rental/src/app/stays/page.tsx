import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fromPrice } from '@/lib/pricing';
import { formatPesoShort } from '@/lib/money';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';

export const metadata = { title: 'All stays' };
export const dynamic = 'force-dynamic';

export default async function StaysPage() {
  const settings = await getSettings();
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
      <SiteHeader settings={settings} />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="display mb-1 text-3xl font-bold">All our places</h1>
        <p className="mb-8 text-sm text-[color:var(--color-ink-500)]">{settings['business.intro']}</p>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {withPrices.map((p) => (
            <Link key={p.id} href={`/stays/${p.slug}`} className="card overflow-hidden hover:shadow-md">
              <div
                className="h-44 bg-[color:var(--color-sand-200)] bg-cover bg-center"
                style={p.photos[0] ? { backgroundImage: `url('${p.photos[0].url}')` } : undefined}
              />
              <div className="p-4">
                <h2 className="font-semibold">{p.name}</h2>
                <p className="text-xs text-[color:var(--color-ink-500)]">
                  {p.city || p.branch.city} · sleeps {p.maxGuests}
                </p>
                <p className="mt-2 text-sm">{p.shortDescription}</p>
                <p className="mt-3 font-bold">from {formatPesoShort(p.fromCents)} / night</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
