'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { AppointmentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit } from '@/lib/audit';
import {
  assertNoConflicts,
  availableResources,
  nextTherapistInRotation,
  requiredPlaceFor,
} from '@/lib/availability';
import { bookingReference } from '@/lib/codes';
import { approveLateRequest, confirmDeposit, declineLateRequest, refundDeposit } from '@/lib/booking';
import { verifyApprovalPin } from '@/lib/auth';
import { formatPeso } from '@/lib/money';
import { resolveNotifications } from '@/lib/notifications';
import { sendTemplateEmail } from '@/lib/email';
import { formatManila } from '@/lib/datetime';
import { effectiveWindow, planVisit, visitMinutes } from '@/lib/itinerary';
import { getSettings } from '@/lib/settings';
import { depositOutcome } from '@/lib/booking-policy';
import { shouldRequestReview } from '@/lib/review-request';

export type FormState = { error?: string; ok?: string };

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? '').trim();
}

export async function saveAppointmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('appointments.edit');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const id = str(formData, 'id');

  const clientId = str(formData, 'clientId');
  const serviceIds = formData.getAll('serviceIds').map(String).filter(Boolean);
  const startAtIso = str(formData, 'startAt');
  const employeeId = str(formData, 'employeeId');
  const resourceId = str(formData, 'resourceId');
  const notes = str(formData, 'notes');
  const partnerId = str(formData, 'partnerId') || null;

  if (!clientId) return { error: 'Choose a client.' };
  if (!serviceIds.length) return { error: 'Choose at least one service.' };
  if (!startAtIso) return { error: 'Choose a start time.' };

  const startAt = new Date(startAtIso);
  if (Number.isNaN(startAt.getTime())) return { error: 'That start time is not valid.' };

  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
  if (services.length !== serviceIds.length) return { error: 'A selected service is unavailable.' };

  // The order the desk ticked them in is the order of the visit, and the gaps
  // between are real floor time — the shower after a sauna, the consultation
  // and foot soak before a massage. Scheduling back to back quotes a finish the
  // spa cannot hit.
  const ordered = serviceIds
    .map((sid) => services.find((x) => x.id === sid))
    .filter(Boolean) as typeof services;
  const settings = await getSettings(branchId);
  const houseChangeover = settings['booking.changeoverMinutes'];
  const treatments = ordered.map((x) => ({
    serviceId: x.id,
    name: x.name,
    durationMinutes: x.durationMinutes,
    changeoverMinutes: x.changeoverMinutes,
    sequenceRank: x.sequenceRank,
  }));
  const duration = visitMinutes(treatments, houseChangeover);
  const itinerary = planVisit({ treatments, startAt, changeoverMinutes: houseChangeover });
  const endAt = itinerary.length
    ? itinerary[itinerary.length - 1].endAt
    : new Date(startAt.getTime() + duration * 60_000);

  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
  const startMinute = startAt.getUTCHours() * 60 + startAt.getUTCMinutes() + 8 * 60;
  const endMinute = (startMinute % 1440) + duration;
  const pastMidnight = endMinute > branch.closeMinute;

  let therapistId = employeeId && employeeId !== 'any' ? employeeId : null;
  if (!therapistId) {
    const next = await nextTherapistInRotation({ branchId, startAt, endAt, serviceIds });
    therapistId = next?.id ?? null;
    if (!therapistId) return { error: 'No therapist is free for that slot.' };
  }

  const place = requiredPlaceFor(services);

  // One place per treatment, each free for its own window. The place the desk
  // picked applies to the first treatment; the rest are assigned to whatever
  // suits them, so a sauna leg lands in the sauna rather than on the bed the
  // massage needs.
  type Leg = {
    serviceId: string; priceCents: number; durationMinutes: number;
    resourceId: string | null; startAt: Date; endAt: Date; changeoverAfter: number;
  };
  const legs: Leg[] = [];
  const picked = resourceId && resourceId !== 'any' ? resourceId : null;

  for (const step of itinerary) {
    const svc = ordered.find((x) => x.id === step.serviceId)!;
    const needs = requiredPlaceFor([svc]);
    let legResource = legs.length === 0 ? picked : null;
    if (!legResource) {
      const free = await availableResources({
        branchId,
        startAt: step.startAt,
        endAt: step.endAt,
        excludeAppointmentId: id || undefined,
        resourceType: needs,
      });
      legResource = free[0]?.id ?? null;
    }

    try {
      await assertNoConflicts({
        branchId,
        startAt: step.startAt,
        endAt: step.endAt,
        employeeIds: [therapistId],
        resourceId: legResource,
        resourceType: needs,
        excludeAppointmentId: id || undefined,
      });
    } catch (err) {
      // Name the treatment: "Bed 3 is already taken" is a puzzle when the visit
      // has three of them and only one is the problem.
      const why = (err as Error).message;
      return { error: ordered.length > 1 ? `${svc.name}: ${why}` : why };
    }

    legs.push({
      serviceId: step.serviceId,
      priceCents: svc.priceCents,
      durationMinutes: svc.durationMinutes,
      resourceId: legResource,
      startAt: step.startAt,
      endAt: step.endAt,
      changeoverAfter: step.changeoverAfter,
    });
  }
  const finalResourceId = legs[0]?.resourceId ?? null;

  let appointmentId = id;
  if (id) {
    const before = await prisma.appointment.findUnique({
      where: { id },
      include: { services: true },
    });
    if (!before) return { error: 'That appointment no longer exists.' };

    await prisma.$transaction(async (tx) => {
      await tx.appointmentService.deleteMany({ where: { appointmentId: id } });
      await tx.appointment.update({
        where: { id },
        data: {
          clientId, startAt, endAt, resourceId: finalResourceId, notes, partnerId,
          services: {
            create: legs.map((l, i) => ({
              serviceId: l.serviceId,
              employeeId: therapistId,
              resourceId: l.resourceId,
              priceCents: l.priceCents,
              durationMinutes: l.durationMinutes,
              sortRank: i,
              startAt: l.startAt,
              endAt: l.endAt,
              changeoverMinutes: l.changeoverAfter,
            })),
          },
        },
      });
    });
    await audit(user, {
      module: 'appointments', action: 'update', entityType: 'Appointment', entityId: id,
      summary: `Rescheduled/edited booking to ${formatManila(startAt, { time: true })}`,
      before: { startAt: before.startAt, endAt: before.endAt, resourceId: before.resourceId },
      after: { startAt, endAt, resourceId: finalResourceId },
    });
  } else {
    let reference = bookingReference();
    while (await prisma.appointment.findUnique({ where: { reference }, select: { id: true } })) {
      reference = bookingReference();
    }
    const created = await prisma.appointment.create({
      data: {
        branchId, reference, clientId, startAt, endAt,
        resourceId: finalResourceId, notes, partnerId,
        status: 'CONFIRMED',
        source: str(formData, 'source') === 'WALK_IN' ? 'WALK_IN' : 'PORTAL',
        services: {
          create: legs.map((l, i) => ({
            serviceId: l.serviceId,
            employeeId: therapistId,
            resourceId: l.resourceId,
            priceCents: l.priceCents,
            durationMinutes: l.durationMinutes,
            sortRank: i,
            startAt: l.startAt,
            endAt: l.endAt,
            changeoverMinutes: l.changeoverAfter,
          })),
        },
      },
    });
    appointmentId = created.id;
    await audit(user, {
      module: 'appointments', action: 'create', entityType: 'Appointment', entityId: created.id,
      summary: `Booked ${services.map((s) => s.name).join(', ')} at ${formatManila(startAt, { time: true })}`,
      after: { reference, clientId, startAt, therapistId },
    });
  }

  revalidatePath('/portal/appointments');
  if (pastMidnight) {
    revalidatePath(`/portal/appointments/${appointmentId}`);
  }
  redirect(`/portal/appointments/${appointmentId}${pastMidnight ? '?warn=past-midnight' : ''}`);
}

