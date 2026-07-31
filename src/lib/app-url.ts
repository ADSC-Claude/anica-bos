/**
 * The deployment's own public URL, used for PayMongo redirects, links in
 * emails, and Open Graph metadata.
 *
 * NEXT_PUBLIC_APP_URL is typed into a hosting dashboard by hand, so it arrives
 * in whatever shape the person pasting it had — commonly the bare hostname
 * Vercel displays ("anica-bos.vercel.app"), sometimes with a trailing slash or
 * stray whitespace. `new URL()` rejects a value with no scheme, and doing that
 * inside `export const metadata` fails the *build*, not a request: Next.js
 * evaluates it while collecting page data and reports it against /_not-found,
 * which points nowhere near the actual cause.
 *
 * So normalise rather than trust, and never throw.
 */

const FALLBACK = 'http://localhost:3000';

function normalise(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  // A bare host is the common paste; assume https, which is what any host
  // serving this app will be using. Scheme detection has to happen before any
  // tidying, or "http://" tidies into the hostname "http".
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  // A hostname with no dot is a typo, not a domain — except localhost, which
  // is how this runs in development.
  const host = parsed.hostname;
  if (host !== 'localhost' && !host.includes('.')) return null;
  // .origin drops any path, query and trailing slash.
  return parsed.origin;
}

/**
 * Origin with no trailing slash, e.g. `https://anica-bos.vercel.app`.
 * Safe to interpolate directly: `${appUrl()}/book/confirmation/${ref}`.
 */
export function appUrl(): string {
  return (
    normalise(process.env.NEXT_PUBLIC_APP_URL) ??
    // Vercel sets this on every deployment, without a scheme. A preview build
    // linking to itself beats one linking to localhost.
    normalise(process.env.VERCEL_URL) ??
    FALLBACK
  );
}

/** Same value as a URL, for Next.js metadata. */
export function appUrlObject(): URL {
  return new URL(appUrl());
}
