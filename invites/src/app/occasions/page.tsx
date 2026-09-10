import Link from 'next/link';
import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { OCCASIONS, templateOccasions } from '@/lib/occasions';
import { collectionsPresent } from '@/lib/collections';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { BackArrow } from '@/components/back';

export const metadata = { title: 'Designs by occasion', description: 'Pick your occasion and see every design and category made for it: weddings, debuts, christenings, birthdays and more.' };
export const dynamic = 'force-dynamic';

/**
 * The way a visitor actually starts: "I am planning a wedding". One card per
 * occasion that has at least one published design, counting the designs and
 * the categories (collections) they come in. A design ticked for several
 * occasions counts under each.
 */
export default async function OccasionsPage() {
  const [s, session, templates] = await Promise.all([
    getSettings(),
    getSession(),
    prisma.template.findMany({ where: { published: true }, select: { occasion: true, occasions: true, collection: true } }),
  ]);
  const rows = OCCASIONS.map((o) => {
    const mine = templates.filter((t) => templateOccasions(t).includes(o.key));
    return { ...o, designs: mine.length, categories: collectionsPresent(mine.map((t) => t.collection)).length };
  }).filter((r) => r.designs > 0);

  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <BackArrow href="/templates" label="All designs" />
        <p className="eyebrow mt-4">By occasion</p>
        <h1 className="display mt-1 text-4xl">What are you celebrating?</h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-ink-700)]">Choose the occasion and we show only the designs made for it, grouped by category. Some designs suit more than one occasion and appear under each.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((o) => (
            <Link key={o.key} href={`/occasions/${o.key}`} className="card flex flex-col gap-1 p-4 transition hover:shadow-md">
              <span className="font-semibold">{o.label}</span>
              <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-ink-500)]">{o.tagalog}</span>
              <span className="mt-1 text-sm text-[color:var(--color-ink-700)]">{o.blurb}</span>
              <span className="mt-2 text-xs text-[color:var(--color-ink-500)]">
                {o.designs} design{o.designs === 1 ? '' : 's'}{o.categories > 0 && ` · ${o.categories} categor${o.categories === 1 ? 'y' : 'ies'}`}
              </span>
            </Link>
          ))}
          {rows.length === 0 && <p className="col-span-full text-sm text-[color:var(--color-ink-500)]">No designs are published yet.</p>}
        </div>
      </main>
      <SiteFooter s={s} />
      <FloatingContact s={s} />
    </>
  );
}
