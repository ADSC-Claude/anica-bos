/**
 * The public base URL, used in emails, PayMongo redirects, share links and QR
 * codes. Vercel supplies VERCEL_PROJECT_PRODUCTION_URL on production
 * deployments, so a forgotten env var degrades to the right host rather than
 * to localhost inside a QR code printed on a hundred cards.
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

/** The host as a guest would read it aloud: "invites.ph", not "https://…/". */
export function displayHost(): string {
  try {
    return new URL(appUrl()).host;
  } catch {
    return appUrl();
  }
}

export function invitationUrl(slug: string, token?: string): string {
  return absoluteUrl(token ? `/i/${slug}/${token}` : `/i/${slug}`);
}
