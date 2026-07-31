import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { PageHeader, StatusBadge, Alert } from '@/components/ui';
import { Receipt } from '@/components/receipt';
import { VoidForm } from './void-form';
import { PrintClient } from './print-button';

export const dynamic = 'force-dynamic';

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage('pos.use');
  const { id } = await params;

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      branch: true,
      series: true,
      client: true,
      cashier: { select: { name: true } },
      voidedBy: { select: { name: true } },
      appointment: { select: { id: true, reference: true } },
      corporateAccount: { select: { name: true } },
      lines: { include: { employee: { select: { name: true } } }, orderBy: { sortRank: 'asc' } },
      discounts: { orderBy: { sequence: 'asc' } },
      payments: true,
      commissions: { include: { employee: { select: { name: true } } } },
      gcRedemptions: { include: { gc: { select: { code: true } } } },
      giftCertificatesSold: true,
    },
  });
  if (!sale) notFound();

  const settings = await getSettings(sale.branchId);
  const canVoid = can(user.role, 'pos.void');
  const showMoney = can(user.role, 'dashboard.financials');

  return (
    <div className="max-w-3xl">
      <div className="no-print">
        <PageHeader
          title={`Receipt ${sale.receiptNo}`}
          subtitle={`${formatManila(sale.createdAt, { time: true })} · issued by ${sale.cashier.name}`}
          actions={
            <>
              <Link href="/portal/sales" className="btn-secondary btn-sm">
                Back to sales
              </Link>
              <PrintClient />
            </>
          }
        />

        {sale.status === 'VOIDED' && (
          <div className="mb-4">
            <Alert tone="danger">
              <strong>This sale was voided</strong>
              {sale.voidedBy ? ` by ${sale.voidedBy.name}` : ''}
              {sale.voidedAt ? ` on ${formatManila(sale.voidedAt, { time: true })}` : ''}. Reason:{' '}
              {sale.voidReason}. The receipt number is retained and is never reused — required for
              BIR CAS integrity.
            </Alert>
          </div>
        )}

        {sale.giftCertificatesSold.length > 0 && (
          <div className="mb-4">
            <Alert tone="info">
              Gift certificate code(s) issued on this sale:{' '}
              {sale.giftCertificatesSold.map((g) => g.code).join(', ')}
            </Alert>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Receipt
          sale={sale}
          business={{
            name: settings['business.name'],
            address: sale.branch.address || settings['business.address'],
            contact: sale.branch.contact || settings['business.contact'],
            tin: settings['business.tin'],
            footer: settings['business.receiptFooter'],
            nonVatNotice: settings['tax.nonVatNotice'],
            permitNumber: sale.series.permitNumber,
            seriesName: sale.series.name,
            casAccredited: settings['tax.casAccredited'],
          }}
        />

        <div className="space-y-4 no-print">
          <div className="card-pad">
            <h2 className="section-title mb-2">Details</h2>
            <dl className="space-y-1 text-sm">
              <Row label="Client" value={sale.client?.name ?? 'Walk-in'} />
              {sale.corporateAccount && <Row label="Charged to" value={sale.corporateAccount.name} />}
              {sale.appointment && (
                <div className="flex justify-between gap-3">
                  <dt className="text-cocoa-500">Appointment</dt>
                  <dd>
                    <Link href={`/portal/appointments/${sale.appointment.id}`} className="text-cocoa-700 underline underline-offset-4">
                      {sale.appointment.reference}
                    </Link>
                  </dd>
                </div>
              )}
              <Row label="Business date" value={sale.businessDate.toISOString().slice(0, 10)} />
              <Row label="Tax regime" value={sale.taxRegime === 'NON_VAT_8' ? 'Non-VAT (8% option)' : 'VAT-registered'} />
              <Row label="Status" value={sale.status} />
            </dl>
          </div>

          {showMoney && sale.commissions.length > 0 && (
            <div className="card-pad">
              <h2 className="section-title mb-2">Commissions credited</h2>
              <ul className="space-y-1 text-sm">
                {sale.commissions.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3">
                    <span className="text-cocoa-600">
                      {c.employee.name}
                      <span className="ml-1 text-xs text-cocoa-400">
                        ({c.rateType === 'PERCENT' ? `${c.rateValue}% of ${formatPeso(c.basisCents)}` : 'fixed'})
                      </span>
                    </span>
                    <span className="num">{formatPeso(c.amountCents)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-cocoa-400">
                Computed on the undiscounted list price, so promos never reduce therapist pay.
              </p>
            </div>
          )}

          {canVoid && sale.status === 'PAID' && (
            <div className="card-pad">
              <h2 className="section-title mb-2">Void this sale</h2>
              <p className="muted mb-3">
                Financial records are never deleted. Voiding reverses stock, loyalty points and
                the journal entries, keeps the receipt number, and is written to the audit log.
              </p>
              <VoidForm saleId={sale.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-cocoa-500">{label}</dt>
      <dd className="text-right capitalize text-cocoa-700">{value.toLowerCase()}</dd>
    </div>
  );
}

