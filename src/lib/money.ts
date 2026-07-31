/**
 * All money in this system is an integer number of CENTAVOS.
 * ₱1,234.50 === 123450. Nothing is ever stored as a float.
 */

export const PESO = '₱';

/** "1234.5" | 1234.5 -> 123450 centavos (half-up rounding). */
export function toCents(value: string | number): number {
  const n = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 123450 -> 1234.5 */
export function toPesos(cents: number): number {
  return cents / 100;
}

/** 123450 -> "₱1,234.50" */
export function formatPeso(cents: number, withSymbol = true): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString('en-PH');
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${withSymbol ? PESO : ''}${whole}.${frac}`;
}

/**
 * Menu prices for the public site: "₱650" rather than "₱650.00", but "₱650.50"
 * when there really are centavos. Display only — never for receipts, exports or
 * anything the BIR reads, which all keep two decimals.
 */
export function formatPesoMenu(cents: number): string {
  return cents % 100 === 0 ? formatPeso(cents).replace(/\.00$/, '') : formatPeso(cents);
}

/** Plain "1234.50" for CSV exports — no symbol, no thousands separator. */
export function centsToDecimalString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Apply a discount to a base amount. Percent values are whole numbers
 * (20 === 20%); fixed values are already centavos.
 * Never returns more than `base`.
 */
export function discountAmount(
  base: number,
  type: 'PERCENT' | 'FIXED',
  value: number,
): number {
  if (base <= 0) return 0;
  const raw = type === 'PERCENT' ? Math.round((base * value) / 100) : value;
  return Math.max(0, Math.min(base, raw));
}

export function percentOf(base: number, percent: number): number {
  return Math.round((base * percent) / 100);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
