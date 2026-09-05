import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { rsvpSummary } from '@/lib/guests';
import { occasionLabel } from '@/lib/occasions';
import { TIERS } from '@/lib/tiers';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { invitationUrl, invitationPath } from '@/lib/app-url';
import { PageHeader, BackLink, InvitationPill, Stat } from '@/components/ui';
import { Flash, type FlashParams } from '../../flash';
import { extendExpiryAction, setTierAction, archiveInvitationAction } from '../../actions';

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
            <dt className="text-[color:var(--color-ink-500)]">Published</dt><dd>{inv.publishedAt ? formatDateTime(inv.publishedAt) : '—'}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Expires</dt><dd>{inv.expiresAt ? formatDateTime(inv.expiresAt) : '—'}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Edits</dt><dd>{inv.editsAllowed < 0 ? 'unlimited' : `${inv.editsUsed} / ${inv.editsAllowed}`}</dd>
            <dt className="text-[color:var(--color-ink-500)]">Order</dt><dd>{inv.order ? <Link href={`/admin/orders/${inv.order.id}`} className="underline">{inv.order.reference}</Link> : '—'}</dd>
            <dt className="text-[color:var(--color-ink-500)]">DFY</dt><dd>{inv.dfyJob ? <Link href={`/admin/dfy/${inv.dfyJob.id}`} className="underline">{inv.dfyJob.status.toLowerCase().replace(/_/g, ' ')}</Link> : '—'}</dd>
          </dl>
        </section>
        {editable && (
          <section className="card space-y-3 p-4 text-sm">
            <h2 className="font-semibold">Support actions</h2>
            <form action={extendExpiryAction.bind(null, inv.id, back)} className="flex gap-1"><input name="days" type="number" defaultValue={30} className="field max-w-[6rem]" /><button className="btn btn-secondary btn-sm" type="submit">Extend link by days</button></form>
            <form action={setTierAction.bind(null, inv.id, back)} className="flex gap-1"><select name="tier" defaultValue={inv.tier} className="field max-w-[10rem]">{TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select><button className="btn btn-secondary btn-sm" type="submit">Transfer package</button></form>
            <form action={archiveInvitationAction.bind(null, inv.id, back)}><button className="btn btn-danger btn-sm" type="submit">Archive (hides the link)</button></form>
          </section>
        )}
      </div>
    </>
  );
}
