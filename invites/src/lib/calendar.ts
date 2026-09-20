/**
 * The event as a link to each calendar that will take one.
 *
 * "the add to calendar doesnt push through on me."
 *
 * The button used to be an `.ics` file served as an attachment, and a file
 * is the one thing an in-app browser will not take. Messenger's browser —
 * which is how nearly every guest opens the invitation — cannot save a
 * download and cannot hand one to another app, so the tap did nothing at
 * all. iPhone was the worst of it: no error, no sheet, nothing.
 *
 * A calendar's own web address is a page, and every browser can open a
 * page. Google's and Outlook's both take an event in their query string and
 * show the guest a filled-in "save this?" screen. The `.ics` stays for
 * Apple Calendar and for anyone on a real browser, but it is no longer the
 * only road.
 *
 * Times go out as UTC stamps, which is what both ends document and what
 * avoids a guest in another timezone being told the wrong hour.
 */
export type CalEvent = {
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
  url?: string;
};

/** four hours, the same span buildIcs gives an event with no stated end */
const DEFAULT_HOURS = 4;

const endOf = (e: CalEvent): Date => e.end ?? new Date(e.start.getTime() + DEFAULT_HOURS * 3_600_000);

/** 20261003T003000Z — the basic form both calendars read */
export function stampUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** the whole story in the event's notes: what it is, and where to read it again */
const notes = (e: CalEvent): string => [e.description, e.url].filter(Boolean).join('\n\n');

export function googleCalendarHref(e: CalEvent): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stampUtc(e.start)}/${stampUtc(endOf(e))}`,
  });
  if (e.location) q.set('location', e.location);
  const d = notes(e);
  if (d) q.set('details', d);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function outlookHref(e: CalEvent): string {
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: e.start.toISOString(),
    enddt: endOf(e).toISOString(),
  });
  if (e.location) q.set('location', e.location);
  const d = notes(e);
  if (d) q.set('body', d);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}
