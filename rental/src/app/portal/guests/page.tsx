import Link from 'next/link';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPesoShort } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { findDuplicates, guestName } from '@/lib/guests';
import { PageHeader, Card, Empty, Pill } from '@/components/ui';

export const metadata = { title: 'Guests' };
export const dynamic = 'force-dynamic';

const TIER_TONE = { NEW: 'muted', REPEAT: 'info', VIP: 'warn' } as const;

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string; sort?: string; consent?: string }>;
}) {
  const user = await requirePage('guests.view');
  const params = await searchParams;
  const mayMerge = can(user.role, 'guests.merge');

  // Guests are not property-scoped — a person is a person across the portfolio.
  // The scope gate applies to their reservations, which is where it matters.
  const rows = await prisma.guest.findMany({
    where: {
      mergedIntoId: null,
      ...(params.tier ? { tier: params.tier as never } : {}),
      ...(params.consent === 'yes' ? { marketingConsent: true } : {}),
      ...(params.consent === 'no' ? { marketingConsent: false } : {}),
      ...(params.q
        ? {
            OR: [
              { firstName: { contains: params.q, mode: 'insensitive' as const } },
              { lastName: { contains: params.q, mode: 'insensitive' as const } },
              { email: { contains: params.q, mode: 'insensitive' as const } },
              { mobile: { contains: params.q } },
              { code: { contains: params.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy:
      params.sort === 'spend'
        ? { totalSpentCents: 'desc' }
        : params.sort === 'name'
          ? { firstName: 'asc' }
          : { lastStayAt: { sort: 'desc', nulls: 'last' } },
    take: 300,
  });

  const duplicates = mayMerge ? await findDuplicates() : [];

  return (
    <>
      <PageHeader title="Guests" subtitle={`${rows.length} shown`} />

      {duplicates.length > 0 && (
        <Card
          title={`${duplicates.length} possible duplicate${duplicates.length === 1 ? '' : 's'}`}
          className="mb-4 border-[color:var(--warn)]"
        >
          <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">
            Same email or same mobile on two live profiles. Nothing is merged automatically — open
            the one you want to keep and merge the other into it.
          </p>
          <ul className="space-y-2 text-sm">
            {duplicates.map((d) => (
              <li key={d.key} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[color:var(--color-ink-500)]">
                  same {d.reason}: {d.key}
                </span>
                {d.guests.map((g) => (
                  <Link
                    key={g.id}
                    href={`/portal/guests/${g.id}`}
                    className="rounded border border-[color:var(--color-sand-300)] px-2 py-0.5 hover:underline"
                  >
                    {g.name} · {g.totalBookings} stay{g.totalBookings === 1 ? '' : 's'}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input
          className="field w-auto"
          name="q"
          placeholder="Name, email, mobile or code"
          defaultValue={params.q ?? ''}
        />
        <select className="field w-auto" name="tier" defaultValue={params.tier ?? ''}>
          <option value="">Any tier</option>
          <option value="NEW">New</option>
          <option value="REPEAT">Repeat</option>
          <option value="VIP">VIP</option>
        </select>
        <select className="field w-auto" name="consent" defaultValue={params.consent ?? ''}>
          <option value="">Any consent</option>
          <option value="yes">Marketing: opted in</option>
          <option value="no">Marketing: not opted in</option>
        </select>
        <select className="field w-auto" name="sort" defaultValue={params.sort ?? 'recent'}>
          <option value="recent">Most recent stay</option>
          <option value="spend">Highest spend</option>
          <option value="name">Name</option>
        </select>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>

      <Card>
        {rows.length === 0 ? (
          <Empty>No guests match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                  <th className="py-2">Guest</th>
                  <th className="py-2">Contact</th>
                  <th className="py-2">Tier</th>
                  <th className="py-2 text-right">Stays</th>
                  <th className="py-2 text-right">Nights</th>
                  <th className="py-2 text-right">Spend</th>
                  <th className="py-2">Last stay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                {rows.map((g) => (
                  <tr key={g.id} className="hover:bg-[color:var(--color-sand-50)]">
                    <td className="py-2">
                      <Link href={`/portal/guests/${g.id}`} className="font-medium hover:underline">
                        {guestName(g)}
                      </Link>
                      <div className="font-mono text-[11px] text-[color:var(--color-ink-500)]">
                        {g.code}
                      </div>
                    </td>
                    <td className="py-2 text-xs">
                      <div>{g.email || '—'}</div>
                      <div className="text-[color:var(--color-ink-500)]">{g.mobile || '—'}</div>
                    </td>
                    <td className="py-2">
                      <Pill tone={TIER_TONE[g.tier]}>{g.tier.toLowerCase()}</Pill>
                    </td>
                    <td className="py-2 text-right tabular-nums">{g.totalBookings}</td>
                    <td className="py-2 text-right tabular-nums">{g.totalNights}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatPesoShort(g.totalSpentCents)}
                    </td>
                    <td className="py-2 text-xs">
                      {g.lastStayAt ? formatManila(g.lastStayAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
