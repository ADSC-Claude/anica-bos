import Link from 'next/link';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatPeso } from '@/lib/money';
import {
  dateKeyToBusinessDate, formatMonthKey, manilaMonthKey, monthBounds,
} from '@/lib/datetime';
import { PageHeader, StatCard, Alert, EmptyState } from '@/components/ui';
import { FinanceTabs } from '@/components/finance-tabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BIR journals' };

const SOURCES = [
  { key: 'SALES', label: 'Sales journal' },
  { key: 'CASH_RECEIPTS', label: 'Cash receipts journal' },
  { key: 'CASH_DISBURSEMENTS', label: 'Cash disbursements journal' },
  { key: 'GENERAL', label: 'General journal' },
] as const;

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; source?: string; branchId?: string }>;
}) {
  const user = await requirePage('finance.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const monthKey = params.month ?? manilaMonthKey();
  const source = (params.source ?? 'SALES') as (typeof SOURCES)[number]['key'];
  const { fromKey, toKey } = monthBounds(monthKey);
  const settings = await getSettings(branchId);

  const [entries, series, totals] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        branchId,
        source,
        entryDate: { gte: dateKeyToBusinessDate(fromKey), lte: dateKeyToBusinessDate(toKey) },
      },
      include: { lines: { include: { account: true } } },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    }),
    prisma.receiptSeries.findMany({ where: { branchId } }),
    prisma.journalLine.aggregate({
      where: {
        entry: {
          branchId,
          entryDate: { gte: dateKeyToBusinessDate(fromKey), lte: dateKeyToBusinessDate(toKey) },
        },
      },
      _sum: { debitCents: true, creditCents: true },
    }),
  ]);

  const debits = totals._sum.debitCents ?? 0;
  const credits = totals._sum.creditCents ?? 0;

  return (
    <div>
      <PageHeader
        title="BIR-format journals"
        subtitle={`${formatMonthKey(monthKey)} · generated only when you ask for them`}
        actions={
          <>
            <form className="flex gap-2" action="/portal/finance/journals">
              <input type="hidden" name="source" value={source} />
              <input type="month" name="month" defaultValue={monthKey} className="input w-auto" />
              <button className="btn-secondary btn-sm" type="submit">Go</button>
            </form>
            <Link
              href={`/api/portal/export/journal?source=${source}&month=${monthKey}&branchId=${branchId}`}
              className="btn-primary btn-sm"
            >
              Export this journal
            </Link>
            <Link
              href={`/api/portal/export/journal?source=LEDGER&month=${monthKey}&branchId=${branchId}`}
              className="btn-secondary btn-sm"
            >
              General ledger
            </Link>
          </>
        }
      />
      <FinanceTabs role={user.role} current="/portal/finance/journals" />

      <div className="mb-4">
        <Alert tone="info">
          These journals are produced from real double-entry postings, so they balance by
          construction. <strong>Nothing is transmitted anywhere</strong> — the BIR receives
          nothing from this system, and exports happen only on your explicit action. Payroll,
          incentives, KPIs and client data are kept out of these files.
        </Alert>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Entries this month" value={String(entries.length)} />
        <StatCard label="Total debits" value={formatPeso(debits)} />
        <StatCard label="Total credits" value={formatPeso(credits)} />
        <StatCard
          label="Balanced"
          value={debits === credits ? 'Yes' : 'No'}
          tone={debits === credits ? 'good' : 'bad'}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {SOURCES.map((s) => (
          <Link
            key={s.key}
            href={`/portal/finance/journals?source=${s.key}&month=${monthKey}`}
            className={`btn-sm ${source === s.key ? 'btn-primary' : 'btn-secondary'}`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {series.length > 0 && (
        <div className="card-pad mb-4">
          <h2 className="section-title mb-2">Receipt series (immutable &amp; gapless)</h2>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Series</th>
                  <th>Prefix</th>
                  <th>ATP / permit</th>
                  <th className="text-right">Range</th>
                  <th className="text-right">Next number</th>
                  <th className="text-right">Issued</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="num">{s.prefix}</td>
                    <td className="text-xs text-moss-500">{s.permitNumber || '—'}</td>
                    <td className="num text-right">{s.rangeStart}–{s.rangeEnd}</td>
                    <td className="num text-right">{s.next}</td>
                    <td className="num text-right">{s.next - s.rangeStart}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-moss-400">
            Voided receipt numbers are retained and never reused. Corrections are posted as
            reversing entries — no financial record is ever deleted. Records are retained and
            exportable for 10 years.
          </p>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState title="No entries in this journal for the selected month" />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Account</th>
                <th>Memo</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) =>
                e.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs">
                      {i === 0 ? e.entryDate.toISOString().slice(0, 10) : ''}
                    </td>
                    <td className="num text-xs">{i === 0 ? e.reference : ''}</td>
                    <td className="text-xs">
                      <span className="num text-moss-400">{l.account.code}</span> {l.account.name}
                    </td>
                    <td className="text-xs text-moss-500">{l.memo || (i === 0 ? e.memo : '')}</td>
                    <td className="num text-right">{l.debitCents ? formatPeso(l.debitCents) : ''}</td>
                    <td className="num text-right">{l.creditCents ? formatPeso(l.creditCents) : ''}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-moss-400">
        Tax regime:{' '}
        {settings['tax.regime'] === 'NON_VAT_8'
          ? 'Non-VAT, 8% income tax option — receipts print the required non-VAT notation.'
          : 'VAT-registered — output VAT is broken out on receipts and in the journals.'}
      </p>
    </div>
  );
}
