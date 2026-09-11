import 'server-only';
import { mailable } from './email';

/**
 * What a reply tells us about the guest who sent it.
 *
 * A number and an address arrive twice over: once on the guest list the couple
 * typed, and once in the reply the guest sent. Only the guest row is read by a
 * blast, so the reply's copy has to be carried across — and the rule for
 * carrying it should be the same whether that happens as the reply is saved or
 * long afterwards in a back-fill. So it lives here, once, rather than in both.
 */

export type Contact = { phone: string; email: string };

/**
 * The address out of a stored one.
 *
 * A corporate RSVP with *Ask for department* on stores the two joined —
 * "maria@example.com · Finance" — because the reply has nowhere else to put a
 * department. That is fine on a reply and wrong on a mailing list, so the
 * department comes off here rather than being mailed to anybody.
 */
export function plainAddress(stored: string): string {
  return (stored ?? '').split('·')[0].trim();
}

/**
 * What of a reply's contact details belongs on the guest's own row.
 *
 * The reply ordinarily wins over what the couple typed: a guest is the
 * authority on their own number, and theirs is the more recent of the two.
 * Blank never wins either way — leaving a field empty is not a correction, and
 * a reply that skipped the question should not erase a number the couple had.
 *
 * `fillBlanksOnly` is for the back-fill, where that reasoning runs out. Going
 * over replies collected months ago we cannot tell whether the couple edited
 * the row afterwards, so a disagreement there is not evidence that the reply is
 * newer. Filling the gaps is the whole point of it anyway: a blast skips a
 * blank, not a mismatch.
 *
 * An address has to look like one before it is kept. The live path has zod's
 * word for that already; a back-fill over old replies does not, and a mailing
 * list is the wrong place to find out.
 */
export function contactPatch(
  reply: Partial<Contact>,
  guest: Contact,
  opts: { fillBlanksOnly?: boolean } = {},
): Partial<Contact> {
  const phone = (reply.phone ?? '').trim();
  const address = plainAddress(reply.email ?? '');
  const email = mailable(address) ? address : '';
  const wanted = (value: string, current: string) =>
    Boolean(value) && value !== current && !(opts.fillBlanksOnly && current);
  return {
    ...(wanted(phone, guest.phone) ? { phone } : {}),
    ...(wanted(email, guest.email) ? { email } : {}),
  };
}
