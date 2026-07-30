import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { discountAmount, formatPeso } from '@/lib/money';
import { PageHeader, EmptyState, StatusBadge } from '@/components/ui';
import { PartnerForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Partners' };

export default async function PartnersPage() {
  const user = await requirePage('partners.view');
  const manage = can(user.role, 'partners.manage');

  const partners = await prisma.partner.findMany({
    include: {
      sales: { where: { status: 'PAID' }, select: { totalCents: true, subtotalCents: true, discountCents: true } },
      appointments: { select: { id: true } },
    },
    orderBy: { name: 'asc' },
  });

  const rows = partners.map((p) => {
    const revenue = p.sales.reduce((a, s) => a + (s.subtotalCents - s.discountCents), 0);
    // What we owe the partner for the business they sent us.
    const fee =
      p.feeType === 'PERCENT'
        ? discountAmount(revenue, 'PERCENT', p.feeValue)
        : p.feeValue * p.sales.length;
    return { p, revenue, fee, referrals: p.appointments.length, sales: p.sales.length };
  });

  return (
    <div>
      <PageHeader
        title="Partners"
        subtitle="Hotels, condos, offices, gyms and referrers, with their agreed terms and what they have earned."
      />

      {rows.length === 0 ? (
        <EmptyState title="No partners yet" />
      ) : (
        <div className="mb-6 card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Type</th>
                <th>Code</th>
                <th className="text-right">Referrals</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Fee due</th>
                <th>Guest rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, revenue, fee, referrals, sales }) => (
                <tr key={p.id}>
                  <td>
                    <span className="font-medium text-moss-800">{p.name}</span>
                    {p.contactPerson && (
                      <span className="block text-xs text-moss-400">{p.contactPerson}</span>
                    )}
                    {!p.active && <StatusBadge status="CANCELLED" label="inactive" />}
                  </td>
                  <td className="capitalize text-moss-600">{p.type}</td>
                  <td className="num text-xs">{p.promoCode ?? '—'}</td>
                  <td className="num text-right">
                    {referrals}
                    <span className="block text-[11px] text-moss-400">{sales} paid</span>
                  </td>
                  <td className="num text-right">{formatPeso(revenue)}</td>
                  <td className="num text-right font-semibold text-moss-700">{formatPeso(fee)}</td>
                  <td className="text-xs text-moss-500">
                    {p.guestDiscountType === 'PERCENT'
                      ? `${p.guestDiscountValue}% off`
                      : `${formatPeso(p.guestDiscountValue)} off`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manage ? (
        <div className="max-w-2xl">
          <h2 className="section-title mb-3">Add or edit a partner</h2>
          <PartnerForm
            partners={partners.map((p) => ({
              id: p.id,
              name: p.name,
              type: p.type,
              contactPerson: p.contactPerson,
              contactMobile: p.contactMobile,
              contactEmail: p.contactEmail,
              feeType: p.feeType,
              feeValue: p.feeType === 'FIXED' ? p.feeValue / 100 : p.feeValue,
              guestDiscountType: p.guestDiscountType,
              guestDiscountValue: p.guestDiscountValue,
              promoCode: p.promoCode ?? '',
              terms: p.terms,
              active: p.active,
            }))}
          />
        </div>
      ) : (
        <p className="muted">
          Only the Owner or Manager can change partner terms. You can tag a booking or sale to
          an existing partner.
        </p>
      )}
    </div>
  );
}
