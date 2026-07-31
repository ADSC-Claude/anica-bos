/**
 * Normalises whatever gets pasted into the "map embed" setting.
 *
 * Google's Share dialog leads with a COPY HTML button that yields a whole
 * `<iframe src="…" …></iframe>` tag, so that is what people paste. Dropped
 * straight into an iframe's src it becomes a relative URL, the browser resolves
 * it against this site, and the frame fills with our own 404 — which looks like
 * the map is broken rather than the value being wrong.
 *
 * The value also ends up as an iframe src on the public landing page, so the
 * host is checked against a list rather than trusted. Settings is Owner-only,
 * but "an admin typed it" is not a reason to embed arbitrary third-party
 * content on a page customers visit.
 */

const ALLOWED = [
  { host: 'www.google.com', path: '/maps/embed' },
  { host: 'google.com', path: '/maps/embed' },
  { host: 'maps.google.com', path: '/maps/embed' },
  { host: 'www.google.com.ph', path: '/maps/embed' },
  { host: 'www.openstreetmap.org', path: '/export/embed.html' },
];

export type MapEmbedResult = { url: string } | { error: string };

export function normaliseMapEmbed(raw: string): MapEmbedResult {
  const trimmed = raw.trim();
  if (!trimmed) return { url: '' };

  // Pull the src out of a pasted iframe tag; otherwise assume it is the URL.
  const tag = trimmed.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  const candidate = (tag ? tag[1] : trimmed)
    // Copied HTML carries entity-escaped ampersands.
    .replace(/&amp;/g, '&')
    .trim();

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return {
      error:
        'That does not look like a map link. In Google Maps: Share → Embed a map → Copy HTML, then paste the whole thing here.',
    };
  }

  if (url.protocol !== 'https:') {
    return { error: 'The map link must start with https://.' };
  }

  const allowed = ALLOWED.some(
    (a) => url.hostname === a.host && url.pathname.startsWith(a.path),
  );
  if (!allowed) {
    return {
      error: `Only Google Maps and OpenStreetMap embeds can be shown here, and this one points at ${url.hostname}. Use Share → Embed a map, not Share → Send a link.`,
    };
  }

  return { url: url.toString() };
}
