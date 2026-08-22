import { handle, requireApi, visibleProperties, HttpError } from '@/lib/guard';
import { csvResponse } from '@/lib/csv';
import { buildReport, isReportKey } from '@/lib/reports';
import { manilaDateKey, manilaMonthKey, monthBounds } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * CSV export for every report. Same builder as the screen, so the file and the
 * page can never disagree — and the same two gates: `reports.view` to run one,
 * `finance.export` to take it off the premises.
 */
export const GET = handle(async (req, ctx) => {
  const user = await requireApi('reports.view');

  const { key: raw } = await ctx.params;
  const key = raw.replace(/\.csv$/, '');
  if (!isReportKey(key)) throw new HttpError(404, 'No such report.');

  // Exporting is a separate permission from reading: Reservations staff can see
  // a list on screen without being able to walk out with the file.
  await requireApi('finance.export');

  const url = new URL(req.url);
  const thisMonth = monthBounds(manilaMonthKey());
  const fromKey = url.searchParams.get('from') ?? thisMonth.fromKey;
  const toKey = url.searchParams.get('to') ?? manilaDateKey();
  if (!DATE.test(fromKey) || !DATE.test(toKey)) {
    throw new HttpError(400, 'from and to must be YYYY-MM-DD dates.');
  }
  if (toKey < fromKey) throw new HttpError(400, 'The end date is before the start date.');

  const propertyIds = await visibleProperties(user);
  const report = await buildReport(key, { fromKey, toKey, propertyIds });

  return csvResponse(`${key}-${fromKey}-to-${toKey}.csv`, report.headers, report.rows);
});
