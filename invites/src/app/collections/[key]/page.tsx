import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toGalleryTemplate } from '@/lib/gallery';
import { collectionsPresent, COLLECTION_BY_KEY } from '@/lib/collections';
import { OPENINGS, OPENING_BY_KEY } from '@/lib/openings';
import { TIER_LABELS } from '@/lib/tiers';
import { occasionLabel } from '@/lib/occasions';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { TemplateGallery } from '@/components/landing/gallery';

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
  const [s, session, found] = await Promise.all([getSettings(), getSession(), load(key)]);
  if (!found) notFound();
  const { info, templates } = found;
  // The openings these designs actually ship with, in catalogue order — the
  // couple is choosing a first impression as much as a colour.
  const openings = OPENINGS.filter((o) => templates.some((t) => t.opening === o.key));
  const occasions = [...new Set(templates.map((t) => t.occasion))];
  // Only collections that have a design of their own — a link to an empty one
  // would 404.
  const others = collectionsPresent((await prisma.template.findMany({ where: { published: true }, select: { collection: true } })).map((t) => t.collection)).filter((c) => c.key !== key);

  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <p className="eyebrow">
          <Link href="/templates" className="hover:underline">Templates</Link> · Collection
        </p>
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

        {openings.length > 0 && (
          <section className="mt-10">
            <h2 className="display text-2xl">The openings</h2>
            <p className="mt-1 max-w-2xl text-[color:var(--color-ink-700)]">
              Every design in this collection starts with a short moving scene. Your guest taps once, it plays, and the invitation is underneath. It is drawn from your own words and photos, so it opens as fast as the page does — there is no video to wait for.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {openings.map((o) => (
                <article key={o.key} className="card p-4">
                  <p className="display text-xl">{o.name}</p>
                  <p className="mt-1 text-sm italic text-[color:var(--color-ink-500)]">{o.tagline}</p>
                  <p className="mt-2 text-sm text-[color:var(--color-ink-700)]">{o.description}</p>
                  <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">
                    {o.minTier === 'BASIC' ? 'Included in every package' : `${TIER_LABELS[o.minTier]} and up`}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <h2 className="display text-2xl">The designs</h2>
          <div className="mt-5">
            <TemplateGallery collection={key} templates={templates.map(toGalleryTemplate)} />
          </div>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id} className="text-sm text-[color:var(--color-ink-700)]">
                <b>{t.name}</b> — {t.description}
                {t.opening && ` Opens with ${OPENING_BY_KEY[t.opening as keyof typeof OPENING_BY_KEY]?.name ?? t.opening}.`}
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
