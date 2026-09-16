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

/** The host as a guest would read it aloud: "youreinvitedto.com", not "https://…/". */
export function displayHost(): string {
  try {
    return new URL(appUrl()).host;
  } catch {
    return appUrl();
  }
}

/**
 * Where a guest's invitation lives, relative to the site root.
 *
 * At the root, deliberately: the domain and the slug are meant to be read as
 * one line — youreinvitedto.com/angelica-and-jeffrey — and a /i/ in the middle
 * of that breaks the sentence the domain was chosen for. The cost is that
 * slugs now share a namespace with every top-level page, which is what
 * RESERVED_SLUGS in invitations.ts exists to keep straight; a test holds that
 * list to the routes actually on disk.
 *
 * Everything that links to an invitation goes through here or through
 * invitationUrl, so the shape is in one place if it ever moves again.
 */
export function invitationPath(slug: string, token?: string): string {
  return token ? `/${slug}/${token}` : `/${slug}`;
}

export function invitationUrl(slug: string, token?: string): string {
  return absoluteUrl(invitationPath(slug, token));
}
