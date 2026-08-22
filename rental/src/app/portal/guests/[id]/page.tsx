import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPeso, formatPesoShort } from '@/lib/money';
import { formatManila, formatStayRange } from '@/lib/datetime';
import { guestName, mergeGuests, normalizeEmail, normalizeMobile, refreshGuestStats } from '@/lib/guests';
import { audit } from '@/lib/audit';
import {
  BackLink,
  Card,
  Empty,
  Field,
  Notice,
  PageHeader,
  Pill,
  StatusPill,
  Stat,
  TextArea,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

const TIER_TONE = { NEW: 'muted', REPEAT: 'info', VIP: 'warn' } as const;

function back(id: string, message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/guests/${id}?${kind}=${encodeURIComponent(message)}`);
}

async function saveAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await requirePage('guests.edit');

  const before = await prisma.guest.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, email: true, mobile: true, address: true, preferences: true, notes: true },
  });
  if (!before) notFound();

  const after = {
    firstName: String(formData.get('firstName') ?? '').trim(),
    lastName: String(formData.get('lastName') ?? '').trim(),
    email: normalizeEmail(String(formData.get('email') ?? '')),
    mobile: normalizeMobile(String(formData.get('mobile') ?? '')),
    address: String(formData.get('address') ?? '').trim(),
    preferences: String(formData.get('preferences') ?? '').trim(),
    notes: String(formData.get('notes') ?? '').trim(),
  };
  if (!after.firstName) back(id, 'A first name is required.', 'error');

  await prisma.guest.update({ where: { id }, data: after });
  await audit(user, {
    module: 'guests',
    action: 'update',
    entityType: 'Guest',
    entityId: id,
    summary: `Guest profile updated: ${after.firstName} ${after.lastName}`.trim(),
    before,
    after,
  });
  back(id, 'Profile saved.');
}

async function consentAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await requirePage('guests.edit');
  const opting = formData.get('consent') === 'on';

  const before = await prisma.guest.findUniqueOrThrow({
    where: { id },
    select: { marketingConsent: true, consentAt: true },
  });

  // Withdrawing consent clears the timestamp; granting it stamps now, and only
  // when it was not already granted, so the original yes keeps its date.
  await prisma.guest.update({
    where: { id },
    data: {
      marketingConsent: opting,
      consentAt: opting ? (before.consentAt ?? new Date()) : null,
    },
  });
  await audit(user, {
    module: 'guests',
    action: opting ? 'consent.grant' : 'consent.withdraw',
    entityType: 'Guest',
    entityId: id,
    summary: opting ? 'Marketing consent recorded' : 'Marketing consent withdrawn',
    before,
    after: { marketingConsent: opting },
  });
  back(id, opting ? 'Marketing consent recorded.' : 'Marketing consent withdrawn.');
}

async function noteAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await requirePage('guests.edit');
  const body = String(formData.get('body') ?? '').trim();
  if (!body) back(id, 'Nothing to save.', 'error');

  await prisma.guestNote.create({
    data: { guestId: id, authorId: user.id, kind: String(formData.get('kind') || 'NOTE'), body },
  });
  back(id, 'Note added.');
}

async function mergeAction(formData: FormData) {
  'use server';
  const winnerId = String(formData.get('id'));
  const loserId = String(formData.get('loserId') ?? '').trim();
  const user = await requirePage('guests.merge');

  if (!loserId) back(winnerId, 'Choose a profile to merge in.', 'error');
  if (loserId === winnerId) back(winnerId, 'A profile cannot be merged into itself.', 'error');

  const loser = await prisma.guest.findUnique({ where: { id: loserId }, select: { id: true, firstName: true, lastName: true, mergedIntoId: true } });
  if (!loser) back(winnerId, 'That profile no longer exists.', 'error');
  if (loser.mergedIntoId) back(winnerId, 'That profile has already been merged.', 'error');

  await mergeGuests(winnerId, loserId);
  await audit(user, {
    module: 'guests',
    action: 'merge',
    entityType: 'Guest',
    entityId: winnerId,
    summary: `Merged ${guestName(loser)} into this profile`,
    after: { mergedFrom: loserId },
  });
  back(winnerId, `${guestName(loser)} merged in. Their stays, notes and reviews moved across.`);
}

async function recalculateAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  await requirePage('guests.edit');
  await refreshGuestStats(id);
  back(id, 'Totals recalculated from the stays.');
}

export default async function GuestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; merge?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePage('guests.view');
  const mayEdit = can(user.role, 'guests.edit');
  const mayMerge = can(user.role, 'guests.merge');
  const showMoney = can(user.role, 'dashboard.financials') || can(user.role, 'reservations.edit');

  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      reservations: {
        include: { property: { select: { name: true } } },
        orderBy: { checkIn: 'desc' },
      },
      guestNotes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      reviews: { include: { property: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      incidents: { orderBy: { createdAt: 'desc' }, take: 10 },
      mergedFrom: { select: { id: true, firstName: true, lastName: true } },
      mergedInto: { select: { id: true, firstName: true, lastName: true } },
      referredBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!guest) notFound();

  // Candidates for a merge: live profiles sharing an email or mobile.
  const candidates =
    mayMerge && (guest.email || guest.mobile)
      ? await prisma.guest.findMany({
          where: {
            id: { not: guest.id },
            mergedIntoId: null,
            OR: [
              ...(guest.email ? [{ email: guest.email }] : []),
              ...(guest.mobile ? [{ mobile: guest.mobile }] : []),
            ],
          },
          select: { id: true, firstName: true, lastName: true, email: true, mobile: true, totalBookings: true },
        })
      : [];

  const stays = guest.reservations.filter((r) => r.status === 'COMPLETED' || r.status === 'CHECKED_OUT');
  const upcoming = guest.reservations.filter((r) => r.status === 'CONFIRMED' || r.status === 'CHECKED_IN');

  return (
    <>
      <BackLink href="/portal/guests">All guests</BackLink>
      <PageHeader
        title={guestName(guest)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{guest.code}</span>
            <Pill tone={TIER_TONE[guest.tier]}>{guest.tier.toLowerCase()}</Pill>
            {guest.marketingConsent ? (
              <Pill tone="ok">marketing: opted in</Pill>
            ) : (
              <Pill tone="muted">marketing: no consent</Pill>
            )}
          </span>
        }
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      {guest.mergedInto && (
        <Notice kind="error">
          This profile was merged into{' '}
          <Link className="underline" href={`/portal/guests/${guest.mergedInto.id}`}>
            {guestName(guest.mergedInto)}
          </Link>
          . It is kept so old links still resolve, but new bookings go to the other profile.
        </Notice>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stays" value={guest.totalBookings} hint={`${upcoming.length} upcoming`} />
        <Stat label="Nights" value={guest.totalNights} />
        {showMoney && <Stat label="Lifetime spend" value={formatPeso(guest.totalSpentCents)} />}
        <Stat
          label="Last stay"
          value={guest.lastStayAt ? formatManila(guest.lastStayAt) : '—'}
          hint={guest.avgGapDays ? `about every ${guest.avgGapDays} days` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Stays">
            {guest.reservations.length === 0 ? (
              <Empty>No bookings yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                      <th className="py-2">Reference</th>
                      <th className="py-2">Property</th>
                      <th className="py-2">Dates</th>
                      <th className="py-2">Status</th>
                      {showMoney && <th className="py-2 text-right">Total</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                    {guest.reservations.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2">
                          <Link
                            href={`/portal/reservations/${r.id}`}
                            className="font-mono text-xs font-semibold hover:underline"
                          >
                            {r.reference}
                          </Link>
                        </td>
                        <td className="py-2">{r.property.name}</td>
                        <td className="py-2 whitespace-nowrap text-xs">
                          {formatStayRange(r.checkIn, r.checkOut)}
                        </td>
                        <td className="py-2">
                          <StatusPill status={r.status} />
                        </td>
                        {showMoney && (
                          <td className="py-2 text-right tabular-nums">
                            {formatPesoShort(r.totalCents)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {mayEdit && (
            <Card title="Profile">
              <form action={saveAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={guest.id} />
                <Field label="First name" name="firstName" defaultValue={guest.firstName} required />
                <Field label="Last name" name="lastName" defaultValue={guest.lastName} />
                <Field label="Email" name="email" type="email" defaultValue={guest.email} />
                <Field
                  label="Mobile"
                  name="mobile"
                  defaultValue={guest.mobile}
                  hint="Stored as +63…; local 09… numbers are converted on save."
                />
                <div className="sm:col-span-2">
                  <Field label="Address" name="address" defaultValue={guest.address} />
                </div>
                <div className="sm:col-span-2">
                  <TextArea
                    label="Preferences"
                    name="preferences"
                    defaultValue={guest.preferences}
                    rows={2}
                    hint="Early check-in, extra towels, allergies — whatever the next stay should know."
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextArea label="Internal notes" name="notes" defaultValue={guest.notes} rows={2} />
                </div>
                <div className="sm:col-span-2">
                  <button className="btn btn-primary" type="submit">
                    Save profile
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card title="Notes and history">
            {mayEdit && (
              <form action={noteAction} className="mb-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={guest.id} />
                <label className="min-w-[12rem] flex-1">
                  <span className="label">Add a note</span>
                  <input className="field" name="body" placeholder="What happened, or what to remember" />
                </label>
                <select className="field w-auto" name="kind" defaultValue="NOTE">
                  <option value="NOTE">Note</option>
                  <option value="COMPLAINT">Complaint</option>
                  <option value="COMPLIMENT">Compliment</option>
                  <option value="REQUEST">Request</option>
                </select>
                <button className="btn btn-secondary" type="submit">
                  Add
                </button>
              </form>
            )}
            {guest.guestNotes.length === 0 ? (
              <Empty>Nothing recorded yet.</Empty>
            ) : (
              <ul className="space-y-3 text-sm">
                {guest.guestNotes.map((n) => (
                  <li key={n.id} className="border-l-2 border-[color:var(--color-sand-300)] pl-3">
                    <div className="text-xs text-[color:var(--color-ink-500)]">
                      {n.kind.toLowerCase()} · {formatManila(n.createdAt, { time: true })}
                      {n.author ? ` · ${n.author.name}` : ''}
                    </div>
                    <p className="whitespace-pre-wrap">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {guest.reviews.length > 0 && (
            <Card title="Reviews left">
              <ul className="space-y-3 text-sm">
                {guest.reviews.map((r) => (
                  <li key={r.id}>
                    <div className="text-xs text-[color:var(--color-ink-500)]">
                      {'★'.repeat(r.rating)}
                      {'☆'.repeat(Math.max(0, 5 - r.rating))} · {r.property.name} ·{' '}
                      {r.platform.toLowerCase()}
                    </div>
                    {r.title && <div className="font-medium">{r.title}</div>}
                    <p className="whitespace-pre-wrap">{r.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Marketing consent">
            <form action={consentAction} className="space-y-3 text-sm">
              <input type="hidden" name="id" value={guest.id} />
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="consent"
                  defaultChecked={guest.marketingConsent}
                  disabled={!mayEdit}
                  className="mt-1"
                />
                <span>
                  This guest has agreed to receive offers.
                  {guest.consentAt && (
                    <span className="block text-xs text-[color:var(--color-ink-500)]">
                      Recorded {formatManila(guest.consentAt)}
                    </span>
                  )}
                </span>
              </label>
              <p className="text-xs text-[color:var(--color-ink-500)]">
                Campaigns query this column, so a profile without it is never emailed an offer — the
                consent is enforced where the audience is built, not left to whoever writes the send.
              </p>
              {mayEdit && (
                <button className="btn btn-secondary" type="submit">
                  Save consent
                </button>
              )}
            </form>
          </Card>

          {guest.incidents.length > 0 && (
            <Card title="Incidents">
              <ul className="space-y-2 text-sm">
                {guest.incidents.map((i) => (
                  <li key={i.id}>
                    <Link href={`/portal/incidents/${i.id}`} className="hover:underline">
                      {i.description.slice(0, 80)}
                    </Link>
                    <div className="text-xs text-[color:var(--color-ink-500)]">
                      {i.type.toLowerCase().replace(/_/g, ' ')} · {formatManila(i.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {mayMerge && (
            <Card title="Merge">
              {candidates.length === 0 ? (
                <p className="text-sm text-[color:var(--color-ink-500)]">
                  No other profile shares this email or mobile.
                </p>
              ) : (
                <form action={mergeAction} className="space-y-3 text-sm">
                  <input type="hidden" name="id" value={guest.id} />
                  <p className="text-[color:var(--color-ink-500)]">
                    The profile you choose is merged <em>into this one</em>: its stays, notes,
                    reviews and incidents move across, and it is kept as a redirect rather than
                    deleted.
                  </p>
                  <select className="field" name="loserId" defaultValue="">
                    <option value="">Choose a profile…</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {guestName(c)} — {c.email || c.mobile} — {c.totalBookings} stay
                        {c.totalBookings === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-secondary" type="submit">
                    Merge into this profile
                  </button>
                </form>
              )}

              {guest.mergedFrom.length > 0 && (
                <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
                  Already merged in: {guest.mergedFrom.map((g) => guestName(g)).join(', ')}
                </p>
              )}
            </Card>
          )}

          {mayEdit && (
            <Card title="Totals">
              <form action={recalculateAction} className="space-y-2 text-sm">
                <input type="hidden" name="id" value={guest.id} />
                <p className="text-[color:var(--color-ink-500)]">
                  Stays, nights, spend and tier are derived from completed reservations and
                  recalculated whenever one completes. Recompute by hand if a stay was edited
                  after the fact.
                </p>
                <button className="btn btn-secondary" type="submit">
                  Recalculate from stays
                </button>
              </form>
            </Card>
          )}

          {guest.referredBy && (
            <Card title="Referral">
              <p className="text-sm">
                Referred by{' '}
                <Link className="hover:underline" href={`/portal/guests/${guest.referredBy.id}`}>
                  {guestName(guest.referredBy)}
                </Link>
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
