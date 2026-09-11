import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { listGuests, rsvpSummary } from '@/lib/guests';
import { entitled, hasFeature } from '@/lib/tiers';
import { invitationUrl } from '@/lib/app-url';
import { PageHeader, Stat } from '@/components/ui';
import { GuestManager } from './manager';
import { Reminders } from './reminders';
import { recentTexts, recentEmails } from '@/lib/reminders';
import { formatDateTime } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (!entitled(inv, 'guests.manager')) redirect(`/account/invitations/${inv.id}/upgrade`);
  const confirms = hasFeature(inv.tier, 'rsvp.emailConfirmation');
  const [guests, tables, summary, texts, emails] = await Promise.all([listGuests(inv.id), prisma.seatingTable.findMany({ where: { invitationId: inv.id }, orderBy: { sortOrder: 'asc' } }), rsvpSummary(inv.id), recentTexts(inv.id, 10), recentEmails(inv.id, 10)]);
  // Newest first across both, then the ten that matter. Each carries the word
  // for how it travelled, which is the only thing the list needs to keep them
  // apart.
  const sent = [
    ...texts.map((t) => ({ ...t, channel: 'text' as const })),
    ...emails.map((e) => ({ ...e, channel: 'e-mail' as const })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);
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
      {/* What each of these costs, said once and above them, because the
          difference is not visible from the buttons: a text is bought by the
          message from a gateway, an e-mail is not bought at all. A couple who
          does not know that will either not use the free one or be surprised
          by the bill for the other. */}
      <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">
        {confirms
          ? 'Your package sends every guest who leaves an e-mail address a confirmation of their reply, at no charge. The e-mail blast below is free too. An SMS blast is bought separately — texts are charged by the gateway, per message.'
          : 'The e-mail blast below is free. An SMS blast is bought separately — texts are charged by the gateway, per message. A confirmation e-mail to every guest who replies comes with the Luxury package.'}
      </p>

      {/* Both channels, side by side. A couple picks by what they have on the
          list: a number for the titas, an address for the ninong in Dubai. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Reminders invitationId={inv.id} live={Boolean(process.env.SEMAPHORE_API_KEY)} />
        <Reminders invitationId={inv.id} live={Boolean(process.env.RESEND_API_KEY)} channel="email" />
      </div>

      {/* One list, both channels, newest first — what a couple wants to know is
          "has this guest been chased", not which wire it went down. Each line
          says which anyway, because a text that failed and an e-mail that
          failed want different second attempts. */}
      {sent.length > 0 && (
        <details className="card mt-4 p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Recent reminders ({sent.length})</summary>
          <ul className="mt-3 divide-y divide-[color:var(--color-sand-100)]">
            {sent.map((t) => (
              <li key={t.id} className="py-2">
                <span className="font-medium">{t.guest?.name ?? t.to}</span>{' '}
                <span className="text-[color:var(--color-ink-500)]">
                  · {t.channel} · {formatDateTime(t.createdAt)} ·{' '}
                  {t.status === 'SENT' ? 'sent' : t.status === 'LOGGED' ? 'logged (no key set)' : `failed — ${t.error}`}
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
        canSeating={entitled(inv, 'seating')}
        tables={tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity }))}
        guests={guests.map((g) => ({ id: g.id, name: g.name, salutation: g.salutation, groupName: g.groupName, seatsAllotted: g.seatsAllotted, plusOneAllowed: g.plusOneAllowed, phone: g.phone, email: g.email, notes: g.notes, token: g.token, tableId: g.tableId, checkedIn: Boolean(g.checkedInAt), response: g.rsvps[0] ? { response: g.rsvps[0].response, seats: g.rsvps[0].seats } : null }))}
      />
    </>
  );
}
