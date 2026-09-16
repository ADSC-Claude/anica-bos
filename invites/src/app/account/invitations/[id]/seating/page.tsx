import { notFound, redirect } from 'next/navigation';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { listGuests, TABLE_SHAPES, TABLE_SHAPE_LABELS, tableShape } from '@/lib/guests';
import { entitled } from '@/lib/tiers';
import { seatingStats } from '@/lib/seating';
import { PageHeader, Stat } from '@/components/ui';
import { SeatingChart } from './chart';

export const dynamic = 'force-dynamic';

/**
 * The Seating chart tab. The names come from the Guest list; this page only
 * decides where they sit. None of it is section content, so the change window
 * that closes the form three weeks out does not close this: saveTable and
 * assignTable ask only whether the package includes the chart, and a couple
 * can still move a name the week of the event.
 */
export default async function SeatingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (!entitled(inv, 'seating')) redirect(`/account/invitations/${inv.id}/upgrade`);
  const [guests, tables] = await Promise.all([listGuests(inv.id), prisma.seatingTable.findMany({ where: { invitationId: inv.id }, orderBy: { sortOrder: 'asc' } })]);
  // The reply travels with the guest, settled number included, so the card
  // counts what the couple agreed to and not what the guest first claimed.
  const rows = guests.map((g) => ({
    id: g.id,
    name: g.name,
    groupName: g.groupName,
    seatsAllotted: g.seatsAllotted,
    tableId: g.tableId,
    response: g.rsvps[0] ? { response: g.rsvps[0].response, seats: g.rsvps[0].seats, seatsApproved: g.rsvps[0].seatsApproved } : null,
  }));
  const stats = seatingStats(tables, rows);
  const chairs = tables.reduce((n, t) => n + t.capacity, 0);
  const unseated = rows.filter((g) => !g.tableId).length;
  return (
    <>
      <PageHeader title="Seating chart" subtitle="Guests come from your Guest list. Lay the tables out here and drag each name to a seat — their table then shows on their personal link." />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Tables" value={stats.tables} hint={chairs ? `${chairs} chairs in all` : undefined} />
        <Stat label="Seated" value={stats.seated} hint={rows.length ? `${unseated} of ${rows.length} guest${rows.length === 1 ? '' : 's'} not seated yet` : undefined} tone={unseated ? 'warn' : undefined} />
        <Stat label="Empty seats" value={stats.empty} />
      </div>
      <SeatingChart
        invitationId={inv.id}
        tables={tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity, shape: tableShape(t.shape) }))}
        guests={rows}
        shapes={TABLE_SHAPES.map((value) => ({ value, label: TABLE_SHAPE_LABELS[value] }))}
      />
    </>
  );
}
