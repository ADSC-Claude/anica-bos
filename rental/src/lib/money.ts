/**
 * All money here is an integer number of CENTAVOS.
 * ₱1,234.50 === 123450. Nothing is ever stored as a float.
 */

export const PESO = '₱';

/** "1234.5" | 1234.5 -> 123450 centavos (half-up). */
export function toCents(value: string | number): number {
  const n = typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

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
 * Rates on the public site: "₱3,500" rather than "₱3,500.00", but "₱3,500.50"
 * when there really are centavos. Display only — receipts and exports keep two
 * decimals everywhere.
 */
export function formatPesoShort(cents: number): string {
  return cents % 100 === 0 ? formatPeso(cents).replace(/\.00$/, '') : formatPeso(cents);
}

/** Plain "1234.50" for CSV — no symbol, no separators. */
export function centsToDecimalString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Percent values are whole numbers (10 === 10%); fixed values are already
 * centavos. Never returns more than `base`, so a ₱2,000 fixed promo on a
 * ₱1,500 stay discounts ₱1,500 and not a peso more.
 */
export function discountAmount(base: number, type: 'PERCENT' | 'FIXED', value: number): number {
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

/** Whole percent, rounded, guarding the zero denominator. 0 when base is 0. */
export function ratio(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export type RevenueParts = {
  accommodationCents: number;
  cleaningFeeCents: number;
  addOnsCents: number;
  extraGuestCents: number;
  discountCents: number;
  totalCents: number;
};

/**
 * What a booking's money is *for*, defending against one that has a total and
 * no breakdown.
 *
 * A channel booking arrives with a payout and nothing else — Airbnb tells us
 * what it paid, never how it split it — and the figure is often typed in by
 * hand later. Left alone, such a stay contributes its nights to occupancy and
 * nothing to accommodation, so ADR and RevPAR are quietly dragged down every
 * time one falls in the window, and the P&L shows a row with revenue and three
 * empty columns beside it.
 *
 * So an unsplit total is treated as accommodation, which is what it is as far
 * as anything here can know. Both `metrics.ts` and `finance.ts` read this, so
 * the dashboard and the statement cannot disagree about the same booking.
 */
export type RevenueSplit = {
  accommodationCents: number;
  cleaningFeeCents: number;
  /** Add-ons and extra-guest charges together — one line on every report. */
  addOnsCents: number;
  discountCents: number;
  /** Everything that is not accommodation, net of the discount. */
  otherCents: number;
};

export function revenueSplit(r: RevenueParts): RevenueSplit {
  const itemised =
    r.accommodationCents + r.cleaningFeeCents + r.addOnsCents + r.extraGuestCents;

  if (itemised === 0 && r.totalCents !== 0) {
    return {
      accommodationCents: r.totalCents,
      cleaningFeeCents: 0,
      addOnsCents: 0,
      discountCents: 0,
      otherCents: 0,
    };
  }

  const addOns = r.addOnsCents + r.extraGuestCents;
  return {
    accommodationCents: r.accommodationCents,
    cleaningFeeCents: r.cleaningFeeCents,
    addOnsCents: addOns,
    discountCents: r.discountCents,
    otherCents: r.cleaningFeeCents + addOns - r.discountCents,
  };
}
