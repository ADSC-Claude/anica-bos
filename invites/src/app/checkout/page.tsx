import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { catalogue } from '@/lib/orders';
import { paletteFrom } from '@/lib/theme';
import { CheckoutWizard } from './wizard';

export const metadata = { title: 'Create your invitation', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Search = { occasion?: string; tier?: string; mode?: string; template?: string; coupon?: string };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) {
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string')).toString();
    redirect(`/signup?next=${encodeURIComponent(`/checkout${qs ? `?${qs}` : ''}`)}`);
  }
  const [{ packages, addOns }, templates, s] = await Promise.all([
    catalogue(),
    prisma.template.findMany({ where: { published: true }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }] }),
    getSettings(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="display text-xl">{s['business.name']}</Link>
        <p className="text-sm text-[color:var(--color-ink-500)]">Signed in as {session.name} · <Link href="/account" className="underline">My invitations</Link></p>
      </div>
      <h1 className="display mb-1 text-3xl">Create your invitation</h1>
      <p className="mb-8 text-[color:var(--color-ink-700)]">Six quick choices, then pay with GCash, Maya, a card, or a bank transfer.</p>
      <CheckoutWizard
        packages={packages.map((p) => ({ code: p.code, name: p.name, tagline: p.tagline, occasion: p.occasion, tier: p.tier, priceCents: p.priceCents, dfyFeeCents: p.dfyFeeCents, conciergeFeeCents: p.conciergeFeeCents }))}
        addOns={addOns.map((a) => ({ code: a.code, name: a.name, description: a.description, priceCents: a.priceCents, quoted: a.quoted }))}
        templates={templates.map((t) => {
          const pal = paletteFrom(t.palette);
          return { id: t.id, slug: t.slug, name: t.name, occasion: t.occasion, minTier: t.minTier, premium: t.premium, thumbnailUrl: t.thumbnailUrl, description: t.description, palette: { bg: pal.bg, accent: pal.accent, accent2: pal.accent2 } };
        })}
        initial={sp}
        demoSlug={s['site.demoSlug']}
      />
    </main>
  );
}
