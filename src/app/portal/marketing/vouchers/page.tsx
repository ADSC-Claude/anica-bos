import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState, Tabs } from '@/components/ui';
import { MARKETING_TABS } from '../tabs';
import { VoucherForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vouchers & gift certificates' };

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePage('marketing.view');
  const params = await searchParams;
  const q = (params.q ?? '').trim().toUpperCase();
  const canEdit = can(user.role, 'marketing.edit');

  const [vouchers, gcs] = await Promise.all([
    prisma.voucher.findMany({
      where: q ? { code: { contains: q } } : {},
      include: { batch: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.giftCertificate.findMany({
      where: q ? { code: { contains: q } } : {},
      include: {
        buyerClient: { select: { name: true } },
        redemptions: { include: { sale: { select: { receiptNo: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  // Unredeemed gift certificate value is a real liability on the books.
  const outstanding = gcs
    .filter((g) => g.status !== 'CANCELLED' && g.status !== 'EXPIRED')
    .reduce((a, g) => a + g.balanceCents, 0);

  return (
    <div>
      <PageHeader
        title="Vouchers &amp; gift certificates"
        subtitle="Search by code, check remaining value, and issue campaign batches."
      />
      <Tabs tabs={MARKETING_TABS} current="/portal/marketing/vouchers" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gift certificates issued" value={String(gcs.length)} />
        <StatCard
          label="Outstanding GC liability"
          value={formatPeso(outstanding)}
          hint="unredeemed value — visible in Finance"
          tone={outstanding ? 'warn' : 'default'}
        />
        <StatCard label="Vouchers issued" value={String(vouchers.length)} />
        <StatCard
          label="Vouchers still usable"
          value={String(vouchers.filter((v) => v.status === 'ACTIVE' || v.status === 'PARTIALLY_USED').length)}
        />
      </div>

      <form className="mb-4 flex gap-2" action="/portal/marketing/vouchers">
        <input name="q" defaultValue={q} className="input" placeholder="Search by code (GC-… or ANC-…)" />
        <button className="btn-secondary" type="submit">Search</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div>
            <h2 className="section-title mb-3">Gift certificates</h2>
            {gcs.length === 0 ? (
              <EmptyState title="No gift certificates yet" hint="They are sold through the POS." />
            ) : (
              <div className="card table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th className="text-right">Face value</th>
                      <th className="text-right">Balance</th>
                      <th>Buyer</th>
                      <th>Expires</th>
                      <th>Redeemed on</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gcs.map((g) => (
                      <tr key={g.id}>
                        <td className="num font-medium tracking-wide">{g.code}</td>
                        <td className="num text-right">{formatPeso(g.faceValueCents)}</td>
                        <td className="num text-right font-semibold">{formatPeso(g.balanceCents)}</td>
                        <td className="text-xs">{g.buyerClient?.name ?? '—'}</td>
                        <td className="text-xs text-moss-500">
                          {g.expiresAt ? formatManila(g.expiresAt) : 'no expiry'}
                        </td>
                        <td className="text-xs text-moss-500">
                          {g.redemptions.map((r) => r.sale.receiptNo).join(', ') || '—'}
                        </td>
                        <td><StatusBadge status={g.status === 'ACTIVE' ? 'ACTIVE' : g.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="section-title mb-3">Vouchers</h2>
            {vouchers.length === 0 ? (
              <EmptyState title="No vouchers issued yet" />
            ) : (
              <div className="card table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Batch</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">Uses</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.map((v) => (
                      <tr key={v.id}>
                        <td className="num font-medium tracking-wide">{v.code}</td>
                        <td className="text-xs text-moss-500">{v.batch?.name ?? '—'}</td>
                        <td className="num text-right">
                          {v.type === 'PERCENT' ? `${v.value}%` : formatPeso(v.value)}
                        </td>
                        <td className="num text-right">{v.usesCount} / {v.usesAllowed}</td>
                        <td className="text-xs text-moss-500">
                          {v.expiresAt ? formatManila(v.expiresAt) : 'no expiry'}
                        </td>
                        <td><StatusBadge status={v.status === 'ACTIVE' ? 'ACTIVE' : v.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {canEdit && <VoucherForm />}
      </div>
    </div>
  );
}
