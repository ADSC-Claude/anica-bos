/**
 * The couple's song, and the moment it starts.
 *
 * Three ways to bring it: a Spotify link (Spotify's own player — the whole
 * song for a guest signed in to Spotify, a preview for one who is not), a
 * YouTube link (YouTube's player, the whole song for everyone), or a file of
 * their own, uploaded, which plays behind the page as it opens. Whichever it
 * is, a song often opens on a long instrumental, so the couple names the
 * moment it should start from, in minutes and seconds. The file and YouTube
 * start there exactly; Spotify does when it is playing the whole song, since
 * a preview is the thirty seconds Spotify picks.
 */

/** The latest start the form takes — an hour in, which no song needs. */
export const START_MAX = 59 * 60 + 59;

function clamp(n: number): number {
  return Math.max(0, Math.min(START_MAX, n));
}

/** Seconds into the song, from a number of seconds or "m:ss"; nothing and junk are 0. */
export function parseStart(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? clamp(Math.round(raw)) : 0;
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (m) {
    const sec = Number(m[2]);
    return sec < 60 ? clamp(Number(m[1]) * 60 + sec) : 0;
  }
  return /^\d+$/.test(s) ? clamp(Number(s)) : 0;
}

/** "1:05" */
export function formatStart(seconds: number): string {
  const s = clamp(Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// A watch link with other parameters before v=, a short link, a Short, an embed, a live page; music.youtube.com is youtube.com too.
const YOUTUBE = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

export function youtubeId(url: string): string | null {
  const m = YOUTUBE.exec(url.trim());
  return m ? m[1] : null;
}

/** YouTube's player for a video, starting where the couple said; and the video's own still. */
export function youtubeEmbed(id: string, start = 0): { src: string; poster: string } {
  const at = parseStart(start);
  return {
    src: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0${at ? `&start=${at}` : ''}`,
    poster: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
  };
}
