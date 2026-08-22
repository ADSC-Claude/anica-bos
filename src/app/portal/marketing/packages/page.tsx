import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { PageHeader, StatusBadge, EmptyState, Tabs } from '@/components/ui';
import { MARKETING_TABS } from '../tabs';
import { PackageForm } from './form';
import { ToggleActiveButton } from '@/components/toggle-active-button';
import { setPackageActiveAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Packages & membership' };

export default async function PackagesPage() {
  const user = await requirePage('marketing.view');
  const canEdit = can(user.role, 'marketing.edit');

  const [packages, services] = await Promise.all([
    prisma.package.findMany({
      include: {
        items: { include: { service: { select: { name: true } } } },
        clientPackages: { where: { status: 'ACTIVE' } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.service.findMany({
      where: { active: true },
      select: { id: true, name: true, priceCents: true },
      orderBy: { sortRank: 'asc' },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Packages &amp; membership"
        subtitle="Prepaid session bundles and the 1-year membership. Sold at POS; balances show on the client profile and at checkout."
      />
      <Tabs tabs={MARKETING_TABS} current="/portal/marketing/packages" />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {packages.length === 0 ? (
            <EmptyState title="No packages defined yet" />
          ) : (
            packages.map((p) => (
              <div key={p.id} className="card-pad">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-cocoa-800">{p.name}</p>
                    <p className="text-xs capitalize text-cocoa-400">
                      {p.type.replaceAll('_', ' ').toLowerCase()} · valid {p.validityDays} days ·{' '}
                      {p.clientPackages.length} active holder(s)
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="num font-semibold">{formatPeso(p.priceCents)}</span>
                    <StatusBadge status={p.active ? 'ACTIVE' : 'CANCELLED'} label={p.active ? 'active' : 'inactive'} />
                    {canEdit && (
                      <ToggleActiveButton
                        action={setPackageActiveAction}
                        id={p.id}
                        label={p.name}
                        on={p.active}
                        offVerb="Stop selling"
                        onVerb="Sell again"
                        confirm={`Stop selling “${p.name}”? It leaves the website and the till. ${
                          p.clientPackages.length
                        } guest(s) already holding one keep their sessions.`}
                      />
                    )}
                  </span>
                </div>
                {p.description && (
                  <p className="muted mb-2 whitespace-pre-line">{p.description}</p>
                )}
                {p.type === 'MEMBERSHIP' ? (
                  <ul className="space-y-0.5 text-sm text-cocoa-600">
                    <li>• {p.memberDiscountPercent}% off every visit</li>
                    {p.birthdayPerkServiceId && (
                      <li>• Free birthday-month service, once per membership year</li>
                    )}
                  </ul>
                ) : (
                  <ul className="space-y-0.5 text-sm text-cocoa-600">
                    {p.items.map((i) => (
                      <li key={i.id}>
                        • {i.sessions} × {i.service.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>

        {canEdit && (
          <PackageForm
            packages={packages.map((p) => ({
              id: p.id,
              name: p.name,
              imageUrl: p.imageUrl,
              type: p.type,
              description: p.description,
              price: p.priceCents / 100,
              validityDays: p.validityDays,
              memberDiscountPercent: p.memberDiscountPercent,
              birthdayPerkServiceId: p.birthdayPerkServiceId ?? '',
              active: p.active,
              showOnLanding: p.showOnLanding,
              items: p.items.map((i) => ({ serviceId: i.serviceId, sessions: i.sessions })),
            }))}
            services={services}
          />
        )}
      </div>
    </div>
  );
}
