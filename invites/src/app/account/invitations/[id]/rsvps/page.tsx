import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { rsvpSummary } from '@/lib/guests';
import { hasFeature } from '@/lib/tiers';
import { formatDateTime } from '@/lib/datetime';
import { replyIdentity } from '@/lib/names';
import { PageHeader, Stat, Empty } from '@/components/ui';
import { RsvpToggle } from './toggle';
import { companionsOf, attendeeLine } from '@/lib/attendees';

export const dynamic = 'force-dynamic';

/**
 * A reply's name as the couple should read it: theirs, with what the guest
 * typed beside it. A corporate reply's department sits here rather than in the
 * contact column, because it says who somebody is from, not how to reach them.
 */
function NameCell({ name, alias, group, department, personal }: { name: string; alias: string; group: string; department: string; personal: boolean }) {
  const under = [department, group, alias && `replied as ${alias}`, personal ? 'personal link' : ''].filter(Boolean).join(' · ');
  return (
    <td>
      {name}
      {under && <span className="block text-xs text-[color:var(--color-ink-500)]">{under}</span>}
    </td>
  );
}

/**
 * Whether this guest was written back to.
 *
 * Three answers, and the one that matters is the third: a guest who left no
 * address got no confirmation, and the couple is the only one who can fix that
 * — by asking them for one. Saying nothing would leave them assuming everybody
 * was told.
 */
function Confirmation({ sent, address }: { sent?: { status: string; error: string }; address: string }) {
  const [text, tone] = !address
    ? ['no e-mail address — nothing sent', 'var(--color-ink-500)']
    : sent?.status === 'SENT'
      ? ['confirmation sent', 'var(--color-ink-500)']
      : sent?.status === 'LOGGED'
        ? ['confirmation logged (no e-mail key set)', 'var(--color-ink-500)']
        : sent?.status === 'FAILED'
          ? [`confirmation failed — ${sent.error || 'the mail server refused it'}`, '#8f1d17']
          : ['no confirmation sent', '#8f1d17'];
  return <span className="mt-0.5 block text-xs" style={{ color: tone }}>{text}</span>;
}

export default async function RsvpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const [rsvps, summary] = await Promise.all([prisma.rsvp.findMany({ where: { invitationId: inv.id }, select: { id: true, name: true, groupName: true, response: true, seats: true, attendees: true, mealChoice: true, dietary: true, message: true, phone: true, email: true, department: true, updatedAt: true, guestId: true, guest: { select: { name: true } }, emails: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, error: true } } }, orderBy: { updatedAt: 'desc' } }), rsvpSummary(inv.id)]);
  const dashboard = hasFeature(inv.tier, 'rsvp.dashboard');
  const confirms = hasFeature(inv.tier, 'rsvp.emailConfirmation');
  return (
    <>
      <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
      <PageHeader title="RSVP responses" subtitle={inv.rsvpClosed ? 'RSVP is closed.' : 'RSVP is open.'} actions={<><RsvpToggle invitationId={inv.id} closed={inv.rsvpClosed} />{hasFeature(inv.tier, 'rsvp.export') && <><Link href={`/account/invitations/${inv.id}/rsvps/print`} className="btn btn-secondary btn-sm">Headcount sheet</Link><a href={`/account/invitations/${inv.id}/rsvps.csv`} className="btn btn-secondary btn-sm">Export Excel / CSV</a></>}</>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accepted" value={summary.accepted} />
        <Stat label="Seats confirmed" value={summary.seats} />
        <Stat label="Declined" value={summary.declined} />
        <Stat label="Total responses" value={summary.accepted + summary.declined} />
      </div>
      {!dashboard && <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">The Basic package shows responses here; the Standard package adds meal and dietary columns, Excel export, message history, and a printable headcount sheet to hand your caterer or coordinator. <Link href={`/account/invitations/${inv.id}/upgrade`} className="underline">Upgrade</Link></p>}
      {dashboard && <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">The headcount sheet prints on one page — who is coming, how many of each meal, and a tick box beside every name. Yours to hand out or send as a PDF.</p>}
      {rsvps.length === 0 ? <Empty>No responses yet.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr><th>Name</th><th>Response</th><th>Seats</th><th>Attendees</th>{dashboard && <><th>Meal</th><th>Dietary</th></>}<th>Message</th><th>Contact</th><th>When</th></tr></thead>
            <tbody>
              {rsvps.map((r) => (
                <tr key={r.id}>
                  <NameCell name={replyIdentity(r.name, r.guest?.name).name} alias={replyIdentity(r.name, r.guest?.name).alias} group={r.groupName} department={r.department} personal={Boolean(r.guestId)} />
                  <td><span className={`pill ${r.response === 'ACCEPT' ? 'pill-ok' : 'pill-bad'}`}>{r.response === 'ACCEPT' ? 'Accepted' : 'Declined'}</span></td>
                  <td>{r.response === 'ACCEPT' ? r.seats : '—'}</td>
                  {/* Each companion with what they are to the guest, which is the
                      part that decides whether they sit at the same table. */}
                  <td className="text-xs">{companionsOf(r.attendees).map((a) => attendeeLine(a)).join(', ')}</td>
                  {dashboard && <><td>{r.mealChoice}</td><td className="text-xs">{r.dietary}</td></>}
                  <td className="max-w-xs text-xs">{r.message}</td>
                  <td className="text-xs">
                    {[r.phone, r.email].filter(Boolean).join(' · ')}
                    {confirms && <Confirmation sent={r.emails[0]} address={r.email} />}
                  </td>
                  <td className="text-xs">{formatDateTime(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
