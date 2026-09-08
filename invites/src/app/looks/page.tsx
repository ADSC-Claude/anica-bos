import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublic } from '@/lib/invitations';
import { getSettings } from '@/lib/settings';
import { LOOKS, LOOK_MIN_TIER } from '@/lib/looks';
import { Invitation } from '@/components/invite/renderer';
import { requireStaffPage } from '@/lib/guard';

export const metadata: Metadata = { title: 'Looks', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Every look, side by side, on the demo invitation: the same page, the same
 * colours, the same words the couple typed — only the faces and the lines
 * under the headings change. This is how a look is chosen for a theme: by
 * scrolling five phones next to each other, not by reading font names.
 */
export default async function LooksPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  // Staff only: five whole invitations side by side is the design itself,
  // and the public sees a design by its opening alone.
  await requireStaffPage();
  const s = await getSettings();
  // Any published invitation can sit for the showcase — ?slug=capiz-demo — so
  // a design can be judged on its own demo; the site's demo otherwise.
  const { slug } = await searchParams;
  const invitation = await loadPublic(slug && /^[a-z0-9-]{1,80}$/.test(slug) ? slug : s['site.demoSlug']);
  if (!invitation) notFound();
  return (
    <main className="mx-auto max-w-[1900px] px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-3xl">
        <p className="eyebrow">The looks</p>
        <h1 className="text-3xl">One page, five voices</h1>
        <p className="mt-2 text-[color:var(--color-ink-soft)]">
          A look is the faces a page is set in and the lines it says under each heading, in English and in Tagalog. The layout and the colours are the design&apos;s; the words are the couple&apos;s. Every design ships in one look. Basic keeps it, Standard chooses among three, and Complete among all five — so a theme the default fonts fight has somewhere to go.
        </p>
      </header>
      <div className="looks-row">
        {LOOKS.map((look) => (
          <section key={look.key} className="looks-col">
            <h2 className="text-xl">{look.name} <span className="pill pill-info align-middle text-xs">{LOOK_MIN_TIER[look.key] === 'STANDARD' ? 'Standard & up' : 'Complete'}</span></h2>
            <p className="mb-1 text-sm text-[color:var(--color-ink-soft)]">{look.tagline}</p>
            <p className="mb-3 text-xs text-[color:var(--color-ink-soft)]">{look.fonts.load.map((f) => f.split(':')[0]).join(' · ')} · names {look.joiner === 'and' ? 'joined by “and”' : 'joined by “&”'}</p>
            <div className="looks-phone">
              <Invitation invitation={invitation} bare shape="phone" look={look} businessName={s['business.name']} />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
