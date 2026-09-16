import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { contentOf } from '@/lib/invitations';
import { publishProblems, sectionLabel, blankSections, skippedSections } from '@/lib/sections';
import { invitationUrl, invitationPath } from '@/lib/app-url';
import { qrSvg } from '@/lib/qr';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { byline } from '@/lib/names';
import { DFY_COLUMNS } from '@/lib/dfy';
import { PageHeader, Notice, DfyPill } from '@/components/ui';
import { PublishControls, ShareBox } from '../controls';
import { RevisionThread } from '../dfy/forms';

export const dynamic = 'force-dynamic';

/**
 * The Share tab: where the link lives. Publishing, with its named blanks
 * and the agreement tick; then, once live, the link, the QR on its own,
 * the buttons for every channel a Filipino family actually uses, the card
 * image and the print view. Where our team does the publishing, the
 * preview-and-approval thread sits at the top until it is done.
 */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const active = !inv.order || inv.order.status === 'ACTIVE' || inv.order.status === 'PAID';
  const dfy = Boolean(inv.order?.serviceMode && inv.order.serviceMode !== 'DIY');
  const [job, pair, pkgRounds] = await Promise.all([
    // ownInvitation has already said who may look, so the job is read
    // straight — staff opening a customer's card see the same thread the
    // customer does, which is how they answer it.
    dfy ? prisma.dfyJob.findUnique({ where: { invitationId: inv.id }, include: { assignee: { select: { name: true } }, revisions: { orderBy: { createdAt: 'asc' } } } }) : null,
    inv.saveTheDateOfId
      ? prisma.invitation.findUnique({ where: { id: inv.saveTheDateOfId }, select: { id: true, title: true, status: true } })
      : prisma.invitation.findUnique({ where: { saveTheDateOfId: inv.id }, select: { id: true, title: true, status: true } }),
    inv.order ? prisma.order.findUnique({ where: { id: inv.order.id }, select: { package: { select: { revisionRounds: true } } } }).then((o) => o?.package?.revisionRounds) : undefined,
  ]);
  const rounds = job?.revisionsAllowed ?? pkgRounds ?? undefined;
  const url = invitationUrl(inv.slug);
  const content = contentOf(inv.content);
  const problems = publishProblems(inv.occasion, content);
  const saveTheDate = Boolean(inv.saveTheDateOfId);
  // What is empty, and which of those parts would simply not appear. Named
  // for the customer at the moment they press Publish, never hidden from them.
  const blanks = blankSections(inv.occasion, content, inv.tier, saveTheDate, inv.addOns).map((k) => ({ key: k, label: sectionLabel(k, inv.occasion) }));
  const skipped = skippedSections(inv.occasion, content, inv.tier, saveTheDate, inv.addOns).map((k) => sectionLabel(k, inv.occasion));
  const live = inv.status === 'PUBLISHED';
  const stage = job ? DFY_COLUMNS.findIndex((c) => c.key === job.status) : -1;
  const left = job ? job.revisionsAllowed - job.revisionsUsed : 0;
  // Our team publishes a Done-For-You card; the customer's own Publish button
  // appears once the job is through, or where there is no job at all.
  const selfPublish = active && (!dfy || !job || job.status === 'PUBLISHED');

  return (
    <>
      <PageHeader title={live ? 'Share your invitation' : 'Publish & share'} subtitle={live ? 'Your link, your QR code, and every way to send them.' : dfy && job && job.status !== 'PUBLISHED' ? 'Our team publishes this once you approve the preview.' : 'When the details look right on the phone, publish to get your shareable link and QR.'} />

      {!active && inv.order && (
        <div className="mb-4"><Notice tone="warn">This invitation unlocks once order {inv.order.reference} is paid. <Link href={`/checkout/pay/${inv.order.reference}`} className="underline">Pay now</Link></Notice></div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {job && (
            <div className="card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Preview &amp; approval</h2>
                <span className="text-xs text-[color:var(--color-ink-500)]"><DfyPill status={job.status} />{job.assignee ? ` · your encoder: ${job.assignee.name}` : ''}{job.dueAt && stage < 3 ? ` · preview due ${formatDate(job.dueAt)}` : ''}</span>
              </div>
              <ol className="mb-4 flex flex-wrap gap-1 text-xs">
                {DFY_COLUMNS.map((c, i) => (
                  <li key={c.key} className={`rounded-full px-3 py-1 ${i < stage ? 'bg-[#e3f3e8] text-[#1e5c37]' : i === stage ? 'bg-[color:var(--color-plum-600)] text-white' : 'bg-[color:var(--color-sand-100)] text-[color:var(--color-ink-500)]'}`}>{c.label}</li>
                ))}
              </ol>
              {job.status === 'NEW' && <Notice tone="info">Paid and ready. Fill in your details on the <Link href={`/account/invitations/${inv.id}`} className="underline">Invitation tab</Link> — or send them over Messenger — and we start within a working day.</Notice>}
              {job.status === 'INTAKE_RECEIVED' && <Notice tone="info">We have your details and are typing them in. Your preview comes here{job.dueAt ? ` by ${formatDate(job.dueAt)}` : ''}.</Notice>}
              {job.status === 'ENCODING' && <Notice tone="info">Your encoder is on it. Your preview comes here{job.dueAt ? ` by ${formatDate(job.dueAt)}` : ''}.</Notice>}
              {job.status === 'PREVIEW_SENT' && <Notice tone="warn">Your preview is ready. <a href={invitationPath(inv.slug)} target="_blank" rel="noopener" className="underline">Open it on your phone</a>, then approve it below or tell us what to change. {left} revision round{left === 1 ? '' : 's'} left.</Notice>}
              {job.status === 'REVISION' && <Notice tone="info">We are making your changes. The new preview comes here.</Notice>}
              {job.status === 'APPROVED' && <Notice tone="ok">Approved — we are publishing it now. The link appears here the moment it is live.</Notice>}
              {job.status === 'PUBLISHED' && <Notice tone="ok">Live! Your link is below.</Notice>}
              {(job.status === 'PREVIEW_SENT' || job.status === 'REVISION' || job.revisions.length > 0) && (
                <div className="mt-4">
                  <RevisionThread invitationId={inv.id} status={job.status} previewHref={invitationPath(inv.slug)} revisionsLeft={left} revisions={job.revisions.map((r) => ({ id: r.id, round: r.round, author: byline(r.authorName, r.byStaff), byStaff: r.byStaff, body: r.body, at: formatDateTime(r.createdAt) }))} />
                </div>
              )}
              <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">Revisions: {job.revisionsAllowed} round{job.revisionsAllowed === 1 ? '' : 's'} included.</p>
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-2 font-semibold">{live ? 'Your link' : 'Publish'}</h2>
            {live ? (
              <>
                <p className="text-sm">Your invitation is live at <a href={url} target="_blank" rel="noopener" className="font-mono underline">{url}</a>{inv.expiresAt && <span className="text-[color:var(--color-ink-500)]"> · link valid until {formatDate(inv.expiresAt)}</span>}</p>
                <ShareBox url={url} title={inv.title} qr={qrSvg(url, { size: 160 })} cardHref={`${invitationPath(inv.slug)}/card`} printHref={`${invitationPath(inv.slug)}/print`} />
                <p className="mt-2 text-xs text-[color:var(--color-ink-500)]"><a href={`${invitationPath(inv.slug)}/qr.svg`} download className="underline">Download the QR code on its own</a> — for a printed card or a tarpaulin. It opens your invitation when scanned.</p>
              </>
            ) : (
              <p className="text-sm text-[color:var(--color-ink-700)]">{selfPublish ? 'Only you can see your invitation until you publish it. Publishing gives you the link and the QR code; you can unpublish later if you need to.' : 'Our team publishes this once you approve the preview above.'}</p>
            )}
            {selfPublish && <PublishControls invitationId={inv.id} status={inv.status} problems={problems} blanks={blanks} skipped={skipped} rounds={rounds} rsvpClosed={inv.rsvpClosed} rsvp={!saveTheDate} />}
          </div>

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
          <div className="card p-4 text-sm">
            <p className="font-semibold">How guests see it</p>
            <p className="text-[color:var(--color-ink-700)]">Paste the link in a Messenger or Viber chat and your cover photo and names show up as the preview. Each guest on your list can also get a personal link of their own, from the Guest list tab.</p>
          </div>
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
