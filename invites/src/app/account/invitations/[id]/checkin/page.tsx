import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { listGuests } from '@/lib/guests';
import { hasFeature } from '@/lib/tiers';
import { PageHeader } from '@/components/ui';
import { CheckInDesk } from './desk';

export const dynamic = 'force-dynamic';

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (!hasFeature(inv.tier, 'checkin')) redirect(`/account/invitations/${inv.id}/upgrade`);
  const guests = await listGuests(inv.id);
  return (
    <>
      <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
      <PageHeader title="Event-day check-in" subtitle="Scan a guest's QR with any camera app, paste the link here, or search by name. Works on a phone at the door." />
      <CheckInDesk invitationId={inv.id} guests={guests.map((g) => ({ id: g.id, name: g.name, groupName: g.groupName, seats: g.rsvps[0]?.response === 'ACCEPT' ? g.rsvps[0].seats : g.seatsAllotted, table: g.table?.name ?? '', checkedIn: Boolean(g.checkedInAt), token: g.token }))} />
    </>
  );
}
