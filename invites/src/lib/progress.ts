import type { SectionKey } from './sections';
import { addDays } from './datetime';

/**
 * How far a couple has come, and how long they have. Each section is marked
 * Done by the couple when they have filled it; our team starts on the
 * invitation only once every section they have is marked Done, and the
 * builder says so. Three weeks before the event the invitation closes to
 * their changes and passes to our team for the final touches, which are done
 * by two weeks before — the last week is kept clear. Pure functions, so the
 * page, the server and the tests share one reading of the dates.
 */
export type Progress = { done?: string[]; completedAt?: string };

export const CLOSE_DAYS = 21;
export const FINAL_DAYS = 14;

export type ChangeWindow = { closesAt: Date; finalAt: Date; closed: boolean };

/** When changes close and when the final touches are due, for an event on this date; nothing for an event with no date yet. */
export function changeWindow(eventAt: Date | null | undefined, now = new Date()): ChangeWindow | null {
  if (!eventAt || Number.isNaN(eventAt.getTime())) return null;
  const closesAt = addDays(eventAt, -CLOSE_DAYS);
  const finalAt = addDays(eventAt, -FINAL_DAYS);
  return { closesAt, finalAt, closed: now.getTime() >= closesAt.getTime() };
}

/** The sections marked Done, as stored. */
export function doneSections(progress: Progress | undefined): SectionKey[] {
  return (progress?.done ?? []).filter((k): k is SectionKey => typeof k === 'string') as SectionKey[];
}

/** The progress with one section marked Done or reopened. */
export function withDone(progress: Progress | undefined, key: SectionKey, done: boolean): Progress {
  const current = doneSections(progress).filter((k) => k !== key);
  return { ...(progress ?? {}), done: done ? [...current, key] : current };
}

/** True once every section the couple has is marked Done. */
export function formComplete(progress: Progress | undefined, sections: SectionKey[]): boolean {
  const done = new Set(doneSections(progress));
  return sections.length > 0 && sections.every((k) => done.has(k));
}
