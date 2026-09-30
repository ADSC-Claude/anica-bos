import 'server-only';
import { z } from 'zod';
import type { Occasion, Tier } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';
import { loadPublic, rsvpOpen } from './invitations';
import { guestByToken } from './guests';
import { hasFeature, entitled, type Entitled } from './tiers';
import { notify } from './notifications';
import { sendEmail, render, baseVars, mailable } from './email';
import { getSettings, type Settings } from './settings';
import { str, rows, bool, guestGroups, displayTitle } from './sections';
import { contentOf } from './invitations';
import { contactPatch, plainAddress } from './contacts';
import { attendeesOf } from './attendees';
import { realGuestIds } from './guest-picker';
import { claimedGuestIds } from './guest-match';
import { seatsHeld, awaitingDecision, cameFromLink } from './seats';
import { invitationUrl } from './app-url';
import { formatDate } from './datetime';

/**
 * The public writes: an RSVP and a guestbook entry. No login, so the defences
 * are a per-IP rate limit (counted in the database — no extra service), a
 * honeypot field, and hard caps on every string. A guest with a personal link
 * updates their own row in place; an open-form guest creates one.
 */

const WINDOW_MS = 60 * 60 * 1000;

/**
 * How many writes an hour will take, and from whom.
 *
 * The old rule was one number counted per IP address: ten wishes an hour, or
 * twenty replies, from one address, across every invitation on the site. It
 * was written imagining a bot at a keyboard, and at a reception it describes
 * the guests instead. Eighty people at one venue are eighty people on one
 * wifi, which is one address — so the eleventh person to write a wish at the
 * party is told they have sent too many, having sent one. The people it fails
 * are exactly the people the guestbook is for.
 *
 * So the same three windows the photo album already uses, for the same
 * reasons (see photoLimit in src/lib/photos.ts, which this deliberately
 * mirrors rather than inventing a second shape):
 *
 *  - a guest who came through their own personal link is counted as
 *    themselves, and the address they share with the room is not counted
 *    against them at all;
 *  - everyone else is counted by address, at a room's worth rather than a
 *    person's;
 *  - and above both, a ceiling on the invitation itself, which is the flood
 *    actually worth stopping — one guestbook filling in minutes.
 *
 * Counted per invitation, not site-wide: a busy wedding must not lock a guest
 * of a different couple out of replying from the same office.
 *
 * None of this is the real defence against a determined bot. That is the
 * approval switch, and for a guestbook running without one — which is how
 * hers runs, deliberately — it is the couple's Delete. These numbers exist to
 * stop a flood, not an attacker.
 */

/**
 * One guest, through their own personal link, in an hour.
 *
 * The wish allowance is the album's forty rather than the reply's ten,
 * because the two are not the same act. A reply is one decision, amended now
 * and then; wishes are a conversation — a lola writes one for the child, one
 * for the parents and one she thought of afterwards, and a ninang at the
 * reception types as she goes. Ten of those is a number a real guest reaches
 * on an ordinary evening, and being told to come back later is the last thing
 * that should happen to somebody taking the trouble to write.
 *
 * It costs little to be generous here: text is cheap, the wall shows three at
 * a time, and the rest are a page away rather than a scroll down the
 * invitation. What is left of a flood is a few taps of Delete for the hosts.
 */
const RSVP_PER_GUEST_PER_HOUR = 10;
const GUESTBOOK_PER_GUEST_PER_HOUR = 40;

/** One address, on one invitation, in an hour — a venue's wifi, not a person. */
const RSVP_PER_IP_PER_HOUR = 60;
const GUESTBOOK_PER_IP_PER_HOUR = 120;

/** One invitation in an hour, however many phones are writing to it. */
const RSVP_PER_INVITATION_PER_HOUR = 150;
const GUESTBOOK_PER_INVITATION_PER_HOUR = 200;

/** What each window has already seen when a write arrives. */
export type WriteCounts = {
  /** This personal link's own writes in the window, or null when none was used. */
  guest: number | null;
  /** Writes from this address to this invitation in the window. */
  ip: number;
  /** Writes to this invitation in the window, from every address. */
  invitationHour: number;
};

