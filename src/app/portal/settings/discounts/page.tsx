import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatPeso } from '@/lib/money';
import { PageHeader, StatusBadge, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { DiscountPresetForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Discount buttons' };

export default async function DiscountsSettingsPage() {
  const user = await requirePage('settings.edit');

  const [presets, services, memberships] = await Promise.all([
    prisma.discountPreset.findMany({ orderBy: { sortRank: 'asc' } }),
    prisma.service.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortRank: 'asc' } }),
    prisma.package.findMany({
      where: { type: 'MEMBERSHIP' },
      include: { items: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Discount buttons"
        subtitle="The tap-to-apply row at checkout. Fully editable — nothing is hard-coded."
      />
      <SettingsNav role={user.role} current="/portal/settings/discounts" />

      <div className="mb-4 max-w-3xl">
        <Alert tone="warn">
          Discounts are <strong>stackable by default</strong> and apply one after another to the
          running total, each shown as its own line on the receipt. Turn stackable <em>off</em> for
          PWD and Senior Citizen discounts, which by Philippine law cannot be combined with other
          discounts — the POS then refuses to apply them alongside anything else.
        </Alert>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Button</th>
                  <th className="text-right">Value</th>
                  <th>Stackable</th>
                  <th>Rules</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {presets.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-moss-800">{p.name}</td>
                    <td className="num text-right">
                      {p.type === 'PERCENT' ? `${p.value}%` : formatPeso(p.value)}
                    </td>
                    <td>
                      <StatusBadge status={p.stackable ? 'OK' : 'BAD'} label={p.stackable ? 'stacks' : 'solo only'} />
                    </td>
                    <td className="text-xs text-moss-500">
                      {[
                        p.requiresId && 'needs ID number',
                        p.membersOnly && 'members only',
                        p.isEmployeeRate && `employee rate${p.monthlyUsageLimit ? `, ${p.monthlyUsageLimit}/month` : ''}${p.familyIncluded ? ', family included' : ''}`,
                        p.serviceIds.length ? `${p.serviceIds.length} service(s)` : 'all services',
                      ].filter(Boolean).join(' · ')}
                    </td>
                    <td>
                      <StatusBadge status={p.active ? 'ACTIVE' : 'CANCELLED'} label={p.active ? 'on' : 'off'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card-pad">
            <h2 className="section-title mb-2">Member birthday perk</h2>
            {memberships.length === 0 ? (
              <p className="muted">No membership package defined yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {memberships.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3">
                    <span className="text-moss-700">{m.name}</span>
                    <span className="text-xs text-moss-500">
                      {m.birthdayPerkServiceId
                        ? `free service during the birthday month, once per membership year`
                        : 'no birthday perk set'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-moss-400">
              Choose which service the perk covers on the membership package in Marketing →
              Packages. Commission is still credited to the therapist on the base price.
            </p>
          </div>
        </div>

        <DiscountPresetForm
          presets={presets.map((p) => ({
            id: p.id, name: p.name, type: p.type,
            value: p.type === 'FIXED' ? p.value / 100 : p.value,
            serviceIds: p.serviceIds, stackable: p.stackable, requiresId: p.requiresId,
            membersOnly: p.membersOnly, isEmployeeRate: p.isEmployeeRate,
            monthlyUsageLimit: p.monthlyUsageLimit, familyIncluded: p.familyIncluded,
            active: p.active, sortRank: p.sortRank,
          }))}
          services={services}
        />
      </div>
    </div>
  );
}
