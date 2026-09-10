import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { collectionsPresent } from '@/lib/collections';
import { OCCASIONS, templateOccasions } from '@/lib/occasions';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { TemplateGallery } from '@/components/landing/gallery';
import { galleryWithPeeks } from '@/lib/peek';
import { PREMIUM_OPENING_CODE } from '@/lib/openings';
import { BackArrow } from '@/components/back';

export const metadata = { title: 'Templates', description: 'Digital invitation templates for weddings, debuts, christenings and birthdays in the Philippines.' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const [s, session, templates, premium] = await Promise.all([
    getSettings(),
    getSession(),
    prisma.template.findMany({ where: { published: true }, orderBy: [{ occasion: 'asc' }, { featured: 'desc' }, { sortOrder: 'asc' }] }),
    prisma.addOn.findFirst({ where: { code: PREMIUM_OPENING_CODE, active: true } }),
  ]);
  const collections = collectionsPresent(templates.map((t) => t.collection));
  // every occasion at least one design is offered for, with its count
  const occasions = OCCASIONS.map((o) => ({ ...o, count: templates.filter((t) => templateOccasions(t).includes(o.key)).length })).filter((o) => o.count > 0);
  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <BackArrow href="/" label="Back" />
        <p className="eyebrow mt-4">Templates</p>
        <h1 className="display mt-1 text-4xl">All designs</h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-ink-700)]">Each design is shown here by its cover — the first page your guest sees. The pages under it are unveiled for our clients once they have chosen. Every package opens with The Letter — a sealed envelope that opens to say you are invited, then your invitation. The premium opening video made for a design, with your names on its card, is an add-on.</p>
        {/* Every design is drawn twice over: the same pages by daylight and after
            dark. The couple sets which one it opens in (Settings on their
            invitation), or lets it follow the guest's own clock; the guest may
            switch with the moon in the corner, and their phone remembers it. */}
        <p className="mt-3 max-w-2xl text-[color:var(--color-ink-700)]">
          <b>Day and night.</b> Every design reads both ways. You choose which one your invitation opens in, or let it follow your guest&apos;s own clock — evening after six — and your guest can switch with the moon in the corner while they read. Their phone remembers how they left it.
        </p>
        {occasions.length > 0 && (
          <section className="mt-8">
            <h2 className="display text-2xl">Browse by occasion</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {occasions.map((o) => (
                <Link key={o.key} href={`/occasions/${o.key}`} className="card flex items-center justify-between gap-3 p-4 transition hover:shadow-md">
                  <span>
                    <span className="block font-semibold">{o.label}</span>
                    <span className="block text-xs text-[color:var(--color-ink-500)]">{o.tagalog}</span>
                  </span>
                  <span className="text-xs text-[color:var(--color-ink-500)]">{o.count} design{o.count === 1 ? '' : 's'}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {collections.length > 0 && (
          <section className="mt-8">
            <h2 className="display text-2xl">Browse by collection</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((c) => (
                <Link key={c.key} href={`/collections/${c.key}`} className="card flex items-center gap-3 p-4 transition hover:shadow-md">
                  <span className="flex shrink-0 gap-1">
                    {c.swatch.map((hex) => <span key={hex} className="h-6 w-6 rounded-full border border-black/10" style={{ background: hex }} />)}
                  </span>
                  <span>
                    <span className="block font-semibold">{c.label}</span>
                    <span className="block text-xs text-[color:var(--color-ink-500)]">{c.tagline}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
        <div className="mt-8">
          <TemplateGallery templates={await galleryWithPeeks(templates)} premiumPriceCents={premium?.priceCents} />
        </div>
      </main>
      <SiteFooter s={s} />
      <FloatingContact s={s} />
    </>
  );
}
