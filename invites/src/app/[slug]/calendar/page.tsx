import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublic, contentOf } from '@/lib/invitations';
import { eventInstant, str } from '@/lib/sections';
import { googleCalendarHref, outlookHref } from '@/lib/calendar';
import { invitationUrl } from '@/lib/app-url';
import { invitationMetadata } from '../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { ...(await invitationMetadata(slug)), robots: { index: false, follow: false } };
}

/**
 * Where ADD TO CALENDAR goes now.
 *
 * It used to go straight at the `.ics`, and in Messenger's browser — how
 * nearly every guest opens an invitation — that is a download, and a
 * download is the one thing an in-app browser refuses. The tap did nothing
 * and said nothing.
 *
 * So the button lands here instead: a page, which every browser can draw.
 * Google's and Outlook's calendars take the event in a web address and
 * show a filled-in screen; the `.ics` is still here for Apple Calendar and
 * anyone on a real browser. And the date, the time and the place are
 * written out in full, so a guest whose calendar is none of the three can
 * still put it in by hand rather than going back empty-handed.
 *
 * One tap became two. That is the price of it working for everybody.
 */
export default async function Page({ params }: Params) {
  const { slug } = await params;
  const invitation = await loadPublic(slug);
  if (!invitation || invitation.expired) notFound();

  const content = contentOf(invitation.content);
  const start = eventInstant(content);
  if (!start) notFound();

  const main = str(content.ceremony, 'venue') ? content.ceremony : content.reception;
  const location = [str(main, 'venue'), str(main, 'address')].filter(Boolean).join(', ');
  const url = invitationUrl(slug);
  const event = { title: invitation.title, start, location, description: str(content.cover, 'intro'), url };

  const when = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(start);

  return (
    <main className="inv-cal">
      <h1>Add to calendar</h1>
      <p className="inv-cal-what">{invitation.title}</p>
      <p className="inv-cal-when">{when}</p>
      {location && <p className="inv-cal-where">{location}</p>}

      <a className="inv-cal-btn" href={googleCalendarHref(event)} target="_blank" rel="noopener">Google Calendar</a>
      <a className="inv-cal-btn" href={`/${slug}/calendar.ics`}>Apple Calendar</a>
      <a className="inv-cal-btn" href={outlookHref(event)} target="_blank" rel="noopener">Outlook</a>

      <a className="inv-cal-back" href={`/${slug}`}>← Back to the invitation</a>
    </main>
  );
}
