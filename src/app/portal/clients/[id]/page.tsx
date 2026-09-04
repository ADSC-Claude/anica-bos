import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatManila, daysUntil } from '@/lib/datetime';
import { medicalAlertsFor, recordMedicalAccess } from '@/lib/medical';
import { PageHeader, StatCard, StatusBadge, Alert, EmptyState } from '@/components/ui';
import { ClientForm } from '@/components/client-form';
import { MedicalForm } from '@/components/medical-form';
import { EraseClient } from '@/components/erase-client';
import { FeedbackForm } from './feedback-form';

export const dynamic = 'force-dynamic';

export default async function ClientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePage('clients.view');
  const { id } = await params;
  const { tab = 'overview' } = await searchParams;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true } },
      packages: {
        include: {
          package: true,
          entitlements: true,
        },
        orderBy: { expiresAt: 'desc' },
      },
      feedback: {
        include: { employee: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      followUps: { orderBy: { createdAt: 'desc' }, take: 10 },
      corporateLinks: { include: { account: { select: { id: true, name: true } } } },
      loyaltyTxns: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!client) notFound();

  const [appointments, sales, fieldDefs, fieldValues, therapists] = await Promise.all([
    prisma.appointment.findMany({
      where: { clientId: id },
      include: {
        services: { include: { service: { select: { name: true } }, employee: { select: { name: true } } } },
      },
      orderBy: { startAt: 'desc' },
      take: 25,
    }),
    prisma.sale.findMany({
      where: { clientId: id, status: 'PAID' },
      include: { lines: { select: { description: true, serviceId: true } } },
      orderBy: { businessDate: 'desc' },
      take: 25,
    }),
    prisma.clientFieldDefinition.findMany({
      where: { retired: false },
      orderBy: { sortRank: 'asc' },
    }),
    prisma.clientFieldValue.findMany({ where: { clientId: id }, include: { definition: true } }),
    prisma.employee.findMany({
      where: { active: true, employeeRole: 'THERAPIST' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const canMedical = can(user.role, 'clients.medical');
  const canErase = can(user.role, 'clients.erase');
  const alerts = canMedical ? (await medicalAlertsFor([id])).get(id) ?? [] : [];
  if (canMedical) {
    // Opening the intake tab is someone reading the answers; the warnings on
    // the overview are the same information arriving unbidden. Logged apart, so
    // the trail can tell a look-up from a glance.
    await recordMedicalAccess(user, id, tab === 'medical' ? 'record' : 'alerts');
  }
  const valuesByKey = Object.fromEntries(fieldValues.map((v) => [v.definition.key, v.value]));

  const lifetimeCents = sales.reduce((a, s) => a + s.totalCents, 0);
  const lastVisit = sales[0]?.businessDate ?? null;

  const serviceCounts = new Map<string, number>();
  for (const s of sales) {
    for (const l of s.lines) {
      if (l.serviceId) serviceCounts.set(l.description, (serviceCounts.get(l.description) ?? 0) + 1);
    }
  }
  const favourite = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  const membership = client.packages.find(
    (p) => p.package.type === 'MEMBERSHIP' && p.status === 'ACTIVE' && p.expiresAt >= new Date(),
  );
  const activePackages = client.packages.filter(
    (p) => p.package.type === 'SESSION_PACKAGE' && p.status === 'ACTIVE' && p.expiresAt >= new Date(),
  );

  const tabs = [
    ['overview', 'Overview'],
    ['history', 'Visit history'],
    ...(canMedical ? [['medical', 'Health intake']] : []),
    ['edit', 'Edit details'],
  ] as const;

  return (
    <div>
      <PageHeader
        title={client.name}
        subtitle={`${client.mobile}${client.email ? ` · ${client.email}` : ''}`}
        actions={
          <>
            <Link href={`/portal/appointments/new?clientId=${client.id}`} className="btn-secondary btn-sm">
              Book appointment
            </Link>
            <Link href={`/portal/sales/pos?clientId=${client.id}`} className="btn-primary btn-sm">
              New sale
            </Link>
          </>
        }
      />

      {/* An emptied record explains itself. Without this the shell reads as a
          botched import, and somebody sets about "fixing" it by asking the
          guest for her details again — which is precisely what she asked the
          spa to stop holding. */}
      {client.erasedAt && (
        <div className="mb-4">
          <Alert tone="warn">
            <p className="font-semibold">This record was erased on request</p>
            <p className="mt-1">
              Erased {formatManila(client.erasedAt)} under the Data Privacy Act. The personal
              details and health answers are gone for good; the sales and receipts below are kept
              because BIR requires them. Do not re-enter her details — book her as a new client if
              she returns.
            </p>
          </Alert>
        </div>
      )}

      {/* At-a-glance answers the receptionist is asked at the counter. */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lifetime spend" value={formatPeso(lifetimeCents)} hint={`${sales.length} visits`} />
        <StatCard label="Loyalty points" value={String(client.loyaltyPoints)} hint="Redeemable at checkout" />
        <StatCard
          label="Membership"
          value={membership ? 'Active' : 'None'}
          hint={
            membership
              ? `${membership.package.name} · expires ${formatManila(membership.expiresAt)}`
              : 'Sell one at POS'
          }
          tone={membership ? 'good' : 'default'}
        />
        <StatCard
          label="Prepaid sessions left"
          value={String(
            activePackages.reduce(
              (a, p) => a + p.entitlements.reduce((x, e) => x + (e.totalSessions - e.usedSessions), 0),
              0,
            ),
          )}
          hint={activePackages[0] ? `Expires ${formatManila(activePackages[0].expiresAt)}` : 'No package'}
          tone={activePackages.length ? 'good' : 'default'}
        />
      </div>

      {membership && daysUntil(membership.expiresAt) <= 30 && (
        <Alert tone="warn">
          <strong>Membership expiring soon</strong> — {membership.package.name} ends in{' '}
          {daysUntil(membership.expiresAt)} day(s) on {formatManila(membership.expiresAt)}. A renewal
          reminder email has been queued; you can also renew it at POS today.
        </Alert>
      )}

      {alerts.length > 0 && (
        <div className="mt-3">
          <Alert tone="danger">
            <p className="font-semibold">Health alerts — tell the therapist before the service</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {alerts.map((a) => (
                <li key={a.label}>
                  {a.label}: {a.detail}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {client.incomplete && (
        <div className="mt-3">
          <Alert tone="warn">
            This record was quick-added at the counter and is missing details. Complete the
            email, birthday and address on their next visit.
          </Alert>
        </div>
      )}

      <nav className="my-5 flex gap-1 overflow-x-auto border-b border-sand-200">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/portal/clients/${client.id}?tab=${key}`}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === key ? 'border-cocoa-600 text-cocoa-800' : 'border-transparent text-cocoa-400'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-pad">
            <h2 className="section-title mb-3">Details</h2>
            <dl className="space-y-1.5 text-sm">
              <Row label="Branch" value={client.branch.name} />
              <Row label="Birthday" value={client.birthday ? formatManila(client.birthday) : '—'} />
              <Row
                label="Address"
                value={[client.addressLine, client.barangay, client.addressCity].filter(Boolean).join(', ') || '—'}
              />
              <Row label="Favourite service" value={favourite} />
              <Row label="Last visit" value={lastVisit ? formatManila(lastVisit) : 'Never'} />
              <Row label="Tags" value={client.tags.join(', ') || '—'} />
              <Row label="PWD ID" value={client.pwdIdNumber || '—'} />
              <Row label="Senior ID" value={client.seniorIdNumber || '—'} />
              <Row
                label="Corporate account"
                value={client.corporateLinks.map((l) => l.account.name).join(', ') || '—'}
              />
              <Row
                label="Data-privacy consent"
                value={client.consentGiven ? `Given ${client.consentAt ? formatManila(client.consentAt) : ''}` : 'Not given'}
              />
              <Row
                label="Treatment waiver"
                value={client.waiverGiven ? `Signed ${client.waiverAt ? formatManila(client.waiverAt) : ''}` : 'Not signed'}
              />
            </dl>
            {client.notes && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-cocoa-500">
                  Notes &amp; preferences
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-cocoa-700">{client.notes}</p>
              </>
            )}
          </div>

          <div className="space-y-4">
            <div className="card-pad">
              <h2 className="section-title mb-3">Packages &amp; memberships</h2>
              {client.packages.length === 0 ? (
                <p className="muted">None yet. Sell one at POS.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {client.packages.map((p) => {
                    const left = p.entitlements.reduce(
                      (a, e) => a + (e.totalSessions - e.usedSessions),
                      0,
                    );
                    const expired = p.expiresAt < new Date();
                    return (
                      <li key={p.id} className="rounded-xl border border-sand-200 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-cocoa-800">{p.package.name}</span>
                          <StatusBadge status={expired ? 'EXPIRED' : p.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-cocoa-500">
                          {p.package.type === 'MEMBERSHIP'
                            ? `${p.package.memberDiscountPercent}% member discount`
                            : `${left} session(s) left`}{' '}
                          · expires {formatManila(p.expiresAt)}
                        </p>
                        {p.package.type === 'MEMBERSHIP' && (
                          <p className="mt-0.5 text-xs text-cocoa-400">
                            Birthday perk{' '}
                            {p.birthdayPerkUsedYear === new Date().getUTCFullYear()
                              ? 'already used this membership year'
                              : 'available in their birthday month'}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="card-pad">
              <h2 className="section-title mb-3">Feedback</h2>
              <FeedbackForm clientId={client.id} therapists={therapists} />
              {client.feedback.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm">
                  {client.feedback.map((f) => (
                    <li key={f.id} className="rounded-xl bg-sand-50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-cocoa-700">
                          {'★'.repeat(f.rating)}
                          <span className="text-sand-300">{'★'.repeat(5 - f.rating)}</span>
                        </span>
                        <span className="text-xs text-cocoa-400">{formatManila(f.createdAt)}</span>
                      </div>
                      {f.comment && <p className="mt-1 text-cocoa-600">{f.comment}</p>}
                      {f.employee && (
                        <p className="mt-0.5 text-xs text-cocoa-400">Therapist: {f.employee.name}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {client.followUps.length > 0 && (
              <div className="card-pad">
                <h2 className="section-title mb-3">Follow-up log</h2>
                <ul className="space-y-1.5 text-sm">
                  {client.followUps.map((f) => (
                    <li key={f.id} className="flex justify-between gap-3">
                      <span className="text-cocoa-700">
                        <span className="font-medium capitalize">{f.channel}</span>
                        {f.note ? ` — ${f.note}` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-cocoa-400">
                        {formatManila(f.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h2 className="section-title mb-3">Appointments</h2>
            {appointments.length === 0 ? (
              <EmptyState title="No appointments yet" />
            ) : (
              <div className="card divide-y divide-sand-100">
                {appointments.map((a) => (
                  <Link key={a.id} href={`/portal/appointments/${a.id}`} className="block px-4 py-3 hover:bg-sand-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-cocoa-800">
                        {formatManila(a.startAt, { time: true })}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-cocoa-500">
                      {a.services.map((s) => s.service.name).join(', ')}
                      {a.services[0]?.employee ? ` · ${a.services[0].employee.name}` : ''}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="section-title mb-3">Purchases</h2>
            {sales.length === 0 ? (
              <EmptyState title="No purchases yet" />
            ) : (
              <div className="card divide-y divide-sand-100">
                {sales.map((s) => (
                  <Link key={s.id} href={`/portal/sales/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sand-50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-cocoa-800">{s.receiptNo}</p>
                      <p className="truncate text-xs text-cocoa-500">
                        {s.lines.map((l) => l.description).join(', ')}
                      </p>
                    </div>
                    <span className="shrink-0 num text-sm font-semibold text-cocoa-700">
                      {formatPeso(s.totalCents)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'medical' && canMedical && (
        <div className="max-w-2xl">
          <div className="card-pad">
            <p className="muted mb-4">
              Last updated{' '}
              {client.medicalUpdatedAt ? formatManila(client.medicalUpdatedAt) : 'never'}.
            </p>
            <MedicalForm
              clientId={client.id}
              fields={fieldDefs}
              values={valuesByKey}
              consentGiven={client.consentGiven}
              waiverGiven={client.waiverGiven}
            />
          </div>
        </div>
      )}


      {tab === 'edit' && (
        <div className="max-w-2xl">
          <ClientForm
            values={{
              id: client.id,
              name: client.name,
              mobile: client.mobile,
              email: client.email,
              birthday: client.birthday?.toISOString().slice(0, 10),
              addressCity: client.addressCity,
              addressLine: client.addressLine,
              barangay: client.barangay,
              notes: client.notes,
              tags: client.tags,
              pwdIdNumber: client.pwdIdNumber,
              seniorIdNumber: client.seniorIdNumber,
              consentGiven: client.consentGiven,
              waiverGiven: client.waiverGiven,
            }}
          />
          {canErase && !client.erasedAt && (
            <EraseClient clientId={client.id} clientName={client.name} />
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-cocoa-500">{label}</dt>
      <dd className="text-right text-cocoa-700">{value}</dd>
    </div>
  );
}
