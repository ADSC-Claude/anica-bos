import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { rsvpSummary } from '@/lib/guests';
import { occasionLabel } from '@/lib/occasions';
import { TIER_LABELS, hasFeature, nextTier } from '@/lib/tiers';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { invitationUrl, invitationPath } from '@/lib/app-url';
import { qrSvg } from '@/lib/qr';
import { contentOf } from '@/lib/invitations';
import { publishProblems } from '@/lib/sections';
import { PageHeader, InvitationPill, Stat, Notice } from '@/components/ui';
import { PublishControls, ShareBox } from './controls';

export const dynamic = 'force-dynamic';

export default async function InvitationDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const [summary, recent, job] = await Promise.all([
    rsvpSummary(inv.id),
    prisma.rsvp.findMany({ where: { invitationId: inv.id }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    prisma.dfyJob.findUnique({ where: { invitationId: inv.id }, select: { status: true } }),
  ]);
  const active = !inv.order || inv.order.status === 'ACTIVE' || inv.order.status === 'PAID';
  const dfy = inv.order?.serviceMode && inv.order.serviceMode !== 'DIY';
  const url = invitationUrl(inv.slug);
  const problems = publishProblems(inv.occasion, contentOf(inv.content));
  const editsLeft = inv.editsAllowed < 0 ? null : Math.max(0, inv.editsAllowed - inv.editsUsed);
  const upgrade = nextTier(inv.tier);

  return (
    <>
      <Link href="/account" className="text-sm text-[color:var(--color-plum-600)] hover:underline">← My invitations</Link>
      <PageHeader
        title={inv.title}
        subtitle={<><InvitationPill status={inv.status} /> · {occasionLabel(inv.occasion)} · {TIER_LABELS[inv.tier]} · {inv.template.name}{inv.eventAt ? ` · ${formatDate(inv.eventAt, 'weekday')}` : ''}</>}
        actions={
          <>
            {active && !dfy && <Link href={`/account/invitations/${inv.id}/builder`} className="btn btn-primary">Edit invitation</Link>}
            {active && dfy && <Link href={`/account/invitations/${inv.id}/dfy`} className="btn btn-primary">Done-For-You</Link>}
            <a href={`${invitationPath(inv.slug)}?preview=1`} target="_blank" rel="noopener" className="btn btn-secondary">Preview</a>
          </>
        }
      />

      {!active && inv.order && (
        <div className="mb-4"><Notice tone="warn">This invitation unlocks once order {inv.order.reference} is paid. <Link href={`/checkout/pay/${inv.order.reference}`} className="underline">Pay now</Link></Notice></div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-2 font-semibold">Publish & share</h2>
            {inv.status === 'PUBLISHED' ? (
              <>
                <p className="text-sm">Your invitation is live at <a href={url} target="_blank" rel="noopener" className="font-mono underline">{url}</a>{inv.expiresAt && <span className="text-[color:var(--color-ink-500)]"> · link valid until {formatDate(inv.expiresAt)}</span>}</p>
                <ShareBox url={url} title={inv.title} qr={qrSvg(url, { size: 160 })} cardHref={`${invitationPath(inv.slug)}/card`} printHref={`${invitationPath(inv.slug)}/print`} />
              </>
            ) : (
              <p className="text-sm text-[color:var(--color-ink-700)]">{dfy ? 'Our team publishes this once you approve the preview.' : 'When the details look right in the preview, publish to get your shareable link and QR.'}</p>
            )}
            {active && !dfy && <PublishControls invitationId={inv.id} status={inv.status} problems={problems} rsvpClosed={inv.rsvpClosed} editsLeft={editsLeft} />}
            {dfy && job && <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">DFY status: {job.status.toLowerCase().replace(/_/g, ' ')} · <Link href={`/account/invitations/${inv.id}/dfy`} className="underline">open</Link></p>}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Page views" value={inv.viewCount} />
            <Stat label="Accepted" value={summary.accepted} hint={`${summary.seats} seat${summary.seats === 1 ? '' : 's'} confirmed`} />
            <Stat label="Declined" value={summary.declined} />
            {hasFeature(inv.tier, 'guests.manager') ? <Stat label="No response" value={summary.pending} hint={`of ${summary.guests} on your list`} /> : <Stat label="Responses" value={summary.accepted + summary.declined} />}
          </div>

          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Latest RSVPs</h2><Link href={`/account/invitations/${inv.id}/rsvps`} className="text-sm underline">See all</Link></div>
            {recent.length === 0 ? <p className="text-sm text-[color:var(--color-ink-500)]">No responses yet. Share the link to start collecting.</p> : (
              <ul className="divide-y divide-[color:var(--color-sand-100)] text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 py-2"><span>{r.name} <span className="text-[color:var(--color-ink-500)]">· {r.response === 'ACCEPT' ? `accepted, ${r.seats} seat${r.seats === 1 ? '' : 's'}` : 'declined'}</span></span><span className="text-xs text-[color:var(--color-ink-500)]">{formatDateTime(r.updatedAt)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <nav className="card p-3 text-sm">
            <p className="eyebrow mb-2 px-2">Manage</p>
            {[
              { href: `/account/invitations/${inv.id}/builder`, label: 'Builder', show: !dfy || inv.status === 'PUBLISHED' || job?.status === 'PUBLISHED' },
              { href: `/account/invitations/${inv.id}/rsvps`, label: 'RSVP responses', show: true },
              { href: `/account/invitations/${inv.id}/guests`, label: 'Guest list & personal links', show: true, locked: !hasFeature(inv.tier, 'guests.manager') },
              { href: `/account/invitations/${inv.id}/checkin`, label: 'Event-day check-in', show: true, locked: !hasFeature(inv.tier, 'checkin') },
              { href: `/account/invitations/${inv.id}/guestbook`, label: 'Guestbook moderation', show: true, locked: !hasFeature(inv.tier, 'guestbook') },
              { href: `/account/invitations/${inv.id}/photos`, label: 'Guest photos', show: true, locked: !hasFeature(inv.tier, 'photoSharing') },
              { href: `/account/invitations/${inv.id}/settings`, label: 'Link, privacy, language & design', show: true },
              { href: `/account/invitations/${inv.id}/dfy`, label: 'Done-For-You', show: Boolean(dfy) },
            ].filter((l) => l.show).map((l) => (
              <Link key={l.href} href={l.locked ? `/account/invitations/${inv.id}/upgrade` : l.href} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-[color:var(--color-sand-100)]">
                {l.label}{l.locked && <span className="pill pill-warn">Upgrade</span>}
              </Link>
            ))}
          </nav>
          {upgrade && (
            <div className="card p-4 text-sm">
              <p className="font-semibold">Need more?</p>
              <p className="text-[color:var(--color-ink-700)]">Upgrade to {TIER_LABELS[upgrade]} for {upgrade === 'STANDARD' ? 'entourage, gallery, gift QR, FAQ, music and unlimited edits' : 'per-guest links, seating, QR check-in, guestbook and more'}. Pay only the difference.</p>
              <Link href={`/account/invitations/${inv.id}/upgrade`} className="btn btn-secondary btn-sm mt-2">See upgrade</Link>
            </div>
          )}
          <div className="card p-4 text-xs text-[color:var(--color-ink-500)]">
            Order {inv.order?.reference ?? '—'} · {inv.order ? <Link href={`/account/orders/${inv.order.id}`} className="underline">receipt</Link> : 'no order'}
          </div>
        </aside>
      </div>
    </>
  );
}
