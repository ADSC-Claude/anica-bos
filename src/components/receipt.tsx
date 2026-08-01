import { formatPeso } from '@/lib/money';
import { formatManila } from '@/lib/datetime';
import { shownName } from '@/lib/people';

type SaleForReceipt = {
  receiptNo: string;
  createdAt: Date;
  subtotalCents: number;
  discountCents: number;
  depositCreditCents: number;
  tipCents: number;
  totalCents: number;
  paidCents: number;
  changeCents: number;
  taxRegime: string;
  vatableSalesCents: number;
  vatExemptSalesCents: number;
  vatAmountCents: number;
  status: string;
  client: { name: string; pwdIdNumber?: string; seniorIdNumber?: string } | null;
  cashier: { name: string };
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    employee: { name: string } | null;
  }[];
  discounts: { id: string; label: string; amountCents: number; idNumber: string }[];
  payments: { id: string; method: string; amountCents: number; reference: string }[];
  gcRedemptions?: { id: string; amountCents: number; gc: { code: string } }[];
};

/**
 * 58/80 mm thermal-friendly receipt. Renders as a plain block that prints
 * cleanly; screen preview mirrors what the printer produces.
 */
export function Receipt({
  sale,
  business,
}: {
  sale: SaleForReceipt;
  business: {
    name: string;
    address: string;
    contact: string;
    tin: string;
    footer: string;
    nonVatNotice: string;
    permitNumber: string;
    seriesName: string;
    casAccredited: boolean;
  };
}) {
  const nonVat = sale.taxRegime === 'NON_VAT_8';
  const idDiscounts = sale.discounts.filter((d) => d.idNumber);

  return (
    <div className="receipt card mx-auto w-full max-w-[320px] bg-white p-4 font-mono text-[11px] leading-snug text-black">
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{business.name}</p>
        <p>{business.address}</p>
        <p>{business.contact}</p>
        <p>TIN {business.tin}</p>
        <p className="mt-1 font-semibold uppercase">
          {nonVat ? 'Non-VAT Sales Invoice' : 'VAT Sales Invoice'}
        </p>
        {business.permitNumber && <p className="text-[10px]">ATP/Permit: {business.permitNumber}</p>}
      </div>

      <Divider />

      <div className="flex justify-between">
        <span>No.</span>
        <span className="font-bold">{sale.receiptNo}</span>
      </div>
      <div className="flex justify-between">
        <span>Date</span>
        <span>{formatManila(sale.createdAt, { time: true })}</span>
      </div>
      <div className="flex justify-between">
        <span>Client</span>
        <span>{sale.client?.name ?? 'Walk-in'}</span>
      </div>
      <div className="flex justify-between">
        <span>Cashier</span>
        <span>{sale.cashier.name}</span>
      </div>

      {sale.status === 'VOIDED' && (
        <p className="mt-2 border border-black py-1 text-center font-bold">*** VOIDED ***</p>
      )}

      <Divider />

      {sale.lines.map((l) => (
        <div key={l.id} className="mb-1">
          <div className="flex justify-between gap-2">
            <span className="min-w-0 flex-1">{l.description}</span>
            <span>{formatPeso(l.lineTotalCents, false)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-neutral-600">
            <span>
              {l.quantity} × {formatPeso(l.unitPriceCents, false)}
              {l.employee ? ` · ${shownName(l.employee)}` : ''}
            </span>
          </div>
        </div>
      ))}

      <Divider />

      <Line label="Subtotal" value={sale.subtotalCents} />
      {sale.discounts.map((d) => (
        <Line key={d.id} label={d.label} value={-d.amountCents} />
      ))}
      {sale.tipCents > 0 && <Line label="Tip" value={sale.tipCents} />}
      <Line label="TOTAL" value={sale.totalCents} bold />

      {sale.depositCreditCents > 0 && (
        <Line label="Less: reservation fee paid" value={-sale.depositCreditCents} />
      )}
      {(sale.gcRedemptions ?? []).map((g) => (
        <Line key={g.id} label={`Gift cert ${g.gc.code}`} value={-g.amountCents} />
      ))}

      <Divider />

      {sale.payments.map((p) => (
        <Line
          key={p.id}
          label={p.method.replaceAll('_', ' ')}
          value={p.amountCents}
          note={p.reference}
        />
      ))}
      {sale.changeCents > 0 && <Line label="CHANGE" value={sale.changeCents} bold />}

      {!nonVat && (
        <>
          <Divider />
          <Line label="VATable sales" value={sale.vatableSalesCents} />
          <Line label="VAT-exempt sales" value={sale.vatExemptSalesCents} />
          <Line label="VAT (12%)" value={sale.vatAmountCents} />
        </>
      )}

      {idDiscounts.length > 0 && (
        <>
          <Divider />
          {idDiscounts.map((d) => (
            <div key={d.id} className="text-[10px]">
              <p>{d.label} — ID No. {d.idNumber}</p>
              <p className="mt-2">Signature: ______________________</p>
            </div>
          ))}
        </>
      )}

      <Divider />

      <p className="text-center text-[10px]">{business.footer}</p>
      {nonVat && (
        <p className="mt-1 text-center text-[9px] uppercase">{business.nonVatNotice}</p>
      )}
      {!business.casAccredited && (
        <p className="mt-1 text-center text-[9px] text-neutral-500">
          Record-keeping system — not yet a BIR-accredited CAS.
        </p>
      )}
      <p className="mt-1 text-center text-[9px]">
        This serves as your official receipt. Please keep it for your records.
      </p>
    </div>
  );
}

function Divider() {
  return <p className="my-1.5 border-t border-dashed border-black" />;
}

function Line({
  label,
  value,
  bold,
  note,
}: {
  label: string;
  value: number;
  bold?: boolean;
  note?: string;
}) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}>
      <span className="capitalize">
        {label.toLowerCase()}
        {note ? <span className="ml-1 text-[9px] text-neutral-500">{note}</span> : null}
      </span>
      <span>{formatPeso(value, false)}</span>
    </div>
  );
}
