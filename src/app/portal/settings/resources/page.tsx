import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { PageHeader, StatusBadge } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { saveResourceAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rooms & beds' };

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; edit?: string }>;
}) {
  const user = await requirePage('settings.edit');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);

  const resources = await prisma.resource.findMany({
    where: { branchId },
    orderBy: { sortRank: 'asc' },
  });
  const editing = resources.find((r) => r.id === params.edit);

  return (
    <div>
      <PageHeader
        title="Rooms &amp; beds"
        subtitle="The bookable resource list. Clients pick one on the booking form, or leave it as 'any'."
      />
      <SettingsNav role={user.role} current="/portal/settings/resources" />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th className="text-right">Capacity</th>
                <th className="text-right">Order</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-cocoa-800">{r.name}</td>
                  <td className="text-xs capitalize">{r.type.toLowerCase()}</td>
                  <td className="num text-right">{r.capacity}</td>
                  <td className="num text-right text-cocoa-400">{r.sortRank}</td>
                  <td>
                    <StatusBadge status={r.active ? 'ACTIVE' : 'CANCELLED'} label={r.active ? 'bookable' : 'off'} />
                  </td>
                  <td>
                    <a href={`/portal/settings/resources?edit=${r.id}`} className="btn-ghost btn-sm">Edit</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={saveResourceAction} className="card-pad space-y-3" key={editing?.id ?? 'new'}>
          <p className="section-title">{editing ? 'Edit resource' : 'Add a room or bed'}</p>
          <input type="hidden" name="branchId" value={branchId} />
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label className="block">
            <span className="label">Name *</span>
            <input name="name" className="input" defaultValue={editing?.name} required
              placeholder="e.g. Bed 7" />
          </label>
          <label className="block">
            <span className="label">Type</span>
            <select name="type" className="select" defaultValue={editing?.type ?? 'BED'}>
              <option value="ROOM">Room</option>
              <option value="BED">Bed</option>
              <option value="SAUNA">Sauna</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">Capacity</span>
              <input name="capacity" type="number" min={1} className="input" defaultValue={editing?.capacity ?? 1} />
            </label>
            <label className="block">
              <span className="label">Display order</span>
              <input name="sortRank" type="number" className="input"
                defaultValue={editing?.sortRank ?? resources.length + 1} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-cocoa-700">
            <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
              defaultChecked={editing?.active ?? true} />
            Bookable
          </label>
          <button className="btn-primary w-full" type="submit">
            {editing ? 'Save resource' : 'Add resource'}
          </button>
          {editing && (
            <a href="/portal/settings/resources" className="btn-secondary w-full">Cancel edit</a>
          )}
        </form>
      </div>
    </div>
  );
}
