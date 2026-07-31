import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { formatManila, daysUntil } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState, Tabs, Alert } from '@/components/ui';
import { PromoForm } from './promo-form';
import { MARKETING_TABS } from './tabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing' };



export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('marketing.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const canEdit = can(user.role, 'marketing.edit');
  const settings = await getSettings(branchId);

  const [promos, services, activeMemberships, expiring, loyaltyTotal] = await Promise.all([
    prisma.promo.findMany({ orderBy: { endDate: 'desc' } }),
    prisma.service.findMany({
      where: { active: true },
      include: { category: { select: { name: true } } },
      orderBy: { sortRank: 'asc' },
    }),
    prisma.clientPackage.count({
      where: {
        status: 'ACTIVE',
        expiresAt: { gte: new Date() },
        package: { type: 'MEMBERSHIP' },
        client: { branchId },
      },
    }),
    prisma.clientPackage.findMany({
      where: {
        status: 'ACTIVE',
        package: { type: 'MEMBERSHIP' },
        client: { branchId },
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + settings['membership.expiryAlertDays'] * 86_400_000),
        },
      },
      include: { client: { select: { id: true, name: true, email: true } }, package: true },
      orderBy: { expiresAt: 'asc' },
    }),
    prisma.client.aggregate({ where: { branchId }, _sum: { loyaltyPoints: true } }),
  ]);

  const now = new Date();
  const live = promos.filter((p) => p.active && p.startDate <= now && p.endDate >= now);

  return (
    <div>
      <PageHeader
        title="Marketing"
        subtitle="Promos, memberships, vouchers and campaigns."
      />
      <Tabs tabs={MARKETING_TABS} current="/portal/marketing" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Live promos" value={String(live.length)} tone={live.length ? 'good' : 'default'} />
        <StatCard label="Active memberships" value={String(activeMemberships)} />
        <StatCard label="Expiring within a month" value={String(expiring.length)} tone={expiring.length ? 'warn' : 'default'} />
        <StatCard
          label="Loyalty points outstanding"
          value={String(loyaltyTotal._sum.loyaltyPoints ?? 0)}
          hint={`worth ${formatPeso((loyaltyTotal._sum.loyaltyPoints ?? 0) * settings['loyalty.pointValueCents'])}`}
        />
      </div>

      {expiring.length > 0 && (
        <div className="mb-4">
          <Alert tone="warn">
            <p className="font-semibold">Memberships expiring soon</p>
            <ul className="mt-1 space-y-0.5">
              {expiring.map((m) => (
                <li key={m.id}>
                  <Link href={`/portal/clients/${m.client.id}`} className="underline underline-offset-4">
                    {m.client.name}
                  </Link>{' '}
                  — {m.package.name} ends {formatManila(m.expiresAt)} ({daysUntil(m.expiresAt)} days)
                  {m.expiryNotifiedAt && ' · reminder sent'}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              The daily job emails each of them a renewal reminder automatically.
            </p>
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <h2 className="section-title mb-3">Promos</h2>
          {promos.length === 0 ? (
            <EmptyState title="No promos yet" />
          ) : (
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Promo</th>
                    <th>Discount</th>
                    <th>Validity</th>
                    <th>Code</th>
                    <th>Landing page</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p) => {
                    const isLive = p.active && p.startDate <= now && p.endDate >= now;
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="font-medium text-cocoa-800">{p.name}</span>
                          {p.description && (
                            <span className="block text-xs text-cocoa-400">{p.description}</span>
                          )}
                        </td>
                        <td className="num">
                          {p.type === 'PERCENT' ? `${p.value}%` : formatPeso(p.value)}
                        </td>
                        <td className="whitespace-nowrap text-xs text-cocoa-500">
                          {formatManila(p.startDate)} → {formatManila(p.endDate)}
                        </td>
                        <td className="num text-xs">{p.code ?? '—'}</td>
                        <td className="text-xs">{p.showOnLanding ? 'shown' : 'hidden'}</td>
                        <td>
                          <StatusBadge
                            status={isLive ? 'ACTIVE' : p.endDate < now ? 'EXPIRED' : 'PENDING'}
                            label={isLive ? 'live' : p.endDate < now ? 'ended' : 'scheduled'}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {canEdit && (
          <PromoForm
            promos={promos.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              type: p.type,
              value: p.type === 'FIXED' ? p.value / 100 : p.value,
              startDate: p.startDate.toISOString().slice(0, 10),
              endDate: p.endDate.toISOString().slice(0, 10),
              serviceIds: p.serviceIds,
              code: p.code ?? '',
              active: p.active,
              showOnLanding: p.showOnLanding,
            }))}
            services={services.map((s) => ({ id: s.id, name: s.name }))}
          />
        )}
      </div>
    </div>
  );
}
