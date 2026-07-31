/**
 * Online booking: turns a public form submission into a client record, a
 * PENDING appointment, and a PayMongo checkout session for the reservation fee.
 */
import type { AppointmentStatus } from '@prisma/client';
import { prisma } from './db';
import { getSettings } from './settings';
import { bookingReference } from './codes';
import {
  assertNoConflicts,
  availableResources,
  nextTherapistInRotation,
  requiredPlaceFor,
} from './availability';
import { createCheckoutSession, isSimulated } from './paymongo';
import { sendTemplateEmail } from './email';
import { notify } from './notifications';
import { formatManila } from './datetime';
import { formatPeso } from './money';
import { appUrl } from './app-url';

export class BookingError extends Error {}

export type BookingRequest = {
  branchId: string;
  serviceIds: string[];
  startAtIso: string;
  therapistId?: string | null; // null / "any" => rotation
  resourceId?: string | null; // null / "any" => auto-assign
  client: {
    name: string;
    mobile: string;
    email: string;
    birthday: string; // YYYY-MM-DD
    addressCity: string;
    addressLine?: string;
    barangay?: string;
  };
  /** Keyed by ClientFieldDefinition.key */
  intake: Record<string, unknown>;
  notes?: string;
  consent: boolean;
  promoCode?: string;
};

const MOBILE_RE = /^(\+?63|0)9\d{9}$/;

function normalizeMobile(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+63')) return '0' + digits.slice(3);
  if (digits.startsWith('63') && digits.length === 12) return '0' + digits.slice(2);
  return digits;
}

