/**
 * A one-event iCalendar file, for the "Add to calendar" button. Google
 * Calendar on Android and Calendar on iPhone both open it directly from the
 * Messenger browser.
 */
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcs(opts: {
  uid: string;
  title: string;
  start: Date;
  end?: Date;
  location?: string;
  description?: string;
  url?: string;
}): string {
  const end = opts.end ?? new Date(opts.start.getTime() + 4 * 3_600_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Invited//Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(opts.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    ...(opts.location ? [`LOCATION:${icsEscape(opts.location)}`] : []),
    ...(opts.description ? [`DESCRIPTION:${icsEscape(opts.description)}`] : []),
    ...(opts.url ? [`URL:${opts.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
