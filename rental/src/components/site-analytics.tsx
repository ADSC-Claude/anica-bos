'use client';

import { Analytics } from '@vercel/analytics/next';

/**
 * Anonymous page-view counting for the PUBLIC site only. The filter runs in
 * the visitor's browser and drops staff surfaces before anything is sent:
 * portal work is already accounted for, person by person, in Settings →
 * Activity, and mixing staff pageloads into "visitors" would flatter the
 * traffic numbers with our own footsteps.
 *
 * Vercel Web Analytics is cookieless and aggregates by rotating hash, so
 * there is nothing here for a consent banner to consent to.
 */
export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        const path = new URL(event.url).pathname;
        if (path.startsWith('/portal') || path.startsWith('/login')) return null;
        return event;
      }}
    />
  );
}
