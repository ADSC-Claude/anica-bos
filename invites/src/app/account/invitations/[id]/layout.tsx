import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { occasionLabel } from '@/lib/occasions';
import { TIER_LABELS } from '@/lib/tiers';
import { formatDate } from '@/lib/datetime';
import { invitationPath } from '@/lib/app-url';
import { isStaff, can } from '@/lib/rbac';
import { tabsFor } from '@/lib/account-tabs';
import { InvitationPill } from '@/components/ui';
import { TabStrip } from '@/components/account/tabs';

/**
 * The frame around every page about one invitation: its name and state, the
 * two buttons that matter on every tab — Preview, and Publish (Share once it
 * is live) — and the strip of tabs, one per tool. Each page under it loads
 * the invitation again for its own work; this is one more findUnique per
 * request, the same as the studio's header, and it is what lets the strip
 * be on every tab without every tab drawing it.
 */
export default async function InvitationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const saveTheDate = Boolean(inv.saveTheDateOfId);
  const [pair, job] = await Promise.all([
    // The other half of the pair, whichever half this is.
    saveTheDate
      ? prisma.invitation.findUnique({ where: { id: inv.saveTheDateOfId! }, select: { id: true } })
      : prisma.invitation.findUnique({ where: { saveTheDateOfId: inv.id }, select: { id: true } }),
    prisma.dfyJob.findUnique({ where: { invitationId: inv.id }, select: { status: true } }),
  ]);
  const tabs = tabsFor({ id: inv.id, tier: inv.tier, addOns: inv.addOns, occasion: inv.occasion, saveTheDate, pairId: pair?.id ?? null });
  const live = inv.status === 'PUBLISHED';
  // Done-For-You publishes through the approval thread on the Share tab; a
  // customer's own card publishes with the button there.
  const dfy = Boolean(inv.order?.serviceMode && inv.order.serviceMode !== 'DIY') && job && job.status !== 'PUBLISHED' && !live;
  const base = `/account/invitations/${inv.id}`;

  return (
    <>
      <Link href="/account" className="text-sm text-[color:var(--color-plum-600)] hover:underline">← My invitations</Link>
      <header className="mb-3 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display truncate text-2xl font-semibold sm:text-3xl">{inv.title}</h1>
          <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">
            <InvitationPill status={inv.status} /> · {occasionLabel(inv.occasion)} · {TIER_LABELS[inv.tier]} · {inv.template.name}{inv.eventAt ? ` · ${formatDate(inv.eventAt, 'weekday')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-tour="publish">
          {/* Our way into the studio, drawn against this very invitation. The customer never sees it. */}
          {isStaff(user.role) && can(user.role, 'templates.edit') && <Link href={`/admin/templates/${inv.templateId}/design?against=${inv.id}`} className="btn btn-secondary btn-sm">Design studio</Link>}
          <Link href={`${base}/history`} className="btn btn-secondary btn-sm">History</Link>
          <a href={invitationPath(inv.slug)} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Preview</a>
          <Link href={`${base}/share`} className="btn btn-primary btn-sm">{live ? 'Share' : dfy ? 'Preview & approval' : 'Publish'}</Link>
        </div>
      </header>
      <TabStrip tabs={tabs} base={base} />
      {children}
    </>
  );
}
