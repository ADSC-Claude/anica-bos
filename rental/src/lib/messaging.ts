import 'server-only';
import type { MessageTiming } from '@prisma/client';
import { prisma, type Tx } from './db';
import { sendEmail, render, baseVars } from './email';
import { appUrl } from './app-url';
import { formatPeso } from './money';
import {
  formatStayDate,
  manilaInstant,
  minutesToLabel,
  toDateKey,
  addDays,
} from './datetime';

/**
 * The guest message sequence.
 *
 * Scheduled when a payment confirms, drained by the 15-minute cron. Every
 * intended message is a row, so the reservation shows one timeline of what was
 * sent and what is still coming — and nothing depends on a person having a
 * browser tab open at 9am.
 */

export const DEFAULT_TEMPLATES: {
  key: string;
  name: string;
  subject: string;
  body: string;
  timing: MessageTiming;
  offsetDays: number;
  sendAtMinute: number;
  sortOrder: number;
}[] = [
  {
    key: 'booking_confirmed',
    name: 'Booking confirmed',
    timing: 'ON_BOOKING_CONFIRMED',
    offsetDays: 0,
    sendAtMinute: 0,
    sortOrder: 1,
    subject: 'You are booked — {{reference}}',
    body: `Hi {{guestFirstName}},

Your stay is confirmed. Here is everything in one place.

  Reference   : {{reference}}
  Place       : {{propertyName}}
  Check in    : {{checkInDate}} from {{checkInTime}}
  Check out   : {{checkOutDate}} by {{checkOutTime}}
  Guests      : {{guests}}
  Nights      : {{nights}}

{{breakdown}}

  Paid so far : {{paid}}
  Balance     : {{balance}}{{balanceNote}}

What happens next: three days before you arrive we will send directions and
house rules, and on the morning of check-in you will get the access details.

Anything at all, just reply to this email or message us on {{businessPhone}}.

See you soon,
{{businessName}}`,
  },
  {
    key: 'balance_due',
    name: 'Balance due',
    timing: 'DAYS_BEFORE_CHECKIN',
    offsetDays: 7,
    sendAtMinute: 540,
    sortOrder: 2,
    subject: 'Balance for your stay — {{reference}}',
    body: `Hi {{guestFirstName}},

Your stay at {{propertyName}} starts on {{checkInDate}}, and there is
{{balance}} left to settle.

  Pay the balance here: {{payLink}}

It takes about a minute — GCash, Maya, card or online banking.

  Reference : {{reference}}
  Total     : {{total}}
  Paid      : {{paid}}
  Balance   : {{balance}}

If you have already paid, thank you — please ignore this.

{{businessName}} • {{businessPhone}}`,
  },
  {
    key: 'pre_arrival',
    name: 'Pre-arrival details',
    timing: 'DAYS_BEFORE_CHECKIN',
    offsetDays: 3,
    sendAtMinute: 540,
    sortOrder: 3,
    subject: 'Getting to {{propertyName}} — {{reference}}',
    body: `Hi {{guestFirstName}},

Three days to go. Here is what you need.

  Where     : {{propertyAddress}}
  Check in  : {{checkInDate}} from {{checkInTime}}
  Check out : {{checkOutDate}} by {{checkOutTime}}

Getting there
{{transportNotes}}

Parking
{{parkingNotes}}

House rules
{{houseRules}}

Please complete your check-in details before you travel — it takes a minute and
means we can send your access instructions on the morning you arrive:

  {{checkInLink}}

{{businessName}} • {{businessPhone}}`,
  },
  {
    key: 'checkin_day',
    name: 'Check-in day — access',
    timing: 'ON_CHECKIN_DAY',
    offsetDays: 0,
    sendAtMinute: 480,
    sortOrder: 4,
    subject: 'Today is the day — how to get in',
    body: `Hi {{guestFirstName}},

Your place is ready from {{checkInTime}} today.

  Where    : {{propertyAddress}}
  Access   : {{accessInstructions}}
  Wi-Fi    : {{wifiName}} / {{wifiPassword}}

  If anything is not right when you walk in, message us straight away on
  {{businessPhone}} — we would much rather fix it now than read about it later.

  In an emergency : {{emergencyContact}}

Have a lovely stay,
{{businessName}}`,
  },
  {
    key: 'post_checkin',
    name: 'Settled in?',
    timing: 'EVENING_OF_CHECKIN',
    offsetDays: 0,
    sendAtMinute: 1140,
    sortOrder: 5,
    subject: 'Everything okay?',
    body: `Hi {{guestFirstName}},

Just checking you got in alright and everything is as it should be.

If anything is missing, broken or confusing, reply here or message
{{businessPhone}} and we will sort it tonight.

{{businessName}}`,
  },
  {
    key: 'checkout_reminder',
    name: 'Checkout reminder',
    timing: 'EVENING_BEFORE_CHECKOUT',
    offsetDays: 0,
    sendAtMinute: 1080,
    sortOrder: 6,
    subject: 'Checking out tomorrow — {{checkOutTime}}',
    body: `Hi {{guestFirstName}},

A gentle reminder that checkout is tomorrow, {{checkOutDate}}, by
{{checkOutTime}}.

Before you go, if you could:
  • Put used towels in the bathroom
  • Bag up any rubbish
  • Turn off the aircon and lights
  • Leave the keys {{keyReturnNote}}

Need a later checkout? Ask us — if nobody is arriving that day we can usually
say yes.

Thank you for staying with us,
{{businessName}}`,
  },
  {
    key: 'post_checkout',
    name: 'Thank you',
    timing: 'ON_CHECKOUT_DAY',
    offsetDays: 0,
    sendAtMinute: 720,
    sortOrder: 7,
    subject: 'Thank you for staying with us',
    body: `Hi {{guestFirstName}},

Thank you for staying at {{propertyName}}. It was a pleasure having you.

If you left something behind, tell us today and we will keep it safe.

Booking direct next time is always our best rate — no platform fees, and you
talk to us rather than a call centre. {{appUrl}}

{{businessName}}`,
  },
  {
    key: 'review_request',
    name: 'Review request',
    timing: 'DAYS_AFTER_CHECKOUT',
    offsetDays: 1,
    sendAtMinute: 600,
    sortOrder: 8,
    subject: 'How was {{propertyName}}?',
    body: `Hi {{guestFirstName}},

Would you tell us how your stay went? It takes a minute and it genuinely helps
— both us and the next guest deciding whether to book.

  {{reviewLink}}

If something was not right, say so there or reply to this email. We would
rather hear it from you than read it in public.

Thank you,
{{businessName}}`,
  },
];

