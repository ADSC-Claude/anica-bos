/** RFC4180-ish CSV writer. Excel-friendly (BOM + CRLF). */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (unknown[])[]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  // BOM keeps ₱ and accented names readable when opened directly in Excel.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvResponse(filename: string, headers: string[], rows: (unknown[])[]): Response {
  return new Response(toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