export async function setAppointmentStatusAction(formData: FormData) {
  const user = await requirePage('appointments.edit');
  const id = str(formData, 'id');
  const status = str(formData, 'status') as AppointmentStatus;
  const reason = str(formData, 'reason');

  const before = await prisma.appointment.findUnique({ where: { id } });
  if (!before) return;

  const now = new Date();

  // The reservation fee on a cancel or a no-show, decided by the house rule
  // rather than by whoever happens to be on the desk — and by the same rule the
  // guest was shown before she paid. Forfeiting means the fee stays; keeping it
  // PAID on a cancelled booking is how "we owe her this back" is recorded,
  // since nothing here can move money at the gateway yet.
  const ending = status === 'CANCELLED' || status === 'NO_SHOW';
  let depositStatus = before.depositStatus;
  let feeNote = '';
  if (ending && before.depositStatus === 'PAID') {
    const s = await getSettings(before.branchId);
    const outcome = depositOutcome({
      status,
      startAt: before.startAt,
      cancelledAt: now,
      windowHours: s['booking.cancellationHours'],
      inTimePolicy: s['booking.depositOnCancel'],
    });
    if (outcome === 'FORFEIT') {
      depositStatus = 'FORFEITED';
      feeNote =
        status === 'NO_SHOW'
          ? ' — reservation fee forfeited (no-show)'
          : ` — reservation fee forfeited (cancelled inside ${s['booking.cancellationHours']}h)`;
    } else {
      feeNote = ' — reservation fee refundable (cancelled in time)';
    }
  }

  await prisma.appointment.update({
    where: { id },
    data: {
      status,
      checkedInAt: status === 'CHECKED_IN' ? now : before.checkedInAt,
      startedAt: status === 'IN_SERVICE' ? now : before.startedAt,
      completedAt: status === 'COMPLETED' ? now : before.completedAt,
      cancelledAt: ending ? now : before.cancelledAt,
      cancelReason: reason || before.cancelReason,
      depositStatus,
    },
  });

  await audit(user, {
    module: 'appointments',
    action: 'status_change',
    entityType: 'Appointment',
    entityId: id,
    summary: `${before.status} → ${status}${reason ? ` (${reason})` : ''}${feeNote}`,
    sensitive: ending,
    before: { status: before.status },
    after: { status },
  });

  // The one message a guest never asked for, so it is fenced: only on the way
  // into COMPLETED, only when the Owner has switched it on, only when there is
  // a listing to send them to, and never twice for the same visit.
  const settings = await getSettings(before.branchId);
  const client = await prisma.client.findUnique({
    where: { id: before.clientId },
    select: { name: true, email: true },
  });
  if (
    shouldRequestReview({
      status,
      previousStatus: before.status,
      enabled: settings['business.reviewRequestEmail'],
      googleUrl: settings['business.googleUrl'],
      email: client?.email,
    })
  ) {
    await sendTemplateEmail({
      to: client!.email!,
      template: 'visit_thank_you',
      clientId: before.clientId,
      vars: {
        clientName: client!.name,
        when: formatManila(before.startAt, { time: true, weekday: true }),
        googleUrl: settings['business.googleUrl'],
      },
    });
  }

  if (status !== 'PENDING') await resolveNotifications(`appointment:${id}`);
  revalidatePath('/portal/appointments');
  revalidatePath(`/portal/appointments/${id}`);
}

