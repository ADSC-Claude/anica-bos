import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { MaintenanceStatus } from '@prisma/client';
import { requirePage, assertProperty, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatManila } from '@/lib/datetime';
import { formatPesoShort } from '@/lib/money';
import { openTicket } from '@/lib/maintenance';
import { Card, Empty, Notice, PageHeader, Pill, PriorityPill } from '@/components/ui';

export const metadata = { title: 'Maintenance' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  REPORTED: 'warn',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  WAITING_PARTS: 'warn',
  COMPLETED: 'ok',
  CANCELLED: 'muted',
} as const;

const CATEGORIES = ['Aircon', 'Plumbing', 'Electrical', 'Appliance', 'Furniture', 'Wifi', 'General'];

async function reportAction(formData: FormData) {
  'use server';
  const user = await requirePage('maintenance.edit');
  const propertyId = String(formData.get('propertyId') ?? '');
  const description = String(formData.get('description') ?? '').trim();

  if (!propertyId || !description) {
    redirect('/portal/maintenance?error=' + encodeURIComponent('A property and a description are required.'));
  }
  await assertProperty(user, propertyId);

  const result = await openTicket({
    propertyId,
    category: String(formData.get('category') || 'General'),
    description,
    priority: (String(formData.get('priority') || 'MEDIUM') as never),
    assigneeId: String(formData.get('assigneeId') || '') || null,
    blockUntil: String(formData.get('blockUntil') || '') || null,
    user,
  });

  const note = result.blockRefused
    ? 'Ticket raised. The dates could NOT be taken off sale — a guest already holds them, so cancel or move that stay first.'
    : result.blocked
      ? 'Ticket raised and those dates taken off sale.'
      : 'Ticket raised.';
  redirect(`/portal/maintenance/${result.ticketId}?${result.blockRefused ? 'error' : 'ok'}=${encodeURIComponent(note)}`);
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string; property?: string }>;
}) {
  const user = await requirePage('maintenance.view');
  const sp = await searchParams;
  const mayEdit = can(user.role, 'maintenance.edit');
  const mayCost = can(user.role, 'maintenance.cost');
  const propertyIds = await visibleProperties(user);

  const open = { notIn: ['COMPLETED', 'CANCELLED'] as MaintenanceStatus[] };
  const tickets = await prisma.maintenanceTicket.findMany({
    where: {
      ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
      ...(sp.property ? { propertyId: sp.property } : {}),
      ...(sp.status === 'all' ? {} : sp.status ? { status: sp.status as never } : { status: open }),
    },
    include: {
      property: { select: { name: true } },
      assignee: { select: { name: true } },
      vendor: { select: { name: true } },
    },
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { reportedAt: 'desc' }],
    take: 200,
  });

  const properties = await prisma.property.findMany({
    where: propertyIds ? { id: { in: propertyIds } } : {},
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });

  const staff = mayEdit
    ? await prisma.user.findMany({
        where: { active: true, role: { in: ['MAINTENANCE', 'MANAGER'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  return (
    <>
      <PageHeader title="Maintenance" subtitle={`${tickets.length} shown`} />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      {mayEdit && (
        <Card title="Report a fault" className="mb-4">
          <form action={reportAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="label">Property *</span>
              <select className="field" name="propertyId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Category</span>
              <select className="field" name="category" defaultValue="General">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Priority</span>
              <select className="field" name="priority" defaultValue="MEDIUM">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent — the unit cannot be let</option>
              </select>
            </label>
            <div className="sm:col-span-2">
              <label className="block">
                <span className="label">What is wrong *</span>
                <input
                  className="field"
                  name="description"
                  required
                  placeholder="Aircon in the bedroom is not cooling"
                />
              </label>
            </div>
            <label className="block">
              <span className="label">Assign to</span>
              <select className="field" name="assigneeId" defaultValue="">
                <option value="">Nobody yet</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Take dates off sale until</span>
              <input className="field" name="blockUntil" type="date" />
              <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
                Optional. Refused if a guest already holds those dates — the ticket is still raised.
              </span>
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <button className="btn btn-primary" type="submit">
                Raise ticket
              </button>
            </div>
          </form>
        </Card>
      )}

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <select className="field w-auto" name="status" defaultValue={sp.status ?? ''}>
          <option value="">Open tickets</option>
          <option value="all">All</option>
          <option value="REPORTED">Reported</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="WAITING_PARTS">Waiting on parts</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select className="field w-auto" name="property" defaultValue={sp.property ?? ''}>
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>

      <Card>
        {tickets.length === 0 ? (
          <Empty>Nothing outstanding.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                  <th className="py-2">Ticket</th>
                  <th className="py-2">Property</th>
                  <th className="py-2">Fault</th>
                  <th className="py-2">Priority</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Assigned</th>
                  <th className="py-2">Reported</th>
                  {mayCost && <th className="py-2 text-right">Cost</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-[color:var(--color-sand-50)]">
                    <td className="py-2">
                      <Link
                        href={`/portal/maintenance/${t.id}`}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {t.number}
                      </Link>
                      {t.blockId && (
                        <span className="ml-1 text-[11px] text-[color:var(--bad)]">blocking</span>
                      )}
                    </td>
                    <td className="py-2">{t.property.name}</td>
                    <td className="py-2">
                      <span className="text-xs text-[color:var(--color-ink-500)]">{t.category}</span>
                      <div>{t.description.slice(0, 70)}</div>
                    </td>
                    <td className="py-2">
                      <PriorityPill priority={t.priority} />
                    </td>
                    <td className="py-2">
                      <Pill tone={STATUS_TONE[t.status]}>
                        {t.status.toLowerCase().replace('_', ' ')}
                      </Pill>
                    </td>
                    <td className="py-2 text-xs">
                      {t.assignee?.name ?? t.vendor?.name ?? '—'}
                    </td>
                    <td className="py-2 text-xs">{formatManila(t.reportedAt)}</td>
                    {mayCost && (
                      <td className="py-2 text-right tabular-nums">
                        {t.costCents ? formatPesoShort(t.costCents) : '—'}
                      </td>
                    )}
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
