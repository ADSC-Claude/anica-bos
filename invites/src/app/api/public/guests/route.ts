import { handle } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { loadPublic, rsvpOpen, contentOf } from '@/lib/invitations';
import { bool } from '@/lib/sections';
import { searchGuests, MIN_QUERY } from '@/lib/guest-picker';

/**
 * The names a guest may pick from, for what they have typed so far.
 *
 * Four gates before a single name is returned, and every one of them is a way
 * this can answer nothing at all:
 *
 *   • the invitation is published and not expired  — loadPublic
 *   • its RSVP is still open                       — a closed form asks nobody
 *   • the couple switched the picker on            — nameFromList, off by default
 *   • three characters have been typed             — MIN_QUERY
 *
 * A miss on any of them returns an empty list rather than an error, because
 * the browser calls this on every keystroke and a red line under a name box
 * is not what a guest should see for typing two letters.
 *
 * No caching: whether a name has already been answered for changes as replies
 * arrive, and a stale tick beside Lola Rosa is the one wrong answer this is
 * here to prevent.
 */
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') ?? '').slice(0, 80);
  const q = (url.searchParams.get('q') ?? '').slice(0, 80);
  if (!slug) throw new HttpError(400, 'Which invitation?');
  if (q.trim().length < MIN_QUERY) return { guests: [] };

  const invitation = await loadPublic(slug);
  if (!invitation || invitation.expired) return { guests: [] };
  if (!rsvpOpen(invitation)) return { guests: [] };
  if (!bool(contentOf(invitation.content).rsvp, 'nameFromList')) return { guests: [] };

  return { guests: await searchGuests(invitation.id, q) };
});
