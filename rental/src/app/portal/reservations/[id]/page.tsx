import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePage, assertProperty, HttpError } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPeso, formatPesoShort, toCents } from '@/lib/money';
import { formatManila, formatStayDate, minutesToLabel, toDateKey } from '@/lib/datetime';
import { checkIn as doCheckIn, checkOut as doCheckOut, cancelReservation, updateReservationDates } from '@/lib/reservations';
import { recordManualPayment, refund, settleDeposit } from '@/lib/payments';
import { renderMessage, sendNow, DEFAULT_TEMPLATES } from '@/lib/messaging';
import { accessCode } from '@/lib/codes';
import { audit } from '@/lib/audit';
import { absoluteUrl } from '@/lib/app-url';
import { BackLink, Card, Notice, PageHeader, StatusPill, PaymentPill, Pill, Empty, Money } from '@/components/ui';

export const dynamic = 'force-dynamic';

function back(id: string, message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/reservations/${id}?${kind}=${encodeURIComponent(message)}`);
}

async function guardReservation(id: string, permission: Parameters<typeof requirePage>[0]) {
  const user = await requirePage(permission);
  const reservation = await prisma.reservation.findUnique({ where: { id }, select: { propertyId: true } });
  if (!reservation) notFound();
  await assertProperty(user, reservation.propertyId);
  return user;
}

async function checkInAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardReservation(id, 'reservations.checkin');

  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: { property: { select: { accessNotes: true, wifiName: true } } },
  });

  try {
    await doCheckIn(id, user);
  } catch (err) {
    if (err instanceof HttpError) back(id, err.message, 'error');
    throw err;
  }

  // Access details are issued at check-in, not before: a code sitting in an
  // inbox for three days is a door standing open for three days.
  const existing = await prisma.accessRecord.count({ where: { reservationId: id } });
  if (!existing) {
    const code = accessCode();
    await prisma.accessRecord.create({
      data: {
        reservationId: id,
        propertyId: r.propertyId,
        method: 'KEYPAD_CODE',
        code,
        instructions: r.property.accessNotes || `Keypad code ${code}, then turn the handle.`,
        activatesAt: new Date(),
        expiresAt: r.checkOut,
        issuedById: user.id,
      },
    });
  }
  back(id, 'Checked in. Access details released to the guest.');
}

async function checkOutAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardReservation(id, 'reservations.checkin');
  try {
    await doCheckOut(id, user);
  } catch (err) {
    if (err instanceof HttpError) back(id, err.message, 'error');
    throw err;
  }
  back(id, 'Checked out. A turnover task has been created with the next arrival as its deadline.');
}

async function cancelAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardReservation(id, 'reservations.cancel');
  await cancelReservation({
    reservationId: id,
    reason: String(formData.get('reason') || 'Cancelled by staff'),
    user,
  });
  back(id, 'Cancelled. Those dates are back on sale.');
}

async function rescheduleAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardReservation(id, 'reservations.edit');
  try {
    await updateReservationDates({
      reservationId: id,
      checkIn: String(formData.get('checkIn')),
      checkOut: String(formData.get('checkOut')),
      user,
    });
  } catch (err) {
    if (err instanceof HttpError) back(id, err.message, 'error');
    throw err;
  }
  back(id, 'Dates changed and the stay re-priced.');
}

async function paymentAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardReservation(id, 'reservations.edit');
  try {
    await recordManualPayment({
      reservationId: id,
      amountCents: toCents(String(formData.get('amount'))),
      method: String(formData.get('method')) as never,
      notes: String(formData.get('notes') ?? ''),
      user,
    });
  } catch (err) {
    if (err instanceof HttpError) back(id, err.message, 'error');
    throw err;
  }
  back(id, 'Payment recorded.');
}

async function refundAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardReservation(id, 'finance.refund');
  try {
    const result = await refund({
      reservationId: id,
      amountCents: toCents(String(formData.get('amount'))),
      reason: String(formData.get('reason') || 'Refund'),
      user,
    });
    back(
      id,
      result.gateway
        ? 'Refund sent through PayMongo and recorded.'
        : 'Refund recorded — it was NOT sent through the gateway, so transfer it by hand.',
      result.gateway ? 'ok' : 'error',
    );
  } catch (err) {
    if (err instanceof HttpError) back(id, err.message, 'error');
    throw err;
  }
}

async function depositAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardReservation(id, 'finance.refund');
  await settleDeposit({
    reservationId: id,
    deductCents: toCents(String(formData.get('deduct') || '0')),
    notes: String(formData.get('notes') ?? ''),
    user,
  });
  back(id, 'Deposit settled.');
}

async function sendMessageAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  await guardReservation(id, 'messages.send');
  const result = await sendNow(id, String(formData.get('templateKey')));
  back(id, result.ok ? 'Message sent.' : `Could not send: ${result.error}`, result.ok ? 'ok' : 'error');
}

async function noteAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardReservation(id, 'reservations.edit');
  const before = await prisma.reservation.findUniqueOrThrow({ where: { id }, select: { internalNotes: true } });
  const internalNotes = String(formData.get('internalNotes') ?? '');
  await prisma.reservation.update({ where: { id }, data: { internalNotes } });
  await audit(user, {
    module: 'reservations',
    action: 'note',
    entityType: 'Reservation',
    entityId: id,
    summary: 'Internal notes updated',
    before,
    after: { internalNotes },
  });
  back(id, 'Notes saved.');
}

export default async function ReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePage('reservations.view');
  const { id } = await params;
  const flash = await searchParams;

  const r = await prisma.reservation.findUnique({
    where: { id },
    include: {
      property: true,
      guest: true,
      lines: { orderBy: { sortOrder: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      securityDeposit: true,
      messages: { orderBy: { scheduledFor: 'asc' } },
      accessRecords: { orderBy: { issuedAt: 'desc' } },
      checkInForm: { include: { companions: true } },
      tasks: { include: { cleaning: true }, orderBy: { createdAt: 'desc' } },
      incidents: true,
      addOns: true,
    },
  });
  if (!r) notFound();
  await assertProperty(user, r.propertyId);

  const showMoney = can(user.role, 'reservations.edit') || can(user.role, 'finance.view');
  const balance = r.totalCents - r.paidCents;
  const preview = await renderMessage(r.id, 'checkin_day').catch(() => null);

  return (
    <>
      <BackLink href="/portal/reservations">All reservations</BackLink>

      <PageHeader
        title={r.reference}
        subtitle={
          <>
            {r.property.name} · {formatStayDate(r.checkIn, { weekday: true })} →{' '}
            {formatStayDate(r.checkOut, { weekday: true })} · {r.nights} night
            {r.nights === 1 ? '' : 's'} · {r.adults + r.children} guest
            {r.adults + r.children === 1 ? '' : 's'}
          </>
        }
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={r.status} />
            {showMoney && <PaymentPill status={r.paymentStatus} />}
            <Pill tone="muted">{r.source.replace('_', ' ').toLowerCase()}</Pill>
          </span>
        }
      />

      {flash.ok && <Notice kind="ok">{flash.ok}</Notice>}
      {flash.error && <Notice kind="error">{flash.error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* --- lifecycle actions ---------------------------------------- */}
          {can(user.role, 'reservations.checkin') && (
            <Card title="Where this stay is up to">
              <div className="flex flex-wrap gap-2">
                {r.status === 'CONFIRMED' && (
                  <form action={checkInAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn btn-primary" type="submit">
                      Check in
                    </button>
                  </form>
                )}
                {r.status === 'CHECKED_IN' && (
                  <form action={checkOutAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn btn-primary" type="submit">
                      Check out
                    </button>
                  </form>
                )}
                {['INQUIRY', 'PENDING', 'CONFIRMED'].includes(r.status) &&
                  can(user.role, 'reservations.cancel') && (
                    <form action={cancelAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input className="field w-56" name="reason" placeholder="Reason for cancelling" required />
                      <button className="btn btn-danger" type="submit">
                        Cancel booking
                      </button>
                    </form>
                  )}
              </div>

              {r.status === 'CHECKED_OUT' && r.tasks.some((t) => t.kind === 'CLEANING') && (
                <p className="mt-3 text-sm">
                  Turnover:{' '}
                  {r.tasks
                    .filter((t) => t.kind === 'CLEANING')
                    .map((t) => (
                      <Link key={t.id} href={`/portal/tasks/${t.id}`} className="underline">
                        {t.cleaning?.status.toLowerCase().replace('_', ' ')}
                      </Link>
                    ))}
                </p>
              )}
            </Card>
          )}

          {/* --- money ---------------------------------------------------- */}
          {showMoney && (
            <Card title="Money">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                  {r.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-1.5">{l.label}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        <Money cents={l.amountCents} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[color:var(--color-sand-300)] font-bold">
                    <td className="py-1.5">Total</td>
                    <td className="py-1.5 text-right tabular-nums">
                      <Money cents={r.totalCents} />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5">Paid</td>
                    <td className="py-1.5 text-right tabular-nums">
                      <Money cents={r.paidCents} />
                    </td>
                  </tr>
                  <tr className={balance > 0 ? 'font-bold text-[color:var(--bad)]' : ''}>
                    <td className="py-1.5">Balance{r.balanceDueAt ? ` (due ${formatStayDate(r.balanceDueAt)})` : ''}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      <Money cents={balance} />
                    </td>
                  </tr>
                </tbody>
              </table>

              <h3 className="mt-4 mb-1 text-xs font-semibold uppercase text-[color:var(--color-ink-500)]">
                Payment history
              </h3>
              {r.payments.length === 0 ? (
                <Empty>Nothing recorded yet.</Empty>
              ) : (
                <ul className="divide-y divide-[color:var(--color-sand-200)] text-sm">
                  {r.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span>
                        <span className="font-mono text-xs">{p.reference}</span>{' '}
                        <span className="text-xs text-[color:var(--color-ink-500)]">
                          {p.kind.toLowerCase()} · {p.method.toLowerCase()} ·{' '}
                          {p.paidAt ? formatManila(p.paidAt, { time: true }) : p.status.toLowerCase()}
                        </span>
                        {p.notes && <span className="block text-xs text-[color:var(--warn)]">{p.notes}</span>}
                      </span>
                      <span className={`tabular-nums ${p.amountCents < 0 ? 'text-[color:var(--bad)]' : ''}`}>
                        <Money cents={p.amountCents} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {can(user.role, 'reservations.edit') && balance > 0 && (
                <form action={paymentAction} className="mt-4 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="block">
                    <span className="label">Record a payment</span>
                    <input className="field w-32" name="amount" placeholder="0.00" inputMode="decimal" required />
                  </label>
                  <select className="field w-auto" name="method" defaultValue="CASH">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="GCASH">GCash</option>
                    <option value="MAYA">Maya</option>
                    <option value="AIRBNB_PAYOUT">Airbnb payout</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input className="field w-40" name="notes" placeholder="Note" />
                  <button className="btn btn-secondary" type="submit">
                    Record
                  </button>
                </form>
              )}

              {can(user.role, 'finance.refund') && r.paidCents > 0 && (
                <form action={refundAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="block">
                    <span className="label">Refund</span>
                    <input className="field w-32" name="amount" placeholder="0.00" inputMode="decimal" required />
                  </label>
                  <input className="field w-56" name="reason" placeholder="Reason" required />
                  <button className="btn btn-danger" type="submit">
                    Refund
                  </button>
                </form>
              )}

              {r.securityDeposit && (
                <div className="mt-4 rounded-lg bg-[color:var(--color-sand-100)] p-3 text-sm">
                  <p className="font-semibold">
                    Security deposit {formatPeso(r.securityDeposit.amountCents)} —{' '}
                    {r.securityDeposit.status.toLowerCase().replace(/_/g, ' ')}
                  </p>
                  {can(user.role, 'finance.refund') && r.securityDeposit.status === 'HELD' && (
                    <form action={depositAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="block">
                        <span className="label">Deduct</span>
                        <input className="field w-28" name="deduct" defaultValue="0" inputMode="decimal" />
                      </label>
                      <input className="field w-56" name="notes" placeholder="Why (links to an incident)" />
                      <button className="btn btn-secondary" type="submit">
                        Settle
                      </button>
                    </form>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* --- communication -------------------------------------------- */}
          <Card title="Messages">
            {r.messages.length === 0 ? (
              <Empty>No messages scheduled. They are written when a payment confirms.</Empty>
            ) : (
              <ul className="divide-y divide-[color:var(--color-sand-200)] text-sm">
                {r.messages.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>
                      {m.templateKey.replace(/_/g, ' ')}
                      {m.manual && <span className="ml-1 text-xs">(sent by hand)</span>}
                      <span className="block text-xs text-[color:var(--color-ink-500)]">
                        {m.sentAt ? `sent ${formatManila(m.sentAt, { time: true })}` : formatManila(m.scheduledFor, { time: true })}
                        {m.error && ` · ${m.error}`}
                      </span>
                    </span>
                    <Pill
                      tone={
                        m.status === 'SENT' ? 'ok' : m.status === 'FAILED' ? 'bad' : m.status === 'CANCELLED' ? 'muted' : 'info'
                      }
                    >
                      {m.status.toLowerCase()}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}

            {can(user.role, 'messages.send') && (
              <form action={sendMessageAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={r.id} />
                <select className="field w-auto" name="templateKey" defaultValue="pre_arrival">
                  {DEFAULT_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" type="submit">
                  Send now
                </button>
              </form>
            )}

            {preview && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Copy the check-in message for WhatsApp or Messenger
                </summary>
                <textarea className="field mt-2 font-mono text-xs" rows={10} readOnly value={preview.body} />
              </details>
            )}
          </Card>
        </div>

        {/* --- sidebar ---------------------------------------------------- */}
        <div className="space-y-4">
          <Card title="Guest">
            <p className="font-semibold">
              <Link href={`/portal/guests/${r.guestId}`} className="hover:underline">
                {r.guest.firstName} {r.guest.lastName}
              </Link>
            </p>
            <p className="text-sm text-[color:var(--color-ink-500)]">{r.guest.email}</p>
            <p className="text-sm text-[color:var(--color-ink-500)]">{r.guest.mobile}</p>
            <p className="mt-2 flex gap-2">
              <Pill tone={r.guest.tier === 'VIP' ? 'warn' : r.guest.tier === 'REPEAT' ? 'info' : 'muted'}>
                {r.guest.tier.toLowerCase()}
              </Pill>
              <Pill tone="muted">{r.guest.totalBookings} stays</Pill>
            </p>
            {r.specialRequests && (
              <p className="mt-3 rounded bg-[color:var(--color-sand-100)] p-2 text-sm">
                <strong>Asked for:</strong> {r.specialRequests}
              </p>
            )}
          </Card>

          <Card title="Stay">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-[color:var(--color-ink-500)]">Check in</dt>
                <dd>{minutesToLabel(r.property.checkInMinute)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[color:var(--color-ink-500)]">Check out</dt>
                <dd>{minutesToLabel(r.property.checkOutMinute)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[color:var(--color-ink-500)]">Booked</dt>
                <dd>{formatManila(r.createdAt)}</dd>
              </div>
              {r.holdExpiresAt && r.status === 'PENDING' && (
                <div className="flex justify-between text-[color:var(--warn)]">
                  <dt>Hold expires</dt>
                  <dd>{formatManila(r.holdExpiresAt, { time: true })}</dd>
                </div>
              )}
            </dl>

            {can(user.role, 'reservations.edit') && ['PENDING', 'CONFIRMED'].includes(r.status) && (
              <form action={rescheduleAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <label className="block">
                  <span className="label">Move check-in</span>
                  <input className="field" type="date" name="checkIn" defaultValue={toDateKey(r.checkIn)} required />
                </label>
                <label className="block">
                  <span className="label">Move check-out</span>
                  <input className="field" type="date" name="checkOut" defaultValue={toDateKey(r.checkOut)} required />
                </label>
                <button className="btn btn-secondary w-full" type="submit">
                  Change dates
                </button>
              </form>
            )}
          </Card>

          {r.accessRecords.length > 0 && (
            <Card title="Access">
              {r.accessRecords.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="font-mono text-lg font-bold">{a.code}</p>
                  <p className="text-xs text-[color:var(--color-ink-500)]">
                    {a.method.replace(/_/g, ' ').toLowerCase()} · expires{' '}
                    {a.expiresAt ? formatStayDate(a.expiresAt) : 'at checkout'}
                  </p>
                </div>
              ))}
            </Card>
          )}

          {r.checkInForm && (
            <Card title="Pre-arrival form">
              <p className="text-sm">
                Completed {formatManila(r.checkInForm.submittedAt, { time: true })}
              </p>
              <p className="text-sm">
                {r.checkInForm.companionCount} companion{r.checkInForm.companionCount === 1 ? '' : 's'}
                {r.checkInForm.companions.length > 0 &&
                  `: ${r.checkInForm.companions.map((c) => c.name).join(', ')}`}
              </p>
              {r.checkInForm.arrivalMinute !== null && (
                <p className="text-sm">Arriving around {minutesToLabel(r.checkInForm.arrivalMinute)}</p>
              )}
            </Card>
          )}

          {can(user.role, 'reservations.edit') && (
            <Card title="Internal notes">
              <form action={noteAction}>
                <input type="hidden" name="id" value={r.id} />
                <textarea className="field" name="internalNotes" rows={4} defaultValue={r.internalNotes} />
                <button className="btn btn-secondary mt-2 w-full" type="submit">
                  Save notes
                </button>
              </form>
            </Card>
          )}

          <Card title="Guest link">
            <p className="text-xs break-all text-[color:var(--color-ink-500)]">
              {absoluteUrl(`/manage/${r.reference}`)}
            </p>
            <p className="mt-1 text-xs">
              The guest opens this with the email or mobile on the booking. Balance{' '}
              {balance > 0 ? formatPesoShort(balance) : 'settled'}.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
