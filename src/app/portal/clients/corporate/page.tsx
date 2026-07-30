import Link from 'next/link';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, EmptyState, StatusBadge } from '@/components/ui';
import { CorporateAccountForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Corporate accounts' };

export default async function CorporatePage() {
  const user = await requirePage('corporate.view');
  const manage = can(user.role, 'corporate.manage');

  const accounts = await prisma.corporateAccount.findMany({
    include: {
      clients: { include: { client: { select: { id: true, name: true } } } },
      payments: true,
      sales: {
        where: { status: 'PAID' },
        include: { payments: { where: { method: 'CORPORATE_CHARGE' } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows = accounts.map((a) => {
    const charged = a.sales.reduce(
      (sum, s) => sum + s.payments.reduce((x, p) => x + p.amountCents, 0),
      0,
    );
    const settled = a.payments.reduce((x, p) => x + p.amountCents, 0);
    const outstanding = charged - settled;
    const oldestUnsettled = a.sales
      .filter((s) => s.payments.length > 0)
      .sort((x, y) => x.businessDate.getTime() - y.businessDate.getTime())[0];
    const ageDays = oldestUnsettled && outstanding > 0
      ? Math.round((Date.now() - oldestUnsettled.businessDate.getTime()) / 86_400_000)
      : 0;
    return { account: a, charged, settled, outstanding, ageDays };
  });

  return (
    <div>
      <PageHeader
        title="Corporate accounts"
        subtitle="Companies whose staff charge treatments to a monthly account."
        actions={
          <Link href="/portal/finance/receivables" className="btn-secondary btn-sm">
            Statements &amp; ageing
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No corporate accounts yet" />
      ) : (
        <div className="mb-6 card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Charged</th>
                <th className="text-right">Outstanding</th>
                <th className="text-right">Credit limit</th>
                <th>Linked clients</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account: a, charged, outstanding }) => (
                <tr key={a.id}>
                  <td>
                    <span className="font-medium text-moss-800">{a.name}</span>
                    {a.tin && <span className="block text-xs text-moss-400">TIN {a.tin}</span>}
                    {!a.active && <StatusBadge status="CANCELLED" label="inactive" />}
                  </td>
                  <td className="text-xs text-moss-500">
                    {a.contactPerson}
                    <br />
                    {a.contactMobile}
                  </td>
                  <td className="num text-right">
                    {a.discountType === 'PERCENT' ? `${a.discountValue}%` : formatPeso(a.discountValue)}
                  </td>
                  <td className="num text-right">{formatPeso(charged)}</td>
                  <td className={`num text-right font-semibold ${outstanding > 0 ? 'text-clay-500' : 'text-moss-600'}`}>
                    {formatPeso(outstanding)}
                  </td>
                  <td className="num text-right text-moss-500">
                    {a.creditLimitCents ? formatPeso(a.creditLimitCents) : 'none'}
                  </td>
                  <td className="text-xs text-moss-500">
                    {a.clients.length
                      ? a.clients.map((l) => l.client.name).join(', ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manage ? (
        <div className="max-w-2xl">
          <h2 className="section-title mb-3">Add or edit an account</h2>
          <CorporateAccountForm
            accounts={accounts.map((a) => ({
              id: a.id,
              name: a.name,
              tin: a.tin,
              billingAddress: a.billingAddress,
              contactPerson: a.contactPerson,
              contactMobile: a.contactMobile,
              contactEmail: a.contactEmail,
              discountType: a.discountType,
              discountValue: a.discountValue,
              creditLimitCents: a.creditLimitCents,
              paymentTermsDays: a.paymentTermsDays,
              active: a.active,
            }))}
          />
        </div>
      ) : (
        <p className="muted">
          Only the Owner or Manager can add accounts or change negotiated rates. You can tag a
          sale to an existing account at checkout.
        </p>
      )}
    </div>
  );
}
