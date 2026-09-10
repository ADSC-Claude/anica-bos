import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { Occasion } from '@prisma/client';
import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { galleryWithPeeks } from '@/lib/peek';
import { collectionsPresent } from '@/lib/collections';
import { OCCASION_BY_KEY, OCCASIONS, isOccasion, offeredFor, templateOccasions } from '@/lib/occasions';
import { PREMIUM_OPENING_CODE } from '@/lib/openings';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { TemplateGallery } from '@/components/landing/gallery';
import { BackArrow } from '@/components/back';

export const dynamic = 'force-dynamic';

/** Only occasions that actually have a published design are pages. */
async function load(key: string) {
  if (!isOccasion(key)) return null;
  const info = OCCASION_BY_KEY[key];
  const templates = await prisma.template.findMany({
    where: { published: true, ...offeredFor(key) },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
  });
  if (templates.length === 0) return null;
  return { key, info, templates };
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const info = isOccasion(key) ? OCCASION_BY_KEY[key] : undefined;
  if (!info) return { title: 'Occasion' };
  return { title: `${info.label} designs`, description: info.blurb };
}

/**
 * One occasion, its designs grouped by category: each collection that has a
 * design offered for this occasion gets its own section with its swatches
 * and line, and designs in no collection close the page. The gallery is
 * scoped to the occasion, so the checkout opens on it.
 */
export default async function OccasionPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [s, session, found, premium, all] = await Promise.all([
    getSettings(),
    getSession(),
    load(key),
    prisma.addOn.findFirst({ where: { code: PREMIUM_OPENING_CODE, active: true } }),
    prisma.template.findMany({ where: { published: true }, select: { occasion: true, occasions: true } }),
  ]);
  if (!found) notFound();
  const { info, templates } = found;
  const occasion = found.key as Occasion;
  const categories = collectionsPresent(templates.map((t) => t.collection)).map((c) => ({ ...c, templates: templates.filter((t) => t.collection === c.key) }));
  const loose = templates.filter((t) => !categories.some((c) => c.key === t.collection));
  // the galleries' peeks are looked up once each, before the page is drawn
  const galleries = await Promise.all(categories.map((c) => galleryWithPeeks(c.templates)));
  const looseGallery = await galleryWithPeeks(loose);
  // the other occasions with a design of their own, so a link never lands on a 404
  const others = OCCASIONS.filter((o) => o.key !== occasion && all.some((t) => templateOccasions(t).includes(o.key)));

  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <BackArrow href="/occasions" label="All occasions" />
        <p className="eyebrow mt-4">Designs for</p>
        <h1 className="display mt-1 text-4xl">{info.label}</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--color-ink-500)]">{info.tagalog}</p>
        <p className="mt-2 max-w-2xl text-[color:var(--color-ink-700)]">{info.blurb}</p>
        <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">
          {templates.length} design{templates.length === 1 ? '' : 's'}{categories.length > 0 && ` in ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
        </p>

        {categories.map((c, i) => (
          <section key={c.key} className="mt-12" id={c.key}>
            <h2 className="display flex flex-wrap items-center gap-3 text-2xl">
              {c.label}
              <span className="flex gap-1">
                {c.swatch.map((hex) => <span key={hex} className="h-4 w-4 rounded-full border border-black/10" style={{ background: hex }} />)}
              </span>
            </h2>
            <p className="mt-1 max-w-2xl text-[color:var(--color-ink-700)]">{c.tagline}</p>
            <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">
              {c.templates.length} design{c.templates.length === 1 ? '' : 's'} · <Link href={`/collections/${c.key}`} className="underline">the whole collection</Link>
            </p>
            <div className="mt-5">
              <TemplateGallery occasion={occasion} collection={c.key} templates={galleries[i]} premiumPriceCents={premium?.priceCents} />
            </div>
          </section>
        ))}

        {loose.length > 0 && (
          <section className="mt-12">
            <h2 className="display text-2xl">{categories.length > 0 ? 'More designs' : 'The designs'}</h2>
            <div className="mt-5">
              <TemplateGallery occasion={occasion} collection="none" templates={looseGallery} premiumPriceCents={premium?.priceCents} />
            </div>
          </section>
        )}

        {others.length > 0 && (
          <p className="mt-12 text-sm text-[color:var(--color-ink-500)]">
            Other occasions: {others.map((o, i) => (
              <span key={o.key}>
                {i > 0 && ' · '}
                <Link href={`/occasions/${o.key}`} className="hover:underline">{o.label}</Link>
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
