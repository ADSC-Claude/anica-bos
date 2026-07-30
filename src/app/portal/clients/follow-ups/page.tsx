import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { retentionWatch, retentionDigest, suggestBusinessThreshold } from '@/lib/retention';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatCard, EmptyState, Alert } from '@/components/ui';
import { logFollowUpAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client follow-ups' };

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('clients.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const settings = await getSettings(branchId);
  const fallbackDays = settings['retention.defaultThresholdDays'];

  const [rows, digest, suggested] = await Promise.all([
    retentionWatch([branchId], { fallbackDays, onlyOverdue: true }),
    retentionDigest([branchId], fallbackDays),
    suggestBusinessThreshold([branchId]),
  ]);

  return (
    <div>
      <PageHeader
        title="Needs follow-up"
        subtitle="Clients who are overdue to return, based on their own visit rhythm."
        actions={
          <Link href="/portal/marketing/campaigns" className="btn-secondary btn-sm">
            Campaign helper
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tracked clients" value={String(digest.trackedClients)} hint="with at least one visit" />
        <StatCard label="Lapsed" value={String(digest.lapsed)} tone={digest.lapsed ? 'bad' : 'good'} />
        <StatCard label="Returned in 30 days" value={String(digest.returned)} tone="good" />
        <StatCard label="Value at risk" value={formatPeso(digest.lapsedValueCents)} hint="lifetime spend of lapsed clients" />
      </div>

      <div className="mb-4">
        <Alert tone="info">
          Current business-wide threshold: <strong>{fallbackDays} days</strong> without a visit.
          {suggested !== null && suggested !== fallbackDays ? (
            <>
              {' '}
              Based on actual visit intervals, <strong>{suggested} days</strong> would fit your
              client base better — change it in{' '}
              <Link href="/portal/settings/operations" className="underline underline-offset-4">
                Settings → Operations
              </Link>
              .
            </>
          ) : (
            <> Each client is also judged against twice their own average gap between visits.</>
          )}
        </Alert>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nobody is overdue right now"
          hint="Clients reappear here when they pass their usual gap between visits."
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Last visit</th>
                <th className="text-right">Days since</th>
                <th className="text-right">Usual gap</th>
                <th className="text-right">Lifetime spend</th>
                <th>Follow up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clientId}>
                  <td>
                    <Link href={`/portal/clients/${r.clientId}`} className="font-medium text-moss-800 hover:underline">
                      {r.name}
                    </Link>
                    <span className="block text-xs text-moss-400">{r.mobile}</span>
                  </td>
                  <td className="whitespace-nowrap text-xs text-moss-500">
                    {r.lastVisit ? formatManila(r.lastVisit) : '—'}
                  </td>
                  <td className="num text-right font-semibold text-clay-500">
                    {r.daysSinceLastVisit}
                  </td>
                  <td className="num text-right text-moss-600">
                    {r.averageIntervalDays ? `${r.averageIntervalDays} d` : '—'}
                    <span className="block text-[11px] text-moss-400">
                      flag at {r.suggestedThresholdDays} d
                    </span>
                  </td>
                  <td className="num text-right">{formatPeso(r.lifetimeSpendCents)}</td>
                  <td>
                    <form action={logFollowUpAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="clientId" value={r.clientId} />
                      <select name="channel" className="select btn-sm w-auto min-h-9 py-1" defaultValue="email">
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="call">Call</option>
                        <option value="messenger">Messenger</option>
                      </select>
                      <button className="btn-secondary btn-sm" type="submit">
                        Log &amp; send
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
