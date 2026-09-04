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
import { Reminders } from './reminders';
import { recentTexts } from '@/lib/reminders';
import { formatDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (!hasFeature(inv.tier, 'guests.manager')) redirect(`/account/invitations/${inv.id}/upgrade`);
  const [guests, tables, summary, texts] = await Promise.all([listGuests(inv.id), prisma.seatingTable.findMany({ where: { invitationId: inv.id }, orderBy: { sortOrder: 'asc' } }), rsvpSummary(inv.id), recentTexts(inv.id, 10)]);
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
      <Reminders invitationId={inv.id} live={Boolean(process.env.SEMAPHORE_API_KEY)} />

      {texts.length > 0 && (
        <details className="card mt-4 p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Recent reminders ({texts.length})</summary>
          <ul className="mt-3 divide-y divide-[color:var(--color-sand-100)]">
            {texts.map((t) => (
              <li key={t.id} className="py-2">
                <span className="font-medium">{t.guest?.name ?? t.to}</span>{' '}
                <span className="text-[color:var(--color-ink-500)]">
                  · {formatDateTime(t.createdAt)} · {t.status === 'SENT' ? 'sent' : t.status === 'LOGGED' ? 'logged (no SMS key)' : `failed — ${t.error}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4" />

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
