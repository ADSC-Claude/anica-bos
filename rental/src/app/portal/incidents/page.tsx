import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage, assertProperty, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatManila } from '@/lib/datetime';
import { formatPesoShort, toCents } from '@/lib/money';
import { guestName } from '@/lib/guests';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { Card, Empty, Notice, PageHeader, Pill } from '@/components/ui';

export const metadata = { title: 'Incidents' };
export const dynamic = 'force-dynamic';

const TYPES = ['DAMAGE', 'LOSS', 'COMPLAINT', 'RULE_BREACH', 'SAFETY', 'NOISE', 'OTHER'];

async function reportAction(formData: FormData) {
  'use server';
  const user = await requirePage('incidents.edit');
  const propertyId = String(formData.get('propertyId') ?? '');
  const description = String(formData.get('description') ?? '').trim();
  if (!propertyId || !description) {
    redirect('/portal/incidents?error=' + encodeURIComponent('A property and a description are required.'));
  }
  await assertProperty(user, propertyId);

  const reservationId = String(formData.get('reservationId') || '') || null;
  const reservation = reservationId
    ? await prisma.reservation.findUnique({
        where: { id: reservationId },
        select: { guestId: true, propertyId: true },
      })
    : null;

  const type = String(formData.get('type') || 'DAMAGE');
  const incident = await prisma.incident.create({
    data: {
      propertyId,
      reservationId,
      guestId: reservation?.guestId ?? null,
      type: type as never,
      description,
      itemsAffected: String(formData.get('itemsAffected') ?? ''),
      estimatedCostCents: toCents(String(formData.get('estimated') || '0')),
      reportedById: user.id,
    },
  });

  await audit(user, {
    module: 'incidents',
    action: 'report',
    entityType: 'Incident',
    entityId: incident.id,
    propertyId,
    summary: `${type.toLowerCase().replace('_', ' ')} reported`,
    after: { description },
  });

  if (type === 'COMPLAINT' || type === 'SAFETY') {
    const property = await prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: { name: true },
    });
    await notify({
      kind: 'COMPLAINT',
      severity: type === 'SAFETY' ? 'URGENT' : 'HIGH',
      title: `${type === 'SAFETY' ? 'Safety incident' : 'Complaint'} at ${property.name}`,
      body: description.slice(0, 200),
      link: `/portal/incidents/${incident.id}`,
      dedupeKey: `incident:${incident.id}`,
      roles: ['OWNER', 'MANAGER'],
      propertyId,
    });
  }

  redirect(`/portal/incidents/${incident.id}?ok=${encodeURIComponent('Incident recorded.')}`);
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string; type?: string }>;
}) {
  const user = await requirePage('incidents.view');
  const sp = await searchParams;
  const mayEdit = can(user.role, 'incidents.edit');
  const propertyIds = await visibleProperties(user);

  const incidents = await prisma.incident.findMany({
    where: {
      ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
      ...(sp.status === 'all' ? {} : { status: (sp.status ?? 'OPEN') as never }),
      ...(sp.type ? { type: sp.type as never } : {}),
    },
    include: {
      property: { select: { name: true } },
      guest: { select: { firstName: true, lastName: true, id: true } },
      reservation: { select: { id: true, reference: true } },
    },
    orderBy: { occurredAt: 'desc' },
    take: 200,
  });

  const properties = await prisma.property.findMany({
    where: propertyIds ? { id: { in: propertyIds } } : {},
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });

  // Only stays that are current or recent can plausibly be the subject of a new
  // incident, and a list of every booking ever is unusable in a dropdown.
  const recent = mayEdit
    ? await prisma.reservation.findMany({
        where: {
          ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
          status: { in: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'] },
        },
        select: { id: true, reference: true, guest: { select: { firstName: true, lastName: true } } },
        orderBy: { checkOut: 'desc' },
        take: 40,
      })
    : [];

  return (
    <>
      <PageHeader title="Incidents and damage" subtitle={`${incidents.length} shown`} />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      {mayEdit && (
        <Card title="Record an incident" className="mb-4">
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
              <span className="label">Type</span>
              <select className="field" name="type" defaultValue="DAMAGE">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.toLowerCase().replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Stay</span>
              <select className="field" name="reservationId" defaultValue="">
                <option value="">Not linked to a stay</option>
                {recent.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference} — {guestName(r.guest)}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <label className="block">
                <span className="label">What happened *</span>
                <input className="field" name="description" required />
              </label>
            </div>
            <label className="block">
              <span className="label">Items affected</span>
              <input className="field" name="itemsAffected" placeholder="Bedside lamp, bath mat" />
            </label>
            <label className="block">
              <span className="label">Estimated cost</span>
              <input className="field" name="estimated" type="number" step="0.01" min="0" defaultValue="0" />
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <button className="btn btn-primary" type="submit">
                Record
              </button>
            </div>
          </form>
        </Card>
      )}

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <select className="field w-auto" name="status" defaultValue={sp.status ?? 'OPEN'}>
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="all">All</option>
        </select>
        <select className="field w-auto" name="type" defaultValue={sp.type ?? ''}>
          <option value="">Any type</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.toLowerCase().replace('_', ' ')}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>

      <Card>
        {incidents.length === 0 ? (
          <Empty>Nothing recorded.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                  <th className="py-2">When</th>
                  <th className="py-2">Property</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">What happened</th>
                  <th className="py-2">Guest</th>
                  <th className="py-2">Action</th>
                  <th className="py-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                {incidents.map((i) => (
                  <tr key={i.id} className="hover:bg-[color:var(--color-sand-50)]">
                    <td className="py-2 text-xs">{formatManila(i.occurredAt)}</td>
                    <td className="py-2">{i.property.name}</td>
                    <td className="py-2 text-xs">{i.type.toLowerCase().replace('_', ' ')}</td>
                    <td className="py-2">
                      <Link href={`/portal/incidents/${i.id}`} className="hover:underline">
                        {i.description.slice(0, 60)}
                      </Link>
                    </td>
                    <td className="py-2 text-xs">
                      {i.guest ? (
                        <Link href={`/portal/guests/${i.guest.id}`} className="hover:underline">
                          {guestName(i.guest)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2">
                      <Pill tone={i.status === 'RESOLVED' ? 'ok' : 'warn'}>
                        {i.action === 'PENDING'
                          ? i.status.toLowerCase()
                          : i.action.toLowerCase().replace('_', ' ')}
                      </Pill>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatPesoShort(i.actualCostCents || i.estimatedCostCents)}
                    </td>
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
