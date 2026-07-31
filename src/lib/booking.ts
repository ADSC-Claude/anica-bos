/**
 * Online booking: turns a public form submission into a client record, a
 * PENDING appointment, and a PayMongo checkout session for the reservation fee.
 */
import type { AppointmentStatus } from '@prisma/client';
import { prisma } from './db';
import { getSettings } from './settings';
import { bookingReference } from './codes';
import { createCheckoutSession, isSimulated } from './paymongo';
import { sendTemplateEmail } from './email';
import { notify } from './notifications';
import {
  assertNoConflicts,
  availableResources,
  nextTherapistInRotation,
  requiredPlaceFor,
  runsPastClosing,
} from './availability';
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
  /**
   * Everyone else in the party. Empty for a booking of one.
   *
   * Names only: the person booking stays the client of record — they pay, they
   * earn the loyalty, they are who we can call — and a guest is a name until
   * they arrive and the desk takes their details properly. Asking four people
   * for a birthday and a medical history at the point of booking loses the
   * booking.
   */
  guests?: PartyGuest[];
};

export type PartyGuest = {
  name: string;
  /** Each guest chooses their own treatment; a party rarely wants the same one. */
  serviceIds: string[];
  resourceId?: string | null;
  therapistId?: string | null;
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
  /** The slot runs past closing: requested, not reserved, and not yet charged. */
  needsApproval: boolean;
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

  const startAt = new Date(req.startAtIso);
  if (Number.isNaN(startAt.getTime())) throw new BookingError('Choose a valid date and time.');
  if (startAt.getTime() < Date.now() + settings['booking.leadTimeMinutes'] * 60_000) {
    throw new BookingError(
      `Please choose a slot at least ${settings['booking.leadTimeMinutes']} minutes from now.`,
    );
  }

  // Everyone in the party, the booker first. A booking of one is a party of
  // one, so there is a single path through the rest of this rather than a
  // solo case and a group case that drift apart.
  const requested: PartyGuest[] = [
    { name: '', serviceIds: req.serviceIds, resourceId: req.resourceId, therapistId: req.therapistId },
    ...(req.guests ?? []).map((g) => ({ ...g, name: g.name.trim() })),
  ];
  if (requested.some((g, i) => i > 0 && !g.name)) {
    throw new BookingError('Please give a name for each guest in your party.');
  }
  if (requested.some((g) => !g.serviceIds.length)) {
    throw new BookingError('Every guest needs at least one treatment chosen.');
  }

  const wantedIds = [...new Set(requested.flatMap((g) => g.serviceIds))];
  const catalog = await prisma.service.findMany({
    where: { id: { in: wantedIds }, active: true },
  });
  if (catalog.length !== wantedIds.length) {
    throw new BookingError('One of the selected services is no longer available.');
  }
  const byId = new Map(catalog.map((s) => [s.id, s]));

  type Seat = {
    name: string;
    services: typeof catalog;
    endAt: Date;
    therapistId: string;
    resourceId: string;
    place: ReturnType<typeof requiredPlaceFor>;
  };

  // One shared reference for the whole party, so its own guests never read as
  // strangers to each other when an exclusive place is checked.
  const partyRef = requested.length > 1 ? `PTY-${bookingReference()}` : '';

  // How many of the party are being put in each place. A couples room is only
  // offered to a booking that fills it, and that count is what proves it.
  const wantedPer = new Map<string, number>();
  for (const g of requested) {
    const id = g.resourceId && g.resourceId !== 'any' ? g.resourceId : null;
    if (id) wantedPer.set(id, (wantedPer.get(id) ?? 0) + 1);
  }

  const seats: Seat[] = [];
  for (const guest of requested) {
    const services = guest.serviceIds.map((id) => byId.get(id)!);
    const minutes = services.reduce((a, x) => a + x.durationMinutes, 0);
    const seatEnd = new Date(startAt.getTime() + minutes * 60_000);
    const place = requiredPlaceFor(services);
    const who = guest.name || req.client.name.trim() || 'you';

    let therapistId = guest.therapistId && guest.therapistId !== 'any' ? guest.therapistId : null;
    if (!therapistId) {
      const next = await nextTherapistInRotation({
        branchId: branch.id,
        startAt,
        endAt: seatEnd,
        serviceIds: guest.serviceIds,
      });
      therapistId = next?.id ?? null;
      if (!therapistId) {
        throw new BookingError(
          requested.length > 1
            ? `No therapist is free for ${who} at that time. Please pick another slot — or call us and we will fit your group in.`
            : 'No therapist is free for that slot. Please pick another time — or call us and we will fit you in.',
        );
      }
    }

    let resourceId = guest.resourceId && guest.resourceId !== 'any' ? guest.resourceId : null;
    if (!resourceId) {
      const free = await availableResources({
        branchId: branch.id,
        startAt,
        endAt: seatEnd,
        resourceType: place,
        partyRef,
        // Auto-assignment takes a place for one person, so it must not be
        // handed a couples room — that is a choice only the party can make.
        partySize: 1,
      });
      resourceId = free.find((r) => !seats.some((t) => t.resourceId === r.id && r.capacity === 1))?.id
        ?? free[0]?.id
        ?? null;
      if (!resourceId) {
        throw new BookingError(
          place
            ? `No ${place.toLowerCase()} is free for ${who} at that time.`
            : `Nowhere is free for ${who} at that time.`,
        );
      }
    }

    // Each seat is checked against the ones already placed as well as against
    // the database, because two guests in one party can be handed the same
    // single bed and neither would clash with anything already stored.
    const alreadyHere = seats.filter((t) => t.resourceId === resourceId).length;
    await assertNoConflicts({
      branchId: branch.id,
      startAt,
      endAt: seatEnd,
      employeeIds: [therapistId],
      resourceId,
      resourceType: place,
      partyRef,
      partySize: wantedPer.get(resourceId) ?? 1,
    });
    const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (resource && alreadyHere + 1 > Math.max(1, resource.capacity)) {
      throw new BookingError(`${resource.name} does not hold that many of your party.`);
    }

    seats.push({ name: guest.name, services, endAt: seatEnd, therapistId, resourceId, place });
  }

  // The booker's own row leads: its reference is the one quoted, and its window
  // is what the confirmation talks about.
  const services = seats[0].services;
  const totalMinutes = services.reduce((a, x) => a + x.durationMinutes, 0);
  const endAt = seats[0].endAt;
  const therapistId = seats[0].therapistId;
  const resourceId = seats[0].resourceId;

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
  // The party pays once, on everything it booked. Charging per guest would put
  // four card payments in front of one person holding one phone.
  const priceTotal = seats.reduce(
    (a, seat) => a + seat.services.reduce((b, x) => b + x.priceCents, 0),
    0,
  );
  const depositCents = Math.round((priceTotal * settings['booking.depositPercent']) / 100);

  // A treatment that runs past closing is a request, not a reservation: it means
  // someone at the desk agrees to stay. Nothing is charged until they do, so a
  // declined request never has to be refunded — which is the whole reason the
  // gateway is skipped here rather than charged and reversed later.
  //
  // One guest running late makes the whole party a request: they arrive
  // together, and approving half a party is not a thing the desk can do.
  const needsApproval = seats.some((seat) =>
    runsPastClosing(
      startAt,
      seat.services.reduce((a, x) => a + x.durationMinutes, 0),
      branch.closeMinute,
    ),
  );
  const manualFallback = needsApproval ? false : settings['booking.manualFallbackEnabled'];

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
      needsApproval,
      // The amount is recorded either way so the desk can quote it, but an
      // unapproved request is not yet awaiting anything.
      depositStatus: needsApproval
        ? 'NONE'
        : manualFallback
          ? 'AWAITING_VERIFICATION'
          : 'AWAITING_PAYMENT',
      depositAmountCents: depositCents,
      // Requests do not expire on the deposit clock — there is nothing to pay
      // yet, and expiring one would cancel a booking the guest is still
      // waiting to hear about.
      expiresAt: needsApproval
        ? null
        : new Date(Date.now() + settings['booking.expiryMinutes'] * 60_000),
      partyRef,
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

  // One row per guest, sharing the party reference. The whole fee sits on the
  // booker's row — it is paid once, by them — so the guests' rows carry zero
  // rather than a share nobody will ever be asked for.
  for (const seat of seats.slice(1)) {
    let guestRef = bookingReference();
    while (await prisma.appointment.findUnique({ where: { reference: guestRef }, select: { id: true } })) {
      guestRef = bookingReference();
    }
    await prisma.appointment.create({
      data: {
        branchId: branch.id,
        reference: guestRef,
        clientId: client.id,
        guestName: seat.name,
        partyRef,
        resourceId: seat.resourceId,
        partnerId: partner?.id ?? null,
        startAt,
        endAt: seat.endAt,
        status: 'PENDING' as AppointmentStatus,
        source: 'ONLINE',
        needsApproval,
        depositStatus: 'NONE',
        depositAmountCents: 0,
        expiresAt: needsApproval
          ? null
          : new Date(Date.now() + settings['booking.expiryMinutes'] * 60_000),
        services: {
          create: seat.services.map((x, i) => ({
            serviceId: x.id,
            employeeId: seat.therapistId,
            priceCents: x.priceCents,
            durationMinutes: x.durationMinutes,
            sortRank: i,
          })),
        },
      },
    });
  }

  // -------------------------------------------------------------- gateway
  let checkoutUrl: string | null = null;
  let simulated = false;
  if (!manualFallback && !needsApproval) {
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
    template: needsApproval ? 'booking_request_received' : 'booking_received',
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
      depositInstructions: needsApproval
        ? `This time runs past our closing hour, so we need to confirm a therapist can stay. We will message you shortly — nothing is charged until we do, and your ${formatPeso(depositCents)} reservation fee is only requested once we confirm.`
        : manualFallback
          ? `Send it via GCash to ${settings['booking.gcashName']} (${settings['booking.gcashNumber']}) or bank transfer to ${settings['booking.bankDetails']}, then upload your proof of payment.`
          : 'You can pay it securely online with GCash, Maya, a card, or online banking.',
    },
  });

  await notify({
    kind: manualFallback ? 'DEPOSIT_TO_VERIFY' : 'PENDING_BOOKING',
    // The late request is the one that actually needs a person to decide
    // something, so it says so rather than arriving as another booking.
    title: needsApproval
      ? `Late request — approve or decline — ${client.name}`
      : manualFallback
        ? `Deposit to verify — ${client.name}`
        : `New online booking — ${client.name}`,
    body: needsApproval
      ? `${services.map((s) => s.name).join(', ')} · ${formatManila(startAt, { time: true })} — runs past closing`
      : `${services.map((s) => s.name).join(', ')} · ${formatManila(startAt, { time: true })}`,
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
    needsApproval,
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

  // One payment confirms the whole party. The guests' rows carry no fee of
  // their own, so leaving them PENDING would expire them out from under a
  // booking that has already been paid for.
  if (appointment.partyRef) {
    await prisma.appointment.updateMany({
      where: {
        partyRef: appointment.partyRef,
        id: { not: appointment.id },
        status: 'PENDING',
      },
      data: { status: 'CONFIRMED', expiresAt: null },
    });
  }

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
    // The party's other rows carry no fee of their own, so nothing would ever
    // expire them — they would sit PENDING forever, holding beds for a booking
    // that lapsed.
    if (appt.partyRef) {
      await prisma.appointment.updateMany({
        where: { partyRef: appt.partyRef, id: { not: appt.id }, status: 'PENDING' },
        data: { status: 'EXPIRED', cancelReason: 'Reservation fee not received in time.' },
      });
    }
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

/**
 * The desk agrees to stay late: a request becomes a real booking.
 *
 * Only now is money asked for. The guest was told nothing would be charged
 * until someone confirmed, so this is the first point a gateway session exists
 * — which is also why declining costs nothing and refunds no one.
 */
export async function approveLateRequest(opts: {
  appointmentId: string;
  approvedBy: string;
}): Promise<{ ok: boolean; error?: string; checkoutUrl?: string | null }> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: opts.appointmentId },
    include: { client: true, branch: true, services: { include: { service: true, employee: true } } },
  });
  if (!appointment) return { ok: false, error: 'That booking no longer exists.' };
  if (!appointment.needsApproval) return { ok: false, error: 'That booking is not awaiting approval.' };
  if (appointment.status === 'CANCELLED') return { ok: false, error: 'That booking was cancelled.' };

  const settings = await getSettings(appointment.branchId);
  const manualFallback = settings['booking.manualFallbackEnabled'];
  const depositCents = appointment.depositAmountCents;
  const serviceNames = appointment.services.map((s) => s.service.name).join(', ');

  let checkoutUrl: string | null = null;
  if (!manualFallback && depositCents > 0) {
    const base = appUrl();
    const session = await createCheckoutSession({
      amountCents: depositCents,
      description: `Reservation fee — ${serviceNames}`,
      reference: appointment.reference,
      lineName: `${settings['booking.depositPercent']}% reservation fee`,
      successUrl: `${base}/book/confirmation/${appointment.reference}?paid=1`,
      cancelUrl: `${base}/book/confirmation/${appointment.reference}?cancelled=1`,
      customer: {
        name: appointment.client.name,
        email: appointment.client.email,
        phone: appointment.client.mobile,
      },
    });
    checkoutUrl = session.checkoutUrl;
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { gatewaySessionId: session.id },
    });
  }

  if (appointment.partyRef) {
    // A party arrives together; approving one of them and not the rest is not a
    // decision the desk can act on.
    await prisma.appointment.updateMany({
      where: { partyRef: appointment.partyRef, id: { not: appointment.id } },
      data: {
        needsApproval: false,
        approvedAt: new Date(),
        approvedBy: opts.approvedBy,
        expiresAt: depositCents === 0
          ? null
          : new Date(Date.now() + settings['booking.expiryMinutes'] * 60_000),
        ...(depositCents === 0 ? { status: 'CONFIRMED' as const } : {}),
      },
    });
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      needsApproval: false,
      approvedAt: new Date(),
      approvedBy: opts.approvedBy,
      // The expiry clock starts now, not when the request was made — the guest
      // has been waiting for an answer and should get the full window to pay.
      depositStatus: depositCents === 0
        ? 'NONE'
        : manualFallback
          ? 'AWAITING_VERIFICATION'
          : 'AWAITING_PAYMENT',
      expiresAt: depositCents === 0
        ? null
        : new Date(Date.now() + settings['booking.expiryMinutes'] * 60_000),
      // With no fee to collect there is nothing left to wait for.
      status: depositCents === 0 ? 'CONFIRMED' : appointment.status,
    },
  });

  await sendTemplateEmail({
    to: appointment.client.email,
    template: 'booking_request_approved',
    clientId: appointment.clientId,
    vars: {
      clientName: appointment.client.name,
      reference: appointment.reference,
      services: serviceNames,
      when: formatManila(appointment.startAt, { time: true, weekday: true }),
      therapist: appointment.services[0]?.employee?.name ?? 'To be assigned',
      deposit: formatPeso(depositCents),
      depositPercent: settings['booking.depositPercent'],
      expiryMinutes: settings['booking.expiryMinutes'],
      depositInstructions: manualFallback
        ? `Send it via GCash to ${settings['booking.gcashName']} (${settings['booking.gcashNumber']}) or bank transfer to ${settings['booking.bankDetails']}, then upload your proof of payment.`
        : 'You can pay it securely online with GCash, Maya, a card, or online banking.',
    },
  });

  return { ok: true, checkoutUrl };
}

