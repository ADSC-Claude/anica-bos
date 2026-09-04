import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { paletteFrom } from '@/lib/theme';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { TemplateGallery } from '@/components/landing/gallery';

export const metadata = { title: 'Templates', description: 'Digital invitation templates for weddings, debuts, christenings and birthdays in the Philippines.' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const [s, session, templates] = await Promise.all([getSettings(), getSession(), prisma.template.findMany({ where: { published: true }, orderBy: [{ occasion: 'asc' }, { featured: 'desc' }, { sortOrder: 'asc' }] })]);
  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <p className="eyebrow">Templates</p>
        <h1 className="display mt-1 text-4xl">All designs</h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-ink-700)]">Every template renders the same sections, so you can switch designs any time without retyping a name. Basic includes the Basic set; Standard unlocks every design; Complete adds premium designs and custom colours.</p>
        <div className="mt-8">
          <TemplateGallery demoSlug={s['site.demoSlug']} templates={templates.map((t) => { const p = paletteFrom(t.palette); return { id: t.id, slug: t.slug, name: t.name, occasion: t.occasion, minTier: t.minTier, premium: t.premium, description: t.description, thumbnailUrl: t.thumbnailUrl, layout: t.layout, palette: { bg: p.bg, accent: p.accent, accent2: p.accent2, ink: p.ink }, featured: t.featured }; })} />
        </div>
      </main>
      <SiteFooter s={s} />
      <FloatingContact s={s} />
    </>
  );
}
