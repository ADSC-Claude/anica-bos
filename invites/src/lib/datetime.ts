/**
 * Everything is shown in Asia/Manila. The server may run in Singapore or
 * Virginia; the guest is in Bulacan.
 */
export const TZ = 'Asia/Manila';

export function formatDate(d: Date | string | null | undefined, style: 'long' | 'short' | 'weekday' = 'long'): string {
  if (!d) return '';
  const date = typeof d === 'string' ? parseDateKey(d) : d;
  if (!date || Number.isNaN(date.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' }
      : style === 'weekday'
        ? { timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
        : { timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat('en-PH', opts).format(date);
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** "14:30" -> "2:30 PM". Anything else comes back as typed. */
export function formatTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m[2]} ${suffix}`;
}

/** "2026-06-20" as a Manila-midnight instant. */
export function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today's date in Manila as "YYYY-MM-DD". */
export function manilaDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function daysUntil(d: Date, from = new Date()): number {
  return Math.ceil((d.getTime() - from.getTime()) / 86_400_000);
}

/** Month key "2026-06" for reports, in Manila. */
export function monthKey(d: Date): string {
  return manilaDateKey(d).slice(0, 7);
}

export function relative(d: Date, from = new Date()): string {
  const diff = d.getTime() - from.getTime();
  const abs = Math.abs(diff);
  const unit = abs < 3_600_000 ? [Math.round(abs / 60_000), 'min'] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), 'h'] : [Math.round(abs / 86_400_000), 'd'];
  return diff < 0 ? `${unit[0]}${unit[1]} ago` : `in ${unit[0]}${unit[1]}`;
}