/**
 * Whether this write is one too many, and what to tell the person.
 *
 * Pure, so the thresholds can be tested without filling a database, and so
 * the wording lives in one place. What it says matters as much as what it
 * refuses: "Too many submissions from this connection" told a guest they had
 * sent too many when the truth was that the venue had, which reads as an
 * accusation and leaves them nothing to do. Each of these says whose
 * allowance ran out, and whether waiting will help.
 */
export function writeLimit(kind: 'rsvp' | 'guestbook', counts: WriteCounts): { status: number; message: string } | null {
  const perGuest = kind === 'rsvp' ? RSVP_PER_GUEST_PER_HOUR : GUESTBOOK_PER_GUEST_PER_HOUR;
  const perIp = kind === 'rsvp' ? RSVP_PER_IP_PER_HOUR : GUESTBOOK_PER_IP_PER_HOUR;
  const perInvitation = kind === 'rsvp' ? RSVP_PER_INVITATION_PER_HOUR : GUESTBOOK_PER_INVITATION_PER_HOUR;

  if (counts.guest !== null) {
    if (counts.guest >= perGuest) {
      return { status: 429, message: 'That is a lot of messages at once. Please try again in a little while.' };
    }
  } else if (counts.ip >= perIp) {
    return { status: 429, message: 'Lots of messages are coming in from this network right now. Please try again in a few minutes.' };
  }
  if (counts.invitationHour >= perInvitation) {
    return { status: 429, message: 'This invitation is receiving a lot of messages right now. Please try again in a few minutes.' };
  }
  return null;
}

