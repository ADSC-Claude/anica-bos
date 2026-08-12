/**
 * The public base URL, used in emails, PayMongo redirects and iCal feed URLs.
 * Vercel supplies VERCEL_PROJECT_PRODUCTION_URL on production deployments, so
 * a forgotten env var degrades to the right host rather than to localhost in
 * someone's inbox.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}

export function absoluteUrl(path: string): string {
  return `${appUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}
