import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { rsvpSummary } from '@/lib/guests';
import { occasionLabel } from '@/lib/occasions';
import { TIER_LABELS, hasFeature, featureOffered, nextTier } from '@/lib/tiers';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { invitationUrl, invitationPath } from '@/lib/app-url';
import { qrSvg } from '@/lib/qr';
import { contentOf } from '@/lib/invitations';
import { publishProblems, sectionsFor, sectionUnlocked, sectionLabel, blankSections, skippedSections } from '@/lib/sections';
import { changeWindow, doneSections } from '@/lib/progress';
import { PageHeader, InvitationPill, Stat, Notice } from '@/components/ui';
import { PublishControls, ShareBox } from './controls';

export const dynamic = 'force-dynamic';

export default async function InvitationDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const [summary, recent, job, pair] = await Promise.all([
    rsvpSummary(inv.id),
    prisma.rsvp.findMany({ where: { invitationId: inv.id }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    prisma.dfyJob.findUnique({ where: { invitationId: inv.id }, select: { status: true } }),
    // The other half of the pair, whichever half this is.
    inv.saveTheDateOfId
      ? prisma.invitation.findUnique({ where: { id: inv.saveTheDateOfId }, select: { id: true, title: true, slug: true, status: true } })
      : prisma.invitation.findUnique({ where: { saveTheDateOfId: inv.id }, select: { id: true, title: true, slug: true, status: true } }),
  ]);
  const active = !inv.order || inv.order.status === 'ACTIVE' || inv.order.status === 'PAID';
  const dfy = inv.order?.serviceMode && inv.order.serviceMode !== 'DIY';
  const url = invitationUrl(inv.slug);
  const content = contentOf(inv.content);
  const problems = publishProblems(inv.occasion, content);
  const saveTheDate = Boolean(inv.saveTheDateOfId);
  // What is empty, and which of those parts would simply not appear. Named for
  // the customer at the moment they press Publish, never hidden from them.
  const blanks = blankSections(inv.occasion, content, inv.tier, saveTheDate).map((k) => ({ key: k, label: sectionLabel(k, inv.occasion) }));
  const skipped = skippedSections(inv.occasion, content, inv.tier, saveTheDate).map((k) => sectionLabel(k, inv.occasion));
  const mine = sectionsFor(inv.occasion, saveTheDate).filter((d) => sectionUnlocked(d.key, inv.occasion, inv.tier)).map((d) => d.key);
  const doneCount = doneSections(content.progress).filter((k) => mine.includes(k)).length;
  const complete = mine.length > 0 && doneCount >= mine.length;
  const window = changeWindow(inv.eventAt);
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
            {active && dfy && <Link href={`/account/invitations/${inv.id}/dfy`} className="btn btn-primary">Your details &amp; preview</Link>}
            <a href={`${invitationPath(inv.slug)}?preview=1`} target="_blank" rel="noopener" className="btn btn-secondary">Preview</a>
          </>
        }
      />

      {!active && inv.order && (
        <div className="mb-4"><Notice tone="warn">This invitation unlocks once order {inv.order.reference} is paid. <Link href={`/checkout/pay/${inv.order.reference}`} className="underline">Pay now</Link></Notice></div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {active && !dfy && (
            <div className="card p-5">
              <h2 className="mb-2 font-semibold">Your form</h2>
              {complete ? (
                <p className="text-sm">✓ Every section is marked Done{content.progress?.completedAt ? ` (${formatDate(new Date(content.progress.completedAt))})` : ''}. Our team has your invitation.</p>
              ) : (
                <p className="text-sm"><b>{doneCount} of {mine.length}</b> sections marked Done. Our team starts on your invitation only once every section is Done — <Link href={`/account/invitations/${inv.id}/builder`} className="underline">continue where you left off</Link>. Everything you save stays.</p>
              )}
              {window && (
                <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">{window.closed ? `Changes closed on ${formatDate(window.closesAt)}; final touches by our team until ${formatDate(window.finalAt)}.` : `Changes close on ${formatDate(window.closesAt)}, three weeks before the event; our team's final touches are done by ${formatDate(window.finalAt)}.`}</p>
              )}
            </div>
          )}
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
            {active && !dfy && <PublishControls invitationId={inv.id} status={inv.status} problems={problems} blanks={blanks} skipped={skipped} rsvpClosed={inv.rsvpClosed} rsvp={!saveTheDate} />}
            {dfy && job && <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">Build status: {job.status.toLowerCase().replace(/_/g, ' ')} · <Link href={`/account/invitations/${inv.id}/dfy`} className="underline">open</Link></p>}
          </div>

          {saveTheDate ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Page views" value={inv.viewCount} />
              <Stat label="Sections" value={`${doneCount} of ${mine.length}`} />
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Page views" value={inv.viewCount} />
            <Stat label="Accepted" value={summary.accepted} hint={`${summary.seats} seat${summary.seats === 1 ? '' : 's'} confirmed`} />
            <Stat label="Declined" value={summary.declined} />
            {hasFeature(inv.tier, 'guests.manager') ? <Stat label="No response" value={summary.pending} hint={`of ${summary.guests} on your list`} /> : <Stat label="Responses" value={summary.accepted + summary.declined} />}
          </div>
          )}

          {!saveTheDate && (
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
          )}

          {pair && (
            <div className="card p-5">
              <h2 className="mb-2 font-semibold">{saveTheDate ? 'The invitation this announces' : 'Your Save the Date'}</h2>
              <p className="text-sm">
                {saveTheDate
                  ? 'This card goes out first. The full invitation is a separate link, published on its own — nothing you do here spends its revisions.'
                  : 'A second card on the same design, with its own link, for sending months ahead. It carries your names and the date and nothing else.'}
              </p>
              <p className="mt-2 text-sm">
                <Link href={`/account/invitations/${pair.id}`} className="underline">{pair.title}</Link>
                <span className="text-[color:var(--color-ink-500)]"> · {pair.status === 'PUBLISHED' ? 'published' : pair.status.toLowerCase()}</span>
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <nav className="card p-3 text-sm">
            <p className="eyebrow mb-2 px-2">Manage</p>
            {[
              { href: `/account/invitations/${inv.id}/builder`, label: 'Builder', show: !dfy || inv.status === 'PUBLISHED' || job?.status === 'PUBLISHED' },
              // A Save the Date collects nothing: no RSVP, no guestbook, no
              // photographs. Those all belong to the invitation it announces.
              { href: `/account/invitations/${inv.id}/rsvps`, label: 'RSVP responses', show: !saveTheDate },
              { href: `/account/invitations/${inv.id}/guests`, label: 'Guest list & personal links', show: !saveTheDate && featureOffered('guests.manager'), locked: !hasFeature(inv.tier, 'guests.manager') },
              { href: `/account/invitations/${inv.id}/checkin`, label: 'Event-day check-in', show: !saveTheDate && featureOffered('checkin'), locked: !hasFeature(inv.tier, 'checkin') },
              { href: `/account/invitations/${inv.id}/guestbook`, label: 'Guestbook moderation', show: !saveTheDate, locked: !hasFeature(inv.tier, 'guestbook') },
              { href: `/account/invitations/${inv.id}/photos`, label: 'Guest photos', show: !saveTheDate, locked: !hasFeature(inv.tier, 'photoSharing') },
              { href: `/account/invitations/${inv.id}/settings`, label: 'Link, privacy, language & design', show: true },
              { href: `/account/invitations/${inv.id}/dfy`, label: 'Your details & preview', show: Boolean(dfy) },
            ].filter((l) => l.show).map((l) => (
              <Link key={l.href} href={l.locked ? `/account/invitations/${inv.id}/upgrade` : l.href} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-[color:var(--color-sand-100)]">
                {l.label}{l.locked && <span className="pill pill-warn">Upgrade</span>}
              </Link>
            ))}
          </nav>
          {upgrade && !saveTheDate && (
            <div className="card p-4 text-sm">
              <p className="font-semibold">Need more?</p>
              <p className="text-[color:var(--color-ink-700)]">Upgrade to {TIER_LABELS[upgrade]} for {upgrade === 'STANDARD' ? 'entourage, gallery, gift QR, music and a custom link' : 'per-guest links, program, guestbook, guest photos and more'}. Pay only the difference.</p>
              <Link href={`/account/invitations/${inv.id}/upgrade`} className="btn btn-secondary btn-sm mt-2">See upgrade</Link>
            </div>
          )}
          <div className="card p-4 text-xs text-[color:var(--color-ink-500)]">
            {saveTheDate && pair
              ? <>Bought with <Link href={`/account/invitations/${pair.id}`} className="underline">{pair.title}</Link> — its order covers this card.</>
              : <>Order {inv.order?.reference ?? '—'} · {inv.order ? <Link href={`/account/orders/${inv.order.id}`} className="underline">receipt</Link> : 'no order'}</>}
          </div>
        </aside>
      </div>
    </>
  );
}
