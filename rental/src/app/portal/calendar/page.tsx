import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage, visibleProperties, assertProperty } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { calendarGrid, createBlock, deleteBlock, conflictingReservations } from '@/lib/calendar';
import { audit } from '@/lib/audit';
import {
  addDays,
  addMonthsToKey,
  dateKeyRange,
  formatMonthKey,
  manilaMonthKey,
  monthBounds,
  toStayDate,
} from '@/lib/datetime';
import { PageHeader, Card, Notice, Empty } from '@/components/ui';
import { DatesTakenError } from '@/lib/calendar';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

const LEGEND: { state: string; label: string }[] = [
  { state: 'AVAILABLE', label: 'Available' },
  { state: 'RESERVED', label: 'Reserved' },
  { state: 'OCCUPIED', label: 'Occupied' },
  { state: 'CLEANING', label: 'Cleaning' },
  { state: 'MAINTENANCE', label: 'Maintenance' },
  { state: 'OWNER', label: 'Owner blocked' },
  { state: 'UNAVAILABLE', label: 'Unavailable' },
  { state: 'EXTERNAL', label: 'Airbnb' },
];

async function blockDates(formData: FormData) {
  'use server';
  const user = await requirePage('calendar.block');
  const propertyId = String(formData.get('propertyId'));
  await assertProperty(user, propertyId);

  const startKey = String(formData.get('startKey'));
  const endKey = String(formData.get('endKey'));
  const reason = String(formData.get('reason')) as 'CLEANING' | 'MAINTENANCE' | 'OWNER' | 'UNAVAILABLE';
  const title = String(formData.get('title') ?? '');
  const month = String(formData.get('month') ?? manilaMonthKey());

  const back = (msg: string, kind = 'error') =>
    redirect(`/portal/calendar?month=${month}&${kind}=${encodeURIComponent(msg)}`);

  try {
    const block = await createBlock({
      propertyId,
      reason,
      title,
      startKey,
      // The form asks for the last blocked NIGHT, which reads naturally; the
      // span wants the exclusive end. Converting here keeps the guest-facing
      // half-open convention out of the user's way.
      endKey: addDays(endKey, 1),
      createdById: user.id,
    });
    await audit(user, {
      module: 'calendar',
      action: 'block',
      entityType: 'CalendarBlock',
      entityId: block.id,
      summary: `${reason} block ${startKey} → ${endKey}`,
      propertyId,
      after: { reason, startKey, endKey, title },
    });
  } catch (err) {
    if (err instanceof DatesTakenError) {
      const clashes = await conflictingReservations(
        propertyId,
        toStayDate(startKey),
        toStayDate(addDays(endKey, 1)),
      );
      // Never quietly evict a paying guest — name who is in the way and let a
      // person decide.
      back(
        clashes.length
          ? `Those dates are taken by ${clashes.map((c) => c.reference).join(', ')}. Move or cancel the booking first.`
          : 'Those dates are already blocked.',
      );
    }
    throw err;
  }
  back('Dates blocked.', 'ok');
}

