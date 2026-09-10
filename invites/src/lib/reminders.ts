import 'server-only';
import { prisma } from './db';
import { HttpError } from './errors';
import { getSettings } from './settings';
import { render, sendEmail, mailable } from './email';
import { sendSms, phMobile, creditsFor } from './sms';
import { invitationUrl } from './app-url';
import { formatDate } from './datetime';
import { displayTitle } from './sections';
import { contentOf } from './invitations';
import type { Occasion, Tier } from '@prisma/client';

/**
 * RSVP reminders, by text and by e-mail.
 *
 * Two rules keep a blast from being a mistake you cannot take back, and they
 * hold for both. A guest already written to in the last day is skipped,
 * because a second reminder inside an afternoon reads as nagging; and a guest
 * who has already answered is skipped unless the sender asks for everyone,
 * because the commonest reason to send at all is precisely the people who have
 * not.
 *
 * The two channels are kept side by side rather than folded into one, because
 * what differs between them is most of what matters: a text costs money by the
 * segment and is refused for a number that is not a Philippine mobile, while
 * an e-mail is free, has a subject line, and reaches the ninong in Dubai whom
 * Semaphore cannot. What they genuinely share — who to skip, and the names and
 * dates a message is written from — is shared.
 */

const QUIET_HOURS = 24;

export type ReminderTarget = {
  guestId: string;
  name: string;
  number: string;
  text: string;
};

export type ReminderPlan = {
  send: ReminderTarget[];
  /** Why each excluded guest is excluded, for a sender who expected them. */
  skipped: { name: string; reason: 'answered' | 'no number' | 'texted today' }[];
  credits: number;
};

type PlanInvitation = {
  id: string;
  slug: string;
  title: string;
  occasion: Occasion;
  tier: Tier;
  eventAt: Date | null;
  content: unknown;
};

/**
 * The words every reminder is written from, whichever way it travels.
 *
 * The title is the one the couple gave the invitation, not the one derived
 * from the cover fields: those differ (the derived wedding title is
 * bride-first), and a reminder naming the hosts differently from the page
 * reads as a mistake.
 */
function saysWho(invitation: PlanInvitation): { hosts: string; eventDate: string } {
  const content = contentOf(invitation.content);
  return {
    hosts: invitation.title.trim() || displayTitle(invitation.occasion, content),
    eventDate: invitation.eventAt ? formatDate(invitation.eventAt) : '',
  };
}

/** How far back "already written to" reaches. */
function quietSince(): Date {
  return new Date(Date.now() - QUIET_HOURS * 60 * 60 * 1000);
}

/**
 * Who would be texted, what they would receive, and what it would cost —
 * worked out before anything is sent so the sender can be shown the bill.
 */
export async function planReminders(
  invitation: PlanInvitation,
  opts: { everyone?: boolean } = {},
): Promise<ReminderPlan> {
  const settings = await getSettings();
  const template = settings['sms.rsvpReminder'];
  const { hosts, eventDate } = saysWho(invitation);

  const since = quietSince();
  const guests = await prisma.guest.findMany({
    where: { invitationId: invitation.id },
    include: {
      rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 },
      texts: { where: { createdAt: { gte: since }, status: { not: 'FAILED' } }, take: 1 },
    },
    orderBy: [{ groupName: 'asc' }, { name: 'asc' }],
  });

  const send: ReminderTarget[] = [];
  const skipped: ReminderPlan['skipped'] = [];

  for (const guest of guests) {
    if (!opts.everyone && guest.rsvps.length) {
      skipped.push({ name: guest.name, reason: 'answered' });
      continue;
    }
    const number = phMobile(guest.phone);
    if (!number) {
      skipped.push({ name: guest.name, reason: 'no number' });
      continue;
    }
    if (guest.texts.length) {
      skipped.push({ name: guest.name, reason: 'texted today' });
      continue;
    }
    send.push({
      guestId: guest.id,
      name: guest.name,
      number,
      text: render(template, {
        guestName: guest.salutation || guest.name,
        hosts,
        eventDate,
        link: invitationUrl(invitation.slug, guest.token),
      }),
    });
  }

  return { send, skipped, credits: send.reduce((total, t) => total + creditsFor(t.text), 0) };
}

export type ReminderOutcome = { sent: number; logged: number; failed: number; skipped: number };

/**
 * Sends the plan. One message at a time and in order: a blast is at most a few
 * hundred texts, and a gateway that starts refusing should be discovered on
 * message eleven rather than after all two hundred have been charged for.
 */
