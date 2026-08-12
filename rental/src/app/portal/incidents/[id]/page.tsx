import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePage, assertProperty } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPeso, toCents } from '@/lib/money';
import { formatManila, formatStayRange } from '@/lib/datetime';
import { guestName } from '@/lib/guests';
import { audit } from '@/lib/audit';
import { resolveNotification } from '@/lib/notifications';
import { BackLink, Card, Field, Notice, PageHeader, Pill, TextArea } from '@/components/ui';

export const dynamic = 'force-dynamic';

function back(id: string, message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/incidents/${id}?${kind}=${encodeURIComponent(message)}`);
}

async function updateAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await requirePage('incidents.edit');

  const before = await prisma.incident.findUnique({
    where: { id },
    select: { propertyId: true, action: true, status: true, actualCostCents: true, resolution: true },
  });
  if (!before) notFound();
  await assertProperty(user, before.propertyId);

  const status = String(formData.get('status') || 'OPEN');
  const after = {
    action: String(formData.get('action') || 'PENDING') as never,
    actualCostCents: toCents(String(formData.get('actual') || '0')),
    resolution: String(formData.get('resolution') ?? ''),
    status: status as never,
    resolvedAt: status === 'RESOLVED' ? new Date() : null,
  };

  await prisma.incident.update({ where: { id }, data: after });
  if (status === 'RESOLVED') await resolveNotification(`incident:${id}`);

  await audit(user, {
    module: 'incidents',
    action: 'update',
    entityType: 'Incident',
    entityId: id,
    propertyId: before.propertyId,
    summary: `Incident ${status.toLowerCase()}`,
    before,
    after,
  });
  back(id, 'Incident updated.');
}

export default async function IncidentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePage('incidents.view');

  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      property: { select: { name: true } },
      guest: { select: { id: true, firstName: true, lastName: true, tier: true } },
      reservation: {
        select: {
          id: true,
          reference: true,
          checkIn: true,
          checkOut: true,
          securityDeposit: true,
        },
      },
      reportedBy: { select: { name: true } },
    },
  });
  if (!incident) notFound();
  await assertProperty(user, incident.propertyId);

  const mayEdit = can(user.role, 'incidents.edit');
  const deposit = incident.reservation?.securityDeposit;

  return (
    <>
      <BackLink href="/portal/incidents">All incidents</BackLink>
      <PageHeader
        title={incident.type.toLowerCase().replace('_', ' ')}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {incident.property.name} · {formatManila(incident.occurredAt, { time: true })}
            <Pill tone={incident.status === 'RESOLVED' ? 'ok' : 'warn'}>
              {incident.status.toLowerCase()}
            </Pill>
          </span>
        }
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="What happened">
            <p className="whitespace-pre-wrap text-sm">{incident.description}</p>
            {incident.itemsAffected && (
              <p className="mt-2 text-sm">
                <span className="text-[color:var(--color-ink-500)]">Items affected: </span>
                {incident.itemsAffected}
              </p>
            )}
            <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">
              Reported {formatManila(incident.createdAt, { time: true })}
              {incident.reportedBy ? ` by ${incident.reportedBy.name}` : ''}
            </p>
            {incident.resolution && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-[color:var(--color-sand-100)] p-3 text-sm">
                {incident.resolution}
              </p>
            )}
          </Card>

          {mayEdit && (
            <Card title="Resolution">
              <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={incident.id} />
                <label className="block">
                  <span className="label">How it is being settled</span>
                  <select className="field" name="action" defaultValue={incident.action}>
                    <option value="PENDING">Not decided</option>
                    <option value="CHARGE_DEPOSIT">Charge the security deposit</option>
                    <option value="GUEST_PAID">Guest paid directly</option>
                    <option value="ABSORB">Absorb the cost</option>
                    <option value="INSURANCE">Claim on insurance</option>
                  </select>
                </label>
                <Field
                  label="Actual cost"
                  name="actual"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(incident.actualCostCents / 100).toFixed(2)}
                  hint={`Estimated at ${formatPeso(incident.estimatedCostCents)}`}
                />
                <div className="sm:col-span-2">
                  <TextArea
                    label="Notes"
                    name="resolution"
                    defaultValue={incident.resolution}
                    rows={3}
                  />
                </div>
                <label className="block">
                  <span className="label">Status</span>
                  <select className="field" name="status" defaultValue={incident.status}>
                    <option value="OPEN">Open</option>
                    <option value="RESOLVED">Resolved</option>
                  </select>
                </label>
                <div className="sm:col-span-2">
                  <button className="btn btn-primary" type="submit">
                    Save
                  </button>
                </div>
              </form>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {incident.guest && (
            <Card title="Guest">
              <Link
                href={`/portal/guests/${incident.guest.id}`}
                className="font-medium hover:underline"
              >
                {guestName(incident.guest)}
              </Link>
              <div className="mt-1 text-xs text-[color:var(--color-ink-500)]">
                {incident.guest.tier.toLowerCase()}
              </div>
            </Card>
          )}

          {incident.reservation && (
            <Card title="Stay">
              <Link
                href={`/portal/reservations/${incident.reservation.id}`}
                className="font-mono text-sm font-semibold hover:underline"
              >
                {incident.reservation.reference}
              </Link>
              <div className="mt-1 text-xs text-[color:var(--color-ink-500)]">
                {formatStayRange(incident.reservation.checkIn, incident.reservation.checkOut)}
              </div>

              {deposit ? (
                <div className="mt-3 border-t border-[color:var(--color-sand-200)] pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[color:var(--color-ink-500)]">Deposit held</span>
                    <span className="tabular-nums">{formatPeso(deposit.amountCents)}</span>
                  </div>
                  {deposit.deductedCents > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[color:var(--color-ink-500)]">Already deducted</span>
                      <span className="tabular-nums">{formatPeso(deposit.deductedCents)}</span>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-[color:var(--color-ink-500)]">
                    {deposit.status.toLowerCase().replace('_', ' ')}
                  </div>
                  {incident.action === 'CHARGE_DEPOSIT' && (
                    <p className="mt-2 text-xs">
                      Deduct it on the{' '}
                      <Link
                        className="underline"
                        href={`/portal/reservations/${incident.reservation.id}`}
                      >
                        reservation
                      </Link>{' '}
                      — the deposit is settled there so one record holds the money.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
                  No security deposit on this stay.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
