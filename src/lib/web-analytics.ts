import 'server-only';

/**
 * How many people looked at the website, brought into the system.
 *
 * Vercel counts the visits; this reads the count back so the Owner does not
 * need a second login to see it. Everything here is written to fail quietly:
 * an analytics card is the least important thing on a dashboard that also
 * shows today's bookings and the till, and it must never be the reason that
 * screen does not load.
 *
 * The response shape is parsed defensively rather than trusted. This is
 * somebody else's API, reachable only from production — it could not be
 * exercised from the machine this was written on — so every field is checked
 * before it is used and anything unrecognised degrades to "unavailable"
 * instead of throwing.
 */

import {
  readCount,
  readTopPages,
  dayKey,
  type WebAnalytics,
} from './web-analytics-shape';
export type { AnalyticsWindow, WebAnalytics } from './web-analytics-shape';

const BASE = 'https://api.vercel.com/v1/query/web-analytics/visits';

/** Ten minutes. Long enough that a dashboard refresh is free, short enough
 *  that the number still feels like today's. */
const TTL_MS = 10 * 60_000;

export type AnalyticsResult =
  | { state: 'ok'; data: WebAnalytics }
  /** No token configured. Not an error — the spa has simply not set it up. */
  | { state: 'unconfigured' }
  /** Configured, but the reading did not arrive. Says why, for the Owner. */
  | { state: 'unavailable'; reason: string };

/* ------------------------------------------------------------- the request */

type Config = { token: string; projectId: string; teamId: string };

function config(): Config | null {
  const token = process.env.VERCEL_ANALYTICS_TOKEN?.trim();
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID?.trim();
  if (!token || !projectId) return null;
  return { token, projectId, teamId: process.env.VERCEL_ANALYTICS_TEAM_ID?.trim() ?? '' };
}

async function ask(
  path: string,
  params: Record<string, string>,
  cfg: Config,
  signal: AbortSignal,
): Promise<unknown> {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set('projectId', cfg.projectId);
  if (cfg.teamId) url.searchParams.set('teamId', cfg.teamId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    // 403 here almost always means the token is fine but Web Analytics has
    // not been enabled on the project, which is worth saying plainly.
    throw new Error(
      res.status === 401 || res.status === 403
        ? `Vercel refused the request (${res.status}). Check the token, and that Web Analytics is enabled for the project.`
        : `Vercel answered ${res.status}.`,
    );
  }
  return res.json();
}

let cached: { at: number; value: AnalyticsResult } | null = null;

/**
 * The card's whole data source.
 *
 * Cached in module memory rather than per-request: the dashboard is
 * force-dynamic, so without this every refresh by every member of staff would
 * be three calls to somebody else's rate limit.
 */
export async function getWebAnalytics(now = new Date()): Promise<AnalyticsResult> {
  if (cached && now.getTime() - cached.at < TTL_MS) return cached.value;

  const cfg = config();
  if (!cfg) return { state: 'unconfigured' };

  const until = dayKey(now);
  const since7 = dayKey(new Date(now.getTime() - 7 * 86_400_000));
  const since30 = dayKey(new Date(now.getTime() - 30 * 86_400_000));

  // A dashboard should not wait on a third party. Four seconds is longer than
  // this ever takes and shorter than anybody would tolerate staring at.
  const abort = AbortSignal.timeout(4_000);

  let value: AnalyticsResult;
  try {
    const [a, b, c] = await Promise.all([
      ask('count', { since: since7, until }, cfg, abort),
      ask('count', { since: since30, until }, cfg, abort),
      // Grouped pages are a nicety; a failure here must not lose the totals,
      // so it resolves to null rather than rejecting the batch.
      ask('aggregate', { since: since30, until, by: 'requestPath', limit: '20' }, cfg, abort)
        .catch(() => null),
    ]);

    const last7 = readCount(a);
    const last30 = readCount(b);
    if (!last7 || !last30) {
      value = { state: 'unavailable', reason: 'Vercel replied in a shape this page did not recognise.' };
    } else {
      value = { state: 'ok', data: { last7, last30, topPages: readTopPages(c) } };
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'Vercel did not answer in time.'
        : err instanceof Error
          ? err.message
          : 'The reading could not be fetched.';
    value = { state: 'unavailable', reason };
  }

  cached = { at: now.getTime(), value };
  return value;
}

/** Test seam: the module-level cache would otherwise leak between tests. */
export function resetAnalyticsCache(): void {
  cached = null;
}
