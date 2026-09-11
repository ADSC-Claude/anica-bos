import 'server-only';
import { z } from 'zod';
import type { Occasion, Tier } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';
import { loadPublic, rsvpOpen } from './invitations';
import { guestByToken } from './guests';
import { hasFeature } from './tiers';
import { notify } from './notifications';
import { sendEmail, render, baseVars, mailable } from './email';
import { getSettings } from './settings';
import { str, rows, bool, guestGroups, displayTitle } from './sections';
import { contentOf } from './invitations';
import { contactPatch, plainAddress } from './contacts';
import { attendeesOf } from './attendees';
import { invitationUrl } from './app-url';
import { formatDate } from './datetime';

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
  /**
   * The party, the guest first. Objects carry the relationship each companion
   * is to the guest; a bare string is still accepted because an older page
   * still open in somebody's browser will send one.
   */
  attendees: z
    .array(z.union([z.string().trim().max(120), z.object({ name: z.string().trim().max(120), relation: z.string().trim().max(20).optional() })]))
    .max(20)
    .optional(),
  groupName: z.string().trim().max(60).optional(),
  mealChoice: z.string().trim().max(60).optional(),
  dietary: z.string().trim().max(500).optional(),
  message: z.string().trim().max(1000).optional(),
  /*
   * The number is required, and checked here as well as in the browser:
   * `required` on an input is a courtesy to the person filling it in, not a
   * guarantee about what arrives.
   *
   * The number is only checked for being a plausible one, not for being a
   * Philippine mobile. Half the ninongs at a Manila wedding are texting from
   * Dubai or Daly City, and refusing their reply to protect a text we could
   * not have sent them anyway is the wrong trade. Whether a number can
   * actually be texted is Semaphore's question, and lib/sms.ts already answers
   * it per-number at send time.
   */
  phone: z
    .string({ error: 'Please leave a mobile number.' })
    .trim()
    .min(1, 'Please leave a mobile number.')
    .max(30)
    .regex(/^[\d+][\d\s()+-]{5,}$/, 'That does not look like a mobile number.'),
  /*
   * The address is taken if it is offered and the reply stands without it.
   *
   * It is not labelled optional, though, and that is deliberate rather than an
   * oversight: an "(optional)" beside a field is read as "skip me", and a guest
   * who skips it costs the couple the only way of reaching them that is not a
   * text message. So it is asked plainly, with a line saying what it is for, and
   * a guest who has no address or does not care to leave one simply carries on.
   *
   * Blank is accepted; a few characters that are not an address are not, since
   * that is a typo rather than a decision.
   */
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'That does not look like an e-mail address.')
    .optional(),
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

  // Only a group the couple actually offers is kept — a made-up one would print
  // on their headcount sheet. What is posted therefore has to survive that
  // check, and what does not falls back to the couple's own tag for this guest.
  //
  // Their tag is the better evidence anyway: they know which side a tita is
  // from, and a guest choosing off a list is guessing. It is also the only
  // answer available in two ordinary cases — a couple who tagged the guest list
  // with words they never offered on the form, and a couple who hid the
  // question entirely. Both used to reach the headcount sheet ungrouped while
  // the answer sat on the guest row unread. A guest can still overrule it, but
  // only with a group the couple offers.
  const groups = guestGroups(invitation.occasion, rsvpSection);
  const offered = input.groupName && groups.includes(input.groupName) ? input.groupName : '';
  const groupName = offered || guest?.groupName || '';

  const meal = input.mealChoice ?? '';
  const choices = rows<{ label: string }>(rsvpSection, 'mealChoices').map((m) => m.label);
  if (meal && hasFeature(invitation.tier, 'rsvp.meal') && choices.length && !choices.includes(meal)) throw new HttpError(400, 'Pick one of the meal choices.');

  // Normalised on the way in, so what is stored is one shape whatever the page
  // sent, and a relationship nobody offers is dropped rather than kept.
  const attendees = attendeesOf(input.attendees ?? []).slice(0, seats || 1);
  const data = {
    invitationId: invitation.id,
    guestId: guest?.id ?? null,
    name: input.name,
    response: input.response,
    groupName,
    seats,
    attendees: attendees as never,
    mealChoice: hasFeature(invitation.tier, 'rsvp.meal') ? meal : '',
    dietary: input.dietary ?? '',
    message: input.message ?? '',
    phone: input.phone ?? '',
    email: input.email ?? '',
    // Its own column. A department is not a contact detail, and while it rode
    // along on the address it was both a department on a mailing list and an
    // address nowhere a blast could read.
    department: input.department ?? '',
    ip,
  };

  const existing = guest ? await prisma.rsvp.findFirst({ where: { guestId: guest.id } }) : null;
  const saved = existing
    ? await prisma.rsvp.update({ where: { id: existing.id }, data })
    : await prisma.rsvp.create({ data });

  // What a guest tells us about themselves goes back on their own row, because
  // that is the row a blast reads. Two copies of the same details on file and
  // only one of them read is how a couple ends up buying an SMS add-on for a
  // list the system believes has no numbers in it. The rule for which copy
  // wins is contactPatch, shared with the back-fill so the two cannot drift.
  //
  // input.email is now the same as what is stored — the department has its own
  // column — but the reply's own fields stay the source here, so a later change
  // to how a row is shaped cannot quietly reach the guest list.
  if (guest) {
    const patch = contactPatch({ phone: input.phone, email: input.email }, guest);
    if (Object.keys(patch).length) await prisma.guest.update({ where: { id: guest.id }, data: patch });
  }

  // And tell the guest, on the packages that include it. A reply into a form
  // that says nothing back is the commonest reason somebody replies twice.
  await confirmToGuest(invitation, saved, guest);

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

