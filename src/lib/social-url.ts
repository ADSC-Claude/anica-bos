/**
 * A social profile, however the owner happens to write it down.
 *
 * Nobody copies a clean canonical URL out of the app. They paste
 * `instagram.com/anicawellnessspa`, or the handle with its `@`, or the whole
 * address with a tracking query hanging off the end. Stored raw, the first two
 * are the same fault the photo paths had: no scheme means the browser resolves
 * it against this site, so "Instagram" in the footer leads to our own 404.
 *
 * Handles are lower-cased because both networks treat them case-insensitively
 * and a capitalised paste otherwise looks like a different address in the bar.
 * Full URLs are left alone apart from the scheme — a profile link can carry a
 * legitimate query, and rewriting somebody else's URL is how links break.
 */
export type SocialResult = { url: string } | { error: string };

export function normaliseSocialUrl(raw: string | undefined, host: string): SocialResult {
  const src = (raw ?? '').trim().replace(/^["']|["']$/g, '').trim();
  if (!src) return { url: '' };

  // A path from a file manager, or an email address pasted into the wrong box.
  if (src.includes('\\') || src.includes(' ') || src.includes('@' + host)) {
    return { error: `That does not look like a ${host} address.` };
  }

  if (/^https?:\/\//i.test(src)) {
    let url: URL;
    try {
      url = new URL(src);
    } catch {
      return { error: `That is not a web address. Paste the link from your ${host} page.` };
    }
    // http works for a link — it is not an embedded resource — but the network
    // redirects it anyway, so store what it will end up as.
    if (url.protocol === 'http:') url.protocol = 'https:';
    return { url: url.toString() };
  }

  // `www.instagram.com/name`, or `instagram.com/name` — an address missing
  // only its scheme.
  if (/^(www\.)?[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(src)) {
    return { url: `https://${src}` };
  }

  // `@name`, or a bare handle. Anything with a slash left in it is a path
  // somebody has half-typed, and guessing at the rest would be worse than
  // saying so.
  const handle = src.replace(/^@/, '');
  if (!/^[a-z0-9._-]+$/i.test(handle)) {
    return {
      error: `Paste the full link to your ${host} page, or just the username.`,
    };
  }

  return { url: `https://www.${host}/${handle.toLowerCase()}` };
}
