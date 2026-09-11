import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { rsvpSummary } from '@/lib/guests';
import { hasFeature, entitled } from '@/lib/tiers';
import { formatDateTime } from '@/lib/datetime';
import { replyIdentity } from '@/lib/names';
import { PageHeader, Stat, Empty } from '@/components/ui';
import { RsvpToggle } from './toggle';
import { companionsOf, attendeeLine } from '@/lib/attendees';
import { awaitingDecision, replySeats } from '@/lib/seats';
import { invitationUrl } from '@/lib/app-url';
import { displayTitle } from '@/lib/sections';
import { contentOf } from '@/lib/invitations';
import { Decide } from './decide';

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
  const [rsvps, summary] = await Promise.all([prisma.rsvp.findMany({ where: { invitationId: inv.id }, select: { id: true, name: true, groupName: true, response: true, seats: true, seatsApproved: true, attendees: true, mealChoice: true, dietary: true, message: true, phone: true, email: true, department: true, updatedAt: true, guestId: true, guest: { select: { name: true, salutation: true, token: true } }, emails: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, error: true } } }, orderBy: { updatedAt: 'desc' } }), rsvpSummary(inv.id)]);
  const dashboard = hasFeature(inv.tier, 'rsvp.dashboard');
  const confirms = entitled(inv, 'rsvp.emailConfirmation');

  // Which replies nobody vetted. A reply that came through a personal link was
  // already held to the seats this couple set aside for it — submitRsvp refuses
  // a bigger number outright — so it never queues. What is left is the plain
  // link, where the seats dropdown goes to ten and nothing checks it.
  //
  // `vetted` needs both halves: the token has to have resolved to a guest AND
  // the invitation has to carry personal links, because the cap in submitRsvp
  // is behind that same entitlement.
  const personalLinks = entitled(inv, 'rsvp.personalLinks');
  const vettedOf = (r: { guestId: string | null }) => Boolean(r.guestId) && personalLinks;
  // The queue keeps a reply that was cut, rather than dropping it the moment
  // the number is saved. Two reasons: the couple still has to tell that guest,
  // and the drawer where they write it would otherwise unmount mid-sentence
  // when the page revalidates. Settling at the full number does remove it —
  // there is nothing left to do and nobody to write to.
  const queue = rsvps.filter(
    (r) => awaitingDecision(r, vettedOf(r)) || (r.seatsApproved !== null && r.seatsApproved < r.seats && r.response === 'ACCEPT'),
  );
  const waiting = rsvps.filter((r) => awaitingDecision(r, vettedOf(r))).length;
  const hosts = inv.title.trim() || displayTitle(inv.occasion, contentOf(inv.content));
  return (
    <>
      <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
      <PageHeader title="RSVP responses" subtitle={inv.rsvpClosed ? 'RSVP is closed.' : 'RSVP is open.'} actions={<><RsvpToggle invitationId={inv.id} closed={inv.rsvpClosed} />{hasFeature(inv.tier, 'rsvp.export') && <><Link href={`/account/invitations/${inv.id}/rsvps/print`} className="btn btn-secondary btn-sm">Headcount sheet</Link><a href={`/account/invitations/${inv.id}/rsvps.csv`} className="btn btn-secondary btn-sm">Export Excel / CSV</a></>}</>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Accepted" value={summary.accepted} />
        <Stat label="Seats confirmed" value={summary.seats} />
        <Stat label="Declined" value={summary.declined} />
        <Stat label="Total responses" value={summary.accepted + summary.declined} />
        <Stat label="Waiting on you" value={waiting} tone={waiting ? 'warn' : undefined} hint={waiting ? 'seats nobody set aside' : undefined} />
      </div>
      {!dashboard && <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">The Basic package shows responses here; the Standard package adds meal and dietary columns, Excel export, message history, and a printable headcount sheet to hand your caterer or coordinator. <Link href={`/account/invitations/${inv.id}/upgrade`} className="underline">Upgrade</Link></p>}
      {dashboard && <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">The headcount sheet prints on one page — who is coming, how many of each meal, and a tick box beside every name. Yours to hand out or send as a PDF.</p>}
      {queue.length > 0 && (
        <div className="card mb-4 p-4">
          <h2 className="text-sm font-semibold">Seats to settle ({queue.length})</h2>
          {/* Said once, above the list, because it is the thing that explains
              why these particular names are here and the others are not. */}
          <p className="mt-1 mb-3 max-w-2xl text-xs text-[color:var(--color-ink-500)]">
            These replies came through your public link, where the form lets a guest pick their own number and nothing
            checks it against a list. Their seats are counted in your total for now, and no confirmation has gone to
            them yet — settling each one is what makes the number yours and sends the receipt. Guests you sent a
            personal link to are not here: they were already held to the seats you set aside for them.
          </p>
          <ul className="divide-y divide-[color:var(--color-sand-100)]">
            {queue.map((r) => (
              <li key={r.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
                <span className="text-sm">
                  <b>{replyIdentity(r.name, r.guest?.name).name}</b>
                  <span className="block text-xs text-[color:var(--color-ink-500)]">
                    {[r.groupName, companionsOf(r.attendees).map((a) => attendeeLine(a)).join(', ')].filter(Boolean).join(' · ') || 'no companions named'}
                  </span>
                  <span className="block text-xs text-[color:var(--color-ink-500)]">
                    {r.email || r.phone || 'no contact details'}
                  </span>
                </span>
                <Decide
                  invitationId={inv.id}
                  hosts={hosts}
                  link={invitationUrl(inv.slug, r.guest?.token)}
                  canEmail={confirms}
                  reply={{
                    id: r.id,
                    guestName: r.guest?.salutation || r.guest?.name || r.name,
                    claimed: r.seats,
                    approved: r.seatsApproved,
                    awaiting: r.seatsApproved === null,
                    address: r.email,
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {rsvps.length === 0 ? <Empty>No responses yet.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr><th>Name</th><th>Response</th><th>Seats</th><th>Attendees</th>{dashboard && <><th>Meal</th><th>Dietary</th></>}<th>Message</th><th>Contact</th><th>When</th></tr></thead>
            <tbody>
              {rsvps.map((r) => (
                <tr key={r.id}>
                  <NameCell name={replyIdentity(r.name, r.guest?.name).name} alias={replyIdentity(r.name, r.guest?.name).alias} group={r.groupName} department={r.department} personal={Boolean(r.guestId)} />
                  <td><span className={`pill ${r.response === 'ACCEPT' ? 'pill-ok' : 'pill-bad'}`}>{r.response === 'ACCEPT' ? 'Accepted' : 'Declined'}</span></td>
                  <td>
                    {r.response === 'ACCEPT' ? (
                      <>
                        <span className="tabular-nums">{replySeats(r)}</span>
                        {r.seatsApproved !== null && r.seatsApproved !== r.seats && (
                          <span className="block text-xs text-[color:var(--color-ink-500)]">they put down {r.seats}</span>
                        )}
                        {awaitingDecision(r, vettedOf(r)) && (
                          <span className="block text-xs" style={{ color: '#8f1d17' }}>waiting on you</span>
                        )}
                      </>
                    ) : '—'}
                  </td>
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
