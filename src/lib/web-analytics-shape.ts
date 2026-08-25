/**
 * Reading the analytics reply, kept apart from the fetching of it.
 *
 * Its own file because it is the only half that can be exercised here: the
 * API is unreachable from development, so the parsing carries the whole
 * weight of the tests while the request itself is proved in production. It
 * also cannot be `server-only` for that reason — nothing in here touches a
 * token or the network.
 */

export type AnalyticsWindow = {
  /** Distinct people, as Vercel counts them. */
  visitors: number;
  /** Pages opened, so a visitor who reads three counts three times. */
  pageviews: number;
};

export type WebAnalytics = {
  last7: AnalyticsWindow;
  last30: AnalyticsWindow;
  /** Busiest pages over the last 30 days, most read first. May be empty. */
  topPages: { path: string; pageviews: number }[];
};

/* ------------------------------------------------------------------ parsing */

/**
 * Pull a window out of a `visits/count` reply.
 *
 * Exported for its tests: the network cannot be reached from development, so
 * the parsing is what gets exercised, against captured and invented payloads.
 */
export function readCount(body: unknown): AnalyticsWindow | null {
  if (typeof body !== 'object' || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;

  const visitors = (data as { visitors?: unknown }).visitors;
  const pageviews = (data as { pageviews?: unknown }).pageviews;
  if (typeof visitors !== 'number' || typeof pageviews !== 'number') return null;
  if (!Number.isFinite(visitors) || !Number.isFinite(pageviews)) return null;

  return { visitors: Math.max(0, visitors), pageviews: Math.max(0, pageviews) };
}

/**
 * Pull the busiest pages out of an `visits/aggregate` reply grouped by path.
 *
 * The row shape is the part of this API least pinned down by the
 * documentation, so several plausible spellings of the same thing are
 * accepted and anything else is dropped rather than guessed at. An empty list
 * is a fine answer; the card simply shows the totals.
 */
export function readTopPages(body: unknown, limit = 5): { path: string; pageviews: number }[] {
  const rows = (body as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];

  const out: { path: string; pageviews: number }[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const path = r.requestPath ?? r.path ?? r.key ?? r.value;
    const views = r.pageviews ?? r.views ?? r.count;
    if (typeof path !== 'string' || !path) continue;
    if (typeof views !== 'number' || !Number.isFinite(views)) continue;
    // The portal is not counted in the first place, but a stray row from an
    // older deployment should not be shown as if guests were reading it.
    if (path.startsWith('/portal') || path.startsWith('/login')) continue;
    out.push({ path, pageviews: Math.max(0, views) });
  }

  return out.sort((a, b) => b.pageviews - a.pageviews).slice(0, limit);
}

/** YYYY-MM-DD, which is what the API's `since` and `until` want. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
