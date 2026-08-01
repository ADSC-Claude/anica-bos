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
  /**
   * Called with the composed `YYYY-MM-DD` whenever it changes, or `''` while
   * the date is incomplete.
   *
   * Optional because the two callers are different shapes: a form that posts
   * needs the hidden field, and a wizard holding its own state needs to be
   * told. Both are supported rather than making one of them adapt.
   */
  onChange,
  id,
}: {
  name?: string;
  /** `YYYY-MM-DD`, or blank. */
  value?: string;
  earliestYear?: number;
  latestYear?: number;
  required?: boolean;
  onChange?: (value: string) => void;
  id?: string;
}) {
  const thisYear = new Date(Date.now() + 8 * 3600_000).getUTCFullYear();
  const newest = latestYear ?? thisYear - 15;
  const oldest = earliestYear ?? thisYear - 85;

  const [y, m, d] = (value ?? '').split('-');
  const [parts, setParts] = useState({ year: y ?? '', month: m ?? '', day: d ?? '' });

  const compose = (p: { year: string; month: string; day: string }) =>
    p.year && p.month && p.day
      ? `${p.year}-${pad(Number(p.month))}-${pad(Number(p.day))}`
      : '';

  /** Apply a change, dropping a day the new month cannot hold. */
  const change = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    // 31 January then February: clear the day rather than letting the date roll
    // silently into March. A date that quietly becomes a different date is
    // worse than one that asks to be finished — and on a birthday it ends up
    // on a government form.
    if (Number(next.day) > daysIn(Number(next.year), Number(next.month))) next.day = '';
    setParts(next);
    onChange?.(compose(next));
  };

  const maxDay = daysIn(Number(parts.year), Number(parts.month));

  // Newest first: someone born in 1998 is a short scroll, and 1941 is not the
  // common case.
  const years: number[] = [];
  for (let yy = newest; yy >= oldest; yy -= 1) years.push(yy);

  return (
    <>
      {name && <input type="hidden" name={name} value={compose(parts)} />}
      <div className="grid grid-cols-3 gap-1.5" id={id}>
        <select
          className="select"
          aria-label="Month"
          value={parts.month}
          required={required}
          onChange={(e) => change({ month: e.target.value })}
        >
          <option value="">Month</option>
          {MONTHS.map((label, i) => (
            <option key={label} value={i + 1}>{label}</option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Day"
          value={parts.day}
          required={required}
          onChange={(e) => change({ day: e.target.value })}
        >
          <option value="">Day</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Year"
          value={parts.year}
          required={required}
          onChange={(e) => change({ year: e.target.value })}
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
