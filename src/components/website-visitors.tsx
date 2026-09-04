import { getWebAnalytics } from '@/lib/web-analytics';
import { prisma } from '@/lib/db';

/**
 * How many people looked at the website, and how many of them booked.
 *
 * The visitor count on its own is a vanity number — it goes up when somebody
 * shares a link and tells the spa nothing it can act on. Set against the
 * bookings taken in the same week it becomes a real question: two hundred
 * people read the price list and four of them booked, so what is wrong with
 * the price list?
 *
 * The two halves come from different places and are honest about it. Visitors
 * are Vercel's count of the public site. Bookings are our own rows, and only
 * the ones made online — a walk-in never saw the website, and folding those in
 * would flatter the rate into meaninglessness.
 */
export async function WebsiteVisitors({ branchIds }: { branchIds: string[] }) {
  const analytics = await getWebAnalytics();

  if (analytics.state === 'unconfigured') {
    return (
      <section className="card-pad">
        <p className="section-title">Website visitors</p>
        <p className="muted mt-2 text-sm">
          Not connected yet. Enable Web Analytics on the Vercel project, then add a read-only
          Vercel token as <code>VERCEL_ANALYTICS_TOKEN</code> and the project id as{' '}
          <code>VERCEL_ANALYTICS_PROJECT_ID</code> in the project&apos;s environment variables.
          The website is already counting; this panel only reads the count back.
        </p>
      </section>
    );
  }

  if (analytics.state === 'unavailable') {
    return (
      <section className="card-pad">
        <p className="section-title">Website visitors</p>
        <p className="muted mt-2 text-sm">
          The reading could not be fetched. {analytics.reason} Nothing else on this page is
          affected, and the website is still counting.
        </p>
      </section>
    );
  }

  const { last7, last30, topPages } = analytics.data;

  // The same seven days the visitor figure covers, so the two can be divided.
  const since = new Date(Date.now() - 7 * 86_400_000);
  const bookings = await prisma.appointment.count({
    where: {
      branchId: { in: branchIds },
      source: 'ONLINE',
      createdAt: { gte: since },
      status: { notIn: ['CANCELLED', 'EXPIRED'] },
    },
  });

  // Guarded because a spa with no visitors yet would otherwise be told its
  // conversion rate is NaN%, which reads as a broken page rather than a quiet
  // week.
  const rate = last7.visitors > 0 ? (bookings / last7.visitors) * 100 : null;

  return (
    <section className="card-pad">
      <p className="section-title">Website visitors</p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Last 7 days" value={last7.visitors} hint={`${last7.pageviews} pages read`} />
        <Figure label="Last 30 days" value={last30.visitors} hint={`${last30.pageviews} pages read`} />
        <Figure label="Booked online" value={bookings} hint="in the last 7 days" />
        <Figure
          label="Of those who looked"
          value={rate === null ? '—' : `${rate.toFixed(1)}%`}
          hint={rate === null ? 'no visitors yet' : 'went on to book'}
        />
      </div>

      {topPages.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cocoa-500">
            Most read, last 30 days
          </p>
          <ul className="mt-2 space-y-1">
            {topPages.map((p: { path: string; pageviews: number }) => (
              <li key={p.path} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-cocoa-700">{p.path}</span>
                <span className="num shrink-0 text-cocoa-500">{p.pageviews}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-cocoa-500">{label}</p>
      <p className="num mt-1 text-2xl text-cocoa-800">{value}</p>
      <p className="mt-0.5 text-[11px] text-cocoa-400">{hint}</p>
    </div>
  );
}
