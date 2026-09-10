import { notFound, redirect } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { rsvpSheet } from '@/lib/guests';
import { hasFeature } from '@/lib/tiers';
import { contentOf } from '@/lib/invitations';
import { str, bool } from '@/lib/sections';
import { formatDate, formatTime, formatDateTime } from '@/lib/datetime';
import { getSettings } from '@/lib/settings';
import { PrintButton } from './print-button';
import { attendeeLine } from '@/lib/attendees';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false }, title: 'Headcount sheet' };

/**
 * The headcount sheet: one page the couple prints and hands to their caterer or
 * coordinator. It is deliberately plain — no colours to eat a printer's ink,
 * and no column for anything the couple was never asked for.
 */
export default async function RsvpPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (!hasFeature(inv.tier, 'rsvp.export')) redirect(`/account/invitations/${inv.id}/upgrade`);

  const [sheet, s] = await Promise.all([rsvpSheet(inv.id), getSettings()]);
  const content = contentOf(inv.content);
  const venue = str(content.reception, 'venue') || str(content.ceremony, 'venue');
  const time = str(content.reception, 'time') || str(content.ceremony, 'time');
  const showMeals = hasFeature(inv.tier, 'rsvp.meal');
  // A couple who never asked how many are coming gets a column of 1s, which is
  // worse than no column at all.
  const showSeats = bool(content.rsvp, 'showSeats');
  // Only once somebody is actually seated. rsvpSheet works this out; the sheet
  // never prints a column of dashes for a seating plan nobody drew.
  const showTables = sheet.seated;
  const where = [venue, time && formatTime(time)].filter(Boolean).join(' · ');

  return (
    <div className="sheet">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <a href={`/account/invitations/${inv.id}/rsvps`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← Back to responses</a>
        <PrintButton />
      </div>

      <header className="sheet-head">
        <p className="sheet-eyebrow">Headcount sheet</p>
        <h1 className="sheet-title">{inv.title}</h1>
        <p className="sheet-sub">{[inv.eventAt ? formatDate(inv.eventAt) : '', where].filter(Boolean).join(' · ')}</p>
      </header>

      <section className="sheet-figures">
        <div className="sheet-figure sheet-figure-lead">
          <span className="sheet-figure-n">{sheet.summary.seats}</span>
          <span className="sheet-figure-l">Coming</span>
        </div>
        <div className="sheet-figure">
          <span className="sheet-figure-n">{sheet.summary.accepted}</span>
          <span className="sheet-figure-l">Accepted</span>
        </div>
        <div className="sheet-figure">
          <span className="sheet-figure-n">{sheet.summary.declined}</span>
          <span className="sheet-figure-l">Declined</span>
        </div>
        <div className="sheet-figure">
          <span className="sheet-figure-n">{sheet.replies}</span>
          <span className="sheet-figure-l">Replies</span>
        </div>
      </section>

      {showMeals && sheet.meals.length > 0 && (
        <section className="sheet-block">
          <h2 className="sheet-h2">Meals to prepare</h2>
          <ul className="sheet-meals">
            {sheet.meals.map((m) => (
              <li key={m.meal}><span className="sheet-meal-n">{m.seats}</span> {m.meal}</li>
            ))}
          </ul>
        </section>
      )}

      {sheet.replies === 0 ? (
        <p className="sheet-empty">No responses yet. Print this again once your guests have replied.</p>
      ) : (
        sheet.groups.map((g) => (
          <section key={g.name} className="sheet-block">
            <h2 className="sheet-h2">
              {sheet.grouped ? g.name : 'Guest list'}
              <span className="sheet-h2-n">{showSeats ? `${g.seats} coming · ` : ''}{g.replies} {g.replies === 1 ? 'reply' : 'replies'}</span>
            </h2>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="sheet-tick"><span className="sr-only">Arrived</span></th>
                  <th>Name</th>
                  {showTables && <th className="sheet-seat">Table</th>}
                  {showSeats && <th className="sheet-num">Coming</th>}
                  {showMeals && <th className="sheet-meal">Meal</th>}
                  {showMeals && <th className="sheet-notes">Notes</th>}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className={r.state === 'DECLINE' ? 'sheet-out' : undefined}>
                    <td className="sheet-tick"><span className="sheet-box" /></td>
                    <td>
                      {r.name}
                      {r.alias && <span className="sheet-with">replied as {r.alias}</span>}
                      {!showSeats && r.state === 'DECLINE' && <span className="sheet-with">Cannot make it</span>}
                      {r.attendees.length > 1 && <span className="sheet-with">with {r.attendees.slice(1).map((a) => attendeeLine(a)).join(', ')}</span>}
                    </td>
                    {showTables && <td className="sheet-seat">{r.table || '—'}</td>}
                    {showSeats && <td className="sheet-num">{r.state === 'ACCEPT' ? r.seats : '—'}</td>}
                    {showMeals && <td className="sheet-meal">{r.meal}</td>}
                    {showMeals && <td className="sheet-notes sheet-note">{r.dietary}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      {sheet.pending.length > 0 && (
        <section className="sheet-block">
          <h2 className="sheet-h2">
            Still waiting on
            <span className="sheet-h2-n">{sheet.pending.length} {sheet.pending.length === 1 ? 'guest' : 'guests'}</span>
          </h2>
          <p className="sheet-pending">
            {sheet.pending.map((g, i) => (
              <span key={`${g.name}-${i}`}>
                {i > 0 && ' · '}
                {g.name}
                {showTables && g.table && <span className="sheet-note"> ({g.table})</span>}
              </span>
            ))}
          </p>
        </section>
      )}

      <footer className="sheet-foot">
        <span>{inv.title} · headcount as of {formatDateTime(new Date())}</span>
        <span>{s['business.name']}</span>
      </footer>
    </div>
  );
}
