import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatPeso } from '@/lib/money';
import { PageHeader, StatusBadge } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { ServiceEditor } from './editor';
import { ServiceCategoryEditor } from './category-editor';
import { DeleteButton } from '@/components/delete-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Service catalog' };

/** What the booking engine will offer for each service. */
const PLACE_LABEL: Record<string, string> = {
  BED: 'Bed or room',
  ROOM: 'Bed or room',
  CHAIR: 'Chair',
  SAUNA: 'Sauna',
  OTHER: 'Other',
  ANY: 'Anywhere free',
};

export default async function ServicesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('settings.edit');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);

  const [categories, services, items] = await Promise.all([
    prisma.serviceCategory.findMany({ orderBy: [{ sortRank: 'asc' }, { name: 'asc' }] }),
    prisma.service.findMany({
      include: {
        category: true,
        alsoInCategories: { select: { id: true } },
        recipes: { include: { item: { include: { unit: true } } } },
      },
      orderBy: [
        { category: { sortRank: 'asc' } },
        { category: { name: 'asc' } },
        { sortRank: 'asc' },
        { name: 'asc' },
      ],
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
        <div className="space-y-6">
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Performed on</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">Price</th>
                  <th>Commission</th>
                  <th>Recipe</th>
                  <th>Status</th>
                  <th className="text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium text-cocoa-800">{s.name}</td>
                    <td className="text-xs text-cocoa-500">{s.category.name}</td>
                    <td className="text-xs text-cocoa-500">{PLACE_LABEL[s.requiredResourceType ?? 'ANY']}</td>
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
                    <td className="text-right">
                      <DeleteButton kind="service" id={s.id} label={s.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="section-title mb-2">Categories</h2>
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="text-right">Order</th>
                    <th>Category</th>
                    <th className="text-right">Services</th>
                    <th>Price list</th>
                    <th className="text-right">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td className="num text-right">{c.sortRank}</td>
                      <td className="font-medium text-cocoa-800">{c.name}</td>
                      <td className="num text-right">
                        {services.filter((s) => s.categoryId === c.id).length}
                      </td>
                      <td>
                        <StatusBadge status={c.active ? 'ACTIVE' : 'CANCELLED'}
                          label={c.active ? 'shown' : 'hidden'} />
                      </td>
                      <td className="text-right">
                        <DeleteButton kind="serviceCategory" id={c.id} label={c.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ServiceCategoryEditor
            categories={categories.map((c) => ({
              id: c.id, name: c.name, sortRank: c.sortRank, active: c.active,
            }))}
          />
        </div>

        <ServiceEditor
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            categoryId: s.categoryId,
            alsoInCategoryIds: s.alsoInCategories.map((c) => c.id),
            description: s.description,
            requiredResourceType: s.requiredResourceType ?? '',
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