export async function sendReminders(
  invitation: PlanInvitation,
  opts: { everyone?: boolean } = {},
): Promise<ReminderOutcome> {
  const plan = await planReminders(invitation, opts);
  if (!plan.send.length) throw new HttpError(400, 'There is nobody to text right now.');

  const outcome: ReminderOutcome = { sent: 0, logged: 0, failed: 0, skipped: plan.skipped.length };

  for (const target of plan.send) {
    const result = await sendSms({ to: target.number, text: target.text });
    await prisma.smsMessage.create({
      data: {
        invitationId: invitation.id,
        guestId: target.guestId,
        to: target.number,
        body: target.text,
        status: result.status === 'sent' ? 'SENT' : result.status === 'logged' ? 'LOGGED' : 'FAILED',
        error: result.error ?? '',
      },
    });
    if (result.status === 'sent') outcome.sent++;
    else if (result.status === 'logged') outcome.logged++;
    else outcome.failed++;
  }

  return outcome;
}

/** The last few blasts, for the guest list page. */
export async function recentTexts(invitationId: string, take = 50) {
  return prisma.smsMessage.findMany({
    where: { invitationId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { guest: { select: { name: true } } },
  });
}

// ---------------------------------------------------------------------------
// The same reminder, by e-mail
// ---------------------------------------------------------------------------

export type EmailTarget = {
  guestId: string;
  name: string;
  address: string;
  subject: string;
  body: string;
};

export type EmailPlan = {
  send: EmailTarget[];
  /** Why each excluded guest is excluded, for a sender who expected them. */
  skipped: { name: string; reason: 'answered' | 'no address' | 'e-mailed today' }[];
};

/**
 * Who would be written to, and what would arrive.
 *
 * No cost is worked out because there is none: an e-mail is free, which is the
 * whole argument for having this beside the text blast. It is also the reason
 * the confirmation still shows the message — free is not the same as harmless,
 * and two hundred guests reading a mistake is two hundred guests either way.
 */
export async function planEmailReminders(
  invitation: PlanInvitation,
  opts: { everyone?: boolean } = {},
): Promise<EmailPlan> {
  const settings = await getSettings();
  const subjectTemplate = settings['email.rsvpReminderSubject'];
  const bodyTemplate = settings['email.rsvpReminder'];
  const { hosts, eventDate } = saysWho(invitation);

  const since = quietSince();
  const guests = await prisma.guest.findMany({
    where: { invitationId: invitation.id },
    include: {
      rsvps: { orderBy: { updatedAt: 'desc' }, take: 1 },
      emails: { where: { createdAt: { gte: since }, status: { not: 'FAILED' } }, take: 1 },
    },
    orderBy: [{ groupName: 'asc' }, { name: 'asc' }],
  });

  const send: EmailTarget[] = [];
  const skipped: EmailPlan['skipped'] = [];

  for (const guest of guests) {
    if (!opts.everyone && guest.rsvps.length) {
      skipped.push({ name: guest.name, reason: 'answered' });
      continue;
    }
    const address = mailable(guest.email);
    if (!address) {
      skipped.push({ name: guest.name, reason: 'no address' });
      continue;
    }
    if (guest.emails.length) {
      skipped.push({ name: guest.name, reason: 'e-mailed today' });
      continue;
    }
    const vars = {
      guestName: guest.salutation || guest.name,
      hosts,
      eventDate,
      link: invitationUrl(invitation.slug, guest.token),
    };
    send.push({
      guestId: guest.id,
      name: guest.name,
      address,
      subject: render(subjectTemplate, vars),
      body: render(bodyTemplate, vars),
    });
  }

  return { send, skipped };
}

/**
 * Sends the plan. One at a time and in order, for the same reason the texts
 * are: a provider that starts refusing should be discovered on the eleventh
 * message rather than after all two hundred have gone out.
 *
 * Every attempt is written down, the failures included. A blast that half
 * worked is the case where the record matters most — it is the only way to
 * know who to write to again without writing to everybody.
 */
export async function sendEmailReminders(
  invitation: PlanInvitation,
  opts: { everyone?: boolean } = {},
): Promise<ReminderOutcome> {
  const plan = await planEmailReminders(invitation, opts);
  if (!plan.send.length) throw new HttpError(400, 'There is nobody to e-mail right now.');

  const outcome: ReminderOutcome = { sent: 0, logged: 0, failed: 0, skipped: plan.skipped.length };

  for (const target of plan.send) {
    const result = await sendEmail({ to: target.address, subject: target.subject, text: target.body });
    await prisma.emailMessage.create({
      data: {
        invitationId: invitation.id,
        guestId: target.guestId,
        to: target.address,
        subject: target.subject,
        body: target.body,
        status: result.status === 'sent' ? 'SENT' : result.status === 'logged' ? 'LOGGED' : 'FAILED',
        error: result.error ?? '',
      },
    });
    if (result.status === 'sent') outcome.sent++;
    else if (result.status === 'logged') outcome.logged++;
    else outcome.failed++;
  }

  return outcome;
}

/** The last few, for the guest list page. */
export async function recentEmails(invitationId: string, take = 50) {
  return prisma.emailMessage.findMany({
    where: { invitationId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { guest: { select: { name: true } } },
  });
}
