import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { PageHeader, StatusBadge } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { saveResourceAction } from '../actions';
import { DeleteButton } from '@/components/delete-button';

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
                <th className="text-right">Holds</th>
                <th>Sharing</th>
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
                  <td className="text-xs text-cocoa-500">
                    {r.exclusiveUse ? 'One booking at a time' : 'Shared'}
                  </td>
                  <td className="num text-right text-cocoa-400">{r.sortRank}</td>
                  <td>
                    <StatusBadge status={r.active ? 'ACTIVE' : 'CANCELLED'} label={r.active ? 'bookable' : 'off'} />
                  </td>
                  <td>
                    <div className="flex flex-wrap items-start gap-1">
                      <a href={`/portal/settings/resources?edit=${r.id}`} className="btn-ghost btn-sm">Edit</a>
                      <DeleteButton kind="resource" id={r.id} label={r.name} />
                    </div>
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
              <option value="CHAIR">Chair (foot spa &amp; reflexology)</option>
              <option value="SAUNA">Sauna</option>
              <option value="OTHER">Other</option>
            </select>
            <span className="mt-1 block text-[11px] text-cocoa-400">
              Each service says which of these it needs, in Settings → Services. A room
              or bed is offered for massages and scrubs; a chair only for foot spa and
              reflexology.
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">Capacity</span>
              <input name="capacity" type="number" min={1} className="input" defaultValue={editing?.capacity ?? 1} />
              <span className="mt-1 block text-[11px] text-cocoa-400">
                How many people fit at once. Room 1 with two beds is capacity 2; a foot
                spa area with two chairs is capacity 2. Do not add a second row for the
                second place — that would sell a bed you do not have.
              </span>
            </label>
            <label className="block">
              <span className="label">Display order</span>
              <input name="sortRank" type="number" className="input"
                defaultValue={editing?.sortRank ?? resources.length + 1} />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm text-cocoa-700">
            <input type="checkbox" name="exclusiveUse" className="mt-0.5 h-5 w-5 accent-[#6b4e35]"
              defaultChecked={editing?.exclusiveUse ?? false} />
            <span>
              One booking at a time
              <span className="mt-0.5 block text-[11px] text-cocoa-400">
                Tick for a couples room or the sauna: one party takes the whole thing, and it is
                unavailable to anyone else even with places to spare. It also means a party has to
                fill it — a couples room will not be offered to a single guest, because the other
                bed would be left for nobody. Leave unticked for open beds and the foot spa chairs,
                where two unrelated bookings sit side by side.
              </span>
            </span>
          </label>
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
