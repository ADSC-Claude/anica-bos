import type { Settings } from './settings-defaults';
import { cancellationPolicyText } from './booking-policy';

/**
 * The refund policy a guest reads, built from the numbers that enforce it.
 *
 * Same principle as privacy-notice.ts, and for the same reason: a published
 * policy that has drifted from the software is not a drafting slip, it is a
 * false statement to the person who relied on it. The reservation percentage,
 * the cancellation window and the refund-or-forfeit rule are all read from
 * `Settings`, so changing the rule in Settings → Booking rewrites this page
 * rather than leaving it quietly wrong.
 *
 * The one thing here the code cannot check is how quickly the spa actually
 * returns money, because that is a promise rather than a behaviour — no test
 * can fail when somebody is slow. It is a constant below rather than a setting
 * on purpose: it is a commitment to a customer and to a payment processor, and
 * changing it should be a deliberate edit with the effective date bumped, not
 * a number quietly nudged in an admin screen.
 *
 * Nothing here is legal advice. It exists because PayMongo, like every card
 * acquirer, requires a refund policy to be publicly readable before it will
 * process payments — and because a guest about to hand over a deposit deserves
 * to know what happens to it without having to ask.
 */

export type PolicySection = {
  heading: string;
  /** Paragraphs, rendered in order. */
  body: string[];
  /** Optional bulleted list, rendered after the paragraphs. */
  bullets?: string[];
};

/**
 * Bumped by hand whenever the wording changes in a way a guest would care
 * about, so somebody who read it in September can tell whether the document
 * they are looking at is the one they agreed to.
 */
export const REFUND_POLICY_EFFECTIVE = '7 September 2026';

/**
 * How long an approved refund takes to reach the guest.
 *
 * Seven covers the realistic spread: a GCash refund through PayMongo usually
 * lands within a few days, while a card refund depends on the issuing bank and
 * can take five to ten. Promising faster than the slowest link in that chain
 * means breaking the promise for reasons the spa cannot control.
 */
export const REFUND_DAYS = 7;

