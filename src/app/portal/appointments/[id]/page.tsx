import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { medicalAlertsFor, recordMedicalAccess } from '@/lib/medical';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatusBadge, Alert } from '@/components/ui';
import {
  approveLateRequestAction,
  declineLateRequestAction,
  setAppointmentStatusAction,
  verifyDepositAction,
} from '../actions';
import { ItineraryPanel } from './itinerary-panel';
import { RefundPanel } from './refund-panel';
import { shownName } from '@/lib/people';

export const dynamic = 'force-dynamic';

const NEXT_STATUS: Record<string, { label: string; status: string; primary?: boolean }[]> = {
  PENDING: [
    { label: 'Confirm manually', status: 'CONFIRMED', primary: true },
    { label: 'Cancel', status: 'CANCELLED' },
  ],
  CONFIRMED: [
    { label: 'Check in', status: 'CHECKED_IN', primary: true },
    { label: 'No-show', status: 'NO_SHOW' },
    { label: 'Cancel', status: 'CANCELLED' },
  ],
  CHECKED_IN: [
    { label: 'Start service', status: 'IN_SERVICE', primary: true },
    { label: 'No-show', status: 'NO_SHOW' },
  ],
  IN_SERVICE: [{ label: 'Mark completed', status: 'COMPLETED', primary: true }],
  COMPLETED: [],
  CANCELLED: [{ label: 'Reinstate', status: 'CONFIRMED' }],
  NO_SHOW: [{ label: 'Reinstate', status: 'CONFIRMED' }],
  EXPIRED: [{ label: 'Reinstate', status: 'CONFIRMED' }],
};

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warn?: string }>;
}) {
  const user = await requirePage('appointments.view');
  const { id } = await params;
  const { warn } = await searchParams;

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: {
      client: true,
      branch: true,
      resource: true,
      partner: true,
      sales: { select: { id: true, receiptNo: true, totalCents: true, status: true } },
      services: {
        include: {
          service: true,
          employee: { select: { id: true, name: true, displayName: true } },
          resource: { select: { id: true, name: true } },
        },
        orderBy: { sortRank: 'asc' },
      },
    },
  });
  if (!appt) notFound();

  // The rest of the party, when there is one. Loaded separately rather than as
  // a relation because a party is a shared reference, not a parent row — there
  // is deliberately no "party" record for a booking of one to belong to.
  const party = appt.partyRef
    ? await prisma.appointment.findMany({
        where: { partyRef: appt.partyRef, id: { not: appt.id } },
        include: {
          client: { select: { name: true } },
          resource: { select: { name: true } },
          services: {
            include: { service: true, employee: { select: { name: true } } },
            orderBy: { sortRank: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const alerts = can(user.role, 'clients.medical')
    ? (await medicalAlertsFor([appt.clientId])).get(appt.clientId) ?? []
    : [];
  if (can(user.role, 'clients.medical')) {
    await recordMedicalAccess(user, appt.clientId, 'alerts');
  }
  const canEdit = can(user.role, 'appointments.edit');
  const total = appt.services.reduce((a, s) => a + s.priceCents, 0);
  const actions = NEXT_STATUS[appt.status] ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={appt.guestName || appt.client.name}
        subtitle={`${formatManila(appt.startAt, { time: true, weekday: true })} · ${appt.reference}${
          appt.guestName ? ` · guest of ${appt.client.name}` : ''
        }`}
        actions={
          <>
            <Link href={`/portal/clients/${appt.clientId}`} className="btn-secondary btn-sm">
              Client record
            </Link>
            {canEdit && (
              <Link href={`/portal/appointments/${appt.id}/edit`} className="btn-secondary btn-sm">
                Edit
              </Link>
            )}
            {appt.status !== 'COMPLETED' || appt.sales.length === 0 ? (
              <Link href={`/portal/sales/pos?appointmentId=${appt.id}`} className="btn-primary btn-sm">
                Checkout
              </Link>
            ) : (
              <Link href={`/portal/sales/${appt.sales[0].id}`} className="btn-secondary btn-sm">
                View receipt
              </Link>
            )}
          </>
        }
      />

      {warn === 'past-midnight' && (
        <div className="mb-4">
          <Alert tone="warn">
            This booking runs past midnight closing time. Double-check with the therapist
            before confirming it.
          </Alert>
        </div>
      )}

      {/* A slot the guest asked for that runs past closing. Nothing has been
          charged, so this decision costs the spa nothing either way — which is
          the point of it being a decision at all. */}
      {appt.needsApproval && canEdit && (
        <div className="card-pad mb-4 border-cocoa-300 bg-cocoa-50">
          <h2 className="section-title mb-1">Late request — runs past closing</h2>
          <p className="muted mb-3">
            {appt.client.name} asked for {formatManila(appt.startAt, { time: true, weekday: true })},
            finishing at {formatManila(appt.endAt, { time: true })}. Approving asks them for the{' '}
            {formatPeso(appt.depositAmountCents)} reservation fee and holds the slot.
            Nothing has been charged yet, so declining costs them nothing.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <form action={approveLateRequestAction}>
              <input type="hidden" name="id" value={appt.id} />
              <button className="btn-primary btn-sm" type="submit">
                Approve — we can stay
              </button>
            </form>
            <form action={declineLateRequestAction} className="flex items-end gap-2">
              <input type="hidden" name="id" value={appt.id} />
              <label className="block">
                <span className="label">Reason (sent to the client)</span>
                <input name="reason" className="input w-64" placeholder="No therapist available that late" />
              </label>
              <button className="btn-danger btn-sm" type="submit">
                Decline
              </button>
            </form>
          </div>
        </div>
      )}

      {party.length > 0 && (
        <div className="card-pad mb-4">
          <h2 className="section-title mb-2">
            Booked together — party of {party.length + 1}
          </h2>
          <ul className="space-y-1 text-sm">
            {party.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/portal/appointments/${p.id}`} className="font-medium text-cocoa-800 hover:underline">
                  {p.guestName || p.client.name}
                </Link>
                <span className="text-xs text-cocoa-500">
                  {p.services.map((s) => s.service.name).join(', ')}
                  {p.resource ? ` · ${p.resource.name}` : ''}
                  {p.services[0]?.employee?.name ? ` · ${p.services[0].employee.name}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-cocoa-400">
            One reservation fee covers the party, and it sits on {appt.client.name}&apos;s
            booking. Confirming, declining or cancelling any of these moves all of them.
          </p>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mb-4">
          <Alert tone="danger">
            <p className="font-semibold">Health alerts — brief the therapist before the service</p>
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

      {/* A cancelled booking whose fee is still paid is the system's way of
          saying the money is owed back — see lib/booking-policy.ts. A late
          cancellation forfeits instead, and never reaches this. */}
      {appt.status === 'CANCELLED' && appt.depositStatus === 'PAID' && canEdit && (
        <div className="mb-4 max-w-2xl">
          <RefundPanel
            appointmentId={appt.id}
            amountCents={appt.depositPaidCents || appt.depositAmountCents}
            cancelReason={appt.cancelReason}
            viaGateway={Boolean(appt.gatewayPaymentId || appt.gatewaySessionId)}
          />
        </div>
      )}

      {/* Manual-transfer deposit sitting in the verify queue. */}
      {appt.depositStatus === 'AWAITING_VERIFICATION' && canEdit && (
        <div className="card-pad mb-4 border-sand-300 bg-sand-50">
          <h2 className="section-title mb-2">Deposit to verify</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="text-sm">
              <p><span className="text-cocoa-500">Expected:</span> <strong className="num">{formatPeso(appt.depositAmountCents)}</strong></p>
              <p><span className="text-cocoa-500">Reference number:</span> {appt.depositReference || '—'}</p>
              <p><span className="text-cocoa-500">Method:</span> {appt.depositMethod || 'manual transfer'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={verifyDepositAction}>
                  <input type="hidden" name="id" value={appt.id} />
                  <input type="hidden" name="decision" value="verify" />
                  <button className="btn-primary btn-sm" type="submit">
                    ✓ Verify &amp; confirm booking
                  </button>
                </form>
                <form action={verifyDepositAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={appt.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <input name="reason" className="input btn-sm min-h-9 w-36 py-1" placeholder="Reason" />
                  <button className="btn-danger btn-sm" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            </div>
            <div>
              {appt.depositProofUrl ? (
                // Data URL from the visitor's upload; shown side-by-side for a fast check.
                <Image
                  src={appt.depositProofUrl}
                  alt="Uploaded proof of payment"
                  width={400}
                  height={520}
                  unoptimized
                  className="max-h-72 w-auto rounded-xl border border-sand-200 object-contain"
                />
              ) : (
                <p className="muted">The client has not uploaded a screenshot yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Booking</h2>
            <StatusBadge status={appt.status} />
          </div>
          <dl className="space-y-1.5 text-sm">
            <Row label="Reference" value={appt.reference} />
            <Row label="Branch" value={appt.branch.name} />
            <Row label="Start" value={formatManila(appt.startAt, { time: true })} />
            <Row label="End" value={formatManila(appt.endAt, { time: true })} />
            <Row label="Room / bed" value={appt.resource?.name ?? 'Not assigned'} />
            <Row label="Source" value={appt.source.replaceAll('_', ' ').toLowerCase()} />
            {appt.partner && <Row label="Partner" value={appt.partner.name} />}
            {appt.notes && <Row label="Notes" value={appt.notes} />}
            {appt.cancelReason && <Row label="Reason" value={appt.cancelReason} />}
          </dl>
        </div>

        <div className="space-y-4">
          <ItineraryPanel
            appointmentId={appt.id}
            canEdit={canEdit}
            legs={appt.services.map((s) => ({
              id: s.id,
              name: s.service.name,
              therapist: s.employee ? shownName(s.employee) : 'unassigned',
              placeName: s.resource?.name ?? 'no place yet',
              durationMinutes: s.durationMinutes,
              priceCents: s.priceCents,
              startAtIso: s.startAt ? s.startAt.toISOString() : null,
              endAtIso: s.endAt ? s.endAt.toISOString() : null,
              actualStartAtIso: s.actualStartAt ? s.actualStartAt.toISOString() : null,
              actualEndAtIso: s.actualEndAt ? s.actualEndAt.toISOString() : null,
              changeoverAfter: s.changeoverMinutes,
            }))}
          />

        <div className="card-pad">
          <div className="text-sm">
            <div className="flex justify-between font-semibold">
              <span>Service total</span>
              <span className="num">{formatPeso(total)}</span>
            </div>
            {appt.depositAmountCents > 0 && (
              <>
                <div className="mt-1 flex justify-between text-cocoa-600">
                  <span>Reservation fee ({appt.depositStatus.replaceAll('_', ' ').toLowerCase()})</span>
                  <span className="num">−{formatPeso(appt.depositPaidCents || appt.depositAmountCents)}</span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-cocoa-400">
                  <span>Gateway reference</span>
                  <span className="num">{appt.gatewayPaymentId || appt.depositReference || '—'}</span>
                </div>
                <div className="mt-2 flex justify-between font-semibold text-cocoa-800">
                  <span>Balance at checkout</span>
                  <span className="num">
                    {formatPeso(Math.max(0, total - (appt.depositStatus === 'PAID' ? appt.depositPaidCents : 0)))}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>

      {canEdit && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((a) => (
            <form key={a.status} action={setAppointmentStatusAction}>
              <input type="hidden" name="id" value={appt.id} />
              <input type="hidden" name="status" value={a.status} />
              <button className={a.primary ? 'btn-primary' : 'btn-secondary'} type="submit">
                {a.label}
              </button>
            </form>
          ))}
        </div>
      )}

      {appt.sales.length > 0 && (
        <div className="card-pad mt-4">
          <h2 className="section-title mb-2">Receipts</h2>
          <ul className="space-y-1 text-sm">
            {appt.sales.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <Link href={`/portal/sales/${s.id}`} className="text-cocoa-700 underline underline-offset-4">
                  {s.receiptNo}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="num">{formatPeso(s.totalCents)}</span>
                  <StatusBadge status={s.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-cocoa-500">{label}</dt>
      <dd className="text-right capitalize text-cocoa-700">{value}</dd>
    </div>
  );
}
