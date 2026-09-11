import type { Tier } from '@prisma/client';
import { entitled, tierAtLeast, type Entitled, type FeatureKey } from './tiers';

/**
 * Features that moved up a package after invitations had already been sold with
 * them.
 *
 * A package is a promise made once and read forever: `entitled()` works out
 * what an invitation has by looking at its tier *today*, so moving a feature up
 * takes it away from everybody who already paid for it, silently and at once.
 * Nothing warns them. A couple who bought Signature in August opens the seating
 * page in October and it is a locked upgrade screen.
 *
 * This is the record of every such move, so the one-off that puts them back
 * (scripts/grandfather-features.ts) reads history rather than somebody's memory
 * of it. Add a row here whenever FEATURE_MIN_TIER raises a feature, in the same
 * commit — not afterwards, when the only people who can tell you what changed
 * are the customers complaining.
 */
export type Moved = {
  feature: FeatureKey;
  /** The lowest package that had it before the move. */
  was: Tier;
  /**
   * When the move reached production. An invitation created before this was
   * sold with the feature; one created after it never had it and is owed
   * nothing.
   */
  on: string;
  /**
   * The add-on code that grants the feature back, or null when no add-on
   * grants it. Null is not an oversight to code around: it means the feature
   * cannot be restored to one invitation at a time, and the script says so
   * instead of pretending it fixed something.
   */
  restoreWith: string | null;
};

/**
 * #127 moved three features from Signature up to Luxury when Luxury was added:
 * the seating chart, event-day check-in and the shared album. Merged
 * 2026-09-11T00:49:13Z, live on the next deploy of main.
 *
 * All three can be handed back one invitation at a time now. The album could
 * not when this file was written — it had no add-on behind it, which is half
 * the reason one was made: a feature somebody was sold and cannot be given back
 * is a refund conversation, not a fix.
 */
export const MOVED: readonly Moved[] = [
  { feature: 'seating', was: 'COMPLETE', on: '2026-09-11T00:49:13Z', restoreWith: 'SEATING_VIEWER' },
  { feature: 'checkin', was: 'COMPLETE', on: '2026-09-11T00:49:13Z', restoreWith: 'QR_CHECKIN' },
  { feature: 'photoSharing', was: 'COMPLETE', on: '2026-09-11T00:49:13Z', restoreWith: 'PHOTO_SHARING' },
];

/** An invitation, as much of one as deciding what it lost needs. */
export type Sold = Entitled & { createdAt: Date };

/**
 * What this invitation was sold with and no longer has.
 *
 * Three things have to be true at once, and leaving any of them out makes the
 * answer wrong in a way that costs somebody something:
 *
 *   - it was created before the move, so it really was sold with the feature;
 *   - its package had the feature under the old table;
 *   - it does not have the feature now — by package or by an add-on, so a
 *     Signature invitation that bought the seating chart separately, or one a
 *     previous run already put back, is not counted twice.
 */
export function lost(inv: Sold, moved: readonly Moved[] = MOVED): Moved[] {
  return moved.filter(
    (m) =>
      inv.createdAt < new Date(m.on) &&
      tierAtLeast(inv.tier, m.was) &&
      !entitled(inv, m.feature),
  );
}

/**
 * The add-on codes to add to an invitation to give back what it lost, without
 * repeating one it already carries.
 *
 * What this returns is never the whole answer where a lost feature has no
 * add-on: `lost()` is what to report, this is only what can be written.
 */
export function restoreCodes(inv: Sold, moved: readonly Moved[] = MOVED): string[] {
  const codes = lost(inv, moved)
    .map((m) => m.restoreWith)
    .filter((code): code is string => Boolean(code) && !inv.addOns.includes(code!));
  return [...new Set(codes)];
}
