import { redirect } from 'next/navigation';
import { getSettings } from './settings';

/**
 * The shop floor, closed.
 *
 * `site.comingSoon` has always existed and has always guarded exactly one
 * page — the landing page, which redirected while `/templates`,
 * `/occasions`, `/looks`, `/demo`, `/collections` and the whole of the
 * checkout stayed open to anybody who typed the address or held an old link.
 * That is not a closed shop; it is a shop with the front door locked and the
 * side door open, and the side door is the one with the prices behind it.
 *
 * So this is the guard, and every page that offers something for sale calls
 * it. One line each, the same way the landing page has always done it,
 * rather than middleware: the setting lives in the database, the check is a
 * database read, and a page that reads the database is a page the server
 * renders anyway.
 *
 * **What stays open, deliberately, and must stay open.** Closing the shop is
 * not the same as going dark, and the difference is the whole point:
 *
 *   • **a guest's invitation** (`/{slug}`, its personal link, its printable
 *     sheet) — somebody paid for that invitation and sent the link to three
 *     hundred people. It is not on sale; it is delivered. Taking it down
 *     because we are not selling this week would be the single worst thing
 *     this switch could do.
 *   • **the RSVP, the guestbook, the photo upload** — the same reason. A
 *     guest answering an invitation is not shopping.
 *   • **an account that already exists** (`/account`, `/login`) — a customer
 *     mid-build keeps their work and keeps reaching it.
 *   • **the admin and the studio** — designs are made while the shop is
 *     closed. That is what it is closed for.
 *   • **the legal pages** (`/privacy`, `/terms`, `/refund-policy`) — a
 *     promise made to somebody who already bought does not close.
 *
 * What closes is browsing and buying: the gallery, the occasion pages, the
 * looks, the demo, the collections, the checkout, and signing up for an
 * account there is nothing yet to buy with.
 */
export async function closedForNow(): Promise<void> {
  const s = await getSettings();
  if (s['site.comingSoon']) redirect('/coming-soon');
}
