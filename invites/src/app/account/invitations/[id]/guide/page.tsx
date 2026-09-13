import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { tabsFor } from '@/lib/account-tabs';
import { CHAPTERS } from '@/lib/guide-chapters';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The Guide tab: one chapter at a time, an index beside it, Previous and
 * Next at the foot. The chapters run in the strip's order, so a customer
 * can build along, tab by tab.
 */
export default async function GuidePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ chapter?: string }> }) {
  const { id } = await params;
  const { chapter } = await searchParams;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const saveTheDate = Boolean(inv.saveTheDateOfId);
  const pair = saveTheDate
    ? await prisma.invitation.findUnique({ where: { id: inv.saveTheDateOfId! }, select: { id: true } })
    : await prisma.invitation.findUnique({ where: { saveTheDateOfId: inv.id }, select: { id: true } });
  const tabs = tabsFor({ id: inv.id, tier: inv.tier, addOns: inv.addOns, saveTheDate, pairId: pair?.id ?? null });
  const tabOf = (key?: string) => tabs.find((t) => t.key === key);
  const i = Math.max(0, CHAPTERS.findIndex((c) => c.key === chapter));
  const c = CHAPTERS[i];
  const prev = CHAPTERS[i - 1];
  const next = CHAPTERS[i + 1];
  const tab = tabOf(c.tab);
  const base = `/account/invitations/${inv.id}/guide`;
  const num = (n: number) => String(n + 1).padStart(2, '0');

  return (
    <>
      <PageHeader title="Guide" subtitle="A chapter for every tab, in the order you meet them." />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="In this guide" className="lg:sticky lg:top-4 lg:self-start">
          <p className="eyebrow mb-2">In this guide</p>
          <ol className="space-y-0.5 text-sm">
            {CHAPTERS.map((ch, n) => (
              <li key={ch.key}>
                <Link href={n === 0 ? base : `${base}?chapter=${ch.key}`} aria-current={n === i ? 'page' : undefined} className={`flex gap-2 rounded-lg px-2 py-1.5 ${n === i ? 'bg-[color:var(--color-plum-600)] text-white' : 'hover:bg-[color:var(--color-sand-100)]'}`}>
                  <span className={`tabular-nums ${n === i ? 'text-white/70' : 'text-[color:var(--color-ink-500)]'}`}>{num(n)}</span>
                  {ch.title}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <article className="card max-w-3xl p-5 sm:p-8">
          <p className="display text-4xl text-[color:var(--color-sand-300)]">{num(i)}</p>
          <h2 className="display mt-1 text-2xl sm:text-3xl">{c.title}</h2>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-[color:var(--color-ink-700)]">
            {c.body.map((p, n) => <p key={n}>{p}</p>)}
          </div>
          {c.steps && (
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
              {c.steps.map((s, n) => <li key={n}>{s}</li>)}
            </ol>
          )}
          {tab && (
            <p className="mt-5 text-sm">
              {tab.locked
                ? <>This tool is in a bigger package. <Link href={tab.href} className="underline">See the upgrade</Link>.</>
                : <Link href={tab.href} className="btn btn-secondary btn-sm">Open {tab.label}</Link>}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-sand-200)] pt-4 text-sm">
            {prev ? <Link href={i - 1 === 0 ? base : `${base}?chapter=${prev.key}`} className="text-[color:var(--color-plum-600)] hover:underline">← Previous: {prev.title}</Link> : <span />}
            {next ? <Link href={`${base}?chapter=${next.key}`} className="btn btn-primary btn-sm">Next: {next.title} →</Link> : <span className="text-[color:var(--color-ink-500)]">That is the whole guide.</span>}
          </div>
        </article>
      </div>
    </>
  );
}