/** Receptionist one-tap verify of a manual-transfer deposit. */
export type RefundState = { error?: string; ok?: string };

/**
 * Sends a reservation fee back to the guest.
 *
 * Behind the Owner's approval PIN, like every other way money leaves this
 * system. A receptionist can see that a fee is owed and say so to the guest;
 * releasing it is the one thing she cannot do on her own shift.
 */
export async function refundDepositAction(
  _prev: RefundState,
  formData: FormData,
): Promise<RefundState> {
  const user = await requirePage('appointments.edit');
  const id = str(formData, 'id');
  const reason = str(formData, 'reason');
  const pin = str(formData, 'approvalPin');

  const approver = await verifyApprovalPin(pin);
  if (!approver) return { error: "Refunds need the Owner's approval PIN." };

  const result = await refundDeposit({ appointmentId: id, reason, refundedBy: user.name });
  if (!result.ok) return { error: result.error ?? 'That refund could not be completed.' };

  await audit(user, {
    module: 'appointments',
    action: 'refund_deposit',
    entityType: 'Appointment',
    entityId: id,
    summary:
      `${approver.name} approved a ${formatPeso(result.amountCents ?? 0)} reservation fee refund` +
      (result.manual ? ' — no gateway payment, send it by hand' : ` (${result.gatewayRefundId})`),
    sensitive: true,
    // The gateway's own id lives here: it is the only place it is kept, and it
    // is what a refund is matched against in the PayMongo dashboard later.
    after: {
      amountCents: result.amountCents,
      gatewayRefundId: result.gatewayRefundId ?? null,
      gatewayStatus: result.gatewayStatus ?? null,
      manual: Boolean(result.manual),
      reason,
      approvedByUserId: approver.id,
    },
  });

  revalidatePath('/portal/appointments');
  revalidatePath(`/portal/appointments/${id}`);
  return {
    ok: result.manual
      ? `Marked refunded. There is no gateway payment behind this fee, so send the ${formatPeso(result.amountCents ?? 0)} yourself.`
      : `${formatPeso(result.amountCents ?? 0)} refunded${
          result.gatewayStatus && result.gatewayStatus !== 'succeeded'
            ? ` — PayMongo reports it as ${result.gatewayStatus}, which can take a few days to settle.`
            : '.'
        }`,
  };
}

