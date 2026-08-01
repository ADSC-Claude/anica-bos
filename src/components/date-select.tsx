'use client';

/**
 * A date entered as three dropdowns, for dates that are decades away.
 *
 * A native date field is right for a booking next Tuesday and wrong for a
 * birthday: reaching 1994 means paging back three hundred and eighty months a
 * click at a time. Three lists get there in three taps, and on a phone they are
 * native pickers rather than a calendar grid nobody can hit.
 *
 * Month first, then day, then year — the order these are said out loud here.
 *
 * The composed value goes to the server through a hidden field, so the form
 * still posts one ordinary `YYYY-MM-DD` string and nothing downstream has to
 * know this control exists.
 */

import { useState } from 'react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Days in a month, so 31 February is never offered. */
function daysIn(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

export function DateSelect({
  name,
  value,
  /** Oldest year offered. Defaults to 85 years back — a working lifetime. */
  earliestYear,
  /** Newest year offered. Defaults to 15 years back, the minimum working age. */
  latestYear,
  required,
}: {
  name: string;
  /** `YYYY-MM-DD`, or blank. */
  value?: string;
  earliestYear?: number;
  latestYear?: number;
  required?: boolean;
}) {
  const thisYear = new Date(Date.now() + 8 * 3600_000).getUTCFullYear();
  const newest = latestYear ?? thisYear - 15;
  const oldest = earliestYear ?? thisYear - 85;

  const [y, m, d] = (value ?? '').split('-');
  const [year, setYear] = useState(y ?? '');
  const [month, setMonth] = useState(m ?? '');
  const [day, setDay] = useState(d ?? '');

  const maxDay = daysIn(Number(year), Number(month));
  // A day that no longer exists after changing month — 31 to February — is
  // dropped rather than silently rolling the date into March.
  const safeDay = Number(day) > maxDay ? '' : day;

  const composed = year && month && safeDay ? `${year}-${pad(Number(month))}-${pad(Number(safeDay))}` : '';

  // Newest first: a therapist born in 1998 is a short scroll, and 1941 is not
  // the common case.
  const years: number[] = [];
  for (let yy = newest; yy >= oldest; yy -= 1) years.push(yy);

  return (
    <>
      <input type="hidden" name={name} value={composed} />
      <div className="grid grid-cols-3 gap-1.5">
        <select
          className="select"
          aria-label="Month"
          value={month}
          required={required}
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="">Month</option>
          {MONTHS.map((label, i) => (
            <option key={label} value={i + 1}>{label}</option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Day"
          value={safeDay}
          required={required}
          onChange={(e) => setDay(e.target.value)}
        >
          <option value="">Day</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Year"
          value={year}
          required={required}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">Year</option>
          {years.map((yy) => (
            <option key={yy} value={yy}>{yy}</option>
          ))}
        </select>
      </div>
    </>
  );
}
