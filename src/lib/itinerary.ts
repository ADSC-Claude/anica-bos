/**
 * A visit is a sequence of treatments, not a single block of time.
 *
 * A guest booking a sauna and a massage is here for half an hour of heat, then
 * a shower, a consultation and a foot soak, then an hour on a bed. Three things
 * follow from that, and the old model got all three wrong:
 *
 *  - **Each treatment needs its own place.** Holding a bed through the sauna
 *    keeps it empty and unsellable, and never holds the sauna at all.
 *  - **The gaps are real time.** Quoting a 1:30 sauna plus a 60-minute massage
 *    as finishing at 3:00 leaves nothing for the shower, and the desk is behind
 *    from the first booking of the evening.
 *  - **The order matters.** Sauna before massage is the house flow; massage
 *    then sauna is a different schedule and a different finish time.
 *
 * This module is the arithmetic of all that, and nothing else — no database, no
 * clock of its own. Everything it produces is derived from a start time and an
 * ordered list, so it can be tested and so the browser and the server compute
 * the same schedule from the same inputs.
 */

export type Treatment = {
  serviceId: string;
  name: string;
  durationMinutes: number;
  /**
   * Minutes to leave free after this treatment. Null means the house default —
   * most treatments want it, a sauna wants longer for the shower.
   */
  changeoverMinutes?: number | null;
  /** Where it usually falls in a visit. Lower runs first. */
  sequenceRank?: number;
  /**
   * The kind of place this treatment needs — 'BED', 'CHAIR', 'SAUNA', or null
   * for "anywhere".
   *
   * Kept as a plain string so this module stays arithmetic with no database
   * types in it, and so the browser can run the same planning code.
   */
  placeType?: string | null;
  /**
   * An extra that runs on the end of the treatment before it, in the same
   * place, with no gap.
   *
   * A hot compress after a massage is not a second appointment: she does not
   * get up, the bed is not turned over, and charging her five minutes of floor
   * time for it would be inventing work. So an add-on takes no changeover
   * *before* it and always belongs to the run in front of it.
   */
  isAddOn?: boolean;
  /**
   * Extra minutes of wait before this treatment, on top of the changeover.
   *
   * The guest's own doing, not the house's: she wants her massage at three
   * rather than straight after the sauna, and asked for it. Zero — the usual
   * case — means the treatments run as close together as the floor allows.
   *
   * It is a wait, not a hold. The place she is not yet in stays sellable to
   * somebody else for the length of it, which is exactly why she has to ask
   * for it rather than getting one by accident.
   */
  gapBefore?: number;
};

export type Segment<T extends Treatment = Treatment> = T & {
  startAt: Date;
  endAt: Date;
  /** Minutes of gap after this treatment. Always 0 for the last one. */
  changeoverAfter: number;
};

const MIN = 60_000;
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MIN);

/**
 * The house order, before anybody reorders it.
 *
 * Sorted by each treatment's own sequence number so the spa's preferred flow is
 * the default without a rule in code — sauna 10, foot spa 20, massage 30, and
 * anything new keeps the middling default until someone gives it a number.
 * Ties keep the order they arrived in, so two massages stay as chosen.
 */
export function houseOrder<T extends Treatment>(treatments: T[]): T[] {
  // Add-ons travel with the treatment they extend. Sorting them on their own
  // rank would put a hot compress before the massage it is a compress *for*,
  // so what gets sorted is the group, and the group moves as one.
  const groups: T[][] = [];
  for (const t of treatments) {
    if (t.isAddOn && groups.length) groups[groups.length - 1].push(t);
    else groups.push([t]);
  }
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (a.g[0].sequenceRank ?? 50) - (b.g[0].sequenceRank ?? 50) || a.i - b.i)
    .flatMap(({ g }) => g);
}

/**
 * How long a treatment holds the floor after it finishes.
 *
 * The last treatment holds nothing: the gap exists to make room for the *next*
 * one, and counting it at the end would quote every guest a finish time twenty
 * minutes after they have left.
 */
export function changeoverFor(t: Treatment, houseDefault: number): number {
  return Math.max(0, t.changeoverMinutes ?? houseDefault);
}

/**
 * The gap between one treatment and the next.
 *
 * Two treatments on the same bed still need their five minutes — the linen is
 * changed and the oils are set out, and pretending otherwise is how the desk
 * ends up running late. An add-on is the exception: it is a continuation of
 * the treatment before it, so it starts the moment that one ends.
 */
export function gapBetween(
  before: Treatment,
  after: Treatment | undefined,
  houseDefault: number,
): number {
  if (!after) return 0;
  // An add-on is a continuation, so it takes no changeover — and it cannot be
  // pushed away from the treatment it extends either.
  if (after.isAddOn) return 0;
  return changeoverFor(before, houseDefault) + Math.max(0, after.gapBefore ?? 0);
}

/**
 * Lay an ordered list of treatments out from a start time.
 *
 * The order given is the order used — reordering is the caller's business, and
 * `houseOrder` is what they reorder *from*.
 */
