/**
 * What the visitor counter is allowed to see.
 *
 * The component itself is a thin wrapper around Vercel's; the part worth
 * testing is the filter, because both of its jobs are promises made to people
 * who cannot check. The rule is duplicated here as data rather than imported
 * from the client component, which cannot be loaded outside a browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** The same rule as src/components/site-analytics.tsx. */
function beforeSend(event: { url: string }): { url: string } | null {
  const url = new URL(event.url);
  if (url.pathname.startsWith('/portal') || url.pathname.startsWith('/login')) return null;
  if (url.pathname.startsWith('/book/confirmation/')) {
    url.pathname = '/book/confirmation/[reference]';
    return { ...event, url: url.toString() };
  }
  return event;
}

const at = (path: string) => beforeSend({ url: `https://anicawellnessspa.info${path}` });

test('the pages a guest reads are counted', () => {
  assert.ok(at('/'));
  assert.ok(at('/book'));
  assert.equal(at('/book')!.url, 'https://anicawellnessspa.info/book');
});

test('the portal is not counted, because staff are not visitors', () => {
  // Counting how often a receptionist opens the appointment list is not
  // traffic; it is surveillance by accident, and it would drown the guests.
  assert.equal(at('/portal'), null);
  assert.equal(at('/portal/appointments'), null);
  assert.equal(at('/portal/clients/abc123'), null);
  assert.equal(at('/login'), null);
});

test('a booking reference never reaches the dashboard', () => {
  // /book/confirmation/ANC-XY78CY names one guest's appointment. A list of
  // those in an analytics tool is a small breach nobody would notice.
  const seen = at('/book/confirmation/ANC-XY78CY');
  assert.ok(seen);
  // Brackets are legal in a path, so this stays readable in the dashboard
  // rather than arriving as %5Breference%5D.
  assert.equal(seen.url, 'https://anicawellnessspa.info/book/confirmation/[reference]');
  assert.ok(!seen.url.includes('ANC-XY78CY'), 'the reference must not survive');
});

test('the confirmation page is still counted, just not identified', () => {
  // The spa should be able to see how many people got that far.
  assert.notEqual(at('/book/confirmation/ANC-AAAAAA'), null);
  assert.equal(
    at('/book/confirmation/ANC-AAAAAA')!.url,
    at('/book/confirmation/ANC-BBBBBB')!.url,
    'two guests must land on the same recorded path',
  );
});
