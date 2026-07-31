/**
 * A stable URL for an owner-uploaded asset, versioned by deployment.
 *
 * `/logo.png` and `/hero.mp4` are fixed paths whose *contents* change: the
 * owner replaces the file and the URL stays identical. Browsers and the CDN
 * quite reasonably keep serving what they already have, so a replaced logo
 * appears in a browser that never saw the old one and nowhere else — which
 * reads as "it is right in the system but wrong on the website".
 *
 * Appending the deployment id makes a replaced file a new URL. It is the same
 * trick the service worker registration already uses, for the same reason.
 *
 * Full https:// URLs are left alone: they belong to somebody else's server, and
 * adding a query to one can break a signed link.
 */
export function assetUrl(raw: string | undefined): string {
  const src = (raw ?? '').trim();
  if (!src) return '';
  if (!src.startsWith('/')) return src;
  if (src.includes('?')) return src;

  const version =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
  return `${src}?v=${encodeURIComponent(version)}`;
}
