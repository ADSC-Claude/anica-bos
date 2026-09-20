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
import { awaitingDecision, replySeats, sourceLabel, wasVetted, type ReplySource } from '@/lib/seats';
import { invitationUrl } from '@/lib/app-url';
import { displayTitle, fieldsFor, bool } from '@/lib/sections';
import { contentOf } from '@/lib/invitations';
import { whyLocked } from '@/lib/progress';
import { rsvpStats, type BreakdownKey } from '@/lib/rsvp-stats';
import { Decide } from './decide';
import { Remove } from './remove';
import { WhatGuestsSee } from './questions';
import { MatchToGuest } from './match';

export const dynamic = 'force-dynamic';

/** How many messages are shown before the rest fold away. */
const MESSAGES_SHOWN = 6;

/** The bars' colours: the tones the pills already use for a yes and a no, and the sand the page rests on for nobody yet. */
const BAR: Record<BreakdownKey, string> = { attending: 'var(--ok)', declined: 'var(--bad)', pending: 'var(--color-sand-300)' };

/**
 * A reply's name as the couple should read it: theirs, with what the guest
 * typed beside it. A corporate reply's department sits here rather than in the
 * contact column, because it says who somebody is from, not how to reach them.
 */
function NameCell({ name, alias, group, department, from, match }: { name: string; alias: string; group: string; department: string; from: string; match?: React.ReactNode }) {
  const under = [department, group, alias && `replied as ${alias}`, from].filter(Boolean).join(' · ');
  return (
    <td>
      {name}
      {under && <span className="block text-xs text-[color:var(--color-ink-500)]">{under}</span>}
      {match}
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

/** One guest's words, quoted and signed, the way the guestbook shows a wish. */
function MessageCard({ name, message }: { name: string; message: string }) {
  return (
    <li className="rounded-lg border border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)] p-3">
      <blockquote className="whitespace-pre-line text-sm">“{message}”</blockquote>
      <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">— {name}</p>
    </li>
  );
}

export default async function RsvpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const [rsvps, summary] = await Promise.all([prisma.rsvp.findMany({ where: { invitationId: inv.id }, select: { id: true, name: true, groupName: true, response: true, seats: true, seatsApproved: true, attendees: true, mealChoice: true, dietary: true, message: true, phone: true, email: true, department: true, updatedAt: true, guestId: true, source: true, guest: { select: { name: true, salutation: true, token: true } }, emails: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, error: true } } }, orderBy: { updatedAt: 'desc' } }), rsvpSummary(inv.id)]);
  const dashboard = hasFeature(inv.tier, 'rsvp.dashboard');
  const confirms = entitled(inv, 'rsvp.emailConfirmation');
  const meals = hasFeature(inv.tier, 'rsvp.meal');
  // The silent bar needs a list to be silent from: without the guest list
  // there is nobody to count as not having answered.
  const manager = entitled(inv, 'guests.manager');

  // Which replies nobody vetted. A reply that came through a personal link was
  // already held to the seats this couple set aside for it — submitRsvp refuses
  // a bigger number outright — so it never queues. What is left is the plain
  // link, where the seats dropdown goes to ten and nothing checks it.
  //
  // `vetted` needs both halves: the token has to have resolved to a guest AND
  // the invitation has to carry personal links, because the cap in submitRsvp
  // is behind that same entitlement.
  // wasVetted, not `Boolean(guestId)`: the guest-list picker sets a guestId
  // on a reply nobody vetted, and reading one as the other let a picked name
  // claim ten seats and skip this queue. See seats.ts.
  /*
   * The names, once, for the matcher on every unmatched row. Id and name and
   * nothing else: this is a shortlist to press, not the guest list, and the
   * tokens and numbers on those rows have no business in a page prop.
   */
  const guestNames = manager
    ? await prisma.guest.findMany({ where: { invitationId: inv.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : [];
  const personalLinks = entitled(inv, 'rsvp.personalLinks');
  const vettedOf = (r: { guestId: string | null; source?: ReplySource }) => wasVetted(r, personalLinks);
  // The queue keeps a reply that was cut, rather than dropping it the moment
  // the number is saved. Two reasons: the couple still has to tell that guest,
  // and the drawer where they write it would otherwise unmount mid-sentence
  // when the page revalidates. Settling at the full number does remove it —
  // there is nothing left to do and nobody to write to.
  const queue = rsvps.filter(
    (r) => awaitingDecision(r, vettedOf(r)) || (r.seatsApproved !== null && r.seatsApproved < r.seats && r.response === 'ACCEPT'),
  );
  const waiting = rsvps.filter((r) => awaitingDecision(r, vettedOf(r))).length;
  const content = contentOf(inv.content);
  const hosts = inv.title.trim() || displayTitle(inv.occasion, content);

  // The numbers, from the same rows the table draws — signed with the name the
  // couple knows the guest by, which is the list's where there is one.
  const stats = rsvpStats(
    rsvps.map((r) => ({ response: r.response, seats: r.seats, seatsApproved: r.seatsApproved, mealChoice: r.mealChoice, dietary: r.dietary, message: r.message, name: replyIdentity(r.name, r.guest?.name).name })),
    manager ? summary.pending : 0,
  );
  const bars = stats.breakdown.filter((b) => b.key !== 'pending' || manager);
  const shown = stats.messages.slice(0, MESSAGES_SHOWN);
  const folded = stats.messages.slice(MESSAGES_SHOWN);

  // What the questions card needs: the whole section, so a switch can send it
  // all back; why it is locked, if it is (the RSVP questions stay the
  // customer's on a live page — whyLocked says so); and the deadline field's
  // own words, so the two tabs never describe the same date two ways.
  const rsvpSection = content.rsvp ?? {};
  const locked = whyLocked(inv, 'rsvp');
  const rsvpFields = fieldsFor('rsvp', inv.occasion);
  const deadlineHint = rsvpFields.find((f) => f.key === 'deadline')?.hint ?? '';
  const phonePlaceholder = rsvpFields.find((f) => f.key === 'contactPhone')?.placeholder ?? '';

  return (
    <>
      <PageHeader
        title="RSVP responses"
        subtitle={`Every reply your guests send, counted up, and the form they fill in as they see it. RSVP is ${inv.rsvpClosed ? 'closed' : 'open'}.`}
        actions={<><RsvpToggle invitationId={inv.id} closed={inv.rsvpClosed} />{hasFeature(inv.tier, 'rsvp.export') && <><Link href={`/account/invitations/${inv.id}/rsvps/print`} className="btn btn-secondary btn-sm">Headcount sheet</Link><a href={`/account/invitations/${inv.id}/rsvps.csv`} className="btn btn-secondary btn-sm">Export Excel / CSV</a></>}</>}
      />
      <div className={`mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 ${waiting ? 'lg:grid-cols-5' : ''}`}>
        <Stat label="Responses" value={stats.responses} />
        <Stat label="Attending" value={stats.attending} hint="seats confirmed" />
        <Stat label="Not attending" value={stats.notAttending} />
        <Stat label="Average party size" value={stats.accepted ? stats.averageParty.toFixed(1) : '—'} hint="seats per reply that said yes" />
        {waiting > 0 && <Stat label="Waiting on you" value={waiting} tone="warn" hint="seats nobody set aside" />}
      </div>
      {!dashboard && <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">The Basic package shows responses here; the Standard package adds meal and dietary columns, Excel export, message history, and a printable headcount sheet to hand your caterer or coordinator. <Link href={`/account/invitations/${inv.id}/upgrade`} className="underline">Upgrade</Link></p>}
      {dashboard && <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">The headcount sheet prints on one page — who is coming, how many of each meal, and a tick box beside every name. Yours to hand out or send as a PDF.</p>}

      {rsvps.length === 0 ? (
        <div className="mb-4"><Empty>Once your guests start replying you will see the numbers here — who is coming, how many seats, meal choices, and their messages.</Empty></div>
      ) : (
        <div className="mb-4 space-y-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold">Attendance</h2>
            <p className="mt-1 mb-3 text-xs text-[color:var(--color-ink-500)]">
              {manager
                ? 'Every reply so far, and the guests on your list who have not answered, each as a share of the whole.'
                : 'Every reply so far, each as a share of all of them.'}
            </p>
            <ul className="grid gap-3">
              {bars.map((b) => (
                <li key={b.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{b.label}</span>
                    <span className="text-xs tabular-nums text-[color:var(--color-ink-500)]">{b.count} · {b.pct}%</span>
                  </div>
                  <div aria-hidden className="mt-1 h-2 overflow-hidden rounded-full bg-[color:var(--color-sand-100)]">
                    <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: BAR[b.key] }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {((meals && stats.meals.length > 0) || dashboard) && (
            <div className="grid gap-4 md:grid-cols-2">
              {meals && stats.meals.length > 0 && (
                <div className="card p-4">
                  <h2 className="text-sm font-semibold">Meal choices</h2>
                  <p className="mt-1 mb-3 text-xs text-[color:var(--color-ink-500)]">Counted by seat, the way the headcount sheet counts them — a reply picks one meal for its whole party.</p>
                  <ul className="flex flex-wrap gap-2">
                    {stats.meals.map((m) => <li key={m.label} className="pill pill-muted">{m.label} · {m.count}</li>)}
                  </ul>
                </div>
              )}
              {dashboard && (
                <div className="card p-4">
                  <h2 className="text-sm font-semibold">Dietary notes</h2>
                  <p className="mt-1 mb-3 text-xs text-[color:var(--color-ink-500)]">{stats.toldDietary} of {stats.accepted} attending told you something.</p>
                  {stats.dietary.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {stats.dietary.map((d) => <li key={d.label} className="pill pill-muted">{d.label} · {d.count}</li>)}
                    </ul>
                  ) : (
                    <p className="text-xs text-[color:var(--color-ink-500)]">
                      {bool(rsvpSection, 'askDietary') ? 'Nothing mentioned yet. Each need will appear here with how many guests share it.' : 'You are not asking about it yet — the switch is under What guests see, below.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {stats.messages.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold">Messages ({stats.messages.length})</h2>
              <p className="mt-1 mb-3 text-xs text-[color:var(--color-ink-500)]">What guests wrote in the message box, newest first.</p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((m, i) => <MessageCard key={i} name={m.name} message={m.message} />)}
              </ul>
              {folded.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[color:var(--color-plum-600)]">Show all {stats.messages.length}</summary>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {folded.map((m, i) => <MessageCard key={i} name={m.name} message={m.message} />)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <WhatGuestsSee invitationId={inv.id} slug={inv.slug} section={rsvpSection} locked={locked} live={inv.status === 'PUBLISHED'} confirms={confirms} deadlineHint={deadlineHint} phonePlaceholder={phonePlaceholder} />
      </div>

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

      {rsvps.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr><th>Name</th><th>Response</th><th>Seats</th><th>Attendees</th>{dashboard && <><th>Meal</th><th>Dietary</th></>}<th>Message</th><th>Contact</th><th>When</th><th><span className="sr-only">Remove this reply</span></th></tr></thead>
            <tbody>
              {rsvps.map((r) => (
                <tr key={r.id}>
                  <NameCell
                          name={replyIdentity(r.name, r.guest?.name).name}
                          alias={replyIdentity(r.name, r.guest?.name).alias}
                          group={r.groupName}
                          department={r.department}
                          from={sourceLabel(r)}
                          match={
                            r.source === 'LINK' ? null : (
                              <MatchToGuest
                                invitationId={inv.id}
                                replyId={r.id}
                                replyName={r.name}
                                matchedName={r.guestId ? (r.guest?.name ?? '') : undefined}
                                guests={guestNames}
                              />
                            )
                          }
                        />
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
                  {/* Last, and quiet. A guest who answered twice through a
                      plain link is two rows here and the couple is the only
                      one who can say which to keep. */}
                  <td><Remove invitationId={inv.id} replyId={r.id} name={replyIdentity(r.name, r.guest?.name).name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
