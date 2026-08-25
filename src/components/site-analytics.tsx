'use client';

import { Analytics } from '@vercel/analytics/react';
import { usePathname } from 'next/navigation';

/**
 * How many people visit the website, and which pages they read.
 *
 * Vercel's own counter rather than Google Analytics: it sets no cookies and
 * builds no profile, so there is no consent banner to add and nothing new to
 * declare under the Data Privacy Act. It answers the question the spa actually
 * has — "is anyone looking at this?" — and stops there.
 *
 * Two things are deliberately kept out of it.
 *
 * The portal is not measured. Counting how often a receptionist opens the
 * appointment list is not visitor traffic, it is staff surveillance by
 * accident, and it would also drown the real numbers: one busy shift would
 * outweigh a week of guests.
 *
 * A booking reference never leaves the page. `/book/confirmation/ANC-XY78CY`
 * names one guest's appointment, and a list of those sitting in an analytics
 * dashboard is a small breach nobody would notice. Those paths are folded to
 * the route itself, so the spa can still see how many people reached the
 * confirmation without seeing whose.
 */
/** Where the counter has no business being. */
function isStaff(pathname: string): boolean {
  return pathname.startsWith('/portal') || pathname.startsWith('/login');
}

export function SiteAnalytics() {
  const pathname = usePathname();

  // Not mounted at all on staff pages, rather than mounted and told to stay
  // quiet. Filtering the event still fetches the tracking script onto the
  // receptionist's screen, and "we do not measure the portal" should mean
  // nothing arrives, not that what arrives is discarded politely.
  if (isStaff(pathname)) return null;

  return (
    <Analytics
      beforeSend={(event) => {
        const url = new URL(event.url);

        // Kept as a second line: a client-side route change can fire before
        // the component unmounts, and this is cheaper than reasoning about
        // whether that race is real.
        if (isStaff(url.pathname)) return null;

        if (url.pathname.startsWith('/book/confirmation/')) {
          url.pathname = '/book/confirmation/[reference]';
          return { ...event, url: url.toString() };
        }

        return event;
      }}
    />
  );
}
