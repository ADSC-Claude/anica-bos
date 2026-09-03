/**
 * All money here is an integer number of CENTAVOS.
 * ₱1,999.00 === 199900. Nothing is ever stored as a float.
 */

export const PESO = '₱';

/** "1999" | 1999 -> 199900 centavos (half-up). */
export function toCents(value: string | number): number {
  const n = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toPesos(cents: number): number {
  return cents / 100;
}

/** 199900 -> "₱1,999.00" */
export function formatPeso(cents: number, withSymbol = true): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString('en-PH');
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${withSymbol ? PESO : ''}${whole}.${frac}`;
}

/**
 * Prices on the landing page: "₱1,999" rather than "₱1,999.00", but
 * "₱1,999.50" when there really are centavos. Display only — receipts and
 * exports keep two decimals everywhere.
 */
export function formatPesoShort(cents: number): string {
  return cents % 100 === 0 ? formatPeso(cents).replace(/\.00$/, '') : formatPeso(cents);
}

/** Plain "1999.00" for CSV — no symbol, no separators. */
export function centsToDecimalString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Percent values are whole numbers (10 === 10%); fixed values are already
 * centavos. Never returns more than `base`, so a ₱2,000 coupon on a ₱999
 * order discounts ₱999 and not a peso more.
 */
export function discountAmount(base: number, type: 'PERCENT' | 'FIXED', value: number): number {
  if (base <= 0) return 0;
  const raw = type === 'PERCENT' ? Math.round((base * value) / 100) : value;
  return Math.max(0, Math.min(base, raw));
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Whole percent, rounded, guarding the zero denominator. 0 when whole is 0. */
export function ratio(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}
