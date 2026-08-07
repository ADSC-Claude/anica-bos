import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcal } from '../src/lib/sync/ical';

/**
 * The import parser, against the shapes Airbnb actually emits — including the
 * folded lines and CRLF endings that a naive split on '\n' gets wrong.
 */

const AIRBNB_FEED = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Airbnb Inc//Hosting Calendar 1.0.0//EN',
  'CALSCALE:GREGORIAN',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20260815',
  'DTSTART;VALUE=DATE:20260812',
  'UID:1234567890abcdef@airbnb.com',
  'SUMMARY:Reserved',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/de',
  ' tails/HMABCDEFGH',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20260901',
  'DTSTART;VALUE=DATE:20260828',
  'UID:fedcba0987654321@airbnb.com',
  'SUMMARY:Airbnb (Not available)',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('parses Airbnb events, dates and folded lines', () => {
  const events = parseIcal(AIRBNB_FEED);
  assert.equal(events.length, 2);

  const [first] = events;
  assert.equal(first.uid, '1234567890abcdef@airbnb.com');
  assert.equal(first.summary, 'Reserved');
  assert.equal(first.startDate.toISOString().slice(0, 10), '2026-08-12');
  assert.equal(first.endDate.toISOString().slice(0, 10), '2026-08-15');

  // The folded DESCRIPTION must not have been read as a second property.
  assert.equal(events[1].uid, 'fedcba0987654321@airbnb.com');
});

test('accepts LF-only feeds and datetime-form DTSTART', () => {
  const feed = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:x@example.com',
    'DTSTART:20260101T140000Z',
    'DTEND:20260103T110000Z',
    'SUMMARY:Booked',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  const events = parseIcal(feed);
  assert.equal(events.length, 1);
  // A datetime is reduced to the stay date it falls on: a check-in is a
  // calendar date, not an instant.
  assert.equal(events[0].startDate.toISOString().slice(0, 10), '2026-01-01');
  assert.equal(events[0].endDate.toISOString().slice(0, 10), '2026-01-03');
});

test('drops events that cannot describe a stay', () => {
  const feed = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:no-dates@example.com',
    'SUMMARY:Broken',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:zero-length@example.com',
    'DTSTART;VALUE=DATE:20260101',
    'DTEND;VALUE=DATE:20260101',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:backwards@example.com',
    'DTSTART;VALUE=DATE:20260110',
    'DTEND;VALUE=DATE:20260105',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  // A malformed feed must not create a span that holds dates nobody can
  // explain, so all three are dropped rather than guessed at.
  assert.equal(parseIcal(feed).length, 0);
});

test('an empty or non-calendar body yields nothing rather than throwing', () => {
  assert.equal(parseIcal('').length, 0);
  assert.equal(parseIcal('<html>404 Not Found</html>').length, 0);
});
