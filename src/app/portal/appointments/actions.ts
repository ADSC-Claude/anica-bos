'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { AppointmentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { assertNoConflicts, availableResources, nextTherapistInRotation } from '@/lib/availability';
import { bookingReference } from '@/lib/codes';
import { confirmDeposit } from '@/lib/booking';
import { resolveNotifications } from '@/lib/notifications';
import { sendTemplateEmail } from '@/lib/email';
import { formatManila } from '@/lib/datetime';

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
  const duration = services.reduce((a, s) => a + s.durationMinutes, 0);
  const endAt = new Date(startAt.getTime() + duration * 60_000);

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

  let finalResourceId = resourceId && resourceId !== 'any' ? resourceId : null;
  if (!finalResourceId) {
    const free = await availableResources({
      branchId, startAt, endAt, excludeAppointmentId: id || undefined,
    });
    finalResourceId = free[0]?.id ?? null;
  }

  try {
    await assertNoConflicts({
      branchId, startAt, endAt,
      employeeIds: [therapistId],
      resourceId: finalResourceId,
      excludeAppointmentId: id || undefined,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }

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
            create: services.map((s, i) => ({
              serviceId: s.id,
              employeeId: therapistId,
              priceCents: s.priceCents,
              durationMinutes: s.durationMinutes,
              sortRank: i,
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
          create: services.map((s, i) => ({
            serviceId: s.id,
            employeeId: therapistId,
            priceCents: s.priceCents,
            durationMinutes: s.durationMinutes,
            sortRank: i,
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
  await prisma.appointment.update({
    where: { id },
    data: {
      status,
      checkedInAt: status === 'CHECKED_IN' ? now : before.checkedInAt,
      startedAt: status === 'IN_SERVICE' ? now : before.startedAt,
      completedAt: status === 'COMPLETED' ? now : before.completedAt,
      cancelledAt: status === 'CANCELLED' || status === 'NO_SHOW' ? now : before.cancelledAt,
      cancelReason: reason || before.cancelReason,
      // Deposit handling on cancel/no-show follows the configured policy.
      depositStatus:
        (status === 'CANCELLED' || status === 'NO_SHOW') && before.depositStatus === 'PAID'
          ? 'FORFEITED'
          : before.depositStatus,
    },
  });

  await audit(user, {
    module: 'appointments',
    action: 'status_change',
    entityType: 'Appointment',
    entityId: id,
    summary: `${before.status} → ${status}${reason ? ` (${reason})` : ''}`,
    sensitive: status === 'CANCELLED' || status === 'NO_SHOW',
    before: { status: before.status },
    after: { status },
  });

  if (status !== 'PENDING') await resolveNotifications(`appointment:${id}`);
  revalidatePath('/portal/appointments');
  revalidatePath(`/portal/appointments/${id}`);
}

/** Receptionist one-tap verify of a manual-transfer deposit. */
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
