import type { MessageKind } from './messages';
import { MESSAGE_KINDS } from './messages';
import { manilaDateKey, addDays } from './datetime';

/**
 * The scheduled messages: what a couple bought, which of them they chose, and
 * which one is due today.
 *
 * This file decides; src/lib/jobs.ts sends. They are kept apart because the
 * decision is arithmetic on dates and add-on codes — testable without a
 * database, a phone or a clock — and the sending is neither.
 *
 * Nothing here reads the campaign rows' prices. What was paid is settled at
 * checkout; what matters afterwards is only which code is on the invitation.
 */

/**
 * The four that go out on a schedule.
 *
 * The RSVP confirmation is deliberately not one of them: it answers one guest
 * the moment they reply, so it is not scheduled, not bought by the band, and
 * not this file's business.
 */
export const CAMPAIGN_KINDS: readonly MessageKind[] = ['sevenDay', 'oneDay', 'sameDay', 'thankYou'];

/** How many days after the event each one goes out. Negative is before. */
const OFFSET: Record<MessageKind, number | null> = {
  rsvpConfirmation: null,
  sevenDay: -7,
  oneDay: -1,
  sameDay: 0,
  thankYou: 1,
};

export type Campaign = {
  /** The add-on code that bought it. */
  code: string;
  /** Text only, or text and e-mail. */
  email: boolean;
  /** How many of the four they may send. */
  allowance: number;
  /** How many guests the band covers. */
  guests: number;
};

const SUITE_ALLOWANCE: Record<string, number> = { BASIC: 1, STANDARD: 2, DELUXE: 3, EXCLUSIVE: 4 };

/**
 * Reads one add-on code as a campaign, or null if it is not one.
 *
 * The codes carry their own meaning — SMS_REMINDER_250, COMMS_DELUXE_1000 —
 * so this parses rather than holding a second table that could disagree with
 * src/lib/addon-catalogue.ts about what COMMS_DELUXE_1000 is.
 */
export function campaignFromCode(code: string): Campaign | null {
  const sms = /^SMS_REMINDER_(\d+)$/.exec(code);
  if (sms) return { code, email: false, allowance: 1, guests: Number(sms[1]) };

  const comms = /^COMMS_([A-Z]+)_(\d+)$/.exec(code);
  if (comms) {
    const allowance = SUITE_ALLOWANCE[comms[1]];
    if (!allowance) return null;
    return { code, email: true, allowance, guests: Number(comms[2]) };
  }
  return null;
}

/**
 * What an invitation's add-ons add up to.
 *
 * A couple who bought two takes the better of each part rather than the better
 * row: someone who bought texts for a thousand guests and then the Deluxe suite
 * for two hundred and fifty has paid for both, and picking one row whole would
 * quietly take away whichever half they are about to use.
 */
export function campaignFor(addOns: string[]): Campaign | null {
  const bought = addOns.map(campaignFromCode).filter((c): c is Campaign => c !== null);
  if (!bought.length) return null;
  return bought.reduce((best, c) => ({
    code: [best.code, c.code].sort().join('+'),
    email: best.email || c.email,
    allowance: Math.max(best.allowance, c.allowance),
    guests: Math.max(best.guests, c.guests),
  }));
}

/**
 * Which messages actually go out: the couple's own choice, capped at what they
 * bought, in the order they are sent.
 *
 * A couple who has not chosen gets the earliest ones. That is a real default
 * rather than silence, because silence here means a campaign that was paid for
 * and never went — and the messages page shows which are picked, so a default
 * nobody wanted is visible before the first one is due rather than after.
 */
export function pickedKinds(campaign: Campaign, chosen: readonly MessageKind[] | undefined): MessageKind[] {
  const wanted = (chosen ?? []).filter((k) => CAMPAIGN_KINDS.includes(k));
  const inOrder = CAMPAIGN_KINDS.filter((k) => wanted.includes(k));
  return (inOrder.length ? inOrder : CAMPAIGN_KINDS).slice(0, campaign.allowance);
}

/** The day a message is due, as a Manila date key. Null if it has no day. */
export function dueDateKey(kind: MessageKind, eventAt: Date): string | null {
  const offset = OFFSET[kind];
  if (offset === null) return null;
  return manilaDateKey(addDays(eventAt, offset));
}

/**
 * Which of a couple's messages is due today, or null.
 *
 * Manila dates on both sides, because the day a guest is thinking about is
 * their own. The cron runs at six in the morning there, which is why the
 * same-day reminder lands before anyone leaves the house.
 *
 * At most one: the offsets are seven days, one day, the day and the day after,
 * so two can only collide on an event whose date moved under a campaign that
 * had already started — and sending two blasts to the same list on one morning
 * is worse than sending the earlier one and letting tomorrow sort itself out.
 */
export function dueToday(
  kinds: readonly MessageKind[],
  eventAt: Date,
  now = new Date(),
): MessageKind | null {
  const today = manilaDateKey(now);
  return CAMPAIGN_KINDS.find((k) => kinds.includes(k) && dueDateKey(k, eventAt) === today) ?? null;
}

/** What the messages page calls each one, for the campaign kinds only. */
export function campaignKindLabel(kind: MessageKind): string {
  return MESSAGE_KINDS.find((k) => k.key === kind)?.label ?? kind;
}
