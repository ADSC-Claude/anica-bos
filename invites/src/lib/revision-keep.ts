import { manilaDateKey } from './datetime';

/**
 * How much history an invitation keeps. Thirty saves is an afternoon of
 * typing — enough to undo a keystroke or a paragraph; one a day for two
 * months is enough to undo a week. Beyond that a version is nobody's to
 * want back, and the table stays small for every invitation ever made.
 */
export const KEEP_RECENT = 30;
export const KEEP_DAYS = 60;

/**
 * Which of an invitation's versions to drop, newest first: the last thirty
 * stay whole; older ones keep the newest of each day (Manila days, since
 * that is the day the customer was typing in) for sixty days; the rest go.
 */
export function revisionsToDrop(revisions: { id: string; createdAt: Date }[], now = new Date()): string[] {
  const sorted = [...revisions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const oldest = now.getTime() - KEEP_DAYS * 86_400_000;
  const days = new Set<string>();
  const drop: string[] = [];
  sorted.forEach((r, i) => {
    if (i < KEEP_RECENT) return;
    if (r.createdAt.getTime() < oldest) {
      drop.push(r.id);
      return;
    }
    const day = manilaDateKey(r.createdAt);
    if (days.has(day)) drop.push(r.id);
    else days.add(day);
  });
  return drop;
}