async function rateLimit(kind: 'rsvp' | 'guestbook', ip: string, invitationId: string, token?: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const where = { invitationId, createdAt: { gte: since } };
  const table = kind === 'rsvp' ? prisma.rsvp : prisma.guestbookEntry;

  // A personal link identifies the writer, so they are counted as themselves
  // rather than as the room. Both tables carry the guest who wrote the row
  // now, so one relation answers for a reply and for a wish alike.
  //
  // The caller has already checked that the token is this invitation's. That
  // matters: counted inside invitationId as this is, a token borrowed from
  // another event would match nothing, and so would hand its holder a fresh
  // allowance and excuse them the address ceiling as well.
  const counted = table as typeof prisma.guestbookEntry;
  const guest = token ? await counted.count({ where: { ...where, guest: { token } } }) : null;

  const [ipCount, invitationHour] = await Promise.all([
    counted.count({ where: { ...where, ip } }),
    counted.count({ where }),
  ]);

  const problem = writeLimit(kind, { guest, ip: ipCount, invitationHour });
  if (problem) throw new HttpError(problem.status, problem.message);
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
    .array(z.union([z.string().trim().max(120), z.object({ name: z.string().trim().max(120), relation: z.string().trim().max(20).optional(), guestId: z.string().max(40).optional() })]))
    .max(20)
    .optional(),
  /**
   * The row on the couple's own guest list this reply is for, when the guest
   * picked their name off it instead of typing one.
   *
   * A claim, not a credential. It says "I am the Ana Dela Cruz on your list",
   * which is worth recording and is not worth trusting: anybody can tap
   * anybody. So it is checked for being a row on *this* invitation and then
   * used only to attribute the reply. What it never does is unlock the seat
   * allotment or write a phone number onto that row — both of those need the
   * token, where the link itself is the evidence.
   */
  guestId: z.string().max(40).optional(),
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
  await rateLimit('rsvp', ip, invitation.id, input.token);

  const content = contentOf(invitation.content);
  const rsvpSection = content.rsvp;
  const guest = input.token ? await guestByToken(input.token) : null;
  if (input.token && (!guest || guest.invitationId !== invitation.id)) throw new HttpError(404, 'That personal link is not valid.');

  const personal = Boolean(guest) && entitled(invitation, 'rsvp.personalLinks');
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
  const claimed = attendeesOf(input.attendees ?? []).slice(0, seats || 1);

  /*
   * Every id the page sent, checked against this invitation's own list.
   *
   * The reply's own and the companions' in one round trip, because they are
   * the same question asked of the same table. An id that is not a row here —
   * stale, mistyped, or somebody having a go at another couple's guest list —
   * is dropped and the reply saved without it. Losing the attribution is a
   * nuisance; losing the RSVP is a guest who thinks they have replied and has
   * not.
   */
  const picker = bool(rsvpSection, 'nameFromList');
  const real = picker
    ? await realGuestIds(invitation.id, [...(input.guestId ? [input.guestId] : []), ...claimed.map((a) => a.guestId ?? '')])
    : new Set<string>();
  const attendees = claimed.map((a) => (a.guestId && real.has(a.guestId) ? a : { name: a.name, relation: a.relation }));

  /*
   * Which guest row this reply belongs to.
   *
   * The token wins where there is one: it is the couple's own link, handed to
   * one person, and it is the only evidence of identity this form has. A
   * picked name comes second, and only stands in when no token was used.
   */
  const picked = !guest && input.guestId && real.has(input.guestId) ? input.guestId : null;

  const data = {
    invitationId: invitation.id,
    guestId: guest?.id ?? picked,
    /*
     * Where this reply came from, written down rather than inferred.
     *
     * It used to be inferable: a `guestId` could only have come from a token,
     * so the guest list read one as "personal link" and the seat queue read
     * one as already vetted. The picker broke both of those in the same
     * stroke — a picked name now sets `guestId` too, and it is nothing like
     * the same evidence. Anyone holding the link can tap anyone's name, and
     * no allotment was applied when they did.
     *
     * So the distinction is stored. See wasVetted() in seats.ts for the half
     * of it that decides whether a reply skips the couple's seat review.
     */
    source: (guest ? 'LINK' : picked ? 'PICKED' : 'TYPED') as 'LINK' | 'PICKED' | 'TYPED',
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

  /*
   * The reply to update rather than add to, where there is one.
   *
   * A personal link is the guest, so their row is found by it and their
   * second answer replaces their first — that is what "update your reply on
   * the same link" promises.
   *
   * A picked name is not the guest, so it cannot do the same: anyone tapping
   * "Ana Dela Cruz" would overwrite the real Ana's answer. It is matched on
   * the name *and* the connection it came from, which is enough for the one
   * case worth handling — Ana correcting her own reply a minute later on her
   * own phone — and no help at all to somebody else. A stranger picking her
   * name writes a new row, which the couple can see and settle; that is the
   * safe direction for this to fail in.
   */
  const existing = guest
    ? await prisma.rsvp.findFirst({ where: { guestId: guest.id } })
    : picked
      ? await prisma.rsvp.findFirst({ where: { invitationId: invitation.id, guestId: picked, ip }, orderBy: { createdAt: 'desc' } })
      : null;
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

  // And tell the guest, where the invitation has it. A reply into a form that
  // says nothing back is the commonest reason somebody replies twice.
  await confirmToGuest(invitation, saved, guest, personal);

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
 * The link a confirmation carries, and the sentence that introduces it.
 *
 * One function because they are one decision. The link only carries a token
 * when the reply came through a personal one, and that token is the only
 * thing that lets submitRsvp() recognise a second answer as the same guest
 * editing their first. Where it is missing, "update your reply on the same
 * link" is a promise the link cannot keep — following it makes a second row,
 * and the couple is left with the same person twice and no way to tell which
 * answer they meant.
 *
 * Deciding both here is what stops them drifting apart: a change to who gets
 * a token is a change to what we may tell them, and separated by thirty lines
 * those two would have gone on being changed one at a time.
 */
export function confirmationLink(
  settings: Settings,
  vars: Record<string, string>,
  slug: string,
  token: string | undefined,
): { link: string; updateLine: string } {
  const line = token
    ? settings['email.rsvpConfirmationUpdate']
    : settings['email.rsvpConfirmationNoUpdate'];
  // Rendered here rather than left to the body: render() replaces in one pass
  // and does not look at what it substituted, so a {{hosts}} arriving inside
  // this line would reach the guest verbatim, braces and all.
  return { link: invitationUrl(slug, token), updateLine: render(line, vars) };
}

/**
 * The receipt a guest gets for accepting.
 *
 * Included with the packages that carry it, and bought on its own below them
 * with a guest communication suite — which is the honest difference: the wire
 * costs the same, what is being sold is our doing it for them. So this asks
 * what the invitation may do rather than what its package includes.
 *
 * Nothing here may stop a reply being recorded. A guest who answered has
 * answered whatever the mail server thought of it, so the send is attempted
 * after the row is saved and its failure is written down rather than raised.
 */
async function confirmToGuest(
  invitation: { id: string; slug: string; tier: Tier; addOns: string[]; title: string; occasion: Occasion; content: unknown; eventAt: Date | null },
  saved: { id: string; name: string; response: string; seats: number; seatsApproved?: number | null; email: string },
  guest: { id: string; token: string; salutation: string } | null,
  vetted: boolean,
) {
  if (!entitled(invitation, 'rsvp.emailConfirmation')) return;
  // Only the people who are coming. A decline is a kindness the guest has
  // already done the couple, and writing back to say we have noted they will
  // not be there reads as a receipt nobody asked for — worse on the occasions
  // where the reason for declining is not a happy one.
  if (saved.response !== 'ACCEPT') return;
  // And not while the couple has yet to agree the number. A receipt confirming
  // six seats, sent the moment a stranger picked six off a dropdown, is the
  // hardest thing in this system to walk back — the guest has it in writing.
  // decideSeats() sends it once the couple has settled the figure.
  if (awaitingDecision({ response: 'ACCEPT', seats: saved.seats, seatsApproved: saved.seatsApproved }, vetted)) return;
  const address = mailable(plainAddress(saved.email));
  // No address is not a failure to record — there was nobody to write to. The
  // couple's RSVP list says so from the blank, which is the thing they can act
  // on: ask that guest for one.
  if (!address) return;

  // What they are actually holding: the couple's figure where there is one,
  // the guest's where there is not. Never the raw claim once it has been cut.
  const seats = seatsHeld(0, { response: 'ACCEPT', seats: saved.seats, seatsApproved: saved.seatsApproved });

  const content = contentOf(invitation.content);
  const settings = await getSettings();
  // {{response}} is always "coming" now, and stays a variable because the
  // wording is the admin's to edit and their template still names it.
  const vars = {
    guestName: guest?.salutation || saved.name,
    hosts: invitation.title.trim() || displayTitle(invitation.occasion, content),
    eventDate: invitation.eventAt ? formatDate(invitation.eventAt) : '',
    response: 'coming',
    seatsLine: ` for ${seats} seat${seats === 1 ? '' : 's'}`,
  };
  const { link, updateLine } = confirmationLink(settings, vars, invitation.slug, guest?.token);
  const subject = render(settings['email.rsvpConfirmationSubject'], vars);
  const body = render(settings['email.rsvpConfirmation'], { ...vars, link, updateLine });

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

/**
 * The couple's answer to a reply nobody vetted.
 *
 * Setting the number is the whole decision: approving is settling on what the
 * guest asked for, trimming is settling on less, and both write to the same
 * column. There is no separate "rejected" state because there is no such
 * outcome at a Filipino celebration — a party of six becomes a party of two,
 * and the two still come.
 *
 * Once this has run, seatsApproved is no longer null, so the reply leaves the
 * queue whichever number was chosen and nothing asks the couple about it again.
 */
export async function decideSeats(
  invitation: { id: string; slug: string; tier: Tier; addOns: string[]; title: string; occasion: Occasion; content: unknown; eventAt: Date | null },
  rsvpId: string,
  seats: number,
) {
  const reply = await prisma.rsvp.findFirst({
    where: { id: rsvpId, invitationId: invitation.id },
    include: { guest: { select: { id: true, token: true, salutation: true } } },
  });
  if (!reply) throw new HttpError(404, 'That reply is not on this invitation.');
  if (reply.response !== 'ACCEPT') throw new HttpError(400, 'Only an acceptance has seats to settle.');

  const seatsApproved = Math.min(99, Math.max(0, Math.trunc(Number(seats) || 0)));
  const saved = await prisma.rsvp.update({ where: { id: reply.id }, data: { seatsApproved } });

  // Approved at what they asked for — or more — is not news anybody has to
  // brace for, so the receipt goes now, carrying the settled figure.
  //
  // A cut is a different kind of message. "We can only seat two of you" is a
  // sentence the couple has to write in their own voice to somebody they know,
  // and a system that sends it for them automatically at two in the morning is
  // a system that costs them a cousin. messageGuest() sends it when they are
  // ready; nothing goes out here.
  //
  // `vetted` is true because the couple has just done the vetting themselves.
  const trimmed = seatsApproved < reply.seats;
  if (!trimmed) await confirmToGuest(invitation, saved, reply.guest, true);

  return { reply: saved, trimmed, claimed: reply.seats, approved: seatsApproved };
}

/**
 * One message, to one guest, in the couple's own words.
 *
 * Every blast in this codebase takes a whole list and two modes — everybody, or
 * everybody who has not replied. There was no way to write to a single person,
 * which is why a couple who needed to say one careful thing to one guest left
 * the system and opened Messenger, and why nothing about that conversation was
 * ever recorded beside the reply it was about.
 *
 * E-mail only, and that is deliberate rather than a gap: it is the one channel
 * we can send down ourselves at no cost. A text would be charged per message by
 * the gateway and the sender name is not registered yet. The guest with no
 * address is handed back to the couple's own phone, which is the honest answer
 * and usually the better one anyway.
 */
export async function messageGuest(invitation: Entitled & { id: string }, rsvpId: string, subject: string, body: string) {
  // Our mail key, our cost, so it is sold rather than given away. The couple is
  // never left without a way to send: the drawer's Viber, WhatsApp, Messages
  // and Messenger buttons open their own app with the words already in it, and
  // those are free on every package because their phone does the sending.
  if (!entitled(invitation, 'rsvp.emailConfirmation'))
    throw new HttpError(
      403,
      'Sending it for you from your invitation’s own address comes with the Exclusive package, or with any reminder pack. Until then, send it from your own Viber, Messenger or Messages with the buttons beside this one.',
    );

  const reply = await prisma.rsvp.findFirst({
    where: { id: rsvpId, invitationId: invitation.id },
    select: { id: true, guestId: true, email: true, name: true },
  });
  if (!reply) throw new HttpError(404, 'That reply is not on this invitation.');

  const address = mailable(plainAddress(reply.email));
  if (!address) throw new HttpError(400, 'That guest left no e-mail address — send it from your own phone instead.');

  const cleanSubject = subject.trim().slice(0, 200);
  const cleanBody = body.trim().slice(0, 4000);
  if (!cleanSubject || !cleanBody) throw new HttpError(400, 'Write a subject and a message first.');

  const result = await sendEmail({ to: address, subject: cleanSubject, text: cleanBody });
  await prisma.emailMessage.create({
    data: {
      invitationId: invitation.id,
      guestId: reply.guestId,
      // Filed against the reply, so the couple's list can show that this guest
      // was written to and does not need chasing twice.
      rsvpId: reply.id,
      to: address,
      subject: cleanSubject,
      body: cleanBody,
      status: result.status === 'sent' ? 'SENT' : result.status === 'logged' ? 'LOGGED' : 'FAILED',
      error: result.error ?? '',
    },
  });
  return { to: address, name: reply.name, status: result.status };
}

/**
 * Taking one reply off the couple's list.
 *
 * There was no way to do this at all, which was fine while every reply came
 * from somebody who meant it and arrived once. Two things make it necessary.
 * A reply through a plain link cannot be edited — see confirmationLink() — so
 * a guest who answers twice becomes two rows, and until now the couple could
 * only look at both. And a couple testing their own invitation before they
 * send it puts their own name in the list with no way to take it out again.
 *
 * The guest stays. Removing a reply says they have not answered, not that
 * they are not invited: their row on the guest list, their table, their
 * personal link and their token all survive, and the invitation goes back to
 * showing them as waiting. Deleting the guest as well would quietly uninvite
 * somebody the couple only meant to un-answer, and their link would stop
 * working with nothing to say why.
 *
 * What does go is the confirmation we sent about it. Those rows are reachable
 * only through the reply, and once it is gone they are an address and a name
 * on file that nothing can show, act on, or explain — which is the wrong half
 * of a deletion to keep.
 */
export async function deleteReply(invitation: { id: string }, rsvpId: string) {
  // Scoped by invitation as well as id: the id arrives from the browser, and
  // on its own it would delete a reply belonging to somebody else's wedding.
  const reply = await prisma.rsvp.findFirst({
    where: { id: rsvpId, invitationId: invitation.id },
    select: { id: true, name: true },
  });
  if (!reply) throw new HttpError(404, 'That reply is not on this invitation.');

  // Together, so a failure between the two cannot leave the confirmations
  // deleted and the reply they belong to still standing.
  await prisma.$transaction([
    prisma.emailMessage.deleteMany({ where: { rsvpId: reply.id } }),
    prisma.rsvp.delete({ where: { id: reply.id } }),
  ]);

  return { name: reply.name };
}

export const guestbookSchema = z.object({
  slug: z.string().min(1).max(80),
  token: z.string().max(80).optional(),
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

  // A personal link is not required — most wishes are left from the one link
  // the hosts shared with everybody — but a link that is given has to be this
  // invitation's, the same rule the reply and the album apply. Checked before
  // anything is counted, because the allowance below is spent in the writer's
  // name and a borrowed token must not be able to spend it.
  let guestId: string | null = null;
  if (input.token) {
    const guest = await guestByToken(input.token);
    if (!guest || guest.invitationId !== invitation.id) throw new HttpError(404, 'That personal link is not valid.');
    guestId = guest.id;
  }

  await rateLimit('guestbook', ip, invitation.id, guestId ? input.token : undefined);
  const moderated = bool(gb, 'moderated');
  const entry = await prisma.guestbookEntry.create({
    data: { invitationId: invitation.id, name: input.name, message: input.message, approved: !moderated, ip, guestId },
  });
  await notify(invitation.userId, `${input.name} left a wish`, str(gb, 'prompt') || input.message.slice(0, 80), `/account/invitations/${invitation.id}/guestbook`);
  return { entry, pending: moderated };
}

/**
 * The couple saying that somebody in a reply is somebody on their list.
 *
 * "there is a rsvp already for pedro, that what im referring to this tab, it
 * doesnt click to the list i have now"
 *
 * Her first real reply arrived at 2:47 and her guest list at 4:04. The reply
 * carried the name "Pedro german jr" and nothing else, and when the list
 * turned up nothing joined the two: Pedro sat on the guest list as "no reply
 * yet" while his acceptance sat on the RSVP tab attached to nobody. The
 * headcount was wrong twice over, in opposite directions.
 *
 * The same is true of everyone he brought. Pedro's reply carried two
 * companions typed by hand, "Reina catherine buena" and a child, and both of
 * them are rows on the list as well — a party of three answers three rows or
 * it answers one and leaves the couple chasing two ghosts. So this takes a
 * position in the party rather than only the reply: 0 is the guest at the head
 * of it, 1 and up are the people they are bringing.
 *
 * Nothing matches automatically, and that is deliberate. Marking the wrong
 * lola as coming is worse than leaving a reply unattached, so rankGuests()
 * offers a shortlist and a person presses the button. What lands here is
 * already a decision.
 *
 * Recorded as MATCHED rather than PICKED or LINK, because it is neither the
 * guest proving who they are nor the guest choosing off the list — it is the
 * couple's reading of it. Like PICKED it grants nothing: no allotment is
 * unlocked and the reply stays in the seat queue if it was there, because
 * agreeing who somebody is is not agreeing to their three seats. A companion
 * carries no source of its own; the reply's source says how the reply arrived,
 * and a companion did not arrive separately.
 *
 * `guestId: null` unmatches, for the correction that follows a wrong press.
 */
export async function matchAttendee(
  invitation: { id: string },
  input: { rsvpId: string; index: number; guestId: string | null; who: string },
) {
  const { rsvpId, index, guestId } = input;
  const reply = await prisma.rsvp.findFirst({
    where: { id: rsvpId, invitationId: invitation.id },
    select: { id: true, name: true, attendees: true, source: true, guestId: true },
  });
  if (!reply) throw new HttpError(404, 'That reply is not on this invitation.');

  // A reply that came through a personal link is already the guest, by the
  // one piece of evidence this system has. Re-pointing it by hand would throw
  // that away for a guess. Only the head of it, though: who that guest
  // brought is as unverified on a personal link as on any other reply, and
  // those companions are exactly the ones worth joining to the list.
  if (index === 0 && cameFromLink(reply)) {
    throw new HttpError(400, 'That reply came through a personal link, so it already belongs to a guest.');
  }

  const party = attendeesOf(reply.attendees);
  const person = party[index];
  if (!person) throw new HttpError(404, 'That person is no longer on this reply.');
  /*
   * The party is addressed by position, and a position means nothing if the
   * reply has been edited since the page was drawn. Cheap insurance against
   * the one mistake that matters here: quietly marking somebody else's lola
   * as attending because a row moved up by one.
   */
  if (person.name.trim().toLowerCase() !== input.who.trim().toLowerCase()) {
    throw new HttpError(409, 'This reply has changed since the page loaded. Reload and try again.');
  }

  if (guestId) {
    const guest = await prisma.guest.findFirst({ where: { id: guestId, invitationId: invitation.id }, select: { id: true, name: true } });
    if (!guest) throw new HttpError(404, 'That name is not on this guest list.');
    /*
     * One name on the list, one place at one table. The claim may already be
     * held by another reply or by another seat in this same party, and both
     * are the same mistake: two bodies where the list has one person. See
     * claimedGuestIds().
     */
    const others = await prisma.rsvp.findMany({
      where: { invitationId: invitation.id },
      select: { id: true, name: true, guestId: true, attendees: true },
      orderBy: { createdAt: 'asc' },
    });
    const claim = claimedGuestIds(others.map((r) => ({ ...r, attendees: attendeesOf(r.attendees) }))).get(guestId);
    if (claim && !(claim.replyId === rsvpId && claim.index === index)) {
      throw new HttpError(
        400,
        claim.replyId === rsvpId
          ? `${guest.name} is already someone else on this reply.`
          : claim.index === 0
            ? `${guest.name} has already replied.`
            : `${guest.name} is already on ${claim.by}'s reply.`,
      );
    }
  }

  /*
   * The head of the party carries the id in two places, and both are written
   * together.
   *
   * answeredFor() reads a party out of the attendee list, and the couple's
   * guest list reads "replied" from it. Matching the reply without tagging
   * the person at the head of it would leave the guest list still saying "no
   * reply yet" for the very guest just matched.
   */
  const attendees = party.map((a, i) =>
    i === index ? (guestId ? { ...a, guestId } : { name: a.name, relation: a.relation }) : a,
  );

  const head = index === 0;
  const updated = await prisma.rsvp.update({
    where: { id: reply.id },
    data: {
      attendees: attendees as never,
      ...(head ? { guestId, source: (guestId ? 'MATCHED' : 'TYPED') as 'MATCHED' | 'TYPED' } : {}),
    },
    select: { id: true, name: true, guestId: true, source: true },
  });
  return { ...updated, index, name: person.name };
}