async function removeBlock(formData: FormData) {
  'use server';
  const user = await requirePage('calendar.block');
  const blockId = String(formData.get('blockId'));
  const month = String(formData.get('month') ?? manilaMonthKey());
  const block = await prisma.calendarBlock.findUniqueOrThrow({ where: { id: blockId } });
  await assertProperty(user, block.propertyId);

  await deleteBlock(blockId);
  await audit(user, {
    module: 'calendar',
    action: 'unblock',
    entityType: 'CalendarBlock',
    entityId: blockId,
    summary: `Block removed`,
    propertyId: block.propertyId,
    before: { reason: block.reason, startDate: block.startDate, endDate: block.endDate },
  });
  redirect(`/portal/calendar?month=${month}&ok=${encodeURIComponent('Block removed.')}`);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePage('calendar.view');
  const params = await searchParams;
  const monthKey = params.month ?? manilaMonthKey();
  const { fromKey, toKey } = monthBounds(monthKey);

  const ids = await visibleProperties(user);
  const properties = await prisma.property.findMany({
    where: { status: { in: ['ACTIVE', 'INACTIVE'] }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, readyState: true },
  });

  const grid = await calendarGrid(
    properties.map((p) => p.id),
    fromKey,
    toKey,
  );
  const days = dateKeyRange(fromKey, toKey);

  const blocks = await prisma.calendarBlock.findMany({
    where: {
      propertyId: { in: properties.map((p) => p.id) },
      endDate: { gt: toStayDate(fromKey) },
      startDate: { lte: toStayDate(toKey) },
    },
    include: { property: { select: { name: true } } },
    orderBy: { startDate: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={formatMonthKey(monthKey)}
        actions={
          <div className="flex gap-2">
            <Link className="btn btn-secondary" href={`/portal/calendar?month=${addMonthsToKey(monthKey, -1)}`}>
              ←
            </Link>
            <Link className="btn btn-secondary" href={`/portal/calendar?month=${manilaMonthKey()}`}>
              This month
            </Link>
            <Link className="btn btn-secondary" href={`/portal/calendar?month=${addMonthsToKey(monthKey, 1)}`}>
              →
            </Link>
          </div>
        }
      />

      {params.ok && <Notice kind="ok">{params.ok}</Notice>}
      {params.error && <Notice kind="error">{params.error}</Notice>}

      <Card className="mb-4 overflow-x-auto">
        {properties.length === 0 ? (
          <Empty>No properties assigned to you.</Empty>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white p-2 text-left">Property</th>
                {days.map((d) => (
                  <th key={d} className="w-8 p-1 text-center font-normal text-[color:var(--color-ink-500)]">
                    {Number(d.slice(-2))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-white p-2 text-left font-medium">
                    <Link href={`/portal/properties/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </th>
                  {(grid.get(p.id) ?? []).map((cell) => (
                    <td
                      key={cell.key}
                      className={`cal-cell cal-${cell.state} px-0.5 text-center`}
                      title={`${cell.key} — ${cell.state.toLowerCase()}${cell.label ? `: ${cell.label}` : ''}`}
                    >
                      {cell.reservationId ? (
                        <Link href={`/portal/reservations/${cell.reservationId}`} className="block">
                          {cell.isStart ? '▶' : '·'}
                        </Link>
                      ) : cell.state === 'AVAILABLE' ? (
                        ''
                      ) : (
                        '×'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        {LEGEND.map((l) => (
          <span key={l.state} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-5 rounded border border-[color:var(--color-sand-300)] cal-${l.state}`} />
            {l.label}
          </span>
        ))}
      </div>

      {can(user.role, 'calendar.block') && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Block dates">
            <form action={blockDates} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="month" value={monthKey} />
              <label className="block sm:col-span-2">
                <span className="label">Property</span>
                <select className="field" name="propertyId" required>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">First night</span>
                <input className="field" type="date" name="startKey" defaultValue={fromKey} required />
              </label>
              <label className="block">
                <span className="label">Last night</span>
                <input className="field" type="date" name="endKey" defaultValue={fromKey} required />
              </label>
              <label className="block">
                <span className="label">Reason</span>
                <select className="field" name="reason" defaultValue="OWNER">
                  <option value="OWNER">Owner use</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="CLEANING">Deep clean</option>
                  <option value="UNAVAILABLE">Temporarily unavailable</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Note</span>
                <input className="field" name="title" placeholder="Family staying" />
              </label>
              <div className="sm:col-span-2">
                <button className="btn btn-primary" type="submit">
                  Block these dates
                </button>
              </div>
            </form>
          </Card>

          <Card title="Blocks this month">
            {blocks.length === 0 ? (
              <Empty>No blocks.</Empty>
            ) : (
              <ul className="divide-y divide-[color:var(--color-sand-200)]">
                {blocks.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm font-medium">
                        {b.property.name} — {b.reason.toLowerCase()}
                      </p>
                      <p className="text-xs text-[color:var(--color-ink-500)]">
                        {b.startDate.toISOString().slice(0, 10)} → {addDays(b.endDate.toISOString().slice(0, 10), -1)}
                        {b.title ? ` · ${b.title}` : ''}
                      </p>
                    </div>
                    <form action={removeBlock}>
                      <input type="hidden" name="blockId" value={b.id} />
                      <input type="hidden" name="month" value={monthKey} />
                      <button className="btn btn-secondary px-3 py-1 text-xs" type="submit">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
