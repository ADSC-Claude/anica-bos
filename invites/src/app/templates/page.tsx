import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { collectionsPresent } from '@/lib/collections';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { TemplateGallery } from '@/components/landing/gallery';
import { toGalleryTemplate } from '@/lib/gallery';

export const metadata = { title: 'Templates', description: 'Digital invitation templates for weddings, debuts, christenings and birthdays in the Philippines.' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const [s, session, templates] = await Promise.all([getSettings(), getSession(), prisma.template.findMany({ where: { published: true }, orderBy: [{ occasion: 'asc' }, { featured: 'desc' }, { sortOrder: 'asc' }] })]);
  const collections = collectionsPresent(templates.map((t) => t.collection));
  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <p className="eyebrow">Templates</p>
        <h1 className="display mt-1 text-4xl">All designs</h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-ink-700)]">Each design is shown here by its opening — the moving scene your guest sees first. Tap one to watch it. The full invitation is unveiled for our clients once they have chosen. Standard unlocks every design; Complete adds premium designs and custom colours.</p>
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
          <TemplateGallery templates={templates.map(toGalleryTemplate)} />
        </div>
      </main>
      <SiteFooter s={s} />
      <FloatingContact s={s} />
    </>
  );
}