export function planVisit<T extends Treatment>(opts: {
  treatments: T[];
  startAt: Date;
  /** Branch default gap between treatments, in minutes. */
  changeoverMinutes: number;
}): Segment<T>[] {
  const out: Segment<T>[] = [];
  let cursor = opts.startAt;
  opts.treatments.forEach((t, i) => {
    const endAt = plus(cursor, Math.max(0, t.durationMinutes));
    const gap = gapBetween(t, opts.treatments[i + 1], opts.changeoverMinutes);
    out.push({ ...t, startAt: cursor, endAt, changeoverAfter: gap });
    cursor = plus(endAt, gap);
  });
  return out;
}

/**
 * A stretch of the visit spent in one place.
 *
 * Two bed treatments in a row are not two bookings of two beds. She lies down
 * once, the five minutes between them is the therapist changing the linen
 * *around* her, and the bed is hers throughout. Treating them as separate holds
 * would let the booking engine offer her Bed 3 then Bed 7 and ask her to get up
 * and walk in between, and would let a stranger book "her" bed for the five
 * minutes in the middle.
 *
 * So consecutive treatments wanting the same kind of place become one run, held
 * end to end. The guest only ever moves when the *kind* of place changes — bed
 * to sauna, chair to bed — and that move is the only place a real changeover
 * belongs.
 */
export type PlaceRun<T extends Treatment = Treatment> = {
  placeType: string | null;
  /** The whole stretch this place is held for, gaps inside it included. */
  startAt: Date;
  endAt: Date;
  segments: Segment<T>[];
};

export function placeRuns<T extends Treatment>(segments: Segment<T>[]): PlaceRun<T>[] {
  const runs: PlaceRun<T>[] = [];
  for (const seg of segments) {
    const open = runs[runs.length - 1];
    const type = seg.placeType ?? null;
    // An add-on never starts a run: it is part of the treatment before it and
    // happens wherever that one happened.
    //
    // A deliberate wait does break the run, even between two bed treatments.
    // She is not lying on the bed during her break, so it goes back on sale —
    // the honest cost of asking for the gap, and the reason she may not get
    // the same bed back afterwards.
    const waited = !seg.isAddOn && (seg.gapBefore ?? 0) > 0;
    const joins = open && !waited && (seg.isAddOn || (open.placeType ?? null) === type);
    if (joins) {
      open.segments.push(seg);
      open.endAt = seg.endAt > open.endAt ? seg.endAt : open.endAt;
    } else {
      runs.push({ placeType: type, startAt: seg.startAt, endAt: seg.endAt, segments: [seg] });
    }
  }
  return runs;
}

/** When the guest actually walks out — the end of the last treatment. */
export function visitEnd(segments: Segment[], fallback: Date): Date {
  return segments.length ? segments[segments.length - 1].endAt : fallback;
}

/**
 * Door to door, in minutes, without needing a start time.
 *
 * This is what the booking form quotes and what decides whether a visit fits
 * before closing, so it has to include the gaps. A sauna and a massage is not
 * 90 minutes; it is 110.
 */
export function visitMinutes(treatments: Treatment[], changeoverMinutes: number): number {
  return treatments.reduce(
    (total, t, i) =>
      total +
      Math.max(0, t.durationMinutes) +
      gapBetween(t, treatments[i + 1], changeoverMinutes),
    0,
  );
}

export type TimedSegment = {
  startAt: Date | null;
  endAt: Date | null;
  actualStartAt?: Date | null;
  actualEndAt?: Date | null;
  durationMinutes: number;
};

/**
 * When a treatment really holds its place.
 *
 * The plan until the desk says otherwise. A treatment that started twenty
 * minutes late is still going twenty minutes late, and a bed shown as free
 * while somebody is lying on it is how two clients end up in one room.
 *
 * A logged start with no logged end runs for its booked length from when it
 * actually began — the best available guess, and it errs towards holding the
 * place rather than releasing it early.
 */
export function effectiveWindow(seg: TimedSegment): { start: Date; end: Date } | null {
  const start = seg.actualStartAt ?? seg.startAt;
  if (!start) return null;
  const end =
    seg.actualEndAt ??
    (seg.actualStartAt ? plus(seg.actualStartAt, seg.durationMinutes) : seg.endAt);
  if (!end) return null;
  // A logged end before the start is a typo at the desk, not a negative
  // booking; treat it as a zero-length hold rather than letting it invert.
  return { start, end: end < start ? start : end };
}

/**
 * Push the rest of the visit by however long this treatment overran.
 *
 * The gaps are preserved rather than eaten: a sauna that ran fifteen minutes
 * over still needs its shower, so the massage moves by fifteen minutes and does
 * not start fifteen minutes closer.
 *
 * Only what follows moves. A treatment already finished is history, and one
 * already under way keeps the start it really had.
 */
export function reflowFrom<T extends Treatment>(
  segments: Segment<T>[],
  index: number,
  finishedAt: Date,
): Segment<T>[] {
  if (index < 0 || index >= segments.length) return segments;
  const out = segments.map((s) => ({ ...s }));
  out[index] = { ...out[index], endAt: finishedAt };

  let cursor = plus(finishedAt, out[index].changeoverAfter);
  for (let i = index + 1; i < out.length; i += 1) {
    out[i] = {
      ...out[i],
      startAt: cursor,
      endAt: plus(cursor, Math.max(0, out[i].durationMinutes)),
    };
    cursor = plus(out[i].endAt, out[i].changeoverAfter);
  }
  return out;
}

/** Two windows sharing any time at all. */
export function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}
