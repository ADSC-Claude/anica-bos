import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState, Tabs, Alert } from '@/components/ui';
import { PettyCashForm } from './form';
import { decideReplenishmentAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Petty cash' };

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('pettycash.log');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const settings = await getSettings(branchId);
  const manage = can(user.role, 'pettycash.manage');

  const [txns, requests, categories] = await Promise.all([
    prisma.pettyCashTxn.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.pettyCashRequest.findMany({
      where: { branchId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expenseCategory.findMany({
      where: { active: true, capitalized: false },
      orderBy: { name: 'asc' },
    }),
  ]);

  const balance = txns[0]?.balanceAfterCents ?? 0;
  const minimum = settings['pos.pettyCashMinimumCents'];
  const monthOut = txns
    .filter((t) => t.direction === 'OUT' && t.businessDate.getUTCMonth() === new Date().getUTCMonth())
    .reduce((a, t) => a + t.amountCents, 0);

  const tabs = [
    { href: '/portal/sales', label: "Today's sales" },
    { href: '/portal/sales/pos', label: 'New sale (POS)' },
    { href: '/portal/sales/petty-cash', label: 'Petty cash' },
    { href: '/portal/sales/eod', label: 'End of day' },
  ];

  return (
    <div>
      <PageHeader
        title="Petty cash"
        subtitle="Small cash-outs at the front desk. Every cash-out becomes an expense in Finance."
      />
      <Tabs tabs={tabs} current="/portal/sales/petty-cash" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Current balance"
          value={formatPeso(balance)}
          tone={balance <= minimum ? 'bad' : 'good'}
          hint={`Minimum ${formatPeso(minimum)}`}
        />
        <StatCard label="Paid out this month" value={formatPeso(monthOut)} />
        <StatCard label="Opening float" value={formatPeso(settings['pos.pettyCashFloatCents'])} />
        <StatCard label="Pending requests" value={String(requests.length)} tone={requests.length ? 'warn' : 'default'} />
      </div>

      {balance <= minimum && (
        <div className="mb-4">
          <Alert tone="warn">
            The petty cash box is at or below the minimum. Request a replenishment below — the
            Owner and Manager are notified straight away.
          </Alert>
        </div>
      )}

      {requests.length > 0 && (
        <div className="card-pad mb-4">
          <h2 className="section-title mb-2">Replenishment requests</h2>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sand-200 px-3 py-2 text-sm">
                <span>
                  <strong className="num">{formatPeso(r.amountCents)}</strong> — {r.reason || 'no reason given'}
                  <span className="block text-xs text-moss-400">
                    {r.requestedByName} · {formatManila(r.createdAt, { time: true })}
                  </span>
                </span>
                {manage ? (
                  <span className="flex gap-1.5">
                    <form action={decideReplenishmentAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="btn-primary btn-sm" type="submit">Approve</button>
                    </form>
                    <form action={decideReplenishmentAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <button className="btn-secondary btn-sm" type="submit">Reject</button>
                    </form>
                  </span>
                ) : (
                  <StatusBadge status="PENDING" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <PettyCashForm
          branchId={branchId}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          canAddCash={manage}
        />

        <div>
          <h2 className="section-title mb-3">Ledger</h2>
          {txns.length === 0 ? (
            <EmptyState title="No petty cash movements yet" />
          ) : (
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>By</th>
                    <th className="text-right">In</th>
                    <th className="text-right">Out</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap text-xs">{formatManila(t.createdAt)}</td>
                      <td className="text-sm">{t.description}</td>
                      <td className="text-xs text-moss-500">{t.recordedByName}</td>
                      <td className="num text-right text-moss-600">
                        {t.direction === 'IN' ? formatPeso(t.amountCents) : ''}
                      </td>
                      <td className="num text-right text-clay-500">
                        {t.direction === 'OUT' ? formatPeso(t.amountCents) : ''}
                      </td>
                      <td className="num text-right font-medium">{formatPeso(t.balanceAfterCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