/** The Airbnb variant: we cannot collect a review for them, so we nudge. */
export const AIRBNB_REVIEW_BODY = `Hi {{guestFirstName}},

Thank you for staying at {{propertyName}}.

If you have a moment, a review on Airbnb would mean a lot — it is the main
thing future guests look at. You should find the prompt in your Airbnb app.

And if you come back to us directly next time, you skip the platform fee:
{{appUrl}}

{{businessName}}`;

export async function seedTemplates(tx: Tx): Promise<void> {
  for (const t of DEFAULT_TEMPLATES) {
    await tx.messageTemplate.upsert({
      where: { key: t.key },
      create: t,
      update: {}, // never overwrite wording someone has edited
    });
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

type ReservationForSchedule = {
  id: string;
  reference: string;
  source: string;
  checkIn: Date;
  checkOut: Date;
  balanceDueAt: Date | null;
  totalCents: number;
  paidCents: number;
  guest: { email: string };
};

/**
 * When a template fires for a stay. Returns null when it does not apply — a
 * balance reminder for a stay already paid in full, for instance.
 */
function scheduledFor(
  template: { timing: MessageTiming; offsetDays: number; sendAtMinute: number },
  r: ReservationForSchedule,
): Date | null {
  const inKey = toDateKey(r.checkIn);
  const outKey = toDateKey(r.checkOut);

  switch (template.timing) {
    case 'ON_BOOKING_CONFIRMED':
      return new Date();
    case 'DAYS_BEFORE_CHECKIN':
      return manilaInstant(addDays(inKey, -template.offsetDays), template.sendAtMinute);
    case 'ON_CHECKIN_DAY':
      return manilaInstant(inKey, template.sendAtMinute);
    case 'EVENING_OF_CHECKIN':
      return manilaInstant(inKey, template.sendAtMinute);
    case 'EVENING_BEFORE_CHECKOUT':
      return manilaInstant(addDays(outKey, -1), template.sendAtMinute);
    case 'ON_CHECKOUT_DAY':
      return manilaInstant(outKey, template.sendAtMinute);
    case 'DAYS_AFTER_CHECKOUT':
      return manilaInstant(addDays(outKey, template.offsetDays), template.sendAtMinute);
    case 'MANUAL':
    default:
      return null;
  }
}

/**
 * Writes the sequence for a reservation. Idempotent: re-running it after a date
 * change reschedules what has not gone out and leaves what has alone.
 */
export async function scheduleSequence(tx: Tx, reservationId: string): Promise<number> {
  const r = await tx.reservation.findUnique({
    where: { id: reservationId },
    include: { guest: { select: { email: true } } },
  });
  if (!r || !r.guest.email) return 0;

  const templates = await tx.messageTemplate.findMany({
    where: { active: true, timing: { not: 'MANUAL' } },
    orderBy: { sortOrder: 'asc' },
  });

  // Anything already sent stays put; only future intentions are rewritten.
  await tx.scheduledMessage.deleteMany({
    where: { reservationId, status: 'SCHEDULED', manual: false },
  });

  let count = 0;
  for (const t of templates) {
    // A stay with nothing outstanding does not get chased for money.
    if (t.key === 'balance_due' && r.totalCents - r.paidCents <= 0) continue;

    const when = scheduledFor(t, r as ReservationForSchedule);
    if (!when) continue;

    // A booking made two days before arrival must not fire a "three days to go"
    // email into the past. Sending it immediately is right for anything the
    // guest still needs; anything purely retrospective is skipped.
    const now = new Date();
    const due = when < now ? (t.key === 'pre_arrival' || t.key === 'balance_due' ? now : null) : when;
    if (!due) continue;

    await tx.scheduledMessage.create({
      data: {
        reservationId,
        templateId: t.id,
        templateKey: t.key,
        channel: t.channel,
        scheduledFor: due,
        to: r.guest.email,
      },
    });
    count++;
  }
  return count;
}

/** Cancels everything not yet sent — a cancelled stay must go quiet at once. */
export async function cancelScheduled(tx: Tx, reservationId: string, keep: string[] = []) {
  await tx.scheduledMessage.updateMany({
    where: { reservationId, status: 'SCHEDULED', templateKey: { notIn: keep } },
    data: { status: 'CANCELLED' },
  });
}

// ---------------------------------------------------------------------------
// Rendering and dispatch
// ---------------------------------------------------------------------------

/**
 * Everything a template may refer to. Credentials — access code, Wi-Fi
 * password — are included ONLY for the check-in-day message, because a
 * pre-arrival email sitting in an inbox is a door code sitting in an inbox.
 */
export async function templateVars(
  reservationId: string,
  templateKey: string,
): Promise<Record<string, string | number>> {
  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: {
      guest: true,
      property: true,
      lines: { orderBy: { sortOrder: 'asc' } },
      accessRecords: { orderBy: { issuedAt: 'desc' }, take: 1 },
    },
  });

  const base = await baseVars();
  const balance = r.totalCents - r.paidCents;
  const releasesCredentials = templateKey === 'checkin_day';
  const access = r.accessRecords[0];

  const breakdown = r.lines
    .map((l) => `  ${l.label.padEnd(34)}${formatPeso(l.amountCents).padStart(12)}`)
    .concat(`  ${'TOTAL'.padEnd(34)}${formatPeso(r.totalCents).padStart(12)}`)
    .join('\n');

  return {
    ...base,
    reference: r.reference,
    guestFirstName: r.guest.firstName,
    guestName: `${r.guest.firstName} ${r.guest.lastName}`.trim(),
    propertyName: r.property.name,
    propertyAddress: [r.property.addressLine, r.property.barangay, r.property.city]
      .filter(Boolean)
      .join(', '),
    checkInDate: formatStayDate(r.checkIn, { weekday: true }),
    checkOutDate: formatStayDate(r.checkOut, { weekday: true }),
    checkInTime: minutesToLabel(r.property.checkInMinute),
    checkOutTime: minutesToLabel(r.property.checkOutMinute),
    nights: r.nights,
    guests: r.adults + r.children,
    total: formatPeso(r.totalCents),
    paid: formatPeso(r.paidCents),
    balance: formatPeso(balance),
    balanceNote: r.balanceDueAt ? ` (due ${formatStayDate(r.balanceDueAt)})` : '',
    breakdown,
    houseRules: r.property.houseRules || 'No smoking indoors. Please respect quiet hours.',
    transportNotes: r.property.transportNotes || 'We will send directions with your access details.',
    parkingNotes: r.property.parkingNotes || 'Ask us about parking and we will advise.',
    emergencyContact: r.property.emergencyContact || base.businessPhone,
    keyReturnNote: 'where you found them',
    payLink: `${appUrl()}/book/pay/${r.reference}`,
    // The token is what makes this link safe to email: a booking reference is
    // short enough to guess at, so it alone never opens a stay.
    checkInLink: r.manageToken
      ? `${appUrl()}/manage/${r.reference}?t=${r.manageToken}`
      : `${appUrl()}/manage/${r.reference}`,
    reviewLink: r.reviewToken ? `${appUrl()}/review/${r.reviewToken}` : `${appUrl()}`,
    accessInstructions: releasesCredentials
      ? access?.instructions || r.property.accessNotes || 'We will meet you at the door.'
      : 'Sent on the morning you arrive.',
    wifiName: releasesCredentials ? r.property.wifiName : 'Sent on arrival',
    wifiPassword: releasesCredentials ? r.property.wifiPassword : '—',
  };
}

