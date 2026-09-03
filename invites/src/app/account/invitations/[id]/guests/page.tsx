import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { listGuests, rsvpSummary } from '@/lib/guests';
import { hasFeature } from '@/lib/tiers';
import { invitationUrl } from '@/lib/app-url';
import { PageHeader, Stat } from '@/components/ui';
import { GuestManager } from './manager';

export const dynamic = 'force-dynamic';

export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (!hasFeature(inv.tier, 'guests.manager')) redirect(`/account/invitations/${inv.id}/upgrade`);
  const [guests, tables, summary] = await Promise.all([listGuests(inv.id), prisma.seatingTable.findMany({ where: { invitationId: inv.id }, orderBy: { sortOrder: 'asc' } }), rsvpSummary(inv.id)]);
  return (
    <>
      <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
      <PageHeader title="Guest list" subtitle="Each guest gets a personal link: their name, their reserved seats, their table. Send it by Messenger, Viber or SMS." actions={<a href={`/account/invitations/${inv.id}/guests.csv`} className="btn btn-secondary btn-sm">Export Excel / CSV</a>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="On the list" value={summary.guests} />
        <Stat label="Accepted" value={summary.accepted} hint={`${summary.seats} seats`} />
        <Stat label="Declined" value={summary.declined} />
        <Stat label="No response" value={summary.pending} tone={summary.pending ? 'warn' : undefined} />
      </div>
      <GuestManager
        invitationId={inv.id}
        slug={inv.slug}
        baseUrl={invitationUrl(inv.slug)}
        reminder={`Hi {name}! Please RSVP for ${inv.title} here: {link}`}
        canSeating={hasFeature(inv.tier, 'seating')}
        tables={tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity, seated: guests.filter((g) => g.tableId === t.id).reduce((a, g) => a + (g.rsvps[0]?.response === 'ACCEPT' ? g.rsvps[0].seats : g.seatsAllotted), 0) }))}
        guests={guests.map((g) => ({ id: g.id, name: g.name, salutation: g.salutation, groupName: g.groupName, seatsAllotted: g.seatsAllotted, plusOneAllowed: g.plusOneAllowed, phone: g.phone, email: g.email, notes: g.notes, token: g.token, tableId: g.tableId, checkedIn: Boolean(g.checkedInAt), response: g.rsvps[0] ? { response: g.rsvps[0].response, seats: g.rsvps[0].seats } : null }))}
      />
    </>
  );
}
