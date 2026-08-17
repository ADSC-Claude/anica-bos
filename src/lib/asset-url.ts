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
/**
 * What somebody typed, turned into an address the browser can actually fetch.
 *
 * The upload instructions say "put it in the repository's `public` folder", so
 * `public/massage.JPG` is the obvious thing to type — and it is wrong, because
 * `public` *is* the web root and never appears in the address. It fails
 * silently: the card falls back to its placeholder and the field still shows a
 * value that looks right, so the owner re-reads the sentence, re-uploads the
 * photo, and concludes the feature is broken. That happened.
 *
 * Every spelling of the same file is therefore accepted and rewritten to the
 * one that works. What cannot be rescued is named rather than half-fixed.
 */
export type AssetPathResult = { url: string } | { error: string };

export function normaliseAssetPath(raw: string | undefined): AssetPathResult {
  // Copy-and-paste picks up stray quotes surprisingly often.
  const src = (raw ?? '').trim().replace(/^["']|["']$/g, '').trim();
  if (!src) return { url: '' };

  // A path from the owner's own computer — a dragged file, a copied Finder or
  // Explorer path. Nothing here can serve it, and saying so beats a blank card.
  if (/^[a-z]:[\\/]/i.test(src) || src.startsWith('file:') || src.includes('\\')) {
    return {
      error:
        'That is a file on your computer, not a web address. Upload it to the repository’s public folder first, then enter /' +
        (src.split(/[\\/]/).pop() || 'photo.jpg'),
    };
  }

  // Somebody else's server. Protocol-relative links are theirs too.
  if (/^https:\/\//i.test(src) || src.startsWith('//')) return { url: src };
  if (/^http:\/\//i.test(src)) {
    return {
      error:
        'That link starts with http://, and browsers refuse to load it on a secure page. Use the https:// version.',
    };
  }

  // From here it is meant to be a file in this repository. Strip every way of
  // saying "the public folder" — `public/x`, `/public/x`, `./public/x` — and
  // the bare `x` that comes from copying the file name alone.
  const path = src
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/^public\//i, '')
    .replace(/\/{2,}/g, '/');

  if (!path) return { error: 'Enter the file name, for example /massage.jpg.' };
  // A stamped path (`/logo.png?v=dpl_x`) comes back through here on the way
  // out, so the extension is checked on the file name, not the whole string.
  const filename = path.split(/[?#]/)[0];
  if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
    return {
      error: `"${src}" has no file extension. Enter the file name exactly as it was uploaded, for example /massage.jpg.`,
    };
  }

  return { url: `/${path}` };
}

export function assetUrl(raw: string | undefined): string {
  // Values saved before the field started correcting itself are healed on the
  // way out, so nobody has to revisit a screen to fix a path already stored.
  const result = normaliseAssetPath(raw);
  if ('error' in result) return '';
  const src = result.url;
  if (!src) return '';
  if (!src.startsWith('/')) return src;
  if (src.includes('?')) return src;

  const version =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
  return `${src}?v=${encodeURIComponent(version)}`;
}
