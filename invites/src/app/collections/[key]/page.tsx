import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { galleryWithPeeks } from '@/lib/peek';
import { collectionsPresent, COLLECTION_BY_KEY } from '@/lib/collections';
import { PREMIUM_OPENING_CODE } from '@/lib/openings';
import { formatPesoShort } from '@/lib/money';
import { occasionLabel } from '@/lib/occasions';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { TemplateGallery } from '@/components/landing/gallery';
import { BackArrow } from '@/components/back';

export const dynamic = 'force-dynamic';

/** Only collections that actually have a published design are pages. */
async function load(key: string) {
  const info = COLLECTION_BY_KEY[key];
  if (!info) return null;
  const templates = await prisma.template.findMany({
    where: { collection: key, published: true },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
  });
  if (templates.length === 0) return null;
  return { info, templates };
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const info = COLLECTION_BY_KEY[key];
  if (!info) return { title: 'Collection' };
  return { title: info.label, description: info.tagline };
}

export default async function CollectionPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [s, session, found, premium] = await Promise.all([getSettings(), getSession(), load(key), prisma.addOn.findFirst({ where: { code: PREMIUM_OPENING_CODE, active: true } })]);
  if (!found) notFound();
  const { info, templates } = found;
  // The designs here with a premium opening clip of their own to add on.
  const withClip = templates.filter((t) => t.openingVideoUrl && t.openingPosterUrl);
  const occasions = [...new Set(templates.map((t) => t.occasion))];
  // Only collections that have a design of their own — a link to an empty one
  // would 404.
  const others = collectionsPresent((await prisma.template.findMany({ where: { published: true }, select: { collection: true } })).map((t) => t.collection)).filter((c) => c.key !== key);

  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <BackArrow href="/templates" label="All designs" />
        <p className="eyebrow mt-4">Collection</p>
        <h1 className="display mt-1 flex flex-wrap items-center gap-3 text-4xl">
          {info.label}
          <span className="flex gap-1">
            {info.swatch.map((hex) => <span key={hex} className="h-4 w-4 rounded-full border border-black/10" style={{ background: hex }} />)}
          </span>
        </h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-ink-700)]">{info.tagline}</p>
        <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">
          {templates.length} design{templates.length === 1 ? '' : 's'} · {occasions.map(occasionLabel).join(', ')}
        </p>

        <section className="mt-10">
          <h2 className="display text-2xl">The opening</h2>
          <p className="mt-1 max-w-2xl text-[color:var(--color-ink-700)]">
            Every package opens with The Letter: a sealed envelope your guest taps once, a card that says you are invited, then the invitation underneath.
            {withClip.length > 0 && ` The premium opening video, made for ${withClip.map((t) => t.name).join(' and ')}, is an add-on${premium ? ` at ${formatPesoShort(premium.priceCents)}` : ''} — a seal breaking, a card sliding out with your names on it.`}
          </p>
        </section>

        <section className="mt-12">
          <h2 className="display text-2xl">The designs</h2>
          <div className="mt-5">
            <TemplateGallery collection={key} templates={await galleryWithPeeks(templates)} premiumPriceCents={premium?.priceCents} />
          </div>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id} className="text-sm text-[color:var(--color-ink-700)]">
                <b>{t.name}</b> — {t.description}
              </li>
            ))}
          </ul>
        </section>

        {others.length > 0 && (
        <p className="mt-12 text-sm text-[color:var(--color-ink-500)]">
          Other collections: {others.map((c, i) => (
            <span key={c.key}>
              {i > 0 && ' · '}
              <Link href={`/collections/${c.key}`} className="hover:underline">{c.label}</Link>
            </span>
          ))}
        </p>
        )}
      </main>
      <SiteFooter s={s} />
      <FloatingContact s={s} />
    </>
  );
}
