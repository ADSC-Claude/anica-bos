import 'server-only';
import { redirect } from 'next/navigation';
import { getSettings } from './settings';
import { HttpError } from './errors';

/**
 * The gate on the public marketing pages while the business is still being
 * set up. Called first thing by every page a stranger could wander into; it
 * sends them to the holding page instead.
 *
 * What it deliberately does NOT gate: /login and the portal (the people
 * filling the site in have to get to work), /manage and /review (someone
 * already holding a booking code must never be locked out of their own
 * stay by a marketing switch), the payment and confirmation steps of a
 * booking already in flight, and the API routes the cron and PayMongo use.
 *
 * The default is "hidden", so a fresh deployment opens quietly rather than
 * announcing an empty catalogue — and so does a deployment whose database is
 * briefly unreachable, since settings fall back to defaults. A holding page
 * is a better thing for a stranger to meet than a listing page with nothing
 * in it.
 */
export async function requirePublicSite(): Promise<void> {
  const settings = await getSettings();
  if (settings['site.comingSoon']) redirect('/coming-soon');
}

/**
 * The same gate for the public API. Hiding the booking form does not hide the
 * endpoint behind it, and a reservation created while the business is still
 * being set up is a real row with real dates held against a property nobody
 * has finished describing.
 */
export async function assertPublicSiteOpen(): Promise<void> {
  const settings = await getSettings();
  if (settings['site.comingSoon']) {
    throw new HttpError(503, 'Bookings are not open yet.');
  }
}
