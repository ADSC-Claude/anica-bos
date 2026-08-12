/**
 * What being late costs, by how late.
 *
 * A flat charge per late arrival treats six minutes over and three hours over
 * as the same offence, which is neither fair to the punctual nor much of a
 * deterrent to the badly late. The minutes were already being recorded at
 * time-in and thrown away; these bands are what finally reads them.
 *
 * The numbers are **minutes past the grace period**, not minutes past opening.
 * Grace already decides whether somebody is late at all — a band starting at 0
 * would otherwise be dead, and one starting at the grace figure would double
 * count it. With a 15-minute grace, a band of 1–15 is somebody arriving
 * between 12:16 and 12:30.
 *
 * Kept as arithmetic with no database in it, so payroll and the settings
 * screen agree by construction rather than by both being careful.
 */

export type LateBand = {
  /** Minutes past grace where this band starts. Inclusive. */
  from: number;
  /** Where it ends, inclusive. Null means "and anything beyond". */
  to: number | null;
  /**
   * A flat peso amount, or a share of that day's allowance.
   *
   * Both are wanted for different rungs of the same ladder: a token ₱50 for
   * being a few minutes over, and half a day's pay for turning up at three.
   * A spa that later changes what a day is worth should not have to retype
   * the bottom of its ladder.
   */
  type: 'FIXED' | 'PERCENT';
  /** Centavos when FIXED. Whole percent of the daily allowance when PERCENT. */
  amountCents: number;
};

/** What one band costs against a given daily rate. */
export function bandAmount(band: LateBand, dailyRateCents: number): number {
  return band.type === 'PERCENT'
    ? Math.round((dailyRateCents * band.amountCents) / 100)
    : band.amountCents;
}

/**
 * Read bands off a settings value that came from JSON.
 *
 * Anything malformed is dropped rather than guessed at: a band with a missing
 * amount is not a band worth charging somebody for.
 */
export function parseLateBands(raw: unknown): LateBand[] {
  if (!Array.isArray(raw)) return [];
  const out: LateBand[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const from = Math.max(0, Math.round(Number(r.from ?? 0)));
    // Anything that is not the word PERCENT is a peso amount, so a band
    // written before this existed keeps meaning what it meant.
    const type = r.type === 'PERCENT' ? 'PERCENT' : 'FIXED';
    const amountCents = Math.max(0, Math.round(Number(r.amountCents ?? 0)));
    const to =
      r.to === null || r.to === undefined || r.to === ''
        ? null
        : Math.round(Number(r.to));
    if (!Number.isFinite(from) || !Number.isFinite(amountCents)) continue;
    if (to !== null && (!Number.isFinite(to) || to < from)) continue;
    out.push({ from, to, type, amountCents });
  }
  // Lowest first, so the first match is always the narrowest sensible one and
  // the screen reads like a ladder.
  return out.sort((a, b) => a.from - b.from);
}

/**
 * The band a given lateness falls in, or null when none covers it.
 *
 * Nothing matching means nothing charged. That is deliberate: an owner who has
 * written three bands has said what she wants charged, and inventing a
 * fallback would take money off somebody for a case she did not describe.
 */
export function bandFor(bands: LateBand[], minutesPastGrace: number): LateBand | null {
  const m = Math.max(0, Math.round(minutesPastGrace));
  for (const b of bands) {
    if (m >= b.from && (b.to === null || m <= b.to)) return b;
  }
  return null;
}

/** How a band reads on a payslip: "16–30 min late" or "over 60 min late". */
export function bandLabel(b: LateBand): string {
  if (b.to === null) return `over ${b.from - 1} min past grace`;
  if (b.from === b.to) return `${b.from} min past grace`;
  return `${b.from}–${b.to} min past grace`;
}

export type BandProblem = { index: number; message: string };

/**
 * What is wrong with a set of bands, in the owner's terms.
 *
 * Overlaps are the one that actually costs money: two bands covering the same
 * minute means the charge depends on which was typed first, and nobody
 * reading the screen would guess which. Gaps are allowed but pointed out,
 * because a gap is silently free.
 */
export function checkBands(bands: LateBand[]): BandProblem[] {
  const problems: BandProblem[] = [];
  const sorted = [...bands].sort((a, b) => a.from - b.from);

  sorted.forEach((b, i) => {
    if (b.to !== null && b.to < b.from) {
      problems.push({ index: i, message: 'This band ends before it starts.' });
    }
    const prev = sorted[i - 1];
    if (!prev) return;
    if (prev.to === null) {
      problems.push({
        index: i,
        message: 'The band above already covers everything beyond it, so this one never applies.',
      });
      return;
    }
    if (b.from <= prev.to) {
      problems.push({ index: i, message: `This overlaps the band above, which runs to ${prev.to} min.` });
    } else if (b.from > prev.to + 1) {
      problems.push({
        index: i,
        message: `Nothing is charged between ${prev.to + 1} and ${b.from - 1} min.`,
      });
    }
  });

  return problems;
}
