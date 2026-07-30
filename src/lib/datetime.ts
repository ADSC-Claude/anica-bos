/**
 * Asia/Manila helpers.
 *
 * The Philippines has observed a fixed UTC+08:00 with no daylight saving since
 * 1978, so a constant offset is exact here and avoids pulling in a tz library.
 * Everything is stored in UTC; these helpers convert for display and for
 * "business date" bucketing.
 */

export const MANILA_OFFSET_MIN = 8 * 60;
export const TIMEZONE = 'Asia/Manila';

/** Wall-clock parts of `date` as seen in Manila. */
export function manilaParts(date: Date) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** "2026-07-30" for the Manila calendar date of `date`. */
export function manilaDateKey(date: Date = new Date()): string {
  const p = manilaParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "2026-07" */
export function manilaMonthKey(date: Date = new Date()): string {
  return manilaDateKey(date).slice(0, 7);
}

/**
 * The value stored in `@db.Date` columns: UTC midnight of the Manila calendar
 * date. Comparing these across rows is then a plain date comparison.
 */
export function businessDate(date: Date = new Date()): Date {
  const p = manilaParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** "2026-07-30" -> UTC midnight Date suitable for a `@db.Date` column. */
export function dateKeyToBusinessDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** UTC instant of `minutes` past Manila-midnight on the Manila date `key`. */
export function manilaInstant(key: string, minutes: number): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + (minutes - MANILA_OFFSET_MIN) * 60_000);
}

/** First UTC instant of the Manila day `key` (00:00 Manila). */
export function startOfManilaDay(key: string): Date {
  return manilaInstant(key, 0);
}

/** Exclusive end of the Manila day `key` (00:00 Manila the next day). */
export function endOfManilaDay(key: string): Date {
  return manilaInstant(key, 24 * 60);
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return manilaDateKeyFromUtcMidnight(dt);
}

export function manilaDateKeyFromUtcMidnight(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Inclusive list of Manila date keys between two keys. */
export function dateKeyRange(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let cur = fromKey;
  let guard = 0;
  while (cur <= toKey && guard++ < 1500) {
    out.push(cur);
    cur = addDaysToKey(cur, 1);
  }
  return out;
}

/** Minutes past midnight (Manila) for `date`. */
export function manilaMinuteOfDay(date: Date): number {
  const p = manilaParts(date);
  return p.hour * 60 + p.minute;
}

/** 750 -> "12:30 PM" */
export function minutesToLabel(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  if (minutes >= 1440 && m === 0) return '12:00 MN';
  return `${h12}:${mm} ${ampm}`;
}

/** "13:30" -> 810 */
export function labelToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "30 Jul 2026, 3:05 PM" (Manila) */
export function formatManila(date: Date, opts: { time?: boolean; weekday?: boolean } = {}) {
  const p = manilaParts(date);
  const datePart = `${opts.weekday ? DAYS[p.weekday] + ' ' : ''}${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
  if (!opts.time) return datePart;
  return `${datePart}, ${minutesToLabel(p.hour * 60 + p.minute)}`;
}

export function formatTimeManila(date: Date): string {
  const p = manilaParts(date);
  return minutesToLabel(p.hour * 60 + p.minute);
}

/** "2026-07-30" -> "Thu 30 Jul 2026" */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-07" -> "July 2026" */
export function formatMonthKey(key: string): string {
  const FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [y, m] = key.split('-').map(Number);
  return `${FULL[m - 1]} ${y}`;
}

export function addMonthsToKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(monthKey: string): { fromKey: string; toKey: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { fromKey: `${monthKey}-01`, toKey: `${monthKey}-${String(last).padStart(2, '0')}` };
}

/** Days until `date` from now, in whole Manila days (negative when past). */
export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = businessDate(from).getTime();
  const b = businessDate(date).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Age-agnostic: does `birthday` fall in the Manila month of `ref`? */
export function isBirthdayMonth(birthday: Date | null, ref: Date = new Date()): boolean {
  if (!birthday) return false;
  return birthday.getUTCMonth() + 1 === manilaParts(ref).month;
}

export function isBirthdayToday(birthday: Date | null, ref: Date = new Date()): boolean {
  if (!birthday) return false;
  const p = manilaParts(ref);
  return birthday.getUTCMonth() + 1 === p.month && birthday.getUTCDate() === p.day;
}