export async function verifyDepositAction(formData: FormData) {
  const user = await requirePage('appointments.edit');
  const id = str(formData, 'id');
  const decision = str(formData, 'decision');

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!appt) return;

  if (decision === 'verify') {
    await confirmDeposit({
      reference: appt.reference,
      paidCents: appt.depositAmountCents,
      method: appt.depositMethod || 'manual transfer',
      verifiedBy: user.name,
    });
    await audit(user, {
      module: 'appointments', action: 'verify_deposit', entityType: 'Appointment', entityId: id,
      summary: `Verified ${appt.depositMethod || 'manual'} deposit for ${appt.reference}`,
      sensitive: true,
    });
  } else {
    await prisma.appointment.update({
      where: { id },
      data: {
        depositStatus: 'FAILED',
        status: 'CANCELLED',
        cancelReason: str(formData, 'reason') || 'Deposit could not be verified.',
      },
    });
    await sendTemplateEmail({
      to: appt.client.email,
      template: 'booking_rejected',
      clientId: appt.clientId,
      vars: {
        clientName: appt.client.name,
        reference: appt.reference,
        when: formatManila(appt.startAt, { time: true, weekday: true }),
        reason: str(formData, 'reason') || 'We could not verify the payment you uploaded.',
      },
    });
    await audit(user, {
      module: 'appointments', action: 'reject_deposit', entityType: 'Appointment', entityId: id,
      summary: `Rejected deposit for ${appt.reference}`,
      sensitive: true,
    });
  }

  await resolveNotifications(`deposit-verify:${id}`);
  await resolveNotifications(`appointment:${id}`);
  revalidatePath('/portal/appointments');
  revalidatePath(`/portal/appointments/${id}`);
}

