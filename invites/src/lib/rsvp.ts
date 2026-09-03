import 'server-only';
import { z } from 'zod';
import { prisma } from './db';
import { HttpError } from './errors';
import { loadPublic, rsvpOpen } from './invitations';
import { guestByToken } from './guests';
import { hasFeature } from './tiers';
import { notify } from './notifications';
import { sendEmail, render, baseVars } from './email';
import { getSettings } from './settings';
import { str, rows, bool } from './sections';
import { contentOf } from './invitations';

/**
 * The public writes: an RSVP and a guestbook entry. No login, so the defences
 * are a per-IP rate limit (counted in the database — no extra service), a
 * honeypot field, and hard caps on every string. A guest with a personal link
 * updates their own row in place; an open-form guest creates one.
 */

const WINDOW_MS = 60 * 60 * 1000;
const RSVP_PER_IP_PER_HOUR = 20;
const GUESTBOOK_PER_IP_PER_HOUR = 10;

async function rateLimit(kind: 'rsvp' | 'guestbook', ip: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const count =
    kind === 'rsvp'
      ? await prisma.rsvp.count({ where: { ip, createdAt: { gte: since } } })
      : await prisma.guestbookEntry.count({ where: { ip, createdAt: { gte: since } } });
  const limit = kind === 'rsvp' ? RSVP_PER_IP_PER_HOUR : GUESTBOOK_PER_IP_PER_HOUR;
  if (count >= limit) throw new HttpError(429, 'Too many submissions from this connection. Please try again later.');
}

export const rsvpSchema = z.object({
  slug: z.string().min(1).max(80),
  token: z.string().max(80).optional(),
  name: z.string().trim().min(1, 'Please tell us your name.').max(120),
  response: z.enum(['ACCEPT', 'DECLINE']),
  seats: z.coerce.number().int().min(0).max(20).optional(),
  attendees: z.array(z.string().trim().max(120)).max(20).optional(),
  mealChoice: z.string().trim().max(60).optional(),
  dietary: z.string().trim().max(500).optional(),
  message: z.string().trim().max(1000).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  /** Honeypot. Bots fill it; people never see it. */
  website: z.string().max(0).optional(),
});

export type RsvpInput = z.infer<typeof rsvpSchema>;

export async function submitRsvp(input: RsvpInput, ip: string) {
  const invitation = await loadPublic(input.slug);
  if (!invitation || invitation.expired) throw new HttpError(404, 'That invitation is no longer available.');
  if (!rsvpOpen(invitation)) throw new HttpError(400, 'RSVP has closed for this event.');
  await rateLimit('rsvp', ip);

  const content = contentOf(invitation.content);
  const rsvpSection = content.rsvp;
  const guest = input.token ? await guestByToken(input.token) : null;
  if (input.token && (!guest || guest.invitationId !== invitation.id)) throw new HttpError(404, 'That personal link is not valid.');

  const personal = Boolean(guest) && hasFeature(invitation.tier, 'rsvp.personalLinks');
  const accepting = input.response === 'ACCEPT';

  // Seats: capped by the allotment on a personal link (plus one if allowed).
  let seats = accepting ? Math.max(1, input.seats ?? 1) : 0;
  if (guest && personal) {
    const cap = guest.seatsAllotted + (guest.plusOneAllowed ? 1 : 0);
    if (seats > cap) throw new HttpError(400, `We have reserved ${cap} seat${cap === 1 ? '' : 's'} for you.`);
  } else if (!bool(rsvpSection, 'showSeats')) {
    seats = accepting ? 1 : 0;
  }

  const meal = input.mealChoice ?? '';
  const choices = rows<{ label: string }>(rsvpSection, 'mealChoices').map((m) => m.label);
  if (meal && hasFeature(invitation.tier, 'rsvp.meal') && choices.length && !choices.includes(meal)) throw new HttpError(400, 'Pick one of the meal choices.');

  const attendees = (input.attendees ?? []).map((a) => a.trim()).filter(Boolean).slice(0, seats || 1);
  const data = {
    invitationId: invitation.id,
    guestId: guest?.id ?? null,
    name: input.name,
    response: input.response,
    seats,
    attendees: attendees as never,
    mealChoice: hasFeature(invitation.tier, 'rsvp.meal') ? meal : '',
    dietary: input.dietary ?? '',
    message: input.message ?? '',
    phone: input.phone ?? '',
    email: input.department ? `${input.email ?? ''}${input.email ? ' · ' : ''}${input.department}` : input.email ?? '',
    ip,
  };

  const existing = guest ? await prisma.rsvp.findFirst({ where: { guestId: guest.id } }) : null;
  const saved = existing
    ? await prisma.rsvp.update({ where: { id: existing.id }, data })
    : await prisma.rsvp.create({ data });

  // Tell the host, but not on every edit of the same response.
  if (!existing) {
    const owner = await prisma.user.findUnique({ where: { id: invitation.userId } });
    if (owner) {
      const label = accepting ? 'Accepted' : 'Declined';
      await notify(owner.id, `${input.name} ${label.toLowerCase()}`, `${invitation.title} · ${seats} seat(s)`, `/account/invitations/${invitation.id}/rsvps`);
      const s = await getSettings();
      await sendEmail({
        to: owner.email,
        subject: `RSVP: ${input.name} — ${label}`,
        text: render(s['email.rsvpReceived'], {
          ...(await baseVars()),
          customerName: owner.name,
          guestName: input.name,
          invitationTitle: invitation.title,
          response: label,
          seats,
          invitationId: invitation.id,
        }),
      });
    }
  }
  return saved;
}

export const guestbookSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().trim().min(1, 'Please tell us your name.').max(80),
  message: z.string().trim().min(2, 'Write a little something.').max(600),
  website: z.string().max(0).optional(),
});

export async function submitGuestbook(input: z.infer<typeof guestbookSchema>, ip: string) {
  const invitation = await loadPublic(input.slug);
  if (!invitation || invitation.expired) throw new HttpError(404, 'That invitation is no longer available.');
  if (!hasFeature(invitation.tier, 'guestbook')) throw new HttpError(400, 'This invitation has no guestbook.');
  const gb = contentOf(invitation.content).guestbook;
  if (!bool(gb, 'enabled')) throw new HttpError(400, 'The guestbook is closed.');
  await rateLimit('guestbook', ip);
  const moderated = bool(gb, 'moderated');
  const entry = await prisma.guestbookEntry.create({
    data: { invitationId: invitation.id, name: input.name, message: input.message, approved: !moderated, ip },
  });
  await notify(invitation.userId, `${input.name} left a wish`, str(gb, 'prompt') || input.message.slice(0, 80), `/account/invitations/${invitation.id}/guestbook`);
  return { entry, pending: moderated };
}
