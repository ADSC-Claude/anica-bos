import Link from 'next/link';
import { requirePage, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPesoShort } from '@/lib/money';
import { formatStayDate, manilaDateKey, toStayDate } from '@/lib/datetime';
import { PageHeader, Card, Empty, StatusPill, PaymentPill } from '@/components/ui';

export const metadata = { title: 'Reservations' };
export const dynamic = 'force-dynamic';

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; property?: string; when?: string }>;
}) {
  const user = await requirePage('reservations.view');
  const params = await searchParams;
  const propertyIds = await visibleProperties(user);
  const showMoney = can(user.role, 'dashboard.financials') || can(user.role, 'reservations.edit');

  const today = toStayDate(manilaDateKey());
  const when = params.when ?? 'upcoming';

  const rows = await prisma.reservation.findMany({
    where: {
      ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
      ...(params.property ? { propertyId: params.property } : {}),
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.source ? { source: params.source as never } : {}),
      ...(when === 'upcoming' ? { checkOut: { gte: today } } : {}),
      ...(when === 'past' ? { checkOut: { lt: today } } : {}),
      ...(params.q
        ? {
            OR: [
              { reference: { contains: params.q, mode: 'insensitive' as const } },
              { guest: { firstName: { contains: params.q, mode: 'insensitive' as const } } },
              { guest: { lastName: { contains: params.q, mode: 'insensitive' as const } } },
              { guest: { email: { contains: params.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    include: {
      property: { select: { name: true } },
      guest: { select: { firstName: true, lastName: true, tier: true } },
    },
    orderBy: when === 'past' ? { checkIn: 'desc' } : { checkIn: 'asc' },
    take: 200,
  });

  const properties = await prisma.property.findMany({
    where: propertyIds ? { id: { in: propertyIds } } : {},
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Reservations"
        subtitle={`${rows.length} shown`}
        actions={
          can(user.role, 'reservations.edit') && (
            <Link className="btn btn-primary" href="/portal/reservations/new">
              Add a booking
            </Link>
          )
        }
      />

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input className="field w-auto" name="q" placeholder="Reference, name or email" defaultValue={params.q ?? ''} />
        <select className="field w-auto" name="when" defaultValue={when}>
          <option value="upcoming">Current and upcoming</option>
          <option value="past">Past</option>
          <option value="all">All</option>
        </select>
        <select className="field w-auto" name="status" defaultValue={params.status ?? ''}>
          <option value="">Any status</option>
          {['INQUIRY', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map(
            (s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ').toLowerCase()}
              </option>
            ),
          )}
        </select>
        <select className="field w-auto" name="source" defaultValue={params.source ?? ''}>
          <option value="">Any source</option>
          {['DIRECT', 'AIRBNB', 'OTA', 'PHONE', 'WALK_IN', 'REFERRAL', 'CORPORATE'].map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ').toLowerCase()}
            </option>
          ))}
        </select>
        <select className="field w-auto" name="property" defaultValue={params.property ?? ''}>
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>

      <Card>
        {rows.length === 0 ? (
          <Empty>No reservations match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                  <th className="py-2">Reference</th>
                  <th className="py-2">Guest</th>
                  <th className="py-2">Property</th>
                  <th className="py-2">Dates</th>
                  <th className="py-2 text-right">Nights</th>
                  <th className="py-2">Source</th>
                  <th className="py-2">Status</th>
                  {showMoney && <th className="py-2 text-right">Total</th>}
                  {showMoney && <th className="py-2 text-right">Balance</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                {rows.map((r) => {
                  const balance = r.totalCents - r.paidCents;
                  return (
                    <tr key={r.id} className="hover:bg-[color:var(--color-sand-50)]">
                      <td className="py-2">
                        <Link href={`/portal/reservations/${r.id}`} className="font-mono text-xs font-semibold hover:underline">
                          {r.reference}
                        </Link>
                      </td>
                      <td className="py-2">
                        {r.guest.firstName} {r.guest.lastName}
                        {r.guest.tier === 'VIP' && <span className="ml-1 text-xs text-[color:var(--warn)]">VIP</span>}
                      </td>
                      <td className="py-2">{r.property.name}</td>
                      <td className="py-2 whitespace-nowrap text-xs">
                        {formatStayDate(r.checkIn)} → {formatStayDate(r.checkOut)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.nights}</td>
                      <td className="py-2 text-xs">{r.source.replace('_', ' ').toLowerCase()}</td>
                      <td className="py-2">
                        <StatusPill status={r.status} />
                      </td>
                      {showMoney && <td className="py-2 text-right tabular-nums">{formatPesoShort(r.totalCents)}</td>}
                      {showMoney && (
                        <td className="py-2 text-right tabular-nums">
                          {balance > 0 ? (
                            <span className="font-semibold text-[color:var(--bad)]">{formatPesoShort(balance)}</span>
                          ) : (
                            <PaymentPill status={r.paymentStatus} />
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
