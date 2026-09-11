import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { rsvpSummary } from '@/lib/guests';
import { occasionLabel } from '@/lib/occasions';
import { TIERS, TIER_LABELS } from '@/lib/tiers';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { invitationUrl, invitationPath } from '@/lib/app-url';
import { PageHeader, BackLink, InvitationPill, Stat } from '@/components/ui';
import { Flash, type FlashParams } from '../../flash';
import { extendExpiryAction, setTierAction, setPremiumOpeningAction, setPremiumOpeningClipAction, archiveInvitationAction, addPartAction, dropPartAction } from '../../actions';
import { premiumOpeningsFor } from '@/lib/premium-openings';
import { contentOf } from '@/lib/invitations';
import { scheduleAdvice } from '@/lib/progress';
import { partsOf } from '@/lib/parts';

export const dynamic = 'force-dynamic';

export default async function AdminInvitation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const user = await requireStaffPage('invitations.view');
  const { id } = await params;
  const sp = await searchParams;
  const inv = await prisma.invitation.findUnique({ where: { id }, include: { user: true, template: true, order: true, dfyJob: true } });
  if (!inv) notFound();
  const summary = await rsvpSummary(inv.id);
  const back = `/admin/invitations/${inv.id}`;
  const editable = can(user.role, 'invitations.edit');
  // The clips drawn for this invitation's design, and no other theme's.
  const clips = premiumOpeningsFor(inv.template);
  const content = contentOf(inv.content);
  // The day they said they would send it out, and the spare photographs they
  // gave us. Both are theirs and neither is on the page: this is where the
  // person doing the work finds them.
  const sendOutRaw = String((content.cover as Record<string, unknown> | undefined)?.sendOut ?? '');
  const schedule = scheduleAdvice(sendOutRaw ? new Date(sendOutRaw) : null);
  const extraPhotos = (Array.isArray((content.extras as Record<string, unknown> | undefined)?.photos) ? ((content.extras as Record<string, unknown>).photos as Record<string, unknown>[]) : [])
    .filter((r) => typeof r?.url === 'string' && r.url);
  /**
   * What this design leaves out, and what has been put back on this one
   * invitation. A design whose pages cover everything the occasion offers
   * shows no card at all — there is nothing to decide.
   */
  const parts = partsOf(inv, inv.template).filter((p) => p.state !== 'carried');
  const extraNote = String((content.extras as Record<string, unknown> | undefined)?.note ?? '');
  const extraVideo = String((content.extras as Record<string, unknown> | undefined)?.videoUrl ?? '');
  return (
    <>
      <BackLink href="/admin/invitations">Invitations</BackLink>
      <PageHeader title={inv.title} subtitle={<><InvitationPill status={inv.status} /> · {occasionLabel(inv.occasion)} · {inv.tier} · {inv.template.name} · <Link href={`/admin/customers/${inv.userId}`} className="underline">{inv.user.name}</Link></>}
        actions={<><a href={`${invitationPath(inv.slug)}?preview=1`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Preview</a>{editable && <Link href={`/account/invitations/${inv.id}/builder`} className="btn btn-primary btn-sm">Edit for the customer</Link>}</>} />
      <Flash {...sp} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Views" value={inv.viewCount} />
        <Stat label="Accepted" value={summary.accepted} hint={`${summary.seats} seats`} />
        <Stat label="Declined" value={summary.declined} />
        <Stat label="Guests listed" value={summary.guests} />
        <Stat label="Checked in" value={summary.checkedIn} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">Details</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-1">
            <dt className="text-[color:var(--color-ink-500)]">Link</dt><dd><a href={invitationUrl(inv.slug)} className="underline">{invitationUrl(inv.slug)}</a></dd>
            <dt className="text-[color:var(--color-ink-500)]">Privacy</dt><dd>{inv.privacy.toLowerCase()}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Language</dt><dd>{inv.language}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Event</dt><dd>{formatDate(inv.eventAt, 'weekday') || '—'}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Sends out</dt><dd>{schedule ? <>{formatDate(schedule.sendOut, 'weekday')} · <span className={schedule.late ? 'text-[color:var(--bad)]' : schedule.tight ? 'text-[color:var(--warn)]' : ''}>form due {formatDate(schedule.finalBy)}</span></> : '—'}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Published</dt><dd>{inv.publishedAt ? formatDateTime(inv.publishedAt) : '—'}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Expires</dt><dd>{inv.expiresAt ? formatDateTime(inv.expiresAt) : '—'}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Order</dt><dd>{inv.order ? <Link href={`/admin/orders/${inv.order.id}`} className="underline">{inv.order.reference}</Link> : '—'}</dd>
            <dt className="text-[color:var(--color-ink-500)]">DFY</dt><dd>{inv.dfyJob ? <Link href={`/admin/dfy/${inv.dfyJob.id}`} className="underline">{inv.dfyJob.status.toLowerCase().replace(/_/g, ' ')}</Link> : '—'}</dd>
          </dl>
        </section>
        {editable && (
          <section className="card space-y-3 p-4 text-sm">
            <h2 className="font-semibold">Support actions</h2>
            <form action={extendExpiryAction.bind(null, inv.id, back)} className="flex gap-1"><input name="days" type="number" defaultValue={30} className="field max-w-[6rem]" /><button className="btn btn-secondary btn-sm" type="submit">Extend link by days</button></form>
            <form action={setTierAction.bind(null, inv.id, back)} className="flex gap-1"><select name="tier" defaultValue={inv.tier} className="field max-w-[10rem]">{TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select><button className="btn btn-secondary btn-sm" type="submit">Transfer package</button></form>
            <form action={setPremiumOpeningAction.bind(null, inv.id, back)} className="flex gap-1"><select name="premiumOpening" defaultValue={inv.premiumOpening ? 'on' : 'off'} className="field max-w-[10rem]"><option value="off">Off</option><option value="on">On</option></select><button className="btn btn-secondary btn-sm" type="submit">Premium opening</button></form>
            {clips.length > 1 && <form action={setPremiumOpeningClipAction.bind(null, inv.id, back)} className="flex gap-1"><select name="premiumOpeningKey" defaultValue={inv.premiumOpeningKey} className="field max-w-[14rem]">{clips.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select><button className="btn btn-secondary btn-sm" type="submit">Which opening</button></form>}
            <form action={archiveInvitationAction.bind(null, inv.id, back)}><button className="btn btn-danger btn-sm" type="submit">Archive (hides the link)</button></form>
          </section>
        )}
      </div>
      {parts.length > 0 && (
        <section className="card mt-4 p-4 text-sm">
          <h2 className="mb-1 font-semibold">Parts this design does not draw</h2>
          <p className="text-xs text-[color:var(--color-ink-500)]">
            Adding one gives <b>this invitation</b> a page of its own for it. The design is untouched, so nobody else on it changes. It buys nothing: a part the package does not include stays unavailable until the package moves.
          </p>
          <ul className="mt-3 space-y-2">
            {parts.map((p) => (
              <li key={p.key} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[10rem]">{p.label}</span>
                {p.state === 'added' && (
                  <>
                    <span className="rounded-full bg-[color:var(--color-sand-100)] px-2 py-0.5 text-xs">On this invitation</span>
                    {editable && <form action={dropPartAction.bind(null, inv.id, back)}><input type="hidden" name="part" value={p.key} /><button className="btn btn-secondary btn-sm" type="submit">Take off</button></form>}
                  </>
                )}
                {p.state === 'addable' && editable && (
                  <form action={addPartAction.bind(null, inv.id, back)}><input type="hidden" name="part" value={p.key} /><button className="btn btn-secondary btn-sm" type="submit">Add to this invitation</button></form>
                )}
                {p.state === 'addable' && !editable && <span className="text-xs text-[color:var(--color-ink-500)]">Not drawn by this design</span>}
                {p.state === 'needs-upgrade' && (
                  <span className="text-xs text-[color:var(--color-ink-500)]">Included from {TIER_LABELS[p.needs!]} — move the package up first</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(extraPhotos.length > 0 || extraNote || extraVideo) && (
        <section className="card mt-4 p-4 text-sm">
          <h2 className="mb-1 font-semibold">Extras from the customer</h2>
          <p className="text-xs text-[color:var(--color-ink-500)]">Not on their invitation. Theirs to offer, ours to place where a page has room.</p>
          {extraPhotos.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {extraPhotos.map((r, i) => (
                <li key={String(r.url)} className="w-24">
                  <a href={String(r.url)} target="_blank" rel="noopener">
                    <img src={String(r.url)} alt={typeof r.caption === 'string' && r.caption ? r.caption : `Extra photo ${i + 1}`} className="h-24 w-24 rounded-lg border border-[color:var(--color-sand-200)] object-cover" loading="lazy" />
                  </a>
                  {typeof r.caption === 'string' && r.caption && <span className="mt-0.5 block truncate text-[10px] text-[color:var(--color-ink-500)]" title={r.caption}>{r.caption}</span>}
                </li>
              ))}
            </ul>
          )}
          {extraVideo && <p className="mt-2 text-xs">Video: <a href={extraVideo} target="_blank" rel="noopener" className="underline break-all">{extraVideo}</a></p>}
          {extraNote && <p className="mt-2 whitespace-pre-line text-xs text-[color:var(--color-ink-700)]"><b>Their note:</b> {extraNote}</p>}
        </section>
      )}
    </>
  );
}
