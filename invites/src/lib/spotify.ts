/**
 * A song from Spotify, by the link the app's Share button copies. The page
 * embeds Spotify's own player for it: the guest taps play, and hears the
 * whole song when signed in to Spotify, a thirty-second preview when not —
 * that is Spotify's rule, not ours, and no file is stored or served here.
 */
export type SpotifyRef = { kind: 'track' | 'album' | 'playlist'; id: string };

const LINK = /open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]+)?\/)?(track|album|playlist)\/([A-Za-z0-9]{10,40})/i;
const URI = /^spotify:(track|album|playlist):([A-Za-z0-9]{10,40})$/i;

export function spotifyRef(raw: string): SpotifyRef | null {
  const s = raw.trim();
  const m = LINK.exec(s) ?? URI.exec(s);
  if (!m) return null;
  return { kind: m[1].toLowerCase() as SpotifyRef['kind'], id: m[2] };
}

/** The embed player's address and the height Spotify draws it at. */
export function spotifyEmbed(ref: SpotifyRef): { src: string; height: number } {
  return { src: `https://open.spotify.com/embed/${ref.kind}/${ref.id}?utm_source=generator&theme=0`, height: ref.kind === 'track' ? 152 : 352 };
}
