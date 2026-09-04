import { requirePage } from '@/lib/guard';
import { formatDateKey } from '@/lib/datetime';
import {
  analyticsConfig,
  visitTotals,
  visitsBy,
  fillDays,
  lastDayKeys,
  type Slice,
  type Totals,
} from '@/lib/vercel-analytics';
import { BackLink, Bar, Card, Empty, Notice, PageHeader, Stat } from '@/components/ui';

export const metadata = { title: 'Visitors' };
export const dynamic = 'force-dynamic';

/**
 * Vercel's visitor numbers, shown where the people who run the business
 * actually look. Counting happens on the public site only — the portal and
 * the sign-in page never send a beacon — so these are guests and would-be
 * guests, not staff. Data refreshes every ten minutes; the Vercel dashboard
 * remains the fuller view (UTM campaigns, custom ranges, live feed).
 */

const DAYS = 30;

function countryName(code: string): string {
  if (code === '(none)') return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function SliceList({ rows, labeller }: { rows: Slice[]; labeller?: (label: string) => string }) {
  if (rows.length === 0) return <Empty>Nothing yet.</Empty>;
  const max = Math.max(...rows.map((r) => r.views), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-0.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{labeller ? labeller(r.label) : r.label}</span>
            <span className="tabular-nums text-xs text-[color:var(--color-ink-500)]">{r.views}</span>
          </div>
          <Bar value={r.views} target={max} />
        </li>
      ))}
    </ul>
  );
}

export default async function VisitorsPage() {
  await requirePage('reports.view');
  const cfg = analyticsConfig();

  if (!cfg) {
    return (
      <>
        <BackLink href="/portal/reports">Reports</BackLink>
        <PageHeader
          title="Visitors"
          subtitle="How many people are looking at the website, straight from Vercel's counter."
        />
        <Card title="Connect visitor statistics">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Create an API token at{' '}
              <span className="font-medium">vercel.com → Account settings → Tokens</span>, scoped to
              the team that owns the site. Copy it — it is shown once.
            </li>
            <li>
              In the Vercel project, add three environment variables:{' '}
              <code>VERCEL_ANALYTICS_TOKEN</code> (the token, as a secret),{' '}
              <code>VERCEL_ANALYTICS_PROJECT_ID</code> and <code>VERCEL_ANALYTICS_TEAM_ID</code>{' '}
              (both listed in DEPLOY.md under "Visitor statistics").
            </li>
            <li>Redeploy. This page starts showing numbers on its own.</li>
          </ol>
          <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
            Web Analytics must also be enabled once on the Vercel project (Analytics tab → Enable).
          </p>
        </Card>
      </>
    );
  }

  const now = new Date();
  const until = now.toISOString();
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30 = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const dayKeys = lastDayKeys(DAYS, now);

  let week: Totals, month: Totals, byDay: Slice[], pages: Slice[], countries: Slice[], referrers: Slice[], devices: Slice[];
  try {
    [week, month, byDay, pages, countries, referrers, devices] = await Promise.all([
      visitTotals(cfg, since7, until),
      visitTotals(cfg, since30, until),
      visitsBy(cfg, 'day', since30, until, 100).then((rows) => fillDays(dayKeys, rows)),
      visitsBy(cfg, 'requestPath', since30, until, 8),
      visitsBy(cfg, 'country', since30, until, 6),
      visitsBy(cfg, 'referrerHostname', since30, until, 6),
      visitsBy(cfg, 'deviceType', since30, until, 4),
    ]);
  } catch (error) {
    return (
      <>
        <BackLink href="/portal/reports">Reports</BackLink>
        <PageHeader title="Visitors" subtitle="How many people are looking at the website." />
        <Notice kind="error">
          Could not reach Vercel Web Analytics: {error instanceof Error ? error.message : 'unknown error'}.
          Check that the token is still valid and Web Analytics is enabled on the project.
        </Notice>
      </>
    );
  }

  const maxDay = Math.max(...byDay.map((d) => d.views), 1);

  return (
    <>
      <BackLink href="/portal/reports">Reports</BackLink>
      <PageHeader
        title="Visitors"
        subtitle="The public website only — the portal and sign-in pages are never counted. Refreshes every ten minutes."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Visitors, last 7 days" value={week.visitors} hint={`${week.pageviews} page views`} />
        <Stat label="Visitors, last 30 days" value={month.visitors} hint={`${month.pageviews} page views`} />
        <Stat
          label="Pages per visitor"
          value={month.visitors > 0 ? (month.pageviews / month.visitors).toFixed(1) : '—'}
          formula="page views ÷ visitors, 30 days"
        />
      </div>

      <Card title="Page views by day" className="mb-4">
        {month.pageviews === 0 ? (
          <Empty>
            Nothing counted yet. The counter starts with the first visit after Web Analytics was
            switched on — share the site and come back.
          </Empty>
        ) : (
          <>
            <div className="flex h-28 items-end gap-[2px]" aria-hidden="true">
              {byDay.map((d) => (
                <div
                  key={d.label}
                  className="min-w-0 flex-1 rounded-t bg-[color:var(--color-clay-600)]"
                  style={{ height: `${Math.max(2, Math.round((d.views / maxDay) * 100))}%`, opacity: d.views === 0 ? 0.15 : 1 }}
                  title={`${formatDateKey(d.label)} — ${d.views} view${d.views === 1 ? '' : 's'}, ${d.visitors} visitor${d.visitors === 1 ? '' : 's'}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-[color:var(--color-ink-500)]">
              <span>{formatDateKey(byDay[0].label)}</span>
              <span>{formatDateKey(byDay[byDay.length - 1].label)}</span>
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Most viewed pages">
          <SliceList rows={pages} />
        </Card>
        <Card title="Where visitors are">
          <SliceList rows={countries} labeller={countryName} />
        </Card>
        <Card title="How they found the site">
          <SliceList rows={referrers} labeller={(l) => (l === '(none)' ? 'Direct — typed or bookmarked' : l)} />
        </Card>
        <Card title="Phone or computer">
          <SliceList rows={devices} labeller={(l) => l.charAt(0).toUpperCase() + l.slice(1)} />
        </Card>
      </div>

      <p className="mt-4 text-xs text-[color:var(--color-ink-500)]">
        Counting is cookieless and anonymous — no personal data is collected, and visitors using ad
        blockers are invisible to every tool of this kind. The Vercel dashboard has the fuller view:
        campaigns, custom date ranges and a live feed.
      </p>
    </>
  );
}