function hoursPhrase(hours: number): string {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

export function buildRefundPolicy(s: Settings): PolicySection[] {
  const spa = s['business.name'];
  const email = s['business.email'];
  const phone = s['business.contact'];
  const percent = s['booking.depositPercent'];
  const hours = s['booking.cancellationHours'];
  const refundsInTime = s['booking.depositOnCancel'] === 'REFUND' && hours > 0;

  return [
    {
      heading: 'What you pay when you book online',
      body: [
        `Booking online asks for a reservation fee of ${percent}% of the treatment price. It is not an ` +
          `extra charge — it comes off what you owe, and the remaining ${100 - percent}% is settled at the spa ` +
          `after your treatment.`,
        `The fee exists to hold a specific therapist and a specific room at a specific hour. Until it is ` +
          `paid the slot stays open to everybody else, and an unpaid booking is released automatically ` +
          `after ${s['booking.expiryMinutes']} minutes.`,
      ],
    },
    {
      heading: 'When the reservation fee is refundable',
      body: [
        cancellationPolicyText({
          windowHours: hours,
          inTimePolicy: s['booking.depositOnCancel'],
        }),
        refundsInTime
          ? `The window is not arbitrary. It is roughly how much notice ${spa} needs to offer your hour to ` +
            `somebody else the same day. Cancel with that much warning and the spa loses nothing, so neither ` +
            `should you.`
          : `If this is not what you were told when you booked, tell us — the terms you agreed to at the time ` +
            `are the terms that apply to your booking.`,
      ],
      bullets: refundsInTime
        ? [
            `Cancelled at least ${hoursPhrase(hours)} ahead — reservation fee refunded in full.`,
            `Cancelled inside ${hoursPhrase(hours)} — reservation fee is not refunded.`,
            'Did not arrive and did not tell us — reservation fee is not refunded.',
            `Cancelled by ${spa} for any reason — reservation fee refunded in full, however late.`,
          ]
        : [
            'Reservation fees are not refundable once a booking is confirmed.',
            `Cancelled by ${spa} for any reason — reservation fee refunded in full, however late.`,
          ],
    },
    {
      heading: 'If we cancel on you',
      body: [
        `If ${spa} cancels — a therapist falls ill, equipment fails, a storm closes the branch — your ` +
          `reservation fee is refunded in full. There is no notice period on this and no discretion in it: ` +
          `the booking failed on our side, so the money comes back.`,
        'We will also offer you the first slot that suits you, but taking it is your choice and not a ' +
          'condition of the refund.',
      ],
    },
    {
      heading: 'Treatments you have already had',
      /**
       * An open door, deliberately not a menu.
       *
       * The spa does put things right when a treatment goes wrong — a redo, or
       * money back where that is fairer — and the manager has room to be
       * generous. But that is decided in the room, on the facts, by somebody
       * who was there. Publishing it as an entitlement changes what it is: a
       * written promise of "a refund in part or in full" is read as an offer
       * and argued with, by exactly the people it was not written for.
       *
       * So the wording invites the complaint and commits to hearing it, names
       * the likely remedy without promising it, and stops there. The goodwill
       * stays where goodwill works, which is unadvertised.
       *
       * "Arranged with the spa directly" is also literally true of the
       * mechanism: a completed treatment is settled at the counter, so putting
       * it right is the spa's own affair and does not run back through the
       * payment gateway the way a reservation fee does.
       */
      body: [
        `A treatment that has been given is not refunded automatically — the therapist's hour and the room were used, and that part cannot be undone. But it is not the end of the conversation either.`,
        `If you were unhappy with your treatment, tell us: the branch manager before you leave if you can, or by email within seven days. We will go through it with you and agree what to do, and more often than not that means putting the treatment right rather than money changing hands.`,
        `Anything settled this way is arranged with the spa directly.`,
      ],
    },
    {
      heading: 'How to ask for a refund',
      body: [
        'Cancelling a booking does not by itself move money. Tell us you want the fee back and we will ' +
          'return it — the fastest way is to email, so there is a written record on both sides.',
      ],
      bullets: [
        `Email ${email}, or call ${phone} during opening hours.`,
        'Give your booking reference — it is the ANC- code on your confirmation email.',
        'Give the name and mobile number the booking was made under.',
        'Say briefly what happened. You do not need to justify a cancellation made in time.',
      ],
    },
    {
      heading: 'How long it takes, and where the money goes',
      body: [
        `Approved refunds are returned within ${REFUND_DAYS} banking days of approval, to the same payment ` +
          `method you paid with. A GCash payment goes back to that GCash account; a card payment goes back ` +
          `to that card.`,
        `We cannot send a refund somewhere else — not to a different account, not in cash at the counter. ` +
          `That is a rule of the payment processor rather than a preference of ours, and it exists to stop ` +
          `stolen cards being cashed out through businesses like this one.`,
        `A card refund can take a little longer than ${REFUND_DAYS} banking days to show up on a statement. That last step belongs to your bank rather than to us or to our payment processor, and none of us can hurry it.`,
        `If nothing has arrived after ${REFUND_DAYS} banking days, contact us anyway. We will send you proof the refund was issued, which is the thing your bank will ask you for.`,
      ],
    },
    {
      heading: 'If you think we have got it wrong',
      body: [
        `Tell us first — email ${email} or call ${phone}, and ask for the branch manager. Most disagreements ` +
          `here are about a fact rather than a principle, and a look at the booking record usually settles it.`,
        'If you are still not satisfied, you keep every right you have under Philippine consumer law, ' +
          'including complaining to the Department of Trade and Industry. Nothing in this policy reduces ' +
          'those rights, and nothing in it stops you disputing a charge with your own bank.',
      ],
    },
    {
      heading: 'Changes to this policy',
      body: [
        `This version took effect on ${REFUND_POLICY_EFFECTIVE}. The terms that apply to your booking are ` +
          `the ones published on the day you booked, so a change made afterwards does not reach back and ` +
          `alter what you agreed to.`,
      ],
    },
  ];
}
