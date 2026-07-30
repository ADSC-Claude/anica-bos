import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatPeso } from '@/lib/money';
import { formatManila, isBirthdayMonth } from '@/lib/datetime';
import { PageHeader, EmptyState, StatusBadge, Tabs } from '@/components/ui';
import { getSettings } from '@/lib/settings';
import { retentionWatch } from '@/lib/retention';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clients' };

type Filter = 'all' | 'frequent' | 'lapsed' | 'birthday' | 'incomplete';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: Filter; branchId?: string }>;
}) {
  const user = await requirePage('clients.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const settings = await getSettings(branchId);
  const q = (params.q ?? '').trim();
  const filter = (params.filter ?? 'all') as Filter;

  const lapsed =
    filter === 'lapsed'
      ? await retentionWatch([branchId], {
          fallbackDays: settings['retention.defaultThresholdDays'],
          onlyOverdue: true,
        })
      : [];

  const clients = await prisma.client.findMany({
    where: {
      branchId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { mobile: { contains: q.replace(/\D/g, '') } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter === 'incomplete' ? { incomplete: true } : {}),
      ...(filter === 'lapsed' ? { id: { in: lapsed.map((l) => l.clientId) } } : {}),
    },
    include: {
      sales: { where: { status: 'PAID' }, select: { totalCents: true, businessDate: true } },
      packages: {
        where: { status: 'ACTIVE', expiresAt: { gte: new Date() } },
        include: { package: { select: { name: true, type: true } } },
      },
    },
    orderBy: { name: 'asc' },
    take: 300,
  });

  let rows = clients.map((c) => ({
    ...c,
    visits: c.sales.length,
    lifetimeCents: c.sales.reduce((a, s) => a + s.totalCents, 0),
    lastVisit: c.sales.length
      ? c.sales.reduce((a, s) => (s.businessDate > a ? s.businessDate : a), c.sales[0].businessDate)
      : null,
    hasMembership: c.packages.some((p) => p.package.type === 'MEMBERSHIP'),
  }));

  if (filter === 'frequent') rows = rows.filter((r) => r.visits >= 3);
  if (filter === 'birthday') rows = rows.filter((r) => isBirthdayMonth(r.birthday));

  const tabs = [
    { href: '/portal/clients', label: 'All' },
    { href: '/portal/clients?filter=frequent', label: 'Frequent' },
    { href: '/portal/clients?filter=lapsed', label: 'Needs follow-up' },
    { href: '/portal/clients?filter=birthday', label: 'Birthday this month' },
    { href: '/portal/clients?filter=incomplete', label: 'Incomplete records' },
  ];

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} record${rows.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Link href="/portal/clients/follow-ups" className="btn-secondary btn-sm">
              Follow-ups
            </Link>
            <Link href="/portal/clients/corporate" className="btn-secondary btn-sm">
              Corporate
            </Link>
            <Link href="/portal/clients/partners" className="btn-secondary btn-sm">
              Partners
            </Link>
            <Link href="/portal/clients/new" className="btn-primary btn-sm">
              + New client
            </Link>
          </>
        }
      />

      <form className="mb-4 flex gap-2" action="/portal/clients">
        {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
        <input
          name="q"
          defaultValue={q}
          className="input"
          placeholder="Search by name, mobile or email…"
          aria-label="Search clients"
        />
        <button className="btn-secondary" type="submit">
          Search
        </button>
      </form>

      <Tabs
        tabs={tabs}
        current={filter === 'all' ? '/portal/clients' : `/portal/clients?filter=${filter}`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No clients match"
          hint="Clients are created automatically from online bookings and POS walk-ins."
          action={
            <Link href="/portal/clients/new" className="btn-primary btn-sm">
              Add one manually
            </Link>
          }
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Mobile</th>
                <th className="text-right">Visits</th>
                <th className="text-right">Lifetime spend</th>
                <th>Last visit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/portal/clients/${c.id}`} className="font-medium text-moss-800 hover:underline">
                      {c.name}
                    </Link>
                    {c.addressCity && (
                      <span className="block text-xs text-moss-400">{c.addressCity}</span>
                    )}
                  </td>
                  <td className="num">{c.mobile}</td>
                  <td className="num text-right">{c.visits}</td>
                  <td className="num text-right">{formatPeso(c.lifetimeCents)}</td>
                  <td className="whitespace-nowrap text-xs text-moss-500">
                    {c.lastVisit ? formatManila(c.lastVisit) : '—'}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {c.incomplete && <StatusBadge status="WARN" label="incomplete" />}
                      {c.hasMembership && <StatusBadge status="ACTIVE" label="member" />}
                      {c.loyaltyPoints > 0 && (
                        <StatusBadge status="OK" label={`${c.loyaltyPoints} pts`} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