/** One-tap walk-in: grabs the next free therapist and an open bed right now. */
export async function walkInNowAction(formData: FormData) {
  const user = await requirePage('appointments.edit');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const clientId = str(formData, 'clientId');
  const serviceId = str(formData, 'serviceId');
  if (!clientId || !serviceId) return;

  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  const therapist = await nextTherapistInRotation({
    branchId, startAt, endAt, serviceIds: [serviceId],
  });
  const resources = await availableResources({ branchId, startAt, endAt });

  let reference = bookingReference();
  while (await prisma.appointment.findUnique({ where: { reference }, select: { id: true } })) {
    reference = bookingReference();
  }

  const created = await prisma.appointment.create({
    data: {
      branchId, reference, clientId, startAt, endAt,
      resourceId: resources[0]?.id ?? null,
      status: 'IN_SERVICE',
      source: 'WALK_IN',
      checkedInAt: startAt,
      startedAt: startAt,
      services: {
        create: {
          serviceId,
          employeeId: therapist?.id ?? null,
          priceCents: service.priceCents,
          durationMinutes: service.durationMinutes,
        },
      },
    },
  });

  await audit(user, {
    module: 'appointments', action: 'walk_in', entityType: 'Appointment', entityId: created.id,
    summary: `Walk-in: ${service.name} with ${therapist?.name ?? 'unassigned'}`,
  });

  redirect(`/portal/appointments/${created.id}`);
}

/* ------------------------------------------------- late booking requests */

export async function approveLateRequestAction(formData: FormData) {
  const user = await requirePage('appointments.edit');
  const id = str(formData, 'id');
  const result = await approveLateRequest({ appointmentId: id, approvedBy: user.name });
  if (result.ok) {
    await audit(user, {
      module: 'appointments', action: 'approve_late_request',
      entityType: 'Appointment', entityId: id,
      summary: 'Approved a booking that runs past closing',
      sensitive: true,
    });
  }
  revalidatePath('/portal/appointments');
  revalidatePath(`/portal/appointments/${id}`);
}

export async function declineLateRequestAction(formData: FormData) {
  const user = await requirePage('appointments.edit');
  const id = str(formData, 'id');
  const result = await declineLateRequest({
    appointmentId: id,
    reason: str(formData, 'reason'),
    declinedBy: user.name,
  });
  if (result.ok) {
    await audit(user, {
      module: 'appointments', action: 'decline_late_request',
      entityType: 'Appointment', entityId: id,
      summary: `Declined a booking that runs past closing${str(formData, 'reason') ? ` — ${str(formData, 'reason')}` : ''}`,
      sensitive: true,
    });
  }
  revalidatePath('/portal/appointments');
  revalidatePath(`/portal/appointments/${id}`);
}

/**
 * Record when a treatment really started or finished, and move what follows.
 *
 * The plan is a guess made at booking time; the floor is what happened. A sauna
 * that ran twenty minutes over holds the sauna twenty minutes longer and pushes
 * the massage back by the same, and the website must stop offering that bed at
 * the old time. That is what this does — the times are not a log, they are the
 * booking.
 *
 * The gaps are preserved rather than eaten to catch up: the shower does not get
 * shorter because the sauna ran late.
 */
