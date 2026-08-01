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
  return treatments
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.sequenceRank ?? 50) - (b.t.sequenceRank ?? 50) || a.i - b.i)
    .map(({ t }) => t);
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
    const last = i === opts.treatments.length - 1;
    const endAt = plus(cursor, Math.max(0, t.durationMinutes));
    const gap = last ? 0 : changeoverFor(t, opts.changeoverMinutes);
    out.push({ ...t, startAt: cursor, endAt, changeoverAfter: gap });
    cursor = plus(endAt, gap);
  });
  return out;
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
  return treatments.reduce((total, t, i) => {
    const last = i === treatments.length - 1;
    return total + Math.max(0, t.durationMinutes) + (last ? 0 : changeoverFor(t, changeoverMinutes));
  }, 0);
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