export async function createOnlineBooking(req: BookingRequest): Promise<{
  reference: string;
  appointmentId: string;
  depositCents: number;
  checkoutUrl: string | null;
  simulated: boolean;
  manualFallback: boolean;
}> {
  const settings = await getSettings(req.branchId);
  if (!settings['booking.enabled']) throw new BookingError('Online booking is currently closed.');
  if (!req.consent) {
    throw new BookingError(
      'Please tick the data-privacy consent box so we can keep your health information on file.',
    );
  }
  if (!req.serviceIds.length) throw new BookingError('Choose at least one service.');

  const mobile = normalizeMobile(req.client.mobile);
  if (!MOBILE_RE.test(mobile)) {
    throw new BookingError('Enter a valid PH mobile number, e.g. 0917 123 4567.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(req.client.email)) {
    throw new BookingError('Enter a valid email address — we send your confirmation there.');
  }
  if (!req.client.birthday) throw new BookingError('Your birthday is required.');
  if (!req.client.addressCity) throw new BookingError('Your city is required.');

  const branch = await prisma.branch.findUnique({ where: { id: req.branchId } });
  if (!branch || !branch.active) throw new BookingError('That branch is not accepting bookings.');

  const services = await prisma.service.findMany({
    where: { id: { in: req.serviceIds }, active: true },
  });
  if (services.length !== req.serviceIds.length) {
    throw new BookingError('One of the selected services is no longer available.');
  }

  const startAt = new Date(req.startAtIso);
  if (Number.isNaN(startAt.getTime())) throw new BookingError('Choose a valid date and time.');
  if (startAt.getTime() < Date.now() + settings['booking.leadTimeMinutes'] * 60_000) {
    throw new BookingError(
      `Please choose a slot at least ${settings['booking.leadTimeMinutes']} minutes from now.`,
    );
  }
  const totalMinutes = services.reduce((a, s) => a + s.durationMinutes, 0);
  const endAt = new Date(startAt.getTime() + totalMinutes * 60_000);

  // Therapist: explicit pick, or rotation for "no preference".
  let therapistId = req.therapistId && req.therapistId !== 'any' ? req.therapistId : null;
  if (!therapistId) {
    const next = await nextTherapistInRotation({
      branchId: branch.id,
      startAt,
      endAt,
      serviceIds: req.serviceIds,
    });
    therapistId = next?.id ?? null;
    if (!therapistId) {
      throw new BookingError(
        'No therapist is free for that slot. Please pick another time — or call us and we will fit you in.',
      );
    }
  }

  // Room, bed or chair: explicit pick, or first free one of the right kind.
  const place = requiredPlaceFor(services);
  let resourceId = req.resourceId && req.resourceId !== 'any' ? req.resourceId : null;
  if (!resourceId) {
    const free = await availableResources({
      branchId: branch.id,
      startAt,
      endAt,
      resourceType: place,
    });
    resourceId = free[0]?.id ?? null;
    if (!resourceId) {
      throw new BookingError(
        place
          ? `No ${place.toLowerCase()} is free at that time.`
          : 'All rooms and beds are taken at that time.',
      );
    }
  }

  await assertNoConflicts({
    branchId: branch.id,
    startAt,
    endAt,
    employeeIds: [therapistId],
    resourceId,
    resourceType: place,
  });

  // ------------------------------------------------------------- the client
  const existing = await prisma.client.findUnique({
    where: { branchId_mobile: { branchId: branch.id, mobile } },
  });
  const birthday = new Date(`${req.client.birthday}T00:00:00Z`);

  const client = existing
    ? await prisma.client.update({
        where: { id: existing.id },
        data: {
          name: req.client.name.trim() || existing.name,
          email: req.client.email.trim().toLowerCase(),
          birthday,
          addressCity: req.client.addressCity,
          addressLine: req.client.addressLine ?? existing.addressLine,
          barangay: req.client.barangay ?? existing.barangay,
          incomplete: false,
          consentGiven: true,
          consentAt: new Date(),
          medicalUpdatedAt: new Date(),
        },
      })
    : await prisma.client.create({
        data: {
          branchId: branch.id,
          name: req.client.name.trim(),
          mobile,
          email: req.client.email.trim().toLowerCase(),
          birthday,
          addressCity: req.client.addressCity,
          addressLine: req.client.addressLine ?? '',
          barangay: req.client.barangay ?? '',
          consentGiven: true,
          consentAt: new Date(),
          medicalUpdatedAt: new Date(),
        },
      });

  // Intake answers flow straight onto the CRM record.
  const definitions = await prisma.clientFieldDefinition.findMany({
    where: { retired: false, showOnline: true },
  });
  for (const def of definitions) {
    if (!(def.key in req.intake)) continue;
    const value = req.intake[def.key];
    if (value === '' || value === null || value === undefined || value === false) continue;
    await prisma.clientFieldValue.upsert({
      where: { clientId_definitionId: { clientId: client.id, definitionId: def.id } },
      create: { clientId: client.id, definitionId: def.id, value: value as never },
      update: { value: value as never },
    });
  }

  // ---------------------------------------------------------- the deposit
  const priceTotal = services.reduce((a, s) => a + s.priceCents, 0);
  const depositCents = Math.round((priceTotal * settings['booking.depositPercent']) / 100);
  const manualFallback = settings['booking.manualFallbackEnabled'];

  const partner = req.promoCode
    ? await prisma.partner.findUnique({ where: { promoCode: req.promoCode.trim().toUpperCase() } })
    : null;

  let reference = bookingReference();
  while (await prisma.appointment.findUnique({ where: { reference }, select: { id: true } })) {
    reference = bookingReference();
  }

  const appointment = await prisma.appointment.create({
    data: {
      branchId: branch.id,
      reference,
      clientId: client.id,
      resourceId,
      partnerId: partner?.id ?? null,
      startAt,
      endAt,
      status: 'PENDING' as AppointmentStatus,
      source: 'ONLINE',
      notes: req.notes ?? '',
      depositStatus: manualFallback ? 'AWAITING_VERIFICATION' : 'AWAITING_PAYMENT',
      depositAmountCents: depositCents,
      expiresAt: new Date(Date.now() + settings['booking.expiryMinutes'] * 60_000),
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

  // -------------------------------------------------------------- gateway
  let checkoutUrl: string | null = null;
  let simulated = false;
  if (!manualFallback) {
    const base = appUrl();
    const session = await createCheckoutSession({
      amountCents: depositCents,
      description: `Reservation fee — ${services.map((s) => s.name).join(', ')}`,
      reference,
      lineName: `${settings['booking.depositPercent']}% reservation fee`,
      successUrl: `${base}/book/confirmation/${reference}?paid=1`,
      cancelUrl: `${base}/book/confirmation/${reference}?cancelled=1`,
      customer: { name: client.name, email: client.email, phone: client.mobile },
    });
    checkoutUrl = session.checkoutUrl;
    simulated = session.simulated;
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { gatewaySessionId: session.id },
    });
  }

  const therapist = await prisma.employee.findUnique({ where: { id: therapistId } });
  await sendTemplateEmail({
    to: client.email,
    template: 'booking_received',
    clientId: client.id,
    vars: {
      clientName: client.name,
      reference,
      services: services.map((s) => s.name).join(', '),
      when: formatManila(startAt, { time: true, weekday: true }),
      therapist: therapist?.name ?? 'To be assigned',
      deposit: formatPeso(depositCents),
      depositPercent: settings['booking.depositPercent'],
      expiryMinutes: settings['booking.expiryMinutes'],
      depositInstructions: manualFallback
        ? `Send it via GCash to ${settings['booking.gcashName']} (${settings['booking.gcashNumber']}) or bank transfer to ${settings['booking.bankDetails']}, then upload your proof of payment.`
        : 'You can pay it securely online with GCash, Maya, a card, or online banking.',
    },
  });

  await notify({
    kind: manualFallback ? 'DEPOSIT_TO_VERIFY' : 'PENDING_BOOKING',
    title: manualFallback
      ? `Deposit to verify — ${client.name}`
      : `New online booking — ${client.name}`,
    body: `${services.map((s) => s.name).join(', ')} · ${formatManila(startAt, { time: true })}`,
    link: `/portal/appointments/${appointment.id}`,
    dedupeKey: `appointment:${appointment.id}`,
    branchId: branch.id,
    roles: ['RECEPTIONIST', 'ADMIN', 'OWNER'],
  });

  return {
    reference,
    appointmentId: appointment.id,
    depositCents,
    checkoutUrl,
    simulated: simulated || isSimulated(),
    manualFallback,
  };
}

/**
 * Marks a deposit paid and confirms the appointment. Called by the verified
 * PayMongo webhook, by the simulated-gateway endpoint, and by the receptionist
 * when verifying a manual transfer.
 */
export async function confirmDeposit(opts: {
  reference: string;
  paidCents: number;
  method: string;
  gatewayPaymentId?: string;
  verifiedBy?: string;
}): Promise<boolean> {
  const appointment = await prisma.appointment.findUnique({
    where: { reference: opts.reference },
    include: {
      client: true,
      resource: true,
      services: { include: { service: true, employee: true } },
    },
  });
  if (!appointment) return false;
  if (appointment.depositStatus === 'PAID') return true; // webhook replay — idempotent
  if (appointment.status === 'CANCELLED') return false;

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      depositStatus: 'PAID',
      depositPaidCents: opts.paidCents,
      depositMethod: opts.method,
      gatewayPaymentId: opts.gatewayPaymentId ?? '',
      status: 'CONFIRMED',
      expiresAt: null,
    },
  });

  await sendTemplateEmail({
    to: appointment.client.email,
    template: 'booking_confirmed',
    clientId: appointment.clientId,
    vars: {
      clientName: appointment.client.name,
      reference: appointment.reference,
      services: appointment.services.map((s) => s.service.name).join(', '),
      when: formatManila(appointment.startAt, { time: true, weekday: true }),
      therapist: appointment.services[0]?.employee?.name ?? 'To be assigned',
      resource: appointment.resource?.name ?? 'To be assigned',
      deposit: formatPeso(opts.paidCents),
    },
  });

  await notify({
    kind: 'PENDING_BOOKING',
    title: `Booking confirmed — ${appointment.client.name}`,
    body: `Deposit ${formatPeso(opts.paidCents)} received · ${formatManila(appointment.startAt, { time: true })}`,
    link: `/portal/appointments/${appointment.id}`,
    dedupeKey: `appointment-confirmed:${appointment.id}`,
    branchId: appointment.branchId,
    roles: ['RECEPTIONIST'],
  });

  return true;
}

/** Expires unpaid bookings past their window. Runs from the daily/periodic job. */
export async function expireStaleBookings(): Promise<number> {
  const stale = await prisma.appointment.findMany({
    where: {
      status: 'PENDING',
      depositStatus: { in: ['AWAITING_PAYMENT', 'FAILED'] },
      expiresAt: { lt: new Date() },
    },
    include: { client: true, services: { include: { service: true } } },
  });

  for (const appt of stale) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: 'EXPIRED', cancelReason: 'Reservation fee not received in time.' },
    });
    await sendTemplateEmail({
      to: appt.client.email,
      template: 'booking_rejected',
      clientId: appt.clientId,
      vars: {
        clientName: appt.client.name,
        reference: appt.reference,
        when: formatManila(appt.startAt, { time: true, weekday: true }),
        reason: 'The reservation fee was not received within the holding window.',
      },
    });
  }
  return stale.length;
}