export async function logTreatmentTimeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('appointments.edit');
  const appointmentId = str(formData, 'appointmentId');
  const segmentId = str(formData, 'segmentId');
  if (!appointmentId || !segmentId) return { error: 'Nothing to record.' };

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      services: { orderBy: { sortRank: 'asc' }, include: { service: true, resource: true } },
    },
  });
  if (!appt) return { error: 'That booking no longer exists.' };

  const index = appt.services.findIndex((s) => s.id === segmentId);
  if (index < 0) return { error: 'That treatment is not part of this booking.' };
  const seg = appt.services[index];

  // "Started just now" / "Ended just now" beat the pickers — the desk should not
  // have to type the current time to say a treatment is happening.
  const stamp = str(formData, 'stamp');
  const parse = (name: string) => {
    const raw = str(formData, name);
    if (!raw) return null;
    const d = new Date(`${raw}:00+08:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  let actualStartAt = stamp === 'start' ? new Date() : parse('actualStartAt');
  let actualEndAt = stamp === 'end' ? new Date() : parse('actualEndAt');
  if (stamp === 'end') actualStartAt = seg.actualStartAt ?? actualStartAt ?? seg.startAt;
  if (stamp === 'start') actualEndAt = seg.actualEndAt;

  if (actualStartAt && actualEndAt && actualEndAt < actualStartAt) {
    return { error: 'That treatment cannot end before it started — check the times.' };
  }

  const finishedAt =
    actualEndAt ??
    (actualStartAt ? new Date(actualStartAt.getTime() + seg.durationMinutes * 60_000) : null);

  // Everything after this treatment shifts by however long it overran, keeping
  // its own changeover.
  const moves: { id: string; startAt: Date; endAt: Date }[] = [];
  if (finishedAt) {
    let cursor = new Date(finishedAt.getTime() + seg.changeoverMinutes * 60_000);
    for (const later of appt.services.slice(index + 1)) {
      // A treatment already under way keeps the start it really had.
      if (later.actualStartAt) {
        cursor = new Date(
          (later.actualEndAt ??
            new Date(later.actualStartAt.getTime() + later.durationMinutes * 60_000)
          ).getTime() + later.changeoverMinutes * 60_000,
        );
        continue;
      }
      const endAt = new Date(cursor.getTime() + later.durationMinutes * 60_000);
      moves.push({ id: later.id, startAt: cursor, endAt });
      cursor = new Date(endAt.getTime() + later.changeoverMinutes * 60_000);
    }
  }

  // Nothing is silently double-booked: if the shift lands a treatment on a
  // place somebody else has, say which one and let the desk decide.
  const clashes: string[] = [];
  for (const move of moves) {
    const later = appt.services.find((s) => s.id === move.id)!;
    if (!later.resourceId) continue;
    try {
      await assertNoConflicts({
        branchId: appt.branchId,
        startAt: move.startAt,
        endAt: move.endAt,
        employeeIds: [],
        resourceId: later.resourceId,
        excludeAppointmentId: appt.id,
      });
    } catch (err) {
      clashes.push(`${later.service.name} → ${(err as Error).message}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointmentService.update({
      where: { id: segmentId },
      data: {
        actualStartAt,
        actualEndAt,
        ...(finishedAt && !actualEndAt ? {} : {}),
      },
    });
    for (const move of moves) {
      await tx.appointmentService.update({
        where: { id: move.id },
        data: { startAt: move.startAt, endAt: move.endAt },
      });
    }
    // The visit's own window is the envelope of its parts, and the calendar,
    // the day list and every availability query read it.
    const all = await tx.appointmentService.findMany({
      where: { appointmentId },
      select: { startAt: true, endAt: true, actualStartAt: true, actualEndAt: true, durationMinutes: true },
    });
    const windows = all.map(effectiveWindow).filter(Boolean) as { start: Date; end: Date }[];
    if (windows.length) {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          startAt: new Date(Math.min(...windows.map((w) => +w.start))),
          endAt: new Date(Math.max(...windows.map((w) => +w.end))),
        },
      });
    }
  });

  await audit(user, {
    module: 'appointments', action: 'log_treatment_time',
    entityType: 'AppointmentService', entityId: segmentId,
    summary: `${seg.service.name}: ${
      actualStartAt ? `started ${formatManila(actualStartAt, { time: true })}` : 'start cleared'
    }${actualEndAt ? `, ended ${formatManila(actualEndAt, { time: true })}` : ''}`,
    before: { actualStartAt: seg.actualStartAt, actualEndAt: seg.actualEndAt },
    after: { actualStartAt, actualEndAt },
  });

  revalidatePath(`/portal/appointments/${appointmentId}`);
  revalidatePath('/portal/appointments');
  return clashes.length
    ? {
        error:
          `Times saved, and the rest of the visit moved — but ${clashes.join('; ')}. ` +
          'Move that treatment or the other booking.',
      }
    : {
        ok: moves.length
          ? `Saved. The rest of the visit moved to match.`
          : 'Saved.',
      };
}
