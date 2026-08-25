import 'server-only';

/**
 * Read-side client for Vercel Web Analytics — the numbers behind the public
 * site's visitor counting, pulled into the portal so nobody needs a Vercel
 * account to answer "is anyone looking at the website?".
 *
 * Wants three env vars, none of which exist by default:
 *   VERCEL_ANALYTICS_TOKEN       an API token the owner creates (the secret)
 *   VERCEL_ANALYTICS_PROJECT_ID  prj_… of the deployed site
 *   VERCEL_ANALYTICS_TEAM_ID     team_… that owns the project
 * Missing any of them, the Visitors page shows setup instructions instead of
 * numbers — the feature is optional wiring, not a hard dependency.
 */

const API = 'https://api.vercel.com/v1/query/web-analytics';

export type AnalyticsConfig = { token: string; projectId: string; teamId: string };

export function analyticsConfig(): AnalyticsConfig | null {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID;
  if (!token || !projectId || !teamId) return null;
  return { token, projectId, teamId };
}

async function query(
  cfg: AnalyticsConfig,
  path: 'visits/count' | 'visits/aggregate',
  params: Record<string, string>,
): Promise<unknown> {
  const u = new URL(`${API}/${path}`);
  u.searchParams.set('projectId', cfg.projectId);
  u.searchParams.set('teamId', cfg.teamId);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    // Ten minutes of data cache: a manager refreshing the page should not
    // spend API quota, and visitor counts do not move faster than this.
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    throw new Error(`Vercel Web Analytics (${path}) answered HTTP ${res.status}.`);
  }
  return res.json();
}

export type Totals = { visitors: number; pageviews: number };

export async function visitTotals(cfg: AnalyticsConfig, sinceIso: string, untilIso: string): Promise<Totals> {
  const raw = (await query(cfg, 'visits/count', { since: sinceIso, until: untilIso })) as {
    data?: { visitors?: number; pageviews?: number };
  };
  return { visitors: raw.data?.visitors ?? 0, pageviews: raw.data?.pageviews ?? 0 };
}

export type Slice = { label: string; views: number; visitors: number };

/**
 * The aggregate endpoint names the grouped column after the dimension, and
 * spells the count differently between datasets — so the shaping is defensive
 * and lives here, where a unit test can hold it still.
 */
export function shapeRows(dimension: string, rows: unknown): Slice[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const value = r[dimension];
    const label =
      typeof value === 'string' && value !== '' ? value : value == null ? '(none)' : String(value);
    const views =
      typeof r.pageviews === 'number' ? r.pageviews : typeof r.count === 'number' ? r.count : 0;
    return {
      label,
      views,
      visitors: typeof r.visitors === 'number' ? r.visitors : 0,
    };
  });
}

export async function visitsBy(
  cfg: AnalyticsConfig,
  dimension: string,
  sinceIso: string,
  untilIso: string,
  limit = 10,
): Promise<Slice[]> {
  const raw = (await query(cfg, 'visits/aggregate', {
    since: sinceIso,
    until: untilIso,
    by: dimension,
    limit: String(limit),
  })) as { data?: unknown };
  return shapeRows(dimension, raw.data);
}

/**
 * The day series comes back sparse — days with no visits are simply absent —
 * and a bar chart with missing days lies about the shape of a week. Fill the
 * range, matching rows by their YYYY-MM-DD prefix whatever the API's exact
 * date spelling.
 */
export function fillDays(dayKeys: string[], rows: Slice[]): Slice[] {
  const byDay = new Map<string, Slice>();
  for (const row of rows) byDay.set(row.label.slice(0, 10), row);
  return dayKeys.map((key) => {
    const hit = byDay.get(key);
    return { label: key, views: hit?.views ?? 0, visitors: hit?.visitors ?? 0 };
  });
}

/** The last `n` UTC day keys, oldest first, ending today. */
export function lastDayKeys(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }
  return out;
}