/**
 * The desk cannot stay: the request is refused and the slot released.
 *
 * Cancelled rather than deleted, because a guest who asked and was told no is
 * part of the record — and because nothing in this system deletes bookings.
 */
export async function declineLateRequest(opts: {
  appointmentId: string;
  reason: string;
  declinedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: opts.appointmentId },
    include: { client: true, services: { include: { service: true } } },
  });
  if (!appointment) return { ok: false, error: 'That booking no longer exists.' };
  if (!appointment.needsApproval) return { ok: false, error: 'That booking is not awaiting approval.' };

  if (appointment.partyRef) {
    await prisma.appointment.updateMany({
      where: { partyRef: appointment.partyRef, id: { not: appointment.id } },
      data: {
        needsApproval: false,
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: opts.reason || 'We could not stay past closing for this time.',
        declineReason: opts.reason,
      },
    });
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      needsApproval: false,
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: opts.reason || 'We could not stay past closing for this time.',
      declineReason: opts.reason,
      approvedBy: opts.declinedBy,
    },
  });

  await sendTemplateEmail({
    to: appointment.client.email,
    template: 'booking_rejected',
    clientId: appointment.clientId,
    vars: {
      clientName: appointment.client.name,
      reference: appointment.reference,
      services: appointment.services.map((s) => s.service.name).join(', '),
      when: formatManila(appointment.startAt, { time: true, weekday: true }),
      reason: opts.reason || 'we are unable to stay past closing at that time',
    },
  });

  return { ok: true };
}
