/**
 * Asia/Manila helpers.
 *
 * The Philippines has observed a fixed UTC+08:00 with no daylight saving since
 * 1978, so a constant offset is exact here and avoids a timezone library.
 *
 * Two kinds of time live in this system and they must not be confused:
 *
 *   • An INSTANT — when a cleaner started, when a payment landed. Stored as
 *     `DateTime` in UTC, displayed in Manila.
 *   • A STAY DATE — a check-in, a check-out, an expense date. Stored as
 *     `@db.Date`, which is UTC midnight of the Manila calendar date. It has no
 *     time, so no timezone can shift it by a day.
 *
 * `dateKey` ("2026-08-12") is the string form of a stay date and is what moves
 * through forms, URLs and query strings.
 */

export const MANILA_OFFSET_MIN = 8 * 60;
export const TIMEZONE = 'Asia/Manila';

export type DateKey = string;

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

/** "2026-08-12" — the Manila calendar date of an instant. */
export function manilaDateKey(date: Date = new Date()): DateKey {
  const p = manilaParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function manilaMonthKey(date: Date = new Date()): string {
  return manilaDateKey(date).slice(0, 7);
}

/** "2026-08-12" -> the Date to store in a @db.Date column. */
export function toStayDate(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** A @db.Date value -> "2026-08-12". */
export function toDateKey(d: Date): DateKey {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Today's stay date, as a Date suitable for a @db.Date column. */
export function todayStayDate(now: Date = new Date()): Date {
  return toStayDate(manilaDateKey(now));
}

export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Nights between two stay dates. Check-out exclusive, so 1→5 Aug is 4. */
export function nightsBetween(checkIn: Date | DateKey, checkOut: Date | DateKey): number {
  const a = typeof checkIn === 'string' ? toStayDate(checkIn) : checkIn;
  const b = typeof checkOut === 'string' ? toStayDate(checkOut) : checkOut;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Every night of a stay: [checkIn, checkOut). The checkout date is not a night. */
export function nightKeys(checkIn: DateKey, checkOut: DateKey): DateKey[] {
  const out: DateKey[] = [];
  let cur = checkIn;
  let guard = 0;
  while (cur < checkOut && guard++ < 1500) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Inclusive range of date keys — for calendars, where the last day is shown. */
export function dateKeyRange(fromKey: DateKey, toKey: DateKey): DateKey[] {
  const out: DateKey[] = [];
  let cur = fromKey;
  let guard = 0;
  while (cur <= toKey && guard++ < 1500) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** UTC instant of `minutes` past Manila-midnight on the Manila date `key`. */
export function manilaInstant(key: DateKey, minutes: number): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + (minutes - MANILA_OFFSET_MIN) * 60_000);
}

/** The instant a stay's check-in time falls on, given the property's rule. */
export function stayInstant(stayDate: Date, minuteOfDay: number): Date {
  return manilaInstant(toDateKey(stayDate), minuteOfDay);
}

export function startOfManilaDay(key: DateKey): Date {
  return manilaInstant(key, 0);
}

export function endOfManilaDay(key: DateKey): Date {
  return manilaInstant(key, 24 * 60);
}

export function manilaMinuteOfDay(date: Date): number {
  const p = manilaParts(date);
  return p.hour * 60 + p.minute;
}

/** 900 -> "3:00 PM" */
export function minutesToLabel(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${ampm}`;
}

/** "15:00" -> 900 */
export function labelToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 900 -> "15:00", for <input type="time">. */
export function minutesToInput(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "12 Aug 2026, 3:05 PM" (Manila) */
export function formatManila(date: Date, opts: { time?: boolean; weekday?: boolean } = {}) {
  const p = manilaParts(date);
  const datePart = `${opts.weekday ? DAYS[p.weekday] + ' ' : ''}${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
  if (!opts.time) return datePart;
  return `${datePart}, ${minutesToLabel(p.hour * 60 + p.minute)}`;
}

export function formatTimeManila(date: Date): string {
  return minutesToLabel(manilaMinuteOfDay(date));
}

/** A @db.Date value, formatted without the timezone shift a Date would apply. */
export function formatStayDate(d: Date, opts: { weekday?: boolean } = {}): string {
  return formatDateKey(toDateKey(d), opts);
}

export function formatDateKey(key: DateKey, opts: { weekday?: boolean } = {}): string {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${opts.weekday ? DAYS[wd] + ' ' : ''}${d} ${MONTHS[m - 1]} ${y}`;
}

/** "12–15 Aug 2026" or "30 Jul – 2 Aug 2026" */
export function formatStayRange(checkIn: Date, checkOut: Date): string {
  const a = { key: toDateKey(checkIn), ...splitKey(toDateKey(checkIn)) };
  const b = { key: toDateKey(checkOut), ...splitKey(toDateKey(checkOut)) };
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${a.y}`;
  return `${formatDateKey(a.key)} – ${formatDateKey(b.key)}`;
}

function splitKey(key: DateKey) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${FULL_MONTHS[m - 1]} ${y}`;
}

export function addMonthsToKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(monthKey: string): { fromKey: DateKey; toKey: DateKey } {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { fromKey: `${monthKey}-01`, toKey: `${monthKey}-${String(last).padStart(2, '0')}` };
}

/** Whole Manila days from now until `date`. Negative when past. */
export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = toStayDate(manilaDateKey(from)).getTime();
  const b = toStayDate(manilaDateKey(date)).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "in 3h 40m" / "2h overdue" — a countdown a person can act on. */
export function countdown(target: Date, from: Date = new Date()): string {
  const ms = target.getTime() - from.getTime();
  const overdue = ms < 0;
  const mins = Math.floor(Math.abs(ms) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const body = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return overdue ? `${body} overdue` : `${body} left`;
}

/** Friday or Saturday night in Manila — when a weekend rate applies. */
export function isWeekendNight(key: DateKey): boolean {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 5 || wd === 6;
}