/** Renders a scheduled message without sending it — for previews and copy-out. */
export async function renderMessage(
  reservationId: string,
  templateKey: string,
): Promise<{ subject: string; body: string }> {
  const [template, vars, reservation] = await Promise.all([
    prisma.messageTemplate.findUnique({ where: { key: templateKey } }),
    templateVars(reservationId, templateKey),
    prisma.reservation.findUnique({ where: { id: reservationId }, select: { source: true } }),
  ]);
  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === templateKey);
  const subject = template?.subject ?? fallback?.subject ?? '';
  let body = template?.body ?? fallback?.body ?? '';

  // We cannot collect a review on Airbnb's behalf, so ask for one where it
  // actually counts.
  if (templateKey === 'review_request' && reservation?.source === 'AIRBNB') {
    body = AIRBNB_REVIEW_BODY;
  }

  return { subject: render(subject, vars), body: render(body, vars) };
}

/**
 * Sends everything due. Called by the 15-minute cron.
 *
 * Failures retry twice; the third gives up and leaves the error on the row,
 * because a permanently bad address should stop consuming the queue and start
 * being visible on the reservation instead.
 */
export async function dispatchDue(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  const due = await prisma.scheduledMessage.findMany({
    where: { status: 'SCHEDULED', scheduledFor: { lte: now }, attempts: { lt: 3 } },
    orderBy: { scheduledFor: 'asc' },
    take: 100,
  });

  let sent = 0;
  let failed = 0;

  for (const message of due) {
    const rendered = await renderMessage(message.reservationId, message.templateKey);
    const result = await sendEmail({ to: message.to, ...{ subject: rendered.subject, text: rendered.body } });

    if (result.ok) {
      await prisma.scheduledMessage.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          subject: rendered.subject,
          body: rendered.body,
          attempts: { increment: 1 },
          error: '',
        },
      });
      sent++;
    } else {
      const attempts = message.attempts + 1;
      await prisma.scheduledMessage.update({
        where: { id: message.id },
        data: {
          status: attempts >= 3 ? 'FAILED' : 'SCHEDULED',
          attempts,
          error: result.error ?? 'Unknown error',
          subject: rendered.subject,
          body: rendered.body,
        },
      });
      failed++;
    }
  }

  return { sent, failed };
}

/** A staff member sending something by hand. Recorded on the same timeline. */
export async function sendNow(
  reservationId: string,
  templateKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { guest: { select: { email: true } } },
  });
  if (!r.guest.email) return { ok: false, error: 'This guest has no email address.' };

  const rendered = await renderMessage(reservationId, templateKey);
  const result = await sendEmail({ to: r.guest.email, subject: rendered.subject, text: rendered.body });

  await prisma.scheduledMessage.create({
    data: {
      reservationId,
      templateKey,
      scheduledFor: new Date(),
      status: result.ok ? 'SENT' : 'FAILED',
      sentAt: result.ok ? new Date() : null,
      to: r.guest.email,
      subject: rendered.subject,
      body: rendered.body,
      attempts: 1,
      error: result.error ?? '',
      manual: true,
    },
  });

  return { ok: result.ok, error: result.error };
}
