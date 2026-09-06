import 'server-only';
import { prisma } from './db';
import { HttpError } from './errors';
import { getSettings } from './settings';
import { render } from './email';
import { sendSms, phMobile, creditsFor } from './sms';
import { invitationUrl } from './app-url';
import { formatDate } from './datetime';
import { displayTitle } from './sections';
import { contentOf } from './invitations';
import type { Occasion, Tier } from '@prisma/client';

/**
 * RSVP reminders by text.
 *
 * Two rules keep a blast from being a mistake you cannot take back. A guest
 * who was texted in the last day is skipped, because a second reminder inside
 * an afternoon reads as nagging and costs another credit; and a guest who has
 * already answered is skipped unless the sender asks for everyone, because the
 * commonest reason to text is precisely the people who have not.
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
 * Who would be texted, what they would receive, and what it would cost —
 * worked out before anything is sent so the sender can be shown the bill.
 */
export async function planReminders(
  invitation: PlanInvitation,
  opts: { everyone?: boolean } = {},
): Promise<ReminderPlan> {
  const settings = await getSettings();
  const template = settings['sms.rsvpReminder'];
  const content = contentOf(invitation.content);
  // The title the couple gave the invitation, not the one derived from the
  // cover fields: those differ (the derived wedding title is bride-first), and
  // a reminder that names the hosts differently from the page reads as a
  // mistake.
  const hosts = invitation.title.trim() || displayTitle(invitation.occasion, content);
  const eventDate = invitation.eventAt ? formatDate(invitation.eventAt) : '';

  const since = new Date(Date.now() - QUIET_HOURS * 60 * 60 * 1000);
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
