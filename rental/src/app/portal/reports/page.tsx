import Link from 'next/link';
import { requirePage, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { buildReport, isReportKey, REPORTS } from '@/lib/reports';
import { manilaDateKey, manilaMonthKey, monthBounds, formatDateKey } from '@/lib/datetime';
import { Card, Empty, PageHeader } from '@/components/ui';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; from?: string; to?: string }>;
}) {
  const user = await requirePage('reports.view');
  const sp = await searchParams;
  const propertyIds = await visibleProperties(user);
  const mayExport = can(user.role, 'finance.export');

  const thisMonth = monthBounds(manilaMonthKey());
  const fromKey = sp.from ?? thisMonth.fromKey;
  const toKey = sp.to ?? (thisMonth.toKey > manilaDateKey() ? manilaDateKey() : thisMonth.toKey);
  const key = sp.report && isReportKey(sp.report) ? sp.report : 'daily-ops';

  const report = await buildReport(key, { fromKey, toKey, propertyIds });
  const query = `report=${key}&from=${fromKey}&to=${toKey}`;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${formatDateKey(fromKey)} → ${formatDateKey(toKey)}`}
        actions={
          <>
            <Link className="btn btn-secondary" href="/portal/reports/visitors">
              Visitors
            </Link>
            {mayExport && (
              <a className="btn btn-secondary" href={`/api/reports/${key}.csv?from=${fromKey}&to=${toKey}`}>
                Download CSV
              </a>
            )}
            <button className="btn btn-secondary print:hidden" type="button" data-print>
              Print
            </button>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden" method="get">
        <label className="block">
          <span className="label">Report</span>
          <select className="field w-auto" name="report" defaultValue={key}>
            {REPORTS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">From</span>
          <input className="field w-auto" name="from" type="date" defaultValue={fromKey} />
        </label>
        <label className="block">
          <span className="label">To</span>
          <input className="field w-auto" name="to" type="date" defaultValue={toKey} />
        </label>
        <button className="btn btn-primary" type="submit">
          Run
        </button>
      </form>

      <nav className="mb-4 flex flex-wrap gap-1 print:hidden">
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={`/portal/reports?report=${r.key}&from=${fromKey}&to=${toKey}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              r.key === key
                ? 'bg-[color:var(--color-clay-500)] text-white'
                : 'hover:bg-[color:var(--color-sand-100)]'
            }`}
          >
            {r.title}
          </Link>
        ))}
      </nav>

      <Card
        title={report.title}
        actions={
          <span className="text-xs text-[color:var(--color-ink-500)]">
            {report.rows.length} row{report.rows.length === 1 ? '' : 's'}
          </span>
        }
      >
        <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">{report.description}</p>

        {report.rows.length === 0 ? (
          <Empty>Nothing in this window.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                  {report.headers.map((h, i) => (
                    <th
                      key={h}
                      className={`py-2 ${report.numericFrom !== undefined && i >= report.numericFrom ? 'text-right' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                {report.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`py-2 ${
                          report.numericFrom !== undefined && ci >= report.numericFrom
                            ? 'text-right tabular-nums'
                            : ''
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-[color:var(--color-ink-500)] print:hidden">
        The CSV is the same query as the table above — a download that disagrees with the page it
        came from is worse than no download. Money leaves as a plain number so a spreadsheet can
        add the column up. For a PDF, print this page: the stylesheet already drops the navigation.
      </p>

      {/* One line of script rather than a client component for a single button. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.querySelector('[data-print]')?.addEventListener('click',()=>window.print())`,
        }}
      />
      <span hidden>{query}</span>
    </>
  );
}
