import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatPeso } from '@/lib/money';
import { PageHeader, StatusBadge } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { ServiceEditor } from './editor';
import { saveServiceCategoryAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Service catalog' };

export default async function ServicesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('settings.edit');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);

  const [categories, services, items] = await Promise.all([
    prisma.serviceCategory.findMany({ orderBy: { sortRank: 'asc' } }),
    prisma.service.findMany({
      include: {
        category: true,
        alsoInCategories: { select: { id: true } },
        recipes: { include: { item: { include: { unit: true } } } },
      },
      orderBy: [{ category: { sortRank: 'asc' } }, { sortRank: 'asc' }],
    }),
    prisma.item.findMany({
      where: { branchId, archived: false },
      include: { unit: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Service catalog"
        subtitle="Prices, durations, commission rules and consumption recipes. Changes appear on the landing page instantly."
      />
      <SettingsNav role={user.role} current="/portal/settings/services" />

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div>
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">Price</th>
                  <th>Commission</th>
                  <th>Recipe</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium text-cocoa-800">{s.name}</td>
                    <td className="text-xs text-cocoa-500">{s.category.name}</td>
                    <td className="num text-right">{s.durationMinutes} min</td>
                    <td className="num text-right">{formatPeso(s.priceCents)}</td>
                    <td className="text-xs">
                      {s.commissionType
                        ? s.commissionType === 'PERCENT'
                          ? `${s.commissionValue}%`
                          : formatPeso(s.commissionValue ?? 0)
                        : 'default'}
                    </td>
                    <td className="text-xs text-cocoa-500">
                      {s.recipes.length
                        ? s.recipes.map((r) => `${r.quantity}${r.item.unit.name} ${r.item.name}`).join(', ')
                        : '—'}
                    </td>
                    <td>
                      <StatusBadge status={s.active ? 'ACTIVE' : 'CANCELLED'} label={s.active ? 'active' : 'off'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={saveServiceCategoryAction} className="card-pad mt-4 flex flex-wrap items-end gap-2">
            <label className="flex-1">
              <span className="label">New category</span>
              <input name="name" className="input" placeholder="e.g. Facials" required />
            </label>
            <label className="w-24">
              <span className="label">Order</span>
              <input name="sortRank" type="number" className="input" defaultValue={categories.length + 1} />
            </label>
            <button className="btn-secondary" type="submit">Add category</button>
          </form>
        </div>

        <ServiceEditor
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            categoryId: s.categoryId,
            alsoInCategoryIds: s.alsoInCategories.map((c) => c.id),
            description: s.description,
            durationMinutes: s.durationMinutes,
            price: s.priceCents / 100,
            commissionType: s.commissionType ?? '',
            commissionValue: s.commissionType === 'FIXED' ? (s.commissionValue ?? 0) / 100 : (s.commissionValue ?? 0),
            active: s.active,
            showOnLanding: s.showOnLanding,
            sortRank: s.sortRank,
            recipes: s.recipes.map((r) => ({ itemId: r.itemId, quantity: r.quantity })),
          }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          items={items.map((i) => ({ id: i.id, name: i.name, unitName: i.unit.name }))}
        />
      </div>
    </div>
  );
}