/**
 * The receipt a guest gets for replying.
 *
 * Included with the packages that carry it; below them the same send is the
 * paid e-mail blast, which is the honest difference — the wire costs the same,
 * what is being sold is our doing it for them.
 *
 * Nothing here may stop a reply being recorded. A guest who answered has
 * answered whatever the mail server thought of it, so the send is attempted
 * after the row is saved and its failure is written down rather than raised.
 */
async function confirmToGuest(
  invitation: { id: string; slug: string; tier: Tier; title: string; occasion: Occasion; content: unknown; eventAt: Date | null },
  saved: { id: string; name: string; response: string; seats: number; email: string },
  guest: { id: string; token: string; salutation: string } | null,
) {
  if (!hasFeature(invitation.tier, 'rsvp.emailConfirmation')) return;
  const address = mailable(plainAddress(saved.email));
  // No address is not a failure to record — there was nobody to write to. The
  // couple's RSVP list says so from the blank, which is the thing they can act
  // on: ask that guest for one.
  if (!address) return;

  const content = contentOf(invitation.content);
  const accepted = saved.response === 'ACCEPT';
  const settings = await getSettings();
  const vars = {
    guestName: guest?.salutation || saved.name,
    hosts: invitation.title.trim() || displayTitle(invitation.occasion, content),
    eventDate: invitation.eventAt ? formatDate(invitation.eventAt) : '',
    response: accepted ? 'coming' : 'not able to come',
    seatsLine: accepted ? ` for ${saved.seats} seat${saved.seats === 1 ? '' : 's'}` : '',
    link: invitationUrl(invitation.slug, guest?.token),
  };
  const subject = render(settings['email.rsvpConfirmationSubject'], vars);
  const body = render(settings['email.rsvpConfirmation'], vars);

  const result = await sendEmail({ to: address, subject, text: body });
  await prisma.emailMessage.create({
    data: {
      invitationId: invitation.id,
      guestId: guest?.id ?? null,
      rsvpId: saved.id,
      to: address,
      subject,
      body,
      status: result.status === 'sent' ? 'SENT' : result.status === 'logged' ? 'LOGGED' : 'FAILED',
      error: result.error ?? '',
    },
  });
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
